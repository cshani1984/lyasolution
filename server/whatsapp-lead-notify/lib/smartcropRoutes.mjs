/**
 * SmartCrop ingestion + crop processing routes.
 */
import { randomUUID } from 'crypto';
import { normalizePhoneE164, parseSizeFromCaption } from './whatsappParser.mjs';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin.mjs';
import { loadImageBuffer, processSmartCrop } from './cropEngine.mjs';
import {
  assertTwilioSignature,
  isTwilioInbound,
  parseTwilioWhatsAppBody,
  replyToWhatsApp,
  resolveTwilioMedia,
} from './twilioWhatsapp.mjs';

const BUCKET = 'photo-prints';

/**
 * Notes: Persist one WhatsApp photo through crop engine + Supabase.
 * @param {{
 *   senderPhone: string,
 *   media_url?: string,
 *   media_base64?: string,
 *   caption_text?: string,
 *   user_id?: string | null,
 * }} input
 */
async function ingestSmartcropPhoto(input) {
  const senderPhone = normalizePhoneE164(String(input.senderPhone ?? ''));
  if (!senderPhone) {
    throw Object.assign(new Error('sender_phone required'), { status: 400 });
  }
  if (!input.media_url && !input.media_base64) {
    throw Object.assign(new Error('media_url or media_base64 required'), { status: 400 });
  }

  const sizeName = parseSizeFromCaption(input.caption_text);
  const supabase = getSupabaseAdmin();

  const { data: sizeRow } = await supabase
    .from('print_sizes')
    .select('*')
    .eq('name', sizeName)
    .maybeSingle();

  const aspectRatio = sizeRow?.aspect_ratio ? Number(sizeRow.aspect_ratio) : 2 / 3;

  let userId = input.user_id || null;
  if (!userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', senderPhone)
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
  const originalPath = `${senderPhone.replace(/\+/g, '')}/${id}-original.jpg`;
  const croppedPath = `${senderPhone.replace(/\+/g, '')}/${id}-cropped.jpg`;

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

  const { data: origPub } = supabase.storage.from(BUCKET).getPublicUrl(originalPath);
  const { data: cropPub } = supabase.storage.from(BUCKET).getPublicUrl(croppedPath);

  const { data: photo, error: photoErr } = await supabase
    .from('photos')
    .insert({
      id,
      order_id: orderId,
      user_id: userId,
      sender_phone: senderPhone,
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

  return {
    photoId: photo.id,
    sizeName,
    userId,
    orderId,
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
          body: parsed.Body,
          numMedia: parsed.NumMedia,
          mediaUrl: parsed.MediaUrl0 || null,
          mediaContentType: parsed.MediaContentType0 || null,
          senderPhone: parsed.senderPhone,
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
              media_url: media.media_url,
              media_base64: media.media_base64,
              caption_text: parsed.caption_text,
            });
            reply = `קיבלנו את התמונה — חתכנו ל-${result.sizeName}. אפשר לאשר באפליקציה ✨`;
            log('Twilio WhatsApp ingested', { photoId: result.photoId, sizeName: result.sizeName });
          }
        } else if (parsed.Body) {
          reply = 'קיבלנו את ההודעה. שלחו תמונה להדפסה עם גודל (למשל 10x15).';
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
        senderPhone: String(body.sender_phone ?? ''),
        media_url: body.media_url,
        media_base64: body.media_base64,
        caption_text: body.caption_text,
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
}
