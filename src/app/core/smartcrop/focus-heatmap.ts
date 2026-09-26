/**
 * Focus / sharpness (Laplacian variance) + saliency heatmap helpers for SmartCrop.
 */

export const LOW_FOCUS_THRESHOLD = 40;

export interface FocusAnalysis {
  /** 0–100 sharpness score for the subject region. */
  focusScore: number;
  isLowFocus: boolean;
  focusWarningHe: string;
  focusWarningEn: string;
}

export interface HeatmapAnchor {
  /** Focal X as % of image width (0–100). */
  xPercent: number;
  /** Focal Y as % of image height (0–100). */
  yPercent: number;
}

/**
 * Notes: Laplacian variance on grayscale — higher = sharper.
 * Normalized to 0–100 via log curve (tuned for photo-print sharpness).
 */
export function laplacianVarianceFocusScore(gray: Float32Array | number[], width: number, height: number): number {
  if (width < 3 || height < 3 || gray.length < width * height) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        -4 * gray[i]! +
        gray[i - 1]! +
        gray[i + 1]! +
        gray[i - width]! +
        gray[i + width]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n < 1) return 0;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  // Typical photo patches: variance ~10–2000+. Map via log to 0–100.
  const score = (Math.log1p(variance) / Math.log1p(2500)) * 100;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export function focusAnalysisFromScore(focusScore: number): FocusAnalysis {
  const isLowFocus = focusScore < LOW_FOCUS_THRESHOLD;
  return {
    focusScore,
    isLowFocus,
    focusWarningHe: '⚠️ פוקוס נמוך: התמונה עלולה לצאת מטושטשת בהדפסה',
    focusWarningEn: '⚠️ Low focus: print may look soft / blurry',
  };
}

/**
 * Notes: Sample a region of an ImageBitmap and score focus (subject box preferred).
 */
export async function analyzeBitmapFocus(
  bitmap: ImageBitmap,
  region: { x: number; y: number; width: number; height: number } | null,
): Promise<FocusAnalysis> {
  const imgW = bitmap.width;
  const imgH = bitmap.height;
  const box = region && region.width > 8 && region.height > 8
    ? {
        x: Math.max(0, Math.floor(region.x)),
        y: Math.max(0, Math.floor(region.y)),
        width: Math.min(imgW, Math.floor(region.width)),
        height: Math.min(imgH, Math.floor(region.height)),
      }
    : { x: Math.floor(imgW * 0.25), y: Math.floor(imgH * 0.25), width: Math.floor(imgW * 0.5), height: Math.floor(imgH * 0.5) };

  const maxSide = 160;
  const scale = Math.min(1, maxSide / Math.max(box.width, box.height));
  const tw = Math.max(8, Math.floor(box.width * scale));
  const th = Math.max(8, Math.floor(box.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return focusAnalysisFromScore(50);

  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, tw, th);
  const { data } = ctx.getImageData(0, 0, tw, th);
  const gray = new Float32Array(tw * th);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return focusAnalysisFromScore(laplacianVarianceFocusScore(gray, tw, th));
}

/** CSS radial heatmap centered on focal point (preview overlay). */
export function heatmapGradientStyle(anchor: HeatmapAnchor): Record<string, string> {
  const x = Math.max(0, Math.min(100, anchor.xPercent));
  const y = Math.max(0, Math.min(100, anchor.yPercent));
  return {
    background: `radial-gradient(ellipse 42% 48% at ${x}% ${y}%, rgba(239,68,68,0.55) 0%, rgba(249,115,22,0.4) 28%, rgba(99,102,241,0.28) 55%, transparent 78%)`,
  };
}

export function focalAnchorFromCrop(
  focal: { x: number; y: number } | null | undefined,
  imgW: number,
  imgH: number,
): HeatmapAnchor {
  if (!focal || !imgW || !imgH) return { xPercent: 50, yPercent: 40 };
  return {
    xPercent: Math.max(0, Math.min(100, (focal.x / imgW) * 100)),
    yPercent: Math.max(0, Math.min(100, (focal.y / imgH) * 100)),
  };
}
