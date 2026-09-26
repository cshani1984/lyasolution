/**
 * CropFlow print sizes — shared client constant.
 * aspect_ratio is width_cm / height_cm (portrait); use getCalculatedAspectRatio for landscape.
 */
import type { PrintSize } from '../models/smartcrop.model';

export type PrintSizeCategory = NonNullable<PrintSize['category']>;

export const DEMO_PRINT_SIZES: PrintSize[] = [
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

export const PRINT_SIZE_CATEGORY_ORDER: PrintSizeCategory[] = [
  'standard',
  'large',
  'passport',
  'square',
];

export const PRINT_SIZE_CATEGORY_LABELS: Record<PrintSizeCategory, { he: string; en: string }> = {
  standard: { he: 'סטנדרטי', en: 'Standard' },
  large: { he: 'הגדלות', en: 'Large' },
  passport: { he: 'פספורט', en: 'Passport' },
  square: { he: 'ריבוע', en: 'Square' },
};

/** Portrait = width/height; landscape = height/width. Square stays 1. */
export function getCalculatedAspectRatio(size: PrintSize, isLandscape = false): number {
  const portrait = size.width_cm / size.height_cm;
  if (size.width_cm === size.height_cm) return 1;
  return isLandscape ? size.height_cm / size.width_cm : portrait;
}

/** Invert a portrait print ratio when the source photo is landscape. */
export function orientAspectRatio(portraitAspect: number, imgW: number, imgH: number): number {
  const base = Number(portraitAspect) || 2 / 3;
  if (!imgW || !imgH || Math.abs(base - 1) < 1e-6) return base === 1 ? 1 : base;
  const isLandscape = imgW > imgH;
  if (isLandscape && base < 1) return 1 / base;
  if (!isLandscape && base > 1) return 1 / base;
  return base;
}

export function printSizeCode(size: PrintSize): string {
  return (size.code || `${size.width_cm}x${size.height_cm}`).trim();
}

function normalizeSizeKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/ס["״]?מ/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/×/g, 'x');
}

/** Resolve a size by id, code, display name, or WxH alias. */
export function findPrintSize(
  sizes: PrintSize[],
  query: string | null | undefined,
): PrintSize | undefined {
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

export function defaultPrintSize(sizes: PrintSize[] = DEMO_PRINT_SIZES): PrintSize {
  return sizes.find((s) => s.is_default) ?? sizes[0];
}

export function groupPrintSizesByCategory(sizes: PrintSize[]): Array<{
  category: PrintSizeCategory | 'other';
  sizes: PrintSize[];
}> {
  const map = new Map<PrintSizeCategory | 'other', PrintSize[]>();
  for (const s of sizes) {
    const key = s.category ?? 'other';
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  const ordered: Array<{ category: PrintSizeCategory | 'other'; sizes: PrintSize[] }> = [];
  for (const cat of PRINT_SIZE_CATEGORY_ORDER) {
    const list = map.get(cat);
    if (list?.length) ordered.push({ category: cat, sizes: list });
  }
  const other = map.get('other');
  if (other?.length) ordered.push({ category: 'other', sizes: other });
  return ordered;
}
