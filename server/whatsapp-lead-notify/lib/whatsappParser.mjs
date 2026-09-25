/**
 * WhatsApp caption / phone helpers for SmartCrop studio ingestion.
 * Notes: Parses size, copies, paper, customer name + phone from free-text captions.
 */

const SIZE_ALIASES = [
  { pattern: /\b10\s*[x×]\s*15\b/i, name: '10x15' },
  { pattern: /\b13\s*[x×]\s*18\b/i, name: '13x18' },
  { pattern: /\b20\s*[x×]\s*30\b/i, name: '20x30' },
  { pattern: /\ba4\b/i, name: 'A4' },
  { pattern: /\bגלויה\b|\bpostcard\b/i, name: '10x15' },
  { pattern: /\bהגדלה\b|\benlargement\b/i, name: '20x30' },
];

const PAPER_ALIASES = [
  { pattern: /\blustre\b|\bלאסטר\b|\bלסטר\b/i, name: 'Lustre' },
  { pattern: /\bgloss(?:y)?\b|\bגלוס\b|\bמבריק\b/i, name: 'Gloss' },
  { pattern: /\bmatte\b|\bmatt\b|\bמט(?:י)?\b/i, name: 'Matte' },
];

const GREETINGS = new Set([
  'היי',
  'שלום',
  'הי',
  'בוקר',
  'ערב',
  'hi',
  'hello',
  'hey',
]);

/**
 * Normalize to E.164-ish (+digits). Israeli local 05x → +9725x.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePhoneE164(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^05\d{8}$/.test(s)) s = `+972${s.slice(1)}`;
  if (/^5\d{8}$/.test(s) && !s.startsWith('+')) s = `+972${s}`;
  if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = `+${s}`;
  return s;
}

/**
 * Parse caption for print size name. Defaults to 10x15.
 * @param {string | null | undefined} caption
 * @returns {string}
 */
export function parseSizeFromCaption(caption) {
  return parseWhatsAppOrder(caption).sizeName;
}

/**
 * Notes: Full order parse from WhatsApp / forward caption.
 * Supports HE+EN: sizes, copies, paper, embedded phone, customer name.
 *
 * @param {string | null | undefined} caption
 * @returns {{
 *   sizeName: string,
 *   copies: number,
 *   paperType: string | null,
 *   customerPhone: string,
 *   customerName: string | null,
 *   parseConfidence: number,
 *   summary: string,
 * }}
 */
export function parseWhatsAppOrder(caption) {
  const text = (caption ?? '').trim();
  let sizeName = '10x15';
  let sizeHit = false;
  for (const { pattern, name } of SIZE_ALIASES) {
    if (pattern.test(text)) {
      sizeName = name;
      sizeHit = true;
      break;
    }
  }

  let copies = 1;
  let copiesHit = false;
  const copiesMatch =
    text.match(/(\d+)\s*(?:עותקים|עותק|copies?|pcs?)/i) ||
    text.match(/(?:x|×)\s*(\d+)(?!\s*\d)/i) ||
    text.match(/(\d+)\s*[x×](?!\s*\d)/i);
  if (copiesMatch) {
    const n = Number(copiesMatch[1]);
    if (Number.isFinite(n) && n > 0 && n < 500) {
      copies = n;
      copiesHit = true;
    }
  }

  let paperType = null;
  for (const { pattern, name } of PAPER_ALIASES) {
    if (pattern.test(text)) {
      paperType = name;
      break;
    }
  }

  const phoneMatch = text.match(
    /(?:\+972[\s-]?)?(?:0?5\d[\s-]?\d{3}[\s-]?\d{4}|\+?\d{10,15})/,
  );
  const customerPhone = phoneMatch ? normalizePhoneE164(phoneMatch[0]) : '';

  let customerName = null;
  const nameLabeled = text.match(
    /(?:שם(?:\s*הלקוח)?|customer|name)\s*[:\-–]\s*([^\n,|]+)/i,
  );
  if (nameLabeled) {
    customerName = cleanName(nameLabeled[1]);
  } else {
    // Prefer full Hebrew/Latin name tokens near the phone (not greeting words)
    const nearPhone = phoneMatch
      ? text.slice(Math.max(0, (phoneMatch.index ?? 0) - 40), phoneMatch.index ?? 0)
      : '';
    const nameNear = nearPhone.match(
      /([A-Za-z\u0590-\u05FF]{2,}(?:\s+[A-Za-z\u0590-\u05FF]{2,}){0,3})\s*$/,
    );
    if (nameNear) {
      customerName = cleanName(nameNear[1]);
    }
    if (!customerName || GREETINGS.has(customerName.split(/\s+/)[0])) {
      const allNames = [...text.matchAll(/([A-Za-z\u0590-\u05FF]{2,}(?:\s+[A-Za-z\u0590-\u05FF]{2,})+)/g)].map(
        (m) => cleanName(m[1]),
      );
      customerName =
        allNames.find((n) => n && !GREETINGS.has(n.split(/\s+/)[0]) && !/\d/.test(n)) || customerName;
    }
  }

  let score = 40;
  if (sizeHit) score += 25;
  if (copiesHit) score += 10;
  if (paperType) score += 10;
  if (customerPhone) score += 10;
  if (customerName) score += 5;
  if (!text) score = 25;
  const parseConfidence = Math.min(99, score);

  const mm =
    sizeName === 'A4'
      ? '210x297mm'
      : sizeName === '13x18'
        ? '130x180mm'
        : sizeName === '20x30'
          ? '200x300mm'
          : '100x150mm';

  const parts = [`${mm}`, `${copies}X`];
  if (paperType) parts.push(`נייר ${paperType}`);
  const summary = `פוענח: ${parts.join(' | ')}`;

  return {
    sizeName,
    copies,
    paperType,
    customerPhone,
    customerName,
    parseConfidence,
    summary,
  };
}

