/**
 * Twilio WhatsApp → SmartCrop ingest helper.
 * Notes: Parses Twilio form fields, downloads media, maps into process payload.
 */
import { normalizePhoneE164, parseSizeFromCaption } from './whatsappParser.mjs';
import {
  buildTwimlReply,
  downloadTwilioMedia,
  isTwilioConfigured,
  sendWhatsAppMessage,
  validateTwilioWebhook,
} from './twilioService.mjs';

/**
 * Notes: Detect Twilio inbound payload (form fields From / MessageSid).
 * @param {Record<string, unknown>} body
 */
export function isTwilioInbound(body) {
  if (!body || typeof body !== 'object') return false;
  const from = String(body.From ?? '');
  return Boolean(body.MessageSid || from.toLowerCase().startsWith('whatsapp:'));
}

/**
 * Notes: Extract Twilio WhatsApp fields from req.body (urlencoded).
 * @param {Record<string, unknown>} body
 */
export function parseTwilioWhatsAppBody(body) {
  const From = String(body.From ?? '');
  const Body = String(body.Body ?? '');
  const NumMedia = Number(body.NumMedia ?? 0);
  const MediaUrl0 = String(body.MediaUrl0 ?? '');
  const MediaContentType0 = String(body.MediaContentType0 ?? '');
  const senderPhone = normalizePhoneE164(From.replace(/^whatsapp:/i, ''));

  return {
    From,
    Body,
    NumMedia,
    MediaUrl0,
    MediaContentType0,
    senderPhone,
    caption_text: Body,
  };
}

/**
 * Notes: Validate X-Twilio-Signature when TWILIO_VALIDATE_SIGNATURE=1.
 * @param {import('express').Request} req
 * @param {Record<string, string>} params
 */
export function assertTwilioSignature(req, params) {
  if (process.env.TWILIO_VALIDATE_SIGNATURE !== '1') return true;
  const signature = req.get('x-twilio-signature');
  const publicUrl =
    process.env.TWILIO_WEBHOOK_PUBLIC_URL?.trim() ||
    `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  return validateTwilioWebhook(signature, publicUrl, params);
}

/**
 * Notes: Load primary image bytes from MediaUrl0 (Twilio Basic Auth).
 * @param {{ NumMedia: number, MediaUrl0: string, MediaContentType0: string }} parsed
 * @returns {Promise<{ media_base64?: string, media_url?: string, contentType?: string }>}
 */
export async function resolveTwilioMedia(parsed) {
  if (!(parsed.NumMedia > 0) || !parsed.MediaUrl0) {
    return {};
  }
  if (parsed.MediaContentType0 && !parsed.MediaContentType0.startsWith('image/')) {
    throw new Error(`Unsupported media type: ${parsed.MediaContentType0}`);
  }
  if (isTwilioConfigured()) {
    const buffer = await downloadTwilioMedia(parsed.MediaUrl0);
    return {
      media_base64: `data:${parsed.MediaContentType0 || 'image/jpeg'};base64,${buffer.toString('base64')}`,
      contentType: parsed.MediaContentType0 || 'image/jpeg',
    };
  }
  // Fallback: pass URL through (may fail without auth).
  return { media_url: parsed.MediaUrl0, contentType: parsed.MediaContentType0 };
}

/**
 * Notes: Reply via TwiML string or async REST outbound (returns mode).
 * @param {{ From: string, reply: string, preferRest?: boolean }} opts
 * @returns {Promise<{ mode: 'twiml' | 'rest', twiml?: string }>}
 */
export async function replyToWhatsApp({ From, reply, preferRest = false }) {
  if (preferRest && isTwilioConfigured() && From) {
    await sendWhatsAppMessage({ to: From, body: reply });
    return { mode: 'rest' };
  }
  return { mode: 'twiml', twiml: buildTwimlReply(reply) };
}

export { parseSizeFromCaption, isTwilioConfigured, sendWhatsAppMessage };
