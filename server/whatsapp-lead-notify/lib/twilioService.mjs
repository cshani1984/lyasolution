/**
 * Twilio WhatsApp outbound service (Node ESM runtime).
 * TypeScript twin: ./twilioService.ts
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
 */
import twilio from 'twilio';

/**
 * Notes: True when SID + token + WhatsApp from-number are present.
 * @returns {boolean}
 */
export function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_NUMBER?.trim(),
  );
}

/**
 * Notes: Lazy Twilio REST client (accountSid, authToken).
 */
export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  }
  return twilio(accountSid, authToken);
}

/**
 * Notes: Normalize to Twilio WhatsApp address (`whatsapp:+E164`).
 * @param {string} raw
 * @returns {string}
 */
export function toWhatsAppAddress(raw) {
  const s = (raw ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('whatsapp:')) return s;
  const digits = s.startsWith('+') ? s : `+${s.replace(/[^\d]/g, '')}`;
  return `whatsapp:${digits}`;
}

/**
 * Notes: Send an outbound WhatsApp message (text + optional media).
 * @param {{ to: string, body: string, mediaUrl?: string | string[] }} opts
 */
export async function sendWhatsAppMessage({ to, body, mediaUrl }) {
  const from = process.env.TWILIO_WHATSAPP_NUMBER?.trim();
  if (!from) {
    throw new Error('TWILIO_WHATSAPP_NUMBER is required');
  }

  const client = getTwilioClient();
  /** @type {{ from: string, to: string, body: string, mediaUrl?: string[] }} */
  const payload = {
    from,
    to: toWhatsAppAddress(to),
    body: body ?? '',
  };

  if (mediaUrl) {
    payload.mediaUrl = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
  }

  return client.messages.create(payload);
}

/**
 * Notes: Validate Twilio webhook signature (X-Twilio-Signature).
 * @param {string | null | undefined} signature
 * @param {string} url
 * @param {Record<string, string>} params
 * @returns {boolean}
 */
export function validateTwilioWebhook(signature, url, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken || !signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

/**
 * Notes: Download MediaUrl0 with Twilio Basic Auth (media is not public).
 * @param {string} mediaUrl
 * @returns {Promise<Buffer>}
 */
export async function downloadTwilioMedia(mediaUrl) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials required to download media');
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Twilio media download failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Notes: Build empty/ack TwiML, optionally with a reply message.
 * @param {string} [replyBody]
 * @returns {string}
 */
export function buildTwimlReply(replyBody) {
  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();
  if (replyBody) {
    twiml.message(replyBody);
  }
  return twiml.toString();
}