/**
 * Notes: Customer-facing WhatsApp bot confirmation (HE), like studio mock.
 * @param {{
 *   customerName?: string | null,
 *   sizeName: string,
 *   paperType?: string | null,
 *   copies?: number,
 *   metrics?: { confidenceScore?: number } | null,
 * }} result
 */
export function buildCustomerBotReply(result) {
  const rawName = result.customerName && result.customerName !== 'Admin' ? String(result.customerName).trim() : '';
  const first = rawName ? rawName.split(/\s+/)[0] : '';
  const hi = first ? `היי ${first}!` : 'היי!';
  const paperHe =
    result.paperType === 'Gloss' || result.paperType === 'Glossy'
      ? 'מבריק'
      : result.paperType === 'Matte'
        ? 'מט'
        : result.paperType === 'Lustre'
          ? 'לאסטר'
          : '';
  const req = paperHe ? `${result.sizeName} ${paperHe}` : result.sizeName;
  let msg = `${hi} זיהינו את הבקשה: ${req}.\nהתמונה נסרקה ב-AI Headroom Guard,\nהראשים שמורים והקובץ מוכן להדפסה!`;
  const conf = result.metrics?.confidenceScore;
  if (typeof conf === 'number' && conf >= 90) {
    msg += '\n✓ מוכן להדפסה';
  }
  return msg;
}

/**
 * Notes: Windows-style hotfolder segment: CustomerName_10x15
 * @param {string | null | undefined} customerName
 * @param {string} phone
 * @param {string} sizeName
 */
export function buildHotfolderPath(customerName, phone, sizeName) {
  const slug = slugifyCustomer(customerName, phone);
  const root = (process.env.SMARTCROP_HOTFOLDER_ROOT || 'C:\\Hotfolder').replace(/[/\\]+$/, '');
  return `${root}\\${slug}_${sizeName}`;
}

/**
 * @param {string | null | undefined} customerName
 * @param {string} phone
 */
export function slugifyCustomer(customerName, phone) {
  const base = (customerName || '')
    .trim()
    .replace(/[^\w\u0590-\u05FF]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (base) return base.slice(0, 48);
  const digits = String(phone || '').replace(/\D/g, '').slice(-8) || 'customer';
  return `Customer_${digits}`;
}

/** @param {string} raw */
function cleanName(raw) {
  const cleaned = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/[|].*$/, '')
    .replace(/(?:^|\s)(?:ס["״]?מ|cm|mm|ב)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!cleaned) return null;
  const first = cleaned.split(/\s+/)[0];
  if (GREETINGS.has(first) && cleaned.split(/\s+/).length === 1) return null;
  return cleaned;
}
