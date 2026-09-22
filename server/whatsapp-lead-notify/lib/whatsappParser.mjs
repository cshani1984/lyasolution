/**
 * WhatsApp caption / phone helpers for SmartCrop demo ingestion.
 */

const SIZE_ALIASES = [
  { pattern: /\b10\s*[x×]\s*15\b/i, name: '10x15' },
  { pattern: /\b13\s*[x×]\s*18\b/i, name: '13x18' },
  { pattern: /\b20\s*[x×]\s*30\b/i, name: '20x30' },
  { pattern: /\ba4\b/i, name: 'A4' },
];

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
  const text = (caption ?? '').trim();
  if (!text) return '10x15';
  for (const { pattern, name } of SIZE_ALIASES) {
    if (pattern.test(text)) return name;
  }
  return '10x15';
}
