import type { CropData, SmartcropPhoto } from '../models/smartcrop.model';
import {
  DEMO_PRINT_SIZES,
  findPrintSize,
  getCalculatedAspectRatio,
} from '../smartcrop/print-sizes';

export {
  DEMO_PRINT_SIZES,
  findPrintSize,
  getCalculatedAspectRatio,
} from '../smartcrop/print-sizes';

const now = () => new Date().toISOString();

function demoCrop(aspect: number): CropData {
  // Placeholder until first open — real box applied on save / auto-fit
  return {
    x: 0,
    y: 0,
    width: 600,
    height: Math.round(600 / aspect),
    zoom: 1,
    focalPoint: { x: 300, y: 240 },
    isManuallyEdited: false,
  };
}

/** Local demo gallery photos (no Supabase / WhatsApp required). */
export function createDemoPhotos(): SmartcropPhoto[] {
  const base = '/assets/smartcrop-demo';
  const items: Array<{ file: string; sizeCode: string; phone: string }> = [
    { file: 'portrait-family.jpg', sizeCode: '10x15', phone: '+972501111001' },
    { file: 'portrait-child.jpg', sizeCode: '13x18', phone: '+972501111002' },
    { file: 'landscape-beach.jpg', sizeCode: '10x15', phone: '+972501111003' },
    { file: 'couple.jpg', sizeCode: '20x30', phone: '+972501111004' },
    { file: 'pet.jpg', sizeCode: 'A4', phone: '+972501111005' },
    { file: 'city.jpg', sizeCode: '13x18', phone: '+972501111006' },
  ];

  return items.map((item, i) => {
    const size = findPrintSize(DEMO_PRINT_SIZES, item.sizeCode) ?? DEMO_PRINT_SIZES[0];
    const url = `${base}/${item.file}`;
    const names = ['ילנה רוסטובה', 'דני כהן', 'נועה לוי', 'איתי מזרחי', 'מיכל אברהם', 'יוסי פרץ'];
    const captions = [
      `שלום, אשמח להדפיס תמונה זו בגודל ${size.name} על נייר פוטו מבריק`,
      `בבקשה ${size.name} מבריק, 2 עותקים`,
      `היי תדפיסו ב-${size.name} מט`,
      `גודל ${size.name} בבקשה`,
      `תמונה להדפסה ${size.name}`,
      `${size.name} על נייר לוסטר תודה`,
    ];
    return {
      id: `demo-${i + 1}`,
      order_id: 'demo-order',
      user_id: 'demo-user',
      sender_phone: item.phone,
      customer_name: names[i] ?? null,
      caption_text: captions[i] ?? null,
      parsed_summary: `${size.name} | מבריק | 1X`,
      parse_confidence: 92 - i * 3,
      paper_type: 'glossy',
      copies: 1,
      original_url: url,
      cropped_url: url,
      size_id: size.id,
      target_size_name: size.name,
      crop_data: demoCrop(getCalculatedAspectRatio(size, false)),
      status: i % 3 === 0 ? 'approved' : 'pending',
      created_at: now(),
    };
  });
}

/**
 * Apply crop box from natural image coords → JPEG blob URL (client-side).
 */
export async function applyClientCrop(
  imageUrl: string,
  crop: CropData,
): Promise<{ blobUrl: string; cropData: CropData }> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const w = Math.max(1, Math.round(crop.width));
  const h = Math.max(1, Math.round(crop.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
  });
  return {
    blobUrl: URL.createObjectURL(blob),
    cropData: { ...crop, isManuallyEdited: true },
  };
}

/** Centered aspect-fit crop with slight top bias (demo “AI”). */
export async function autoCenterCrop(imageUrl: string, aspectRatio: number): Promise<CropData> {
  const img = await loadImage(imageUrl);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const imgAspect = imgW / imgH;
  let cropW: number;
  let cropH: number;
  if (imgAspect > aspectRatio) {
    cropH = imgH;
    cropW = Math.round(cropH * aspectRatio);
  } else {
    cropW = imgW;
    cropH = Math.round(cropW / aspectRatio);
  }
  const x = Math.round((imgW - cropW) / 2);
  const y = Math.max(0, Math.round((imgH - cropH) * 0.35));
  return {
    x,
    y: Math.min(y, imgH - cropH),
    width: cropW,
    height: cropH,
    zoom: 1,
    focalPoint: { x: x + cropW / 2, y: y + cropH * 0.38 },
    isManuallyEdited: false,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
