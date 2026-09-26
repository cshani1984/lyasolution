/**
 * SmartCrop print sizes (runtime ESM) — keep in sync with Angular print-sizes.ts
 */

/** @typedef {'standard' | 'passport' | 'square' | 'large'} PrintSizeCategory */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   code?: string,
 *   width_cm: number,
 *   height_cm: number,
 *   aspect_ratio: number,
 *   is_default: boolean,
 *   category?: PrintSizeCategory,
 *   description?: string,
 * }} PrintSize
 */

/** @type {PrintSize[]} */
export const DEMO_PRINT_SIZES = [
  {
    id: 'size-10x15',
    name: '10x15 ס"מ',
    code: '10x15',
    width_cm: 10,
    height_cm: 15,
    aspect_ratio: 10 / 15,
    is_default: true,
    category: 'standard',
    description: 'הגודל הקלאסי והפופולרי ביותר',
  },
  {
    id: 'size-13x18',
    name: '13x18 ס"מ',
    code: '13x18',
    width_cm: 13,
    height_cm: 18,
    aspect_ratio: 13 / 18,
    is_default: false,
    category: 'standard',
    description: 'מתאים למסגרות אלבום בינוניות',
  },
  {
    id: 'size-15x21',
    name: '15x21 ס"מ (A5)',
    code: '15x21',
    width_cm: 15,
    height_cm: 21,
    aspect_ratio: 15 / 21,
    is_default: false,
    category: 'standard',
    description: 'גודל מבוקש למזכרות מאירועים',
  },
  {
    id: 'size-20x30',
    name: '20x30 ס"מ',
    code: '20x30',
    width_cm: 20,
    height_cm: 30,
    aspect_ratio: 20 / 30,
    is_default: false,
    category: 'large',
    description: 'הגדלה רגילה למסגרות קיר',
  },
  {
    id: 'size-a4',
    name: 'A4 (21x29.7 ס"מ)',
    code: 'A4',
    width_cm: 21,
    height_cm: 29.7,
    aspect_ratio: 21 / 29.7,
    is_default: false,
    category: 'large',
    description: 'דף מדפסת / תעודות ופוסטרים',
  },
  {
    id: 'size-passport',
    name: 'פספורט (3.5x4.5 ס"מ)',
    code: 'Passport',
    width_cm: 3.5,
    height_cm: 4.5,
    aspect_ratio: 3.5 / 4.5,
    is_default: false,
    category: 'passport',
    description: 'תמונת פספורט רשמית',
  },
  {
    id: 'size-square-10x10',
    name: '10x10 ס"מ (ריבוע)',
    code: '10x10',
    width_cm: 10,
    height_cm: 10,
    aspect_ratio: 1,
    is_default: false,
    category: 'square',
    description: 'תמונת אינסטגרם / קנבס מרובע',
  },
];

/**
 * @param {PrintSize} size
 * @param {boolean} [isLandscape]
 */
export function getCalculatedAspectRatio(size, isLandscape = false) {
  if (size.width_cm === size.height_cm) return 1;
  return isLandscape ? size.height_cm / size.width_cm : size.width_cm / size.height_cm;
}

/**
 * @param {number} portraitAspect
 * @param {number} imgW
 * @param {number} imgH
 */
export function orientAspectRatio(portraitAspect, imgW, imgH) {
  const base = Number(portraitAspect) || 2 / 3;
  if (!imgW || !imgH || Math.abs(base - 1) < 1e-6) return base === 1 ? 1 : base;
  const isLandscape = imgW > imgH;
  if (isLandscape && base < 1) return 1 / base;
  if (!isLandscape && base > 1) return 1 / base;
  return base;
}

/**
 * @param {string} raw
 */
function normalizeSizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/ס["״]?מ/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/×/g, 'x');
}

/**
 * @param {PrintSize[]} sizes
 * @param {string | null | undefined} query
 * @returns {PrintSize | undefined}
 */
export function findPrintSize(sizes, query) {
  if (!query) return undefined;
  const q = String(query).trim();
  const nq = normalizeSizeKey(q);
  return (
    sizes.find((s) => s.id === q) ||
    sizes.find((s) => s.name === q) ||
    sizes.find((s) => normalizeSizeKey(s.code || '') === nq) ||
    sizes.find((s) => normalizeSizeKey(s.name) === nq) ||
    sizes.find((s) => normalizeSizeKey(`${s.width_cm}x${s.height_cm}`) === nq) ||
    sizes.find((s) => nq.includes(normalizeSizeKey(`${s.width_cm}x${s.height_cm}`)))
  );
}

export function defaultPrintSize(sizes = DEMO_PRINT_SIZES) {
  return sizes.find((s) => s.is_default) ?? sizes[0];
}

/** Hotfolder / WhatsApp stable token */
export function printSizeCode(size) {
  return (size?.code || `${size?.width_cm}x${size?.height_cm}` || '10x15').trim();
}
