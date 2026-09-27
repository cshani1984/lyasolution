/**
 * CropFlow public store routing + web upload (shared Twilio number).
 * Mounted from registerSmartcropRoutes — no API key (rate-limited).
 */
import multer from 'multer';
import { normalizePhoneE164 } from './whatsappParser.mjs';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin.mjs';

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
    cb(ok ? null : new Error('סוג קובץ לא נתמך'), ok);
  },
});

/**
 * @param {import('express').Express} app
 * @param {{
 *   rateLimiter: Function,
 *   log: Function,
 *   logErr: Function,
 *   findUserIdByStoreCode: Function,
 *   loadStoreProfile: Function,
 *   ingestSmartcropPhoto: Function,
 * }} deps
 */
export function registerStoreUploadRoutes(app, deps) {
  const {
    rateLimiter,
    log,
    logErr,
    findUserIdByStoreCode,
    loadStoreProfile,
    ingestSmartcropPhoto,
  } = deps;

  app.get('/api/stores/:storeCode', rateLimiter, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
        return;
      }
      const code = String(req.params.storeCode || '').trim().toUpperCase();
      if (!code || code.length < 3) {
        res.status(400).json({ ok: false, error: 'קוד חנות לא תקין' });
        return;
      }
      const supabase = getSupabaseAdmin();
      const shopId = await findUserIdByStoreCode(supabase, code);
      if (!shopId) {
        res.status(404).json({ ok: false, error: 'החנות לא נמצאה' });
        return;
      }
      const store = await loadStoreProfile(supabase, shopId);
      res.json({
        ok: true,
        store: {
          code: store?.storeCode || code,
          name: store?.storeName || code,
        },
      });
    } catch (err) {
      logErr('store lookup failed', err?.message ?? err);
      res.status(500).json({ ok: false, error: err?.message ?? 'Store lookup failed' });
    }
  });

  app.post(
    '/api/upload/web',
    rateLimiter,
    (req, res, next) => {
      upload.array('files', 20)(req, res, (err) => {
        if (err) {
          res.status(400).json({ ok: false, error: err.message || 'העלאה נכשלה' });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      log('HTTP POST /api/upload/web', { ip: req.ip ?? '', files: req.files?.length ?? 0 });
      if (!isSupabaseAdminConfigured()) {
        res.status(503).json({ ok: false, error: 'Supabase admin not configured' });
        return;
      }
      try {
        const storeCode = String(req.body?.storeCode || req.body?.store_code || '')
          .trim()
          .toUpperCase();
        const phone = normalizePhoneE164(String(req.body?.phone || req.body?.sender_phone || ''));
        const customerName = String(req.body?.name || req.body?.customer_name || '').trim() || null;
        const sizeName =
          String(req.body?.sizeName || req.body?.size_name || '10x15').trim() || '10x15';
        const files = Array.isArray(req.files) ? req.files : [];

        if (!storeCode) {
          res.status(400).json({ ok: false, error: 'חסר קוד חנות' });
          return;
        }
        if (!phone) {
          res.status(400).json({ ok: false, error: 'נא להזין מספר טלפון' });
          return;
        }
        if (!files.length) {
          res.status(400).json({ ok: false, error: 'לא נבחרו קבצים' });
          return;
        }

        const supabase = getSupabaseAdmin();
        const shopId = await findUserIdByStoreCode(supabase, storeCode);
        if (!shopId) {
          res.status(404).json({ ok: false, error: `לא מצאנו חנות עם הקוד ${storeCode}` });
          return;
        }

        const caption = [customerName, phone, sizeName, `code: ${storeCode}`].filter(Boolean).join(' ');
        const photos = [];
        for (const file of files) {
          const mime = file.mimetype || 'image/jpeg';
          const b64 = `data:${mime};base64,${file.buffer.toString('base64')}`;
          const result = await ingestSmartcropPhoto({
            senderPhone: phone,
            media_base64: b64,
            caption_text: caption,
            sizeName,
            customer_name: customerName,
            user_id: shopId,
            storeCode,
            source: 'WEB_UPLOAD',
          });
          photos.push({
            photoId: result.photoId,
            sizeName: result.sizeName,
            croppedUrl: result.croppedUrl,
          });
        }

        const store = await loadStoreProfile(supabase, shopId);
        res.json({
          ok: true,
          count: photos.length,
          storeName: store?.storeName || storeCode,
          photos,
          message: `התמונות נשלחו לחנות ${store?.storeName || storeCode}`,
        });
      } catch (err) {
        logErr('web upload failed', err?.message ?? err);
        const status = err?.status || 500;
        res.status(status).json({ ok: false, error: err?.message ?? 'העלאה נכשלה' });
      }
    },
  );
}
