/**
 * HTTP API after contact form: WhatsApp to owner.
 * Gmail confirmation to client — disabled (see commented import + block in /api/notify-lead, and email.mjs).
 *
 * Env:
 *   PORT (default 3840)
 *   API_KEY — required when NODE_ENV=production; client sends header x-api-key
 *   OWNER_WHATSAPP_E164 — digits only, default +972509250384 (050-9250384)
 *   CORS_ORIGIN — optional; comma-separated list, or * for any (dev only)
 *   WWEBJS_DATA_PATH — optional; folder for WhatsApp session (use a persistent disk path in production, e.g. Render mount)
 *   NOTIFY_MAX_PER_IP — max POST /api/notify-lead per IP per window (default 30)
 *   NOTIFY_WINDOW_MS — rate-limit window in ms (default 900000 = 15 min)
 *   TRUST_PROXY_HOPS — trust X-Forwarded-For from proxy (default 1; use on Render)
 */
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
// import { isGmailConfigured, sendClientConfirmationEmail } from './email.mjs';

const { Client, LocalAuth } = pkg;

const log = (msg, ...args) => console.log(`[lead-notify ${new Date().toISOString()}]`, msg, ...args);
const logErr = (msg, ...args) => console.error(`[lead-notify ${new Date().toISOString()}]`, msg, ...args);

const PORT = Number(process.env.PORT) || 3840;
const API_KEY = (process.env.API_KEY ?? '').trim();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const OWNER_E164 = (process.env.OWNER_WHATSAPP_E164 ?? '+972509250384').replace(/\D/g, '');
const OWNER_JID = `${OWNER_E164}@c.us`;

const corsOrigin = process.env.CORS_ORIGIN?.trim();
const corsOptions =
  corsOrigin === '*' || !corsOrigin
    ? { origin: true }
    : { origin: corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) };

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? '1') || 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));

const NOTIFY_MAX_PER_IP = Math.max(1, Number(process.env.NOTIFY_MAX_PER_IP) || 30);
const NOTIFY_WINDOW_MS = Math.max(60_000, Number(process.env.NOTIFY_WINDOW_MS) || 15 * 60 * 1000);

const notifyRateLimiter = rateLimit({
  windowMs: NOTIFY_WINDOW_MS,
  limit: NOTIFY_MAX_PER_IP,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' },
});

/** Max lengths after trim — limits abuse / oversized WhatsApp payloads */
const LEAD_FIELD_MAX = {
  firstName: 80,
  lastName: 80,
  phone: 40,
  email: 254,
  message: 8000,
};

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

let clientReady = false;
let clientStarting = false;

const puppeteerExecutable = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
const wwebjsDataPath = (process.env.WWEBJS_DATA_PATH ?? '.wwebjs_auth').trim() || '.wwebjs_auth';

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: wwebjsDataPath }),
  puppeteer: {
    headless: true,
    executablePath: puppeteerExecutable || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp (Linked devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  clientReady = true;
  log('WhatsApp client ready. Owner JID:', OWNER_JID);
});

client.on('auth_failure', (m) => logErr('WhatsApp auth_failure:', m));
client.on('disconnected', (r) => {
  clientReady = false;
  logErr('WhatsApp disconnected:', r);
});

function startClient() {
  if (clientStarting) return;
  clientStarting = true;
  client.initialize().catch((e) => {
    clientStarting = false;
    logErr('Failed to initialize WhatsApp client:', e);
  });
}

startClient();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    whatsappReady: clientReady,
    gmailConfigured: false, // was: isGmailConfigured() — email sending disabled
    apiKeyRequired: IS_PRODUCTION || Boolean(API_KEY),
  });
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
    whatsappReady: clientReady,
    gmailConfigured: false,
  });

  const text = [
    'ליד חדש מהאתר:',
    `שם: ${lead.firstName} ${lead.lastName}`,
    `טלפון: ${lead.phone}`,
    `מייל: ${lead.email}`,
    `הודעה: ${lead.message}`,
  ].join('\n');

  let whatsappSent = false;
  let whatsappError = null;
  if (clientReady) {
    try {
      await client.sendMessage(OWNER_JID, text);
      whatsappSent = true;
      log('WhatsApp: OK →', OWNER_JID);
    } catch (e) {
      whatsappError = e instanceof Error ? e.message : String(e);
      logErr('WhatsApp: FAIL', whatsappError);
    }
  } else {
    log('WhatsApp: SKIP (client not ready — scan QR in this terminal)');
  }

  let emailSent = false;
  let emailError = null;
  /*
  if (isGmailConfigured()) {
    try {
      await sendClientConfirmationEmail(lead);
      emailSent = true;
      log('Email: OK →', lead.email);
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      logErr('Email: FAIL', emailError);
    }
  } else {
    log('Email: SKIP (GMAIL_USER / GMAIL_APP_PASSWORD not set)');
  }
  */

  if (!whatsappSent && !emailSent) {
    const hint = !clientReady
      ? 'WhatsApp not connected. Scan QR in server logs.'
      : 'Failed to send WhatsApp. Check logs.';
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
    log('API_KEY not set (open endpoint — dev only; set API_KEY before production)');
  }
  // if (isGmailConfigured()) log('Gmail: configured');
  if (puppeteerExecutable) log('Puppeteer executable:', puppeteerExecutable);
});
