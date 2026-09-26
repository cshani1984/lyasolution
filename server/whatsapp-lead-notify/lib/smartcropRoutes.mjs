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
  phoneDigits,
  phoneLookupCandidates,
  slugifyCustomer,
} from './whatsappParser.mjs';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin.mjs';
import {
  loadImageBuffer,
  photoStatusFromAutoCrop,
  processBlindCenterCrop,
  processSmartCrop,
} from './cropEngine.mjs';
import {
  DEMO_PRINT_SIZES,
  defaultPrintSize,
  findPrintSize,
  getCalculatedAspectRatio,
  printSizeCode,
} from './printSizes.mjs';
import {
  assertTwilioSignature,
  isTwilioInbound,
  parseTwilioWhatsAppBody,
  replyToWhatsApp,
  resolveTwilioMedia,
} from './twilioWhatsapp.mjs';

const BUCKET = 'photo-prints';

/**
 * Notes: Resolve print size from DB catalog or DEMO_PRINT_SIZES fallback.
 * aspect_ratio is always width/height; landscape orientation is applied in processSmartCrop.
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {string | null | undefined} query
 */
async function resolvePrintSize(supabase, query) {
  let catalog = DEMO_PRINT_SIZES;
  let fromDb = false;
  if (supabase) {
    const { data: rows } = await supabase.from('print_sizes').select('*');
    if (rows?.length) {
      fromDb = true;
      catalog = rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code || undefined,
        width_cm: Number(r.width_cm),
        height_cm: Number(r.height_cm),
        aspect_ratio:
          r.width_cm && r.height_cm
            ? Number(r.width_cm) / Number(r.height_cm)
            : Number(r.aspect_ratio) || 2 / 3,
        is_default: Boolean(r.is_default),
        category: r.category || undefined,
        description: r.description || undefined,
      }));
    }
  }
  const size = findPrintSize(catalog, query) || defaultPrintSize(catalog);
  return {
    size,
    aspectRatio: getCalculatedAspectRatio(size, false),
    sizeCode: printSizeCode(size),
    sizeName: size.name,
    sizeId: fromDb ? size.id : null,
  };
}

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
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
  fileFilter(_req, file, cb) {
    const ok =
      ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase()) ||
      /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Unsupported image type'), ok);
  },
});

/**
 * Notes: Resolve photo-shop (lab) account — owner of the dashboard.
 * Multi-tenant: each studio is identified by profiles.phone after login/register.
 * Priority:
 *   1) explicit user_id (browser upload while logged in)
 *   2) human phones among To/From (skip only Twilio Sandbox +14155238886)
 * Production: To is often the studio Twilio WA number (= profiles.phone) — must NOT skip it.
 * Sandbox: To is +14155…, From is the studio phone — match From.
 */
async function resolveShopUserId(supabase, { userId, shopPhone, fromPhone }) {
  if (userId) return userId;

  const ordered = studioLookupPhones(shopPhone, fromPhone);
  for (const phone of ordered) {
    const id = await findUserIdByStudioPhone(supabase, phone);
    if (id) return id;
  }

  return null;
}

/** Twilio WhatsApp Sandbox — never a SmartCrop studio profile. */
const TWILIO_SANDBOX_DIGITS = '14155238886';

/**
 * Notes: Prefer non-sandbox phones. Never skip TWILIO_WHATSAPP_NUMBER — in production
 * that env value IS the studio business line and must match profiles.phone.
 * @param {string} shopPhone  Twilio "To"
 * @param {string} fromPhone  Twilio "From"
 * @returns {string[]}
 */
function studioLookupPhones(shopPhone, fromPhone) {
  const isSandbox = (p) => phoneDigits(p) === TWILIO_SANDBOX_DIGITS;
  const phones = [fromPhone, shopPhone].filter((p) => p && phoneDigits(p).length >= 8);
  // Prefer From first (sandbox: studio sends → From is +972…)
  // then To (production: customer → To is studio WA number)
  const seen = new Set();
  const out = [];
  for (const p of phones) {
    if (isSandbox(p)) continue;
    const d = phoneDigits(p);
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(p);
  }
  return out;
}

/**
 * Notes: Match studio by digits only (ignore +, spaces, whatsapp:).
 * Never put '+' in PostgREST .eq filters — it often becomes a space.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string | null | undefined} rawPhone
 * @returns {Promise<string | null>}
 */
