/**
 * Client confirmation email via Gmail SMTP — DISABLED.
 * Uncomment the block below and re-enable the import in server.mjs when turning email back on.
 */
/*
import nodemailer from 'nodemailer';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isGmailConfigured() {
  const u = process.env.GMAIL_USER?.trim();
  const p = normalizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD);
  return Boolean(u && p);
}

function normalizeGmailAppPassword(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').trim();
}

export async function sendClientConfirmationEmail(lead) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = normalizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) {
    throw new Error('Gmail not configured (GMAIL_USER / GMAIL_APP_PASSWORD)');
  }

  const fromName = (process.env.GMAIL_FROM_NAME ?? 'Lya Solution').trim();
  const subject =
    (process.env.CLIENT_EMAIL_SUBJECT ?? 'קיבלנו את הפנייה שלך — Lya Solution').trim();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  if (pass.length !== 16) {
    throw new Error(
      'GMAIL_APP_PASSWORD should be 16 characters (Google App Password). ' +
        'Remove spaces when pasting. Do not use your normal Gmail password.',
    );
  }

  const fn = lead.firstName.trim();
  const to = lead.email.trim().toLowerCase();
  const body = lead.message.trim();

  const text = [
    `היי ${fn},`,
    '',
    'קיבלנו את הפנייה שלך ונחזור אליך בהקדם.',
    '',
    'סיכום הפנייה:',
    body,
    '',
    'בברכה,',
    fromName,
  ].join('\n');

  const safeFn = escapeHtml(fn);
  const safeBody = escapeHtml(body);

  const html = `
<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #222;">
  <p>היי ${safeFn},</p>
  <p>תודה שפנית אלינו דרך האתר. קיבלנו את ההודעה שלך ונחזור אליך בהקדם.</p>
  <p><strong>סיכום הפנייה:</strong></p>
  <blockquote style="margin: 0; padding: 12px 16px; border-right: 3px solid #7b1fa2; background: #f9f9f9;">
    ${safeBody.replace(/\n/g, '<br />')}
  </blockquote>
  <p>בברכה,<br />${escapeHtml(fromName)}</p>
</div>`.trim();

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to,
      replyTo: user,
      subject,
      text,
      html,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const response = typeof err === 'object' && err && 'response' in err ? String((err).response) : '';
    const combined = `${msg} ${response}`;
    if (/invalid login|535|authentication failed|bad credentials/i.test(combined)) {
      throw new Error(
        'Gmail rejected the login. Fix: (1) Turn on 2-Step Verification for this Google account. ' +
          '(2) Create an App Password at https://myaccount.google.com/apppasswords — 16 characters. ' +
          '(3) Set GMAIL_USER to the full Gmail address and GMAIL_APP_PASSWORD to that App Password only (not your normal password). ' +
          `Underlying: ${msg}`,
      );
    }
    throw err;
  }
}
*/
