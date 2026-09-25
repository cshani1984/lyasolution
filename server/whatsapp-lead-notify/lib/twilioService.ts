/**
 * Twilio WhatsApp outbound service.
 * Notes: Uses official `twilio` SDK with Account SID + Auth Token.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_NUMBER  e.g. whatsapp:+14155238886
 */
import twilio from 'twilio';

export type SendWhatsAppMessageInput = {
  /** Destination WhatsApp address, e.g. whatsapp:+9725..., or bare +E.164 */
  to: string;
  /** Message body text */
  body: string;
  /** Optional public media URL (image) */
  mediaUrl?: string | string[];
};

/**
 * Notes: True when SID + token + WhatsApp from-number are present.
 */
export function isTwilioConfigured(): boolean {
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
 */
export function toWhatsAppAddress(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('whatsapp:')) return s;
  const digits = s.startsWith('+') ? s : `+${s.replace(/[^\d]/g, '')}`;
  return `whatsapp:${digits}`;
}

/**
 * Notes: Send an outbound WhatsApp message (text and optional media).
 */
export async function sendWhatsAppMessage({
  to,
  body,
  mediaUrl,
}: SendWhatsAppMessageInput) {
  const from = process.env.TWILIO_WHATSAPP_NUMBER?.trim();
  if (!from) {
    throw new Error('TWILIO_WHATSAPP_NUMBER is required');
  }

  const client = getTwilioClient();
  const payload: {
    from: string;
    to: string;
    body: string;
    mediaUrl?: string[];
  } = {
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
 */
export function validateTwilioWebhook(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken || !signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

/**
 * Notes: Download MediaUrl0 with Twilio Basic Auth (media is not public).
 */
export async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
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
 * Notes: Build TwiML MessagingResponse XML string.
 */
export function buildTwimlReply(replyBody?: string): string {
  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();
  if (replyBody) twiml.message(replyBody);
  return twiml.toString();
}