async function findUserIdByStudioPhone(supabase, rawPhone) {
  const canonical = normalizePhoneE164(String(rawPhone ?? ''));
  const wantDigits = phoneDigits(canonical || rawPhone);
  if (wantDigits.length < 8) return null;

  const tail = wantDigits.slice(-9);
  const candidatesNoPlus = phoneLookupCandidates(canonical || String(rawPhone ?? '')).filter(
    (c) => !String(c).includes('+'),
  );

  // 1) Queries without '+' only
  for (const c of candidatesNoPlus) {
    const { data: rows } = await supabase.from('profiles').select('id, phone').eq('phone', c).limit(5);
    const hit = (rows ?? []).find((r) => phonesMatch(r.phone, wantDigits));
    if (hit?.id) {
      await backfillProfilePhone(supabase, hit.id, canonical || `+${wantDigits}`);
      return hit.id;
    }
  }

  // 2) LIKE last 9 digits
  if (tail.length >= 8) {
    const { data: liked } = await supabase
      .from('profiles')
      .select('id, phone')
      .not('phone', 'is', null)
      .like('phone', `%${tail}%`)
      .limit(50);
    const hit = (liked ?? []).find((r) => phonesMatch(r.phone, wantDigits));
    if (hit?.id) {
      await backfillProfilePhone(supabase, hit.id, canonical || `+${wantDigits}`);
      return hit.id;
    }
  }

  // 3) Full scan — compare digits in JS (bypasses filter encoding quirks)
  const { data: allRows, error: scanErr } = await supabase
    .from('profiles')
    .select('id, phone')
    .not('phone', 'is', null)
    .limit(1000);
  if (scanErr) {
    console.warn('[smartcrop] profiles scan', scanErr.message);
  } else {
    const soft = (allRows ?? []).find((r) => phonesMatch(r.phone, wantDigits));
    if (soft?.id) {
      await backfillProfilePhone(supabase, soft.id, canonical || `+${wantDigits}`);
      return soft.id;
    }
    console.warn('[smartcrop] no profile digit match', {
      wantDigits,
      tail,
      sample: (allRows ?? []).slice(0, 15).map((r) => ({
        id: r.id,
        phone: r.phone,
        digits: phoneDigits(r.phone),
      })),
    });
  }

  const authId = await findAuthUserIdByPhone(
    supabase,
    phoneLookupCandidates(canonical || String(rawPhone ?? '')),
  );
  if (authId) {
    await backfillProfilePhone(supabase, authId, canonical || `+${wantDigits}`);
    return authId;
  }

  return null;
}

/** True when two phones share the same national digits (8–10). */
function phonesMatch(stored, wantDigits) {
  const a = phoneDigits(stored);
  if (!a || !wantDigits) return false;
  if (a === wantDigits) return true;
  const n = Math.min(10, a.length, wantDigits.length);
  return n >= 8 && a.slice(-n) === wantDigits.slice(-n);
}

/**
 * Notes: Ensure profiles.phone is canonical E.164 so future WhatsApp matches are exact.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} e164
 */
async function backfillProfilePhone(supabase, userId, e164) {
  const phone = normalizePhoneE164(e164);
  if (!userId || !phone) return;
  const { data } = await supabase.from('profiles').select('id, phone').eq('id', userId).maybeSingle();
  if (!data) {
    const { error } = await supabase.from('profiles').upsert({ id: userId, phone }, { onConflict: 'id' });
    if (error) console.warn('[smartcrop] backfillProfilePhone upsert', error.message);
    return;
  }
  if (normalizePhoneE164(data.phone || '') === phone) return;
  const { error } = await supabase.from('profiles').update({ phone }).eq('id', userId);
  if (error && (error.code === '23505' || /profiles_phone_key/i.test(error.message || ''))) {
    // Phone unique on another row — clear orphan then retry once
    await supabase.from('profiles').update({ phone: null }).eq('phone', phone).neq('id', userId);
    await supabase.from('profiles').update({ phone }).eq('id', userId);
  } else if (error) {
    console.warn('[smartcrop] backfillProfilePhone update', error.message);
  }
}

/**
 * Notes: Fallback when profiles.phone was never saved after OTP (unique conflict / race).
 * Checks auth.users.phone and phone identity_data.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} candidates
 * @returns {Promise<string | null>}
 */
