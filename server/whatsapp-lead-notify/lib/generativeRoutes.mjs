/**
 * Standard crop + Generative Fill (Clipdrop) routes.
 */
import multer from 'multer';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin.mjs';
import { loadImageBuffer, processSmartCrop } from './cropEngine.mjs';
import {
  calculateExtendPadding,
  generativeFillOrFallback,
  isClipdropConfigured,
} from './generativeService.mjs';
import {
  checkGenerativeQuota,
  incrementGenerativeUsage,
  quotaExceededPayload,
  setGenerativeUsage,
} from './quotaService.mjs';
import {
  GENERATIVE_FILL_RECOMMEND_PERCENT,
  TIER_CONFIGS,
  normalizeTier,
  supportWhatsAppUrl,
} from './subscriptions.mjs';

const BUCKET = 'photo-prints';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

/**
 * @param {import('express').Express} app
 * @param {{ checkApiKey: Function, rateLimiter: Function, log: Function, logErr: Function }} ctx
 */
export function registerGenerativeRoutes(app, ctx) {
  const { checkApiKey, rateLimiter, log, logErr } = ctx;

  /**
   * Notes: Free MediaPipe/Sharp auto-crop. Flags recommendGenerativeFill when loss > 20%.
   * Body JSON: { media_base64 | media_url, aspectRatio?, sizeName?, photoId? }
   * Or multipart: file + aspectRatio
   */
  app.post(
    '/api/photos/process',
    rateLimiter,
    (req, res, next) => {
      const ct = String(req.headers['content-type'] || '');
      if (ct.includes('multipart/form-data')) {
        upload.single('file')(req, res, (err) => {
          if (err) {
            res.status(400).json({ ok: false, error: err.message });
            return;
          }
          next();
        });
        return;
      }
      next();
    },
    async (req, res) => {
      log('HTTP POST /api/photos/process', { ip: req.ip ?? '' });
      if (!checkApiKey(req, res)) return;

      try {
        let inputBuffer = null;
        if (req.file?.buffer) {
          inputBuffer = req.file.buffer;
        } else {
          const body = req.body ?? {};
          inputBuffer = await loadImageBuffer({
            media_url: body.media_url,
            media_base64: body.media_base64,
          });
        }

        const aspectRatio =
          Number(req.body?.aspectRatio || req.body?.aspect_ratio) || 2 / 3;
        const { buffer, cropData, cropLossPercentage, confidenceScore, metrics } =
          await processSmartCrop(inputBuffer, { aspectRatio, resetToAi: true });

        const loss = Number(cropLossPercentage ?? metrics?.cropLossPercentage ?? 0);
        const recommendGenerativeFill = loss > GENERATIVE_FILL_RECOMMEND_PERCENT;
        const meta = await (await import('sharp')).default(inputBuffer).rotate().metadata();
        const extend = calculateExtendPadding(meta.width || 1, meta.height || 1, aspectRatio);

        const croppedBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;

        // Optional: persist flag on existing photo
        const photoId = req.body?.photoId;
        if (photoId && isSupabaseAdminConfigured()) {
          const supabase = getSupabaseAdmin();
          await supabase
            .from('photos')
            .update({
              crop_data: cropData,
              recommend_generative_fill: recommendGenerativeFill,
            })
            .eq('id', photoId);
        }

        res.json({
          ok: true,
          croppedBase64,
          cropData,
          metrics: metrics ?? cropData?.metrics ?? null,
          confidenceScore,
          cropLossPercentage: loss,
          recommendGenerativeFill,
          extendPadding: extend,
          clipdropConfigured: isClipdropConfigured(),
        });
      } catch (err) {
        logErr('photos/process failed', err?.message ?? err);
        res.status(500).json({ ok: false, error: err?.message ?? 'Process failed' });
      }
    },
  );

  /**
   * Notes: Paid Generative Fill via Clipdrop Uncrop + quota enforcement.
   * Body: { photoId?, userId?, media_base64?, media_url?, aspectRatio? }
   */
  app.post('/api/photos/generative-fill', rateLimiter, async (req, res) => {
    log('HTTP POST /api/photos/generative-fill', { ip: req.ip ?? '' });
    if (!checkApiKey(req, res)) return;

    try {
      const body = req.body ?? {};
      const userId = body.userId || body.user_id || null;
      const aspectRatio = Number(body.aspectRatio || body.aspect_ratio) || 2 / 3;

      /** Demo page can simulate tier/usage without a Supabase profile. */
      let quota;
      if (body.demoMode && body.simulateUsed != null) {
        const tier = normalizeTier(body.simulateTier || 'demo');
        const used = Math.max(0, Number(body.simulateUsed) || 0);
        const max = TIER_CONFIGS[tier].maxMonthlyGenerativeAI;
        quota =
          used >= max
            ? {
                allowed: false,
                tier,
                used,
                max,
                error: 'QUOTA_EXCEEDED',
                supportUrl: supportWhatsAppUrl(),
              }
            : { allowed: true, tier, used, max };
      } else {
        quota = await checkGenerativeQuota(userId);
      }

      if (!quota.allowed && quota.error === 'QUOTA_EXCEEDED') {
        res.status(403).json({ ok: false, ...quotaExceededPayload(quota) });
        return;
      }
      if (!quota.allowed && quota.error) {
        res.status(503).json({ ok: false, error: quota.error });
        return;
      }

      let inputBuffer = null;
      let photo = null;
      const supabase = isSupabaseAdminConfigured() ? getSupabaseAdmin() : null;

      if (body.photoId && supabase) {
        const { data } = await supabase.from('photos').select('*').eq('id', body.photoId).maybeSingle();
        photo = data;
        if (!photo) {
          res.status(404).json({ ok: false, error: 'Photo not found' });
          return;
        }
        inputBuffer = await loadImageBuffer({ media_url: photo.original_url });
      } else {
        inputBuffer = await loadImageBuffer({
          media_url: body.media_url,
          media_base64: body.media_base64,
        });
      }

      const fill = await generativeFillOrFallback(inputBuffer, aspectRatio);

      // Always produce a print-ready crop (Clipdrop canvas or fallback standard crop)
      let sourceForCrop = fill.ok && fill.buffer ? fill.buffer : inputBuffer;
      const usedClipdrop = Boolean(fill.usedClipdrop);
      const { buffer, cropData, cropLossPercentage, confidenceScore, metrics } =
        await processSmartCrop(sourceForCrop, { aspectRatio, resetToAi: true });

      let generativeFillUrl = null;
      let croppedUrl = null;

      if (supabase && photo) {
        const phone = String(photo.sender_phone || 'inbox').replace(/\+/g, '');
        if (usedClipdrop && fill.buffer) {
          const gfPath = `${phone}/${photo.id}-generative.jpg`;
          await supabase.storage.from(BUCKET).upload(gfPath, fill.buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });
          const { data: gfPub } = supabase.storage.from(BUCKET).getPublicUrl(gfPath);
          generativeFillUrl = `${gfPub.publicUrl}?t=${Date.now()}`;
        }

        const croppedPath = `${phone}/${photo.id}-cropped.jpg`;
        await supabase.storage.from(BUCKET).upload(croppedPath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        const { data: cropPub } = supabase.storage.from(BUCKET).getPublicUrl(croppedPath);
        croppedUrl = `${cropPub.publicUrl}?t=${Date.now()}`;

        await supabase
          .from('photos')
          .update({
            cropped_url: croppedUrl,
            crop_data: {
              ...cropData,
              generativeFill: usedClipdrop,
              extendPadding: fill.extend ?? null,
            },
            generative_fill_url: generativeFillUrl,
            recommend_generative_fill: false,
          })
          .eq('id', photo.id);
      }

      let used = quota.used;
      if (usedClipdrop && userId) {
        const inc = await incrementGenerativeUsage(userId);
        used = inc.used;
      }

      res.json({
        ok: true,
        usedClipdrop,
        fallback: !usedClipdrop,
        fallbackReason: fill.error || null,
        clipdropConfigured: isClipdropConfigured(),
        croppedUrl,
        generativeFillUrl,
        croppedBase64: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        generativeBase64:
          usedClipdrop && fill.buffer
            ? `data:image/jpeg;base64,${fill.buffer.toString('base64')}`
            : null,
        cropData,
        metrics: metrics ?? cropData?.metrics ?? null,
        confidenceScore,
        cropLossPercentage,
        extendPadding: fill.extend ?? null,
        quota: { tier: quota.tier, used, max: quota.max },
      });
    } catch (err) {
      logErr('generative-fill failed', err?.message ?? err);
      res.status(500).json({ ok: false, error: err?.message ?? 'Generative fill failed' });
    }
  });

  /** Dev helpers for /demo quota simulation */
  app.post('/api/quota/set', rateLimiter, async (req, res) => {
    if (!checkApiKey(req, res)) return;
    try {
      const { userId, used, tier } = req.body ?? {};
      if (!userId) {
        res.status(400).json({ ok: false, error: 'userId required' });
        return;
      }
      if (!isSupabaseAdminConfigured()) {
        res.json({
          ok: true,
          simulated: true,
          used: Number(used) || 0,
          tier: normalizeTier(tier),
          max: TIER_CONFIGS[normalizeTier(tier)].maxMonthlyGenerativeAI,
        });
        return;
      }
      await setGenerativeUsage(userId, Number(used) || 0, tier);
      const check = await checkGenerativeQuota(userId);
      res.json({ ok: true, ...check, supportUrl: supportWhatsAppUrl() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message ?? 'Quota set failed' });
    }
  });

  app.get('/api/quota/status', rateLimiter, async (req, res) => {
    if (!checkApiKey(req, res)) return;
    try {
      const userId = String(req.query.userId || '');
      const tierOverride = req.query.tier ? normalizeTier(String(req.query.tier)) : null;
      if (!userId || !isSupabaseAdminConfigured()) {
        const tier = tierOverride || 'demo';
        res.json({
          ok: true,
          simulated: true,
          tier,
          used: 0,
          max: TIER_CONFIGS[tier].maxMonthlyGenerativeAI,
          supportUrl: supportWhatsAppUrl(),
          tiers: TIER_CONFIGS,
        });
        return;
      }
      if (tierOverride) await setGenerativeUsage(userId, undefined, tierOverride);
      const check = await checkGenerativeQuota(userId);
      res.json({ ok: true, ...check, supportUrl: supportWhatsAppUrl(), tiers: TIER_CONFIGS });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message ?? 'Quota status failed' });
    }
  });
}
