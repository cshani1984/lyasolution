/**
 * HTTP API for sending WhatsApp messages to the business owner after a lead.
 * Uses whatsapp-web.js (WhatsApp Web session — scan QR once on first run).
 *
 * Env:
 *   PORT (default 3840)
 *   API_KEY — if set, client must send header x-api-key with this value
 *   OWNER_WHATSAPP_E164 — digits only, default 972509250384 (050-9250384)
 *   CORS_ORIGIN — optional; comma-separated list, or * for any (dev only)
 */
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const PORT = Number(process.env.PORT) || 3840;
const API_KEY = (process.env.API_KEY ?? '').trim();
const OWNER_E164 = (process.env.OWNER_WHATSAPP_E164 ?? '+972509250384').replace(/\D/g, '');
const OWNER_JID = `${OWNER_E164}@c.us`;

const corsOrigin = process.env.CORS_ORIGIN?.trim();
const corsOptions =
  corsOrigin === '*' || !corsOrigin
    ? { origin: true }
    : { origin: corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) };

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));

let clientReady = false;
let clientStarting = false;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp (Linked devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  clientReady = true;
  console.log('WhatsApp client ready. Owner JID:', OWNER_JID);
});

client.on('auth_failure', (m) => console.error('WhatsApp auth_failure:', m));
client.on('disconnected', (r) => {
  clientReady = false;
  console.warn('WhatsApp disconnected:', r);
});

function startClient() {
  if (clientStarting) return;
  clientStarting = true;
  client.initialize().catch((e) => {
    clientStarting = false;
    console.error('Failed to initialize WhatsApp client:', e);
  });
}

startClient();

function checkApiKey(req, res) {
  if (!API_KEY) return true;
  const key = req.get('x-api-key');
  if (key !== API_KEY) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, whatsappReady: clientReady });
});

app.post('/api/notify-lead', async (req, res) => {
  if (!checkApiKey(req, res)) return;

  if (!clientReady) {
    res.status(503).json({
      ok: false,
      error: 'WhatsApp not connected yet. Open server logs and scan the QR code.',
    });
    return;
  }

  const { firstName, lastName, phone, email, message } = req.body ?? {};
  if (
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof phone !== 'string' ||
    typeof email !== 'string' ||
    typeof message !== 'string'
  ) {
    res.status(400).json({ ok: false, error: 'Invalid body' });
    return;
  }

  const text = [
    'ליד חדש מהאתר:',
    `שם: ${firstName.trim()} ${lastName.trim()}`,
    `טלפון: ${phone.trim()}`,
    `מייל: ${email.trim()}`,
    `הודעה: ${message.trim()}`,
  ].join('\n');

  try {
    await client.sendMessage(OWNER_JID, text);
    res.json({ ok: true });
  } catch (e) {
    console.error('sendMessage error:', e);
    res.status(500).json({ ok: false, error: 'Failed to send WhatsApp message' });
  }
});

app.listen(PORT, () => {
  console.log(`Lead notify API listening on http://0.0.0.0:${PORT}`);
  console.log('POST /api/notify-lead with JSON { firstName, lastName, phone, email, message }');
});
