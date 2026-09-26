/**
 * WhatsApp caption / phone helpers for SmartCrop studio ingestion.
 * Notes: Parses size, copies, paper, customer name + phone from free-text captions.
 */

const SIZE_ALIASES = [
  { pattern: /\b10\s*[x×]\s*15\b/i, name: '10x15' },
  { pattern: /\b10\s*[x×]\s*20\b/i, name: '10x20' },
  { pattern: /\b13\s*[x×]\s*18\b/i, name: '13x18' },
  { pattern: /\b15\s*[x×]\s*21\b|\ba5\b/i, name: '15x21' },
  { pattern: /\b20\s*[x×]\s*30\b/i, name: '20x30' },
  { pattern: /\ba4\b/i, name: 'A4' },
  { pattern: /\b10\s*[x×]\s*10\b|\bריבוע\b|\bsquare\b/i, name: '10x10' },
  { pattern: /\bpassport\b|\bפספורט\b|\b3\.?5\s*[x×]\s*4\.?5\b/i, name: 'Passport' },
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
 * Normalize to E.164-ish (+digits). Strips whatsapp: prefix. Israeli local 05x → +9725x.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePhoneE164(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw
    .trim()
    .replace(/^whatsapp:/i, '')
    .replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^05\d{8}$/.test(s)) s = `+972${s.slice(1)}`;
  if (/^5\d{8}$/.test(s) && !s.startsWith('+')) s = `+972${s}`;
  if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = `+${s}`;
  return s;
}

/** Digits only — primary key for matching Twilio ↔ profiles.phone. */
export function phoneDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Notes: All common spellings of the same mobile for DB lookup (E.164 / local / digits).
 * @param {string} raw
 * @returns {string[]}
 */
export function phoneLookupCandidates(raw) {
  const n = normalizePhoneE164(raw);
  if (!n) return [];
  const digits = n.replace(/\D/g, '');
  const out = new Set([n, digits, `+${digits}`]);
  // Israel mobile: +9725XXXXXXXX ↔ 05XXXXXXXX ↔ 5XXXXXXXX
  if (digits.startsWith('972') && digits.length >= 11) {
    const national = digits.slice(3); // 5XXXXXXXX
    out.add(national);
    out.add(`0${national}`);
    out.add(`+972${national}`);
  }
  if (digits.startsWith('0') && digits.length >= 9) {
    out.add(`+972${digits.slice(1)}`);
  }
  return [...out].filter(Boolean);
}

/**
 * Notes: Extract Israeli / E.164 phones from free text (forwarded WhatsApp captions).
 * Supports: 05X-XXXXXXX, 05X XXX XXXX, +9725XXXXXXXX, 9725…
 * @param {string} text
 * @returns {string[]} unique E.164 phones
 */
export function extractPhonesFromText(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];
  const re =
    /(?:\+?972[\s\-.]?|0)(5\d)[\s\-.]?(\d{3})[\s\-.]?(\d{4})\b|\+\d{10,15}\b/g;
  const found = new Set();
  let m;
  while ((m = re.exec(raw)) !== null) {
    const chunk = m[0];
    const n = normalizePhoneE164(chunk);
    if (phoneDigits(n).length >= 9) found.add(n);
  }
  return [...found];
}

/**
 * Notes: Prefer first Israeli mobile in caption for shop-forward attribution.
 * @param {string | null | undefined} caption
 * @returns {string}
 */
export function extractPrimaryCustomerPhone(caption) {
  const phones = extractPhonesFromText(caption ?? '');
  const il = phones.find((p) => phoneDigits(p).startsWith('9725'));
  return il || phones[0] || '';
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
  // Generic W×H (e.g. 10X20, 8x12) when not in aliases
  if (!sizeHit) {
    const dim = text.match(/\b(\d{1,2}(?:\.\d)?)\s*[x×]\s*(\d{1,2}(?:\.\d)?)\b/i);
    if (dim) {
      sizeName = `${dim[1]}x${dim[2]}`;
      sizeHit = true;
    }
  }

  let copies = 1;
  let copiesHit = false;
  // Prefer explicit "עותקים"; avoid treating 10X20 as "×20 copies"
  const copiesMatch =
    text.match(/(\d+)\s*(?:עותקים|עותק|copies?|pcs?)/i) ||
    text.match(/(?<!\d)\s*[x×]\s*(\d+)\b(?!\s*\d)/i);
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
    /(?:\+?972[\s\-.]?|0)(5\d)[\s\-.]?(\d{3})[\s\-.]?(\d{4})\b|\+\d{10,15}\b/,
  );
  const customerPhone = extractPrimaryCustomerPhone(text) || (phoneMatch ? normalizePhoneE164(phoneMatch[0]) : '');

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
  const dashboardUrl = 'https://www.lya-solution.com/smartcrop/dashboard';
  return `${hi} זיהינו את הבקשה: ${req}.\nהתמונה נסרקה ב-SmartCrop.\nהתמונות מוכנות להדפסה, יש להיכנס לדשבורד:\n${dashboardUrl}`;
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
