/**
 * SmartCrop ingestion + crop processing routes.
 */
import { randomUUID } from 'crypto';
import multer from 'multer';
import {
  buildCustomerBotReply,
  buildHotfolderPath,
  normalizePhoneE164,
  parseWhatsAppOrder,
  slugifyCustomer,
} from './whatsappParser.mjs';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin.mjs';
import { loadImageBuffer, processBlindCenterCrop, processSmartCrop } from './cropEngine.mjs';
import {
  assertTwilioSignature,
  isTwilioInbound,
  parseTwilioWhatsAppBody,
  replyToWhatsApp,
  resolveTwilioMedia,
} from './twilioWhatsapp.mjs';

const BUCKET = 'photo-prints';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter(_req, file, cb) {
    const ok =
      ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase()) ||
      /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Unsupported image type'), ok);
  },
});

/**
 * Notes: Resolve photo-shop (lab) account — owner of the dashboard.
 * Priority: explicit user_id → SMARTCROP_SHOP_USER_ID → profile matching To/shop phone.
 */
async function resolveShopUserId(supabase, { userId, shopPhone }) {
  if (userId) return userId;
  const envId = process.env.SMARTCROP_SHOP_USER_ID?.trim();
  if (envId) return envId;
  const phone = normalizePhoneE164(String(shopPhone ?? ''));
  if (!phone) return null;
  const { data } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle();
  return data?.id ?? null;
}

/**
 * Notes: Upsert CRM row for end-customer under the shop account.
 */
async function upsertShopCustomer(supabase, { shopUserId, phone, fullName }) {
  if (!shopUserId || !phone) return;
  const { data: existing } = await supabase
    .from('shop_customers')
    .select('id, photo_count, full_name')
    .eq('shop_user_id', shopUserId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('shop_customers')
      .update({
        photo_count: (existing.photo_count ?? 0) + 1,
        last_order_at: new Date().toISOString(),
        full_name: fullName || existing.full_name,
      })
      .eq('id', existing.id);
    return;
  }

  await supabase.from('shop_customers').insert({
    shop_user_id: shopUserId,
    phone,
    full_name: fullName || null,
    photo_count: 1,
  });
}

/**
 * Notes: Persist one WhatsApp / upload photo for a shop, keyed by end-customer phone.
 * @param {{
 *   senderPhone?: string,
 *   shopPhone?: string,
 *   media_url?: string,
 *   media_base64?: string,
 *   caption_text?: string,
 *   sizeName?: string,
 *   customer_name?: string,
 *   user_id?: string | null,
 * }} input
 */
