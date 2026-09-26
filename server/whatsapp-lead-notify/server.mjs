/**
 * HTTP API after contact form: WhatsApp to owner.
 * Optional Gmail confirmation is sent to the lead when configured.
 *
 * Env:
 *   PORT (default 3840)
 *   API_KEY â€” required when NODE_ENV=production; client sends header x-api-key
 *   OWNER_WHATSAPP_E164 â€” digits only, default +972509250384 (050-9250384)
 *   CORS_ORIGIN â€” optional; comma-separated list, or * for any (dev only)
 *   WWEBJS_DATA_PATH â€” optional; folder for WhatsApp session (use a persistent disk path in production, e.g. Render mount)
 *   NOTIFY_MAX_PER_IP â€” max POST /api/notify-lead per IP per window (default 30)
 *   NOTIFY_WINDOW_MS â€” rate-limit window in ms (default 900000 = 15 min)
 *   TRUST_PROXY_HOPS â€” trust X-Forwarded-For from proxy (default 1; use on Render)
 *
 * First-time link (Render logs often hide ASCII QR): GET /setup/qr?token=<API_KEY>
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  isGmailConfigured,
  sendClientConfirmationEmail,
  sendOwnerLeadNotificationEmail,
} from './email.mjs';
import { enhanceCvText, isOpenAiConfigured } from './cv-openai.mjs';
import { registerSmartcropRoutes } from './lib/smartcropRoutes.mjs';
import { registerGenerativeRoutes } from './lib/generativeRoutes.mjs';
import { isSupabaseAdminConfigured } from './lib/supabaseAdmin.mjs';
import { isClipdropConfigured } from './lib/generativeService.mjs';

const log = (msg, ...args) => console.log(`[lead-notify ${new Date().toISOString()}]`, msg, ...args);
const logErr = (msg, ...args) => console.error(`[lead-notify ${new Date().toISOString()}]`, msg, ...args);

const PORT = Number(process.env.PORT) || 3840;
const API_KEY = (process.env.API_KEY ?? '').trim();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const corsOrigin = process.env.CORS_ORIGIN?.trim();
const configuredOrigins =
  corsOrigin && corsOrigin !== '*'
    ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

/** Always allow local Angular + production site origins for SmartCrop API calls. */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://lya-solution.com',
  'https://www.lya-solution.com',
  'https://lyasolution.com',
  'https://www.lyasolution.com',
];

const allowedOriginSet = new Set([
  ...(configuredOrigins ?? []),
  ...DEFAULT_ALLOWED_ORIGINS,
]);

