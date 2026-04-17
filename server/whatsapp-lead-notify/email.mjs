import nodemailer from 'nodemailer';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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

function createGmailTransport() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = normalizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) {
    throw new Error('Gmail not configured (GMAIL_USER / GMAIL_APP_PASSWORD)');
  }
  if (pass.length !== 16) {
    throw new Error(
      'GMAIL_APP_PASSWORD should be 16 characters (Google App Password). ' +
        'Remove spaces when pasting. Do not use your normal Gmail password.',
    );
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return { transporter, user };
}

function wrapAuthError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const response = typeof err === 'object' && err && 'response' in err ? String(err.response) : '';
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

/**
 * @param {{ firstName: string; lastName: string; email: string; message: string }} lead
 */
export async function sendClientConfirmationEmail(lead) {
  const { transporter, user } = createGmailTransport();

  const fromName = (process.env.GMAIL_FROM_NAME ?? 'Lya Solution').trim();
  const subject =
    (process.env.CLIENT_EMAIL_SUBJECT ?? 'קיבלנו את הפנייה שלך — Lya Solution').trim();

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
    console.log('[email] sendClientConfirmationEmail: sending', {
      to,
      fromUser: user,
      subject,
    });
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to,
      replyTo: user,
      subject,
      text,
      html,
    });
    console.log('[email] sendClientConfirmationEmail: sent', { to });
  } catch (err) {
    console.error('[email] sendClientConfirmationEmail: failed', err);
    wrapAuthError(err);
  }
}

/**
 * @param {{ firstName: string; lastName: string; phone: string; email: string; message: string }} lead
 */
export async function sendOwnerLeadNotificationEmail(lead) {
  const { transporter, user } = createGmailTransport();
  const fromName = (process.env.GMAIL_FROM_NAME ?? 'Lya Solution').trim();
  const subject = `ליד חדש מהאתר — ${lead.firstName.trim()} ${lead.lastName.trim()}`;
  const body = [
    'ליד חדש מהאתר:',
    `שם: ${lead.firstName.trim()} ${lead.lastName.trim()}`,
    `טלפון: ${lead.phone.trim()}`,
    `מייל: ${lead.email.trim().toLowerCase()}`,
    '',
    'הודעה:',
    lead.message.trim(),
  ].join('\n');

  const html = `
<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #222;">
  <h3 style="margin: 0 0 12px;">ליד חדש מהאתר</h3>
  <p><strong>שם:</strong> ${escapeHtml(lead.firstName.trim())} ${escapeHtml(lead.lastName.trim())}</p>
  <p><strong>טלפון:</strong> ${escapeHtml(lead.phone.trim())}</p>
  <p><strong>מייל:</strong> ${escapeHtml(lead.email.trim().toLowerCase())}</p>
  <p><strong>הודעה:</strong></p>
  <blockquote style="margin: 0; padding: 12px 16px; border-right: 3px solid #7b1fa2; background: #f9f9f9;">
    ${escapeHtml(lead.message.trim()).replace(/\n/g, '<br />')}
  </blockquote>
</div>`.trim();

  try {
    console.log('[email] sendOwnerLeadNotificationEmail: sending', {
      to: user,
      replyTo: lead.email.trim().toLowerCase(),
      subject,
    });
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: user,
      replyTo: lead.email.trim().toLowerCase(),
      subject,
      text: body,
      html,
    });
    console.log('[email] sendOwnerLeadNotificationEmail: sent', { to: user });
  } catch (err) {
    console.error('[email] sendOwnerLeadNotificationEmail: failed', err);
    wrapAuthError(err);
  }
}