async function ingestSmartcropPhoto(input) {
  const order = parseWhatsAppOrder(input.caption_text);
  if (input.sizeName) order.sizeName = input.sizeName;
  if (input.customer_name) order.customerName = String(input.customer_name).trim() || order.customerName;

  const fromPhone = normalizePhoneE164(String(input.senderPhone ?? ''));
  const shopPhone = normalizePhoneE164(String(input.shopPhone ?? ''));

  const isShopForward = Boolean(shopPhone && fromPhone && fromPhone === shopPhone);
  const missingCustomerIdentity = !order.customerPhone && !order.customerName;

  // End-customer phone: caption wins (shop forward), else WhatsApp From.
  // Shop forward without name/phone → Admin folder under the shop account.
  let customerPhone = order.customerPhone || fromPhone;
  let customerName = order.customerName;
  if (isShopForward && missingCustomerIdentity) {
    customerPhone = shopPhone || fromPhone || 'admin';
    customerName = 'Admin';
  } else if (isShopForward && order.customerPhone) {
    customerPhone = order.customerPhone;
  }
  if (!customerName && missingCustomerIdentity && !fromPhone) {
    customerName = 'Admin';
    customerPhone = shopPhone || 'admin';
  }

  if (!customerPhone) {
    customerPhone = shopPhone || 'admin';
    customerName = customerName || 'Admin';
  }
  order.customerName = customerName;
  if (!input.media_url && !input.media_base64) {
    throw Object.assign(new Error('media_url or media_base64 required'), { status: 400 });
  }

  const sizeName = order.sizeName || '10x15';
  const supabase = getSupabaseAdmin();

  const { data: sizeRow } = await supabase
    .from('print_sizes')
    .select('*')
    .eq('name', sizeName)
    .maybeSingle();

  const aspectRatio = sizeRow?.aspect_ratio ? Number(sizeRow.aspect_ratio) : 2 / 3;

  // Shop owns the dashboard; do NOT bind user_id to end-customer phone
  let userId = await resolveShopUserId(supabase, {
    userId: input.user_id || null,
    shopPhone: shopPhone || process.env.SMARTCROP_SHOP_PHONE || '',
  });

  // Fallback: if only one profile matches From and no shop configured, keep legacy link
  if (!userId && fromPhone && fromPhone === customerPhone) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', fromPhone)
      .maybeSingle();
    userId = profile?.id ?? null;
  }

  let orderId = null;
  if (userId) {
    const { data: openOrder } = await supabase
      .from('orders')
      .select('id, total_photos')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openOrder) {
      orderId = openOrder.id;
      await supabase
        .from('orders')
        .update({ total_photos: (openOrder.total_photos ?? 0) + 1 })
        .eq('id', orderId);
    } else {
      const { data: created, error: orderErr } = await supabase
        .from('orders')
        .insert({ user_id: userId, status: 'pending', total_photos: 1 })
        .select('id')
        .single();
      if (orderErr) throw orderErr;
      orderId = created.id;
    }
  }

  const inputBuffer = await loadImageBuffer({
    media_url: input.media_url,
    media_base64: input.media_base64,
  });

  const { buffer: croppedBuffer, cropData } = await processSmartCrop(inputBuffer, {
    aspectRatio,
  });

  const id = randomUUID();
  const shopSegment = userId || 'inbox';
  const customerSlug = slugifyCustomer(order.customerName, customerPhone);
  const phoneDigits = customerPhone.replace(/\+/g, '');
  const folderBase = `${shopSegment}/${phoneDigits}/${sizeName}`;
  const originalPath = `${folderBase}/${id}-original.jpg`;
  const croppedPath = `${folderBase}/${id}-cropped.jpg`;
  const hotfolderPath = buildHotfolderPath(order.customerName, customerPhone, sizeName);

  const originalJpeg = await (await import('sharp')).default(inputBuffer).rotate().jpeg({ quality: 92 }).toBuffer();

  const upOrig = await supabase.storage.from(BUCKET).upload(originalPath, originalJpeg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (upOrig.error) throw upOrig.error;

  const upCrop = await supabase.storage.from(BUCKET).upload(croppedPath, croppedBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (upCrop.error) throw upCrop.error;

  // Print-ready copy under hotfolder-style storage prefix (syncable to lab PC)
  const printPath = `${shopSegment}/hotfolder/${customerSlug}_${sizeName}/${id}.jpg`;
  await supabase.storage.from(BUCKET).upload(printPath, croppedBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  const { data: origPub } = supabase.storage.from(BUCKET).getPublicUrl(originalPath);
  const { data: cropPub } = supabase.storage.from(BUCKET).getPublicUrl(croppedPath);

  const aiConfidence = cropData?.metrics?.confidenceScore ?? null;
  const combinedConfidence =
    typeof aiConfidence === 'number'
      ? Math.round((aiConfidence * 0.7 + order.parseConfidence * 0.3) * 10) / 10
      : order.parseConfidence;

  const { data: photo, error: photoErr } = await supabase
    .from('photos')
    .insert({
      id,
      order_id: orderId,
      user_id: userId,
      sender_phone: customerPhone,
      customer_name: order.customerName,
      copies: order.copies,
      paper_type: order.paperType,
      caption_text: input.caption_text ?? null,
      parsed_summary: order.summary,
      parse_confidence: combinedConfidence,
      hotfolder_path: hotfolderPath,
      original_url: origPub.publicUrl,
      cropped_url: cropPub.publicUrl,
      size_id: sizeRow?.id ?? null,
      target_size_name: sizeName,
      crop_data: cropData,
      status: 'pending',
    })
    .select('id')
    .single();

  if (photoErr) throw photoErr;

  await upsertShopCustomer(supabase, {
    shopUserId: userId,
    phone: customerPhone,
    fullName: order.customerName,
  });

  let blindUrl = null;
  try {
    const blind = await processBlindCenterCrop(inputBuffer, aspectRatio);
    const blindPath = `${folderBase}/${id}-blind.jpg`;
    const upBlind = await supabase.storage.from(BUCKET).upload(blindPath, blind.buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (!upBlind.error) {
      const { data: blindPub } = supabase.storage.from(BUCKET).getPublicUrl(blindPath);
      blindUrl = blindPub.publicUrl;
    }
  } catch {
    /* optional */
  }

  return {
    photoId: photo.id,
    sizeName,
    userId,
    orderId,
    customerPhone,
    customerName: order.customerName,
    copies: order.copies,
    paperType: order.paperType,
    parsedSummary: order.summary,
    parseConfidence: combinedConfidence,
    hotfolderPath,
    originalUrl: origPub.publicUrl,
    croppedUrl: cropPub.publicUrl,
    blindUrl,
    metrics: cropData.metrics ?? null,
    cropData,
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ checkApiKey: Function, rateLimiter: Function, log: Function, logErr: Function }} ctx
 */
export function registerSmartcropRoutes(app, ctx) {
  const { checkApiKey, rateLimiter, log, logErr } = ctx;

  app.post('/api/whatsapp/webhook', rateLimiter, async (req, res) => {
    log('HTTP POST /api/whatsapp/webhook', { ip: req.ip ?? '' });

    const body = req.body ?? {};

    // --- Twilio WhatsApp (form-urlencoded: From, Body, NumMedia, MediaUrl0, …) ---
    if (isTwilioInbound(body)) {
      try {
        /** @type {Record<string, string>} */
        const params = {};
        for (const [k, v] of Object.entries(body)) {
          if (v != null && typeof v !== 'object') params[k] = String(v);
        }
        if (!assertTwilioSignature(req, params)) {
          res.status(403).type('text/plain').send('Invalid Twilio signature');
          return;
        }

        const parsed = parseTwilioWhatsAppBody(body);

        // Notes: Logger — received user details and photo URL.
        log('Twilio WhatsApp inbound', {
          from: parsed.From,
          to: parsed.To,
          body: parsed.Body,
          numMedia: parsed.NumMedia,
          mediaUrl: parsed.MediaUrl0 || null,
          mediaContentType: parsed.MediaContentType0 || null,
          senderPhone: parsed.senderPhone,
          shopPhone: parsed.shopPhone,
        });

        let reply =
          'שלום מ-SmartCrop! שלחו תמונה להתחלת הזמנה (אפשר לציין גודל כמו 10x15).';

        if (parsed.NumMedia > 0 && parsed.MediaUrl0) {
          if (!isSupabaseAdminConfigured()) {
            reply = 'המערכת עדיין לא מוגדרת לקליטת תמונות. נסו שוב מאוחר יותר.';
          } else {
            const media = await resolveTwilioMedia(parsed);
            const result = await ingestSmartcropPhoto({
              senderPhone: parsed.senderPhone,
              shopPhone: parsed.shopPhone,
              media_url: media.media_url,
              media_base64: media.media_base64,
              caption_text: parsed.caption_text,
            });
            reply = buildCustomerBotReply({
              customerName: result.customerName,
              sizeName: result.sizeName,
              paperType: result.paperType,
              copies: result.copies,
              metrics: result.metrics,
            });
            log('Twilio WhatsApp ingested', {
              photoId: result.photoId,
              sizeName: result.sizeName,
              customerPhone: result.customerPhone,
              customerName: result.customerName,
              hotfolderPath: result.hotfolderPath,
            });
          }
        } else if (parsed.Body) {
          const preview = parseWhatsAppOrder(parsed.Body);
          const paperHe =
            preview.paperType === 'Gloss'
              ? 'מבריק'
              : preview.paperType === 'Matte'
                ? 'מט'
                : preview.paperType === 'Lustre'
                  ? 'לאסטר'
                  : '';
          const req = paperHe ? `${preview.sizeName} ${paperHe}` : preview.sizeName;
          reply = `קיבלנו את ההודעה — זיהינו: ${req}${preview.copies > 1 ? ` · ${preview.copies} עותקים` : ''}.\nשלחו גם את התמונה להדפסה (ואם מעבירים הודעה — שם + טלפון הלקוח; אחרת יישמר תחת Admin).`;
        }

        const preferRest = process.env.TWILIO_REPLY_MODE === 'rest';
        const out = await replyToWhatsApp({
          From: parsed.From,
          reply,
          preferRest,
        });

        if (out.mode === 'rest') {
          res.status(200).end();
          return;
        }
        res.status(200).type('text/xml').send(out.twiml);
      } catch (err) {
        logErr('Twilio WhatsApp webhook failed', err?.message ?? err);
        const twiml = (await replyToWhatsApp({ From: '', reply: 'אירעה שגיאה בעיבוד. נסו שוב.' })).twiml;
        res.status(200).type('text/xml').send(twiml);
      }
      return;
    }

    // --- JSON demo / internal simulation (requires API key) ---
    if (!checkApiKey(req, res)) return;
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
      return;
    }

    try {
      const result = await ingestSmartcropPhoto({
        senderPhone: String(body.sender_phone ?? body.customer_phone ?? ''),
        shopPhone: String(body.shop_phone ?? body.to_phone ?? ''),
        media_url: body.media_url,
        media_base64: body.media_base64,
        caption_text: body.caption_text,
        sizeName: body.sizeName || body.size_name,
        customer_name: body.customer_name,
        user_id: body.user_id ?? null,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      logErr('whatsapp webhook failed', err?.message ?? err);
      const status = err?.status || 500;
      res.status(status).json({ ok: false, error: err?.message ?? 'Webhook failed' });
    }
  });

  app.post('/api/crop/process', rateLimiter, async (req, res) => {
    log('HTTP POST /api/crop/process', { ip: req.ip ?? '' });
    if (!checkApiKey(req, res)) return;
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
      return;
    }

    try {
      const { photoId, sizeId, cropData: manualCrop, resetToAi } = req.body ?? {};
      if (!photoId) {
        res.status(400).json({ ok: false, error: 'photoId required' });
        return;
      }

      const supabase = getSupabaseAdmin();
      const { data: photo, error } = await supabase.from('photos').select('*').eq('id', photoId).single();
      if (error || !photo) {
        res.status(404).json({ ok: false, error: 'Photo not found' });
        return;
      }

      let sizeRow = null;
      if (sizeId) {
        const { data } = await supabase.from('print_sizes').select('*').eq('id', sizeId).maybeSingle();
        sizeRow = data;
      } else if (photo.size_id) {
        const { data } = await supabase.from('print_sizes').select('*').eq('id', photo.size_id).maybeSingle();
        sizeRow = data;
      } else {
        const { data } = await supabase
          .from('print_sizes')
          .select('*')
          .eq('name', photo.target_size_name || '10x15')
          .maybeSingle();
        sizeRow = data;
      }

      const aspectRatio = sizeRow?.aspect_ratio ? Number(sizeRow.aspect_ratio) : 2 / 3;
      const inputBuffer = await loadImageBuffer({ media_url: photo.original_url });
      const { buffer, cropData } = await processSmartCrop(inputBuffer, {
        aspectRatio,
        manualCrop: resetToAi ? null : manualCrop ?? photo.crop_data,
        resetToAi: Boolean(resetToAi),
      });

      const croppedPath = `${String(photo.sender_phone).replace(/\+/g, '')}/${photo.id}-cropped.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(croppedPath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (up.error) throw up.error;

      const { data: cropPub } = supabase.storage.from(BUCKET).getPublicUrl(croppedPath);
      const patch = {
        cropped_url: `${cropPub.publicUrl}?t=${Date.now()}`,
        crop_data: cropData,
        size_id: sizeRow?.id ?? photo.size_id,
        target_size_name: sizeRow?.name ?? photo.target_size_name,
      };

      const { error: updErr } = await supabase.from('photos').update(patch).eq('id', photoId);
      if (updErr) throw updErr;

      res.json({
        ok: true,
        croppedUrl: patch.cropped_url,
        cropData,
        metrics: cropData.metrics ?? null,
      });
    } catch (err) {
      logErr('crop process failed', err?.message ?? err);
      res.status(500).json({ ok: false, error: err?.message ?? 'Crop failed' });
    }
  });

  app.post('/api/photos/batch-update', rateLimiter, async (req, res) => {
    log('HTTP POST /api/photos/batch-update', { ip: req.ip ?? '' });
    if (!checkApiKey(req, res)) return;
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
      return;
    }

    try {
      const { photoIds, sizeId, status } = req.body ?? {};
      if (!Array.isArray(photoIds) || photoIds.length === 0) {
        res.status(400).json({ ok: false, error: 'photoIds required' });
        return;
      }

      const supabase = getSupabaseAdmin();
      let sizeRow = null;
      if (sizeId) {
        const { data } = await supabase.from('print_sizes').select('*').eq('id', sizeId).maybeSingle();
        sizeRow = data;
      }

      let updated = 0;
      for (const photoId of photoIds) {
        const { data: photo } = await supabase.from('photos').select('*').eq('id', photoId).maybeSingle();
        if (!photo) continue;

        const patch = {};
        if (status) patch.status = status;

        if (sizeRow) {
          const inputBuffer = await loadImageBuffer({ media_url: photo.original_url });
          const { buffer, cropData } = await processSmartCrop(inputBuffer, {
            aspectRatio: Number(sizeRow.aspect_ratio) || 2 / 3,
            resetToAi: true,
          });
          const croppedPath = `${String(photo.sender_phone).replace(/\+/g, '')}/${photo.id}-cropped.jpg`;
          await supabase.storage.from(BUCKET).upload(croppedPath, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });
          const { data: cropPub } = supabase.storage.from(BUCKET).getPublicUrl(croppedPath);
          patch.cropped_url = `${cropPub.publicUrl}?t=${Date.now()}`;
          patch.crop_data = cropData;
          patch.size_id = sizeRow.id;
          patch.target_size_name = sizeRow.name;
        }

        if (Object.keys(patch).length) {
          const { error } = await supabase.from('photos').update(patch).eq('id', photoId);
          if (!error) updated += 1;
        }
      }

      res.json({ ok: true, updated });
    } catch (err) {
      logErr('batch-update failed', err?.message ?? err);
      res.status(500).json({ ok: false, error: err?.message ?? 'Batch update failed' });
    }
  });

  /**
   * Notes: Manual browser upload (drag/drop / file picker) — multipart form-data.
   * Fields: files[] (or photos[]), sizeName|size_name|sizeId, sender_phone, user_id
   */
  app.post(
    '/api/photos/upload',
    rateLimiter,
    (req, res, next) => {
      upload.array('files', 20)(req, res, (err) => {
        if (err) {
          res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      log('HTTP POST /api/photos/upload', { ip: req.ip ?? '', files: req.files?.length ?? 0 });
      if (!checkApiKey(req, res)) return;
      if (!isSupabaseAdminConfigured()) {
        res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
        return;
      }

      try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (!files.length) {
          res.status(400).json({ ok: false, error: 'No image files provided (field: files)' });
          return;
        }

        const sizeName =
          String(req.body?.sizeName || req.body?.size_name || '10x15').trim() || '10x15';
        const senderPhone = String(req.body?.sender_phone || req.body?.customer_phone || '');
        const customerName = req.body?.customer_name || null;
        const caption =
          String(req.body?.caption_text || '').trim() ||
          [customerName, senderPhone, sizeName].filter(Boolean).join(' ');
        const userId = req.body?.user_id || null;

        const photos = [];
        for (const file of files) {
          const mime = file.mimetype || 'image/jpeg';
          const b64 = `data:${mime};base64,${file.buffer.toString('base64')}`;
          const result = await ingestSmartcropPhoto({
            senderPhone,
            shopPhone: String(req.body?.shop_phone || ''),
            media_base64: b64,
            caption_text: caption,
            sizeName,
            customer_name: customerName,
            user_id: userId,
          });
          photos.push({
            photoId: result.photoId,
            originalUrl: result.originalUrl,
            croppedUrl: result.croppedUrl,
            blindUrl: result.blindUrl,
            sizeName: result.sizeName,
            customerPhone: result.customerPhone,
            customerName: result.customerName,
            hotfolderPath: result.hotfolderPath,
            parseConfidence: result.parseConfidence,
            parsedSummary: result.parsedSummary,
            cropData: result.cropData,
            metrics: result.metrics,
          });
        }

        res.json({ ok: true, count: photos.length, photos });
      } catch (err) {
        logErr('photos upload failed', err?.message ?? err);
        const status = err?.status || 500;
        res.status(status).json({ ok: false, error: err?.message ?? 'Upload failed' });
      }
    },
  );

  /**
   * Notes: Mark selected photos as printed / sent to lab hotfolder.
   */
  app.post('/api/photos/send-to-print', rateLimiter, async (req, res) => {
    log('HTTP POST /api/photos/send-to-print', { ip: req.ip ?? '' });
    if (!checkApiKey(req, res)) return;
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
      return;
    }

    try {
      const { photoIds } = req.body ?? {};
      if (!Array.isArray(photoIds) || !photoIds.length) {
        res.status(400).json({ ok: false, error: 'photoIds required' });
        return;
      }

      const supabase = getSupabaseAdmin();
      const folders = [];
      let updated = 0;

      for (const photoId of photoIds) {
        const { data: photo } = await supabase.from('photos').select('*').eq('id', photoId).maybeSingle();
        if (!photo) continue;

        const hotfolder =
          photo.hotfolder_path ||
          buildHotfolderPath(photo.customer_name, photo.sender_phone, photo.target_size_name);

        const { error } = await supabase
          .from('photos')
          .update({ status: 'printed', hotfolder_path: hotfolder })
          .eq('id', photoId);
        if (!error) {
          updated += 1;
          folders.push(hotfolder);
        }
      }

      if (req.body?.orderId) {
        await supabase
          .from('orders')
          .update({ status: 'sent_to_print' })
          .eq('id', req.body.orderId);
      }

      res.json({
        ok: true,
        updated,
        hotfolderPaths: [...new Set(folders)],
      });
    } catch (err) {
      logErr('send-to-print failed', err?.message ?? err);
      res.status(500).json({ ok: false, error: err?.message ?? 'Send to print failed' });
    }
  });
}