const corsOptions = {
  origin(origin, callback) {
    // Non-browser / same-origin / server-to-server
    if (!origin) {
      callback(null, true);
      return;
    }
    if (!configuredOrigins || corsOrigin === '*') {
      callback(null, true);
      return;
    }
    if (allowedOriginSet.has(origin)) {
      callback(null, true);
      return;
    }
    logErr('CORS blocked origin', origin);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Type'],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? '1') || 1);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
/** Twilio WhatsApp webhooks post application/x-www-form-urlencoded */
app.use(express.urlencoded({ extended: false }));
/** 25mb allows generative-fill / process with large media_base64 payloads */
app.use(express.json({ limit: '25mb' }));

const NOTIFY_MAX_PER_IP = Math.max(1, Number(process.env.NOTIFY_MAX_PER_IP) || 30);
const NOTIFY_WINDOW_MS = Math.max(60_000, Number(process.env.NOTIFY_WINDOW_MS) || 15 * 60 * 1000);

const notifyRateLimiter = rateLimit({
  windowMs: NOTIFY_WINDOW_MS,
  limit: NOTIFY_MAX_PER_IP,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' },
});

/** Max lengths after trim â€” limits abuse / oversized WhatsApp payloads */
const LEAD_FIELD_MAX = {
  firstName: 80,
  lastName: 80,
  phone: 40,
  email: 254,
  message: 8000,
};

const CV_ENHANCE_MAX_TEXT = 12_000;
const CV_ENHANCE_FIELDS = new Set(['headline', 'summary', 'experience', 'education']);

function apiKeyMatches(provided) {
  if (!API_KEY) return false;
  if (typeof provided !== 'string') return false;
  try {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(API_KEY, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function checkApiKey(req, res) {
  if (IS_PRODUCTION && !API_KEY) {
    logErr('reject: production requires API_KEY');
    res.status(503).json({ ok: false, error: 'Service misconfigured' });
    return false;
  }
  if (!API_KEY) return true;
  const key = req.get('x-api-key');
  if (!apiKeyMatches(key ?? '')) {
    logErr('reject request: invalid or missing x-api-key');
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

const clientReady = false;

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    whatsappReady: clientReady,
    whatsappQrAvailable: false,
    gmailConfigured: isGmailConfigured(),
    openAiConfigured: isOpenAiConfigured(),
    supabaseAdminConfigured: isSupabaseAdminConfigured(),
    clipdropConfigured: isClipdropConfigured(),
    apiKeyRequired: IS_PRODUCTION || Boolean(API_KEY),
  });
});

registerSmartcropRoutes(app, {
  checkApiKey,
  rateLimiter: notifyRateLimiter,
  log,
  logErr,
});

registerGenerativeRoutes(app, {
  checkApiKey,
  rateLimiter: notifyRateLimiter,
  log,
  logErr,
});

app.post('/api/cv/enhance', notifyRateLimiter, async (req, res) => {
  log('HTTP POST /api/cv/enhance', { ip: req.ip ?? '' });
  if (!checkApiKey(req, res)) return;

  if (!isOpenAiConfigured()) {
    res.status(503).json({ ok: false, error: 'OPENAI_API_KEY not configured on server' });
    return;
  }

  const { text, field, lang, desiredRole } = req.body ?? {};
  if (typeof text !== 'string' || typeof field !== 'string') {
    res.status(400).json({ ok: false, error: 'Invalid body' });
    return;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    res.status(400).json({ ok: false, error: 'Empty text' });
    return;
  }
  if (trimmed.length > CV_ENHANCE_MAX_TEXT) {
    res.status(400).json({ ok: false, error: 'Text too long' });
    return;
  }
  if (!CV_ENHANCE_FIELDS.has(field)) {
    res.status(400).json({ ok: false, error: 'Invalid field' });
    return;
  }

  const langNorm = lang === 'he' ? 'he' : 'en';
  const role = typeof desiredRole === 'string' ? desiredRole.trim().slice(0, 120) : '';

  try {
    const improved = await enhanceCvText({
      text: trimmed,
      field,
      lang: langNorm,
      desiredRole: role,
    });
    log('cv/enhance: OK', { field, lang: langNorm, len: improved.length });
    res.json({ ok: true, text: improved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logErr('cv/enhance: FAIL', msg);
    res.status(502).json({ ok: false, error: msg });
  }
});

app.post('/api/notify-lead', notifyRateLimiter, async (req, res) => {
  log('HTTP POST /api/notify-lead', { ip: req.ip ?? req.socket?.remoteAddress ?? '' });
  if (!checkApiKey(req, res)) return;

  const { firstName, lastName, phone, email, message } = req.body ?? {};
  if (
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof phone !== 'string' ||
    typeof email !== 'string' ||
    typeof message !== 'string'
  ) {
    logErr('notify-lead: invalid body');
    res.status(400).json({ ok: false, error: 'Invalid body' });
    return;
  }

  const lead = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    email: email.trim(),
    message: message.trim(),
  };

  if (
    !lead.firstName ||
    !lead.lastName ||
    !lead.phone ||
    !lead.email ||
    !lead.message
  ) {
    res.status(400).json({ ok: false, error: 'Missing required fields' });
    return;
  }

  for (const key of Object.keys(LEAD_FIELD_MAX)) {
    const max = LEAD_FIELD_MAX[key];
    if (lead[key].length > max) {
      logErr('notify-lead: field too long', key, lead[key].length);
      res.status(400).json({ ok: false, error: 'Invalid payload' });
      return;
    }
  }

  log('notify-lead: received', {
    toEmail: lead.email,
    name: `${lead.firstName} ${lead.lastName}`,
    whatsappReady: false,
    gmailConfigured: isGmailConfigured(),
  });

  let whatsappSent = false;
  let whatsappError = null;
  log('WhatsApp: DISABLED (email-only mode)');

  let emailSent = false;
  let emailError = null;
  if (isGmailConfigured()) {
    try {
      log('Email: START client confirmation →', lead.email);
      await sendClientConfirmationEmail(lead);
      log('Email: OK client confirmation →', lead.email);
      log('Email: START owner notification →', process.env.GMAIL_USER?.trim() ?? '(missing GMAIL_USER)');
      await sendOwnerLeadNotificationEmail(lead);
      log('Email: OK owner notification');
      emailSent = true;
      log('Email: OK →', lead.email);
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      logErr('Email: FAIL', emailError);
    }
  } else {
    log('Email: SKIP (GMAIL_USER / GMAIL_APP_PASSWORD not set)');
  }

  if (!whatsappSent && !emailSent) {
    const hint = isGmailConfigured()
      ? 'Failed to send email. Check logs and Gmail configuration.'
      : 'Gmail not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD.';
    logErr('notify-lead: no channel succeeded', { whatsappError, emailError });
    res.status(503).json({ ok: false, error: hint, whatsappError, emailError });
    return;
  }

  log('notify-lead: done', { whatsapp: whatsappSent, email: emailSent });
  res.json({
    ok: true,
    whatsapp: whatsappSent,
    email: emailSent,
    ...(whatsappError && { whatsappError }),
    ...(emailError && { emailError }),
  });
});

app.listen(PORT, () => {
  log(`listening on http://0.0.0.0:${PORT}`);
  log('POST /api/notify-lead — body: { firstName, lastName, phone, email, message }');
  log('POST /api/cv/enhance — body: { text, field, lang, desiredRole? }');
  log('POST /api/whatsapp/webhook — SmartCrop (JSON demo + Twilio WhatsApp form)');
  if (process.env.TWILIO_ACCOUNT_SID?.trim()) log('Twilio WhatsApp: credentials present');
  else log('Twilio WhatsApp: TWILIO_* not set (JSON webhook still works)');
  log('POST /api/crop/process — SmartCrop re-crop');
  log('POST /api/photos/upload — SmartCrop browser multipart upload');
  log('POST /api/photos/send-to-print — mark printed + hotfolder paths');
  log('POST /api/photos/batch-update — SmartCrop batch');
  if (isOpenAiConfigured()) log('OpenAI: configured for CV enhance');
  else log('OpenAI: OPENAI_API_KEY not set (CV enhance unavailable)');
  if (isSupabaseAdminConfigured()) log('Supabase admin: configured for SmartCrop');
  else log('Supabase admin: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  log('WhatsApp runtime disabled (email-only mode).');
  if (IS_PRODUCTION) {
    if (!API_KEY) {
      logErr('FATAL: NODE_ENV=production requires API_KEY. Set API_KEY in your host env.');
      process.exit(1);
    }
    log('API_KEY is set (required in production)');
    log(`Rate limit: ${NOTIFY_MAX_PER_IP} requests / ${NOTIFY_WINDOW_MS}ms per IP`);
  } else if (API_KEY) {
    log('API_KEY is set (require x-api-key header)');
  } else {
    log('API_KEY not set (open endpoint â€” dev only; set API_KEY before production)');
  }
  if (isGmailConfigured()) log('Gmail: configured');
});

