/**
 * Next.js App Router — Twilio WhatsApp webhook (portable reference).
 *
 * Live endpoint in this repo (Express):
 *   POST https://YOUR_API_HOST/api/whatsapp/webhook
 *
 * To use in a Next.js app, copy:
 *   lib/twilioService.ts  →  <next-app>/lib/twilioService.ts
 *   this file             →  <next-app>/app/api/whatsapp/webhook/route.ts
 * and set import to `@/lib/twilioService` (or relative `../../../../lib/twilioService`).
 */
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import {
  isTwilioConfigured,
  sendWhatsAppMessage,
  validateTwilioWebhook,
} from '../../../../lib/twilioService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notes: POST receives Twilio formData — From, Body, NumMedia, MediaUrl0, MediaContentType0.
 * Returns TwiML XML, or 200 OK when using async REST outbound.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const From = String(formData.get('From') ?? '');
  const Body = String(formData.get('Body') ?? '');
  const NumMedia = Number(formData.get('NumMedia') ?? 0);
  const MediaUrl0 = String(formData.get('MediaUrl0') ?? '');
  const MediaContentType0 = String(formData.get('MediaContentType0') ?? '');

  console.log('[twilio/whatsapp webhook]', {
    from: From,
    body: Body,
    numMedia: NumMedia,
    mediaUrl: MediaUrl0 || null,
    mediaContentType: MediaContentType0 || null,
  });

  if (process.env.TWILIO_VALIDATE_SIGNATURE === '1') {
    const signature = req.headers.get('x-twilio-signature');
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });
    const url = process.env.TWILIO_WEBHOOK_PUBLIC_URL?.trim() || req.url;
    if (!validateTwilioWebhook(signature, url, params)) {
      return new NextResponse('Invalid signature', { status: 403 });
    }
  }

  const reply =
    NumMedia > 0 && MediaUrl0
      ? 'קיבלנו את התמונה — מעבדים לחיתוך הדפסה ✨'
      : Body
        ? 'קיבלנו את ההודעה. שלחו תמונה להדפסה עם גודל (למשל 10x15).'
        : 'שלום מ-SmartCrop! שלחו תמונה להתחלת הזמנה.';

  // Protocol A — TwiML (default)
  if (process.env.TWILIO_REPLY_MODE !== 'rest') {
    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    twiml.message(reply);
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }

  // Protocol B — async REST outbound + 200 OK
  if (isTwilioConfigured() && From) {
    void sendWhatsAppMessage({ to: From, body: reply }).catch(console.error);
  }
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'twilio-whatsapp-webhook',
    configured: isTwilioConfigured(),
  });
}