async function findAuthUserIdByPhone(supabase, candidates) {
  const wantedDigitsList = candidates
    .map((c) => phoneDigits(normalizePhoneE164(c) || c))
    .filter((d) => d.length >= 8);

  const digitMatch = (raw) => {
    const d = phoneDigits(raw);
    if (!d) return false;
    return wantedDigitsList.some((w) => phonesMatch(d, w) || phonesMatch(raw, w));
  };

  try {
    let page = 1;
    const perPage = 200;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.warn('[smartcrop] auth.admin.listUsers', error.message);
        break;
      }
      const users = data?.users ?? [];
      if (!users.length) break;
      for (const u of users) {
        if (digitMatch(u.phone)) return u.id;
        if (digitMatch(u.user_metadata?.phone)) return u.id;
        const identities = Array.isArray(u.identities) ? u.identities : [];
        for (const idn of identities) {
          const idPhone =
            idn?.identity_data?.phone ||
            idn?.identity_data?.phone_number ||
            idn?.identity_data?.provider_id;
          if (digitMatch(idPhone)) return u.id;
        }
      }
      if (users.length < perPage) break;
      page += 1;
      if (page > 15) break;
    }
  } catch (err) {
    console.warn('[smartcrop] findAuthUserIdByPhone', err?.message ?? err);
  }
  return null;
}

/**
 * Notes: True when the WhatsApp sender is the studio itself (forward / self-send).
 */
