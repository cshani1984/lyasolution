import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type LeadPayload = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  message: string;
  creation_date?: string;
};

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendWhatsAppToOwner(lead: LeadPayload): Promise<void> {
  const twilioSid = getRequiredEnv('TWILIO_ACCOUNT_SID');
  const twilioToken = getRequiredEnv('TWILIO_AUTH_TOKEN');
  const fromWhatsApp = getRequiredEnv('TWILIO_WHATSAPP_FROM');
  const ownerWhatsApp = getRequiredEnv('OWNER_WHATSAPP_TO');

  const text = [
    'ליד חדש מהאתר:',
    `שם: ${lead.first_name} ${lead.last_name}`,
    `טלפון: ${lead.phone}`,
    `מייל: ${lead.email}`,
    `הודעה: ${lead.message}`,
  ].join('\n');

  const body = new URLSearchParams({
    From: fromWhatsApp,
    To: ownerWhatsApp,
    Body: text,
  });

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const auth = btoa(`${twilioSid}:${twilioToken}`);

  const response = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Twilio error: ${response.status} ${errText}`);
  }
}

/** Off unless `SEND_CLIENT_EMAIL` is exactly `true` (Resend; not Twilio). */
function shouldSendClientEmail(): boolean {
  return Deno.env.get('SEND_CLIENT_EMAIL') === 'true';
}

async function sendConfirmationEmailToClient(lead: LeadPayload): Promise<void> {
  const resendApiKey = getRequiredEnv('RESEND_API_KEY');
  const fromEmail = getRequiredEnv('RESEND_FROM_EMAIL');

  const safeFirstName = escapeHtml(lead.first_name);
  const safeMessage = escapeHtml(lead.message);

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>היי ${safeFirstName},</p>
      <p>תודה שפנית דרך האתר. קיבלתי את ההודעה שלך ואחזור אליך בהקדם.</p>
      <p><strong>סיכום קצר של הפנייה:</strong></p>
      <blockquote style="margin: 0; padding: 10px 14px; border-right: 3px solid #ccc;">
        ${safeMessage}
      </blockquote>
      <p>בברכה,<br />Lya Solutions</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [lead.email],
      subject: 'קיבלנו את הפנייה שלך',
      html,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend error: ${response.status} ${errText}`);
  }
}

serve(async (req: any) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const lead = (await req.json()) as LeadPayload;

    if (!lead?.email || !lead?.phone || !lead?.first_name || !lead?.last_name || !lead?.message) {
      return new Response('Bad Request: missing lead fields', { status: 400 });
    }

    const tasks: Promise<void>[] = [sendWhatsAppToOwner(lead)];
    if (shouldSendClientEmail()) {
      tasks.push(sendConfirmationEmailToClient(lead));
    }
    await Promise.all(tasks);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