async function isRegisteredShopPhone(supabase, phone) {
  const id = await findUserIdByStudioPhone(supabase, phone);
  return Boolean(id);
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

  const supabase = getSupabaseAdmin();

  // Shop owns the dashboard; do NOT bind user_id to end-customer phone
  let userId = await resolveShopUserId(supabase, {
    userId: input.user_id || null,
    shopPhone,
    fromPhone,
  });

  const senderIsShop = await isRegisteredShopPhone(supabase, fromPhone);
  // Shop forward: studio sent the WhatsApp message (sandbox or forwarded customer chat)
  const isShopForward = Boolean(senderIsShop && userId);
  const missingCustomerIdentity = !order.customerPhone && !order.customerName;

  // End-customer phone: caption wins (shop forward), else WhatsApp From (real customer).
  // Shop forward without name/phone → Admin folder under the shop account.
  let customerPhone = order.customerPhone || (isShopForward ? null : fromPhone);
  let customerName = order.customerName;
  if (isShopForward && missingCustomerIdentity) {
    customerPhone = 'admin';
    customerName = 'Admin';
  } else if (isShopForward && order.customerPhone) {
    customerPhone = order.customerPhone;
  }
  if (!customerName && missingCustomerIdentity && !fromPhone) {
    customerName = 'Admin';
    customerPhone = 'admin';
  }

  if (!customerPhone) {
    customerPhone = isShopForward ? 'admin' : fromPhone || 'admin';
    customerName = customerName || (isShopForward ? 'Admin' : null);
  }
  order.customerName = customerName;
  if (!input.media_url && !input.media_base64) {
    throw Object.assign(new Error('media_url or media_base64 required'), { status: 400 });
  }

  if (!userId) {
    throw Object.assign(
      new Error(
        'No studio account matched this WhatsApp. Register/login with the business phone, or send to that studio WhatsApp number.',
      ),
      { status: 404 },
    );
  }

  const sizeQuery = order.sizeName || '10x15';

  const { size: sizeRow, aspectRatio, sizeCode, sizeName, sizeId } = await resolvePrintSize(
    supabase,
    sizeQuery,
  );
  void sizeRow;

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
      if (orderErr) {
        console.warn('[smartcrop] orders insert skipped', orderErr.message);
        orderId = null;
      } else {
        orderId = created.id;
      }
    }
  }

  const inputBuffer = await loadImageBuffer({
    media_url: input.media_url,
    media_base64: input.media_base64,
  });

  let croppedBuffer;
  let cropData;
  try {
    const processed = await processSmartCrop(inputBuffer, { aspectRatio });
    croppedBuffer = processed.buffer;
    cropData = processed.cropData;
  } catch (cropErr) {
    throw Object.assign(
      new Error(`Crop failed: ${cropErr?.message || cropErr}`),
      { status: 500, cause: cropErr },
    );
  }

  const id = randomUUID();
  const shopSegment = userId || 'inbox';
  const customerSlug = slugifyCustomer(order.customerName, customerPhone);
  const phoneDigits = String(customerPhone).replace(/\+/g, '');
  const folderBase = `${shopSegment}/${phoneDigits}/${sizeCode}`;
  const originalPath = `${folderBase}/${id}-original.jpg`;
  const croppedPath = `${folderBase}/${id}-cropped.jpg`;
  const hotfolderPath = buildHotfolderPath(order.customerName, customerPhone, sizeCode);

  let originalJpeg;
  try {
    originalJpeg = await (await import('sharp')).default(inputBuffer).rotate().jpeg({ quality: 92 }).toBuffer();
  } catch (imgErr) {
    throw Object.assign(
      new Error(`Image decode failed: ${imgErr?.message || imgErr}`),
      { status: 500, cause: imgErr },
    );
  }

  const upOrig = await supabase.storage.from(BUCKET).upload(originalPath, originalJpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upOrig.error) {
    throw Object.assign(
      new Error(`Storage upload failed (${BUCKET}): ${upOrig.error.message}`),
      { status: 500 },
    );
  }

  const upCrop = await supabase.storage.from(BUCKET).upload(croppedPath, croppedBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upCrop.error) {
    throw Object.assign(
      new Error(`Storage upload failed (${BUCKET}): ${upCrop.error.message}`),
      { status: 500 },
    );
  }

  // Print-ready copy under hotfolder-style storage prefix (syncable to lab PC)
  const printPath = `${shopSegment}/hotfolder/${customerSlug}_${sizeCode}/${id}.jpg`;
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

  const photoRow = {
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
    size_id: sizeId,
    target_size_name: sizeName,
    crop_data: cropData,
    status: photoStatusFromAutoCrop(cropData?.metrics),
  };

  let { data: photo, error: photoErr } = await supabase.from('photos').insert(photoRow).select('id').single();

  // Retry without optional columns if schema is older
  if (photoErr && /column|schema cache/i.test(photoErr.message || '')) {
    const minimal = {
      id,
      order_id: orderId,
      user_id: userId,
      sender_phone: customerPhone,
      original_url: origPub.publicUrl,
      cropped_url: cropPub.publicUrl,
      size_id: sizeId,
      target_size_name: sizeName,
      crop_data: cropData,
      status: photoStatusFromAutoCrop(cropData?.metrics),
    };
    const retry = await supabase.from('photos').insert(minimal).select('id').single();
    photo = retry.data;
    photoErr = retry.error;
  }

  // FK on size_id / order_id — keep the photo even if catalog drift
  if (photoErr && /foreign key|violates/i.test(photoErr.message || '')) {
    const noFk = {
      id,
      user_id: userId,
      sender_phone: customerPhone,
      original_url: origPub.publicUrl,
      cropped_url: cropPub.publicUrl,
      size_id: null,
      target_size_name: sizeName,
      crop_data: cropData,
      status: 'pending',
    };
    const retry = await supabase.from('photos').insert(noFk).select('id').single();
    photo = retry.data;
    photoErr = retry.error;
  }

  if (photoErr) {
    throw Object.assign(new Error(`DB photos insert: ${photoErr.message}`), { status: 500 });
  }

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

  /**
   * Notes: Debug studio phone match (API key). Open:
   *   GET /api/smartcrop/diagnose-phone?phone=%2B972509250384
   * with header x-api-key: <API_KEY>
   */
  app.get('/api/smartcrop/diagnose-phone', checkApiKey, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        res.status(503).json({ error: 'Supabase admin not configured on server' });
        return;
      }
      const raw = String(req.query.phone || '');
      const supabase = getSupabaseAdmin();
      const canonical = normalizePhoneE164(raw);
      const wantDigits = phoneDigits(canonical || raw);
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, phone, email, full_name')
        .not('phone', 'is', null)
        .limit(200);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const matches = (profiles ?? []).filter((r) => phonesMatch(r.phone, wantDigits));
      const authId = await findAuthUserIdByPhone(supabase, phoneLookupCandidates(canonical || raw));
      res.json({
        input: raw,
        canonical,
        wantDigits,
        profileMatches: matches,
        profileCountWithPhone: (profiles ?? []).length,
        samplePhones: (profiles ?? []).slice(0, 20).map((r) => ({
          id: r.id,
          phone: r.phone,
          digits: phoneDigits(r.phone),
        })),
        authUserId: authId,
        supabaseHost: String(process.env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('/')[0],
      });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  app.post('/api/whatsapp/webhook', rateLimiter, async (req, res) => {
    log('HTTP POST /api/whatsapp/webhook', { ip: req.ip ?? '' });

    const body = req.body ?? {};

    // --- Twilio WhatsApp (form-urlencoded: From, Body, NumMedia, MediaUrl0, …) ---
    if (isTwilioInbound(body)) {
      /** @type {ReturnType<typeof parseTwilioWhatsAppBody> | null} */
      let parsed = null;
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

        parsed = parseTwilioWhatsAppBody(body);

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
          studioLookup: studioLookupPhones(parsed.shopPhone, parsed.senderPhone),
        });

        let reply =
          'שלום מ-SmartCrop! שלחו תמונה להתחלת הזמנה (אפשר לציין גודל כמו 10x15).';

        if (parsed.NumMedia > 0 && parsed.MediaUrl0) {
          if (!isSupabaseAdminConfigured()) {
            reply =
              'השרת לא מחובר ל-Supabase (חסר SUPABASE_URL / SERVICE_ROLE). לבדיקה חיה הגדירו את Webhook של Twilio ל: https://lyasolution-node-email-server.onrender.com/api/whatsapp/webhook';
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
        const detail = String(err?.message || err || 'unknown');
        logErr('Twilio WhatsApp webhook failed', detail);
        if (err?.stack) logErr('Twilio WhatsApp stack', err.stack.slice(0, 800));
        if (err?.status === 404) {
          logErr('Studio phone lookup miss', {
            from: parsed?.From,
            to: parsed?.To,
            senderPhone: parsed?.senderPhone,
            shopPhone: parsed?.shopPhone,
            fromCandidates: phoneLookupCandidates(parsed?.senderPhone || ''),
          });
        }
        let friendly = 'אירעה שגיאה בעיבוד. נסו שוב.';
        if (err?.status === 404) {
          const tried = studioLookupPhones(parsed?.shopPhone || '', parsed?.senderPhone || '');
          friendly =
            `לא מצאנו סטודיו ל-${tried.join(' / ') || 'מספר לא זוהה'}. בדקו ב-Supabase → profiles שה-phone הוא +972509250384 (או אותו מספר שממנו שלחתם).`;
        } else if (/Storage upload failed|Bucket not found|not found/i.test(detail)) {
          friendly =
            'שגיאת אחסון תמונות (Storage). ודאו שקיים bucket בשם photo-prints ב-Supabase.';
        } else if (/Twilio media download|credentials/i.test(detail)) {
          friendly = 'לא הצלחנו להוריד את התמונה מ-Twilio. בדקו TWILIO_ACCOUNT_SID / AUTH_TOKEN.';
        } else if (/Image decode|unsupported|heic|corrupt/i.test(detail)) {
          friendly = 'לא הצלחנו לקרוא את קובץ התמונה. נסו JPG או PNG.';
        } else if (/DB photos insert|orders/i.test(detail)) {
          friendly = `שגיאת מסד נתונים: ${detail.slice(0, 120)}`;
        } else if (detail && detail !== 'unknown') {
          friendly = `שגיאת עיבוד: ${detail.slice(0, 140)}`;
        }
        const twiml = (await replyToWhatsApp({ From: '', reply: friendly })).twiml;
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

      let sizeQuery = photo.target_size_name || '10x15';
      if (sizeId) sizeQuery = sizeId;
      else if (photo.size_id) sizeQuery = photo.size_id;

      const resolved = await resolvePrintSize(supabase, sizeQuery);
      const aspectRatio = resolved.aspectRatio;
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
      const isManualEdit = Boolean(manualCrop) && !resetToAi;
      const patch = {
        cropped_url: `${cropPub.publicUrl}?t=${Date.now()}`,
        crop_data: cropData,
        size_id: resolved.sizeId ?? photo.size_id,
        target_size_name: resolved.sizeName ?? photo.target_size_name,
        status: isManualEdit ? 'pending' : photoStatusFromAutoCrop(cropData?.metrics),
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
      let resolvedSize = null;
      if (sizeId) {
        resolvedSize = await resolvePrintSize(supabase, sizeId);
      }

      let updated = 0;
      for (const photoId of photoIds) {
        const { data: photo } = await supabase.from('photos').select('*').eq('id', photoId).maybeSingle();
        if (!photo) continue;

        const patch = {};
        if (status) patch.status = status;

        if (resolvedSize) {
          const inputBuffer = await loadImageBuffer({ media_url: photo.original_url });
          const { buffer, cropData } = await processSmartCrop(inputBuffer, {
            aspectRatio: resolvedSize.aspectRatio,
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
          patch.size_id = resolvedSize.sizeId;
          patch.target_size_name = resolvedSize.sizeName;
          if (!status) patch.status = photoStatusFromAutoCrop(cropData?.metrics);
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
