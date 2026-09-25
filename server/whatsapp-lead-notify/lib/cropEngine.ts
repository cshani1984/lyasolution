/**
 * CropEngine TypeScript contract + math helpers (shared docs / client import).
 * Server runtime lives in `cropEngine.mjs` (Sharp multi-pass).
 * Browser MediaPipe runtime lives in `crop-engine.client.ts`.
 */

/** Detection cascade outcome. */
export type DetectedType = 'face' | 'object' | 'saliency_landscape';

/** Pixel-space point of interest. */
export interface FocalPoint {
  x: number;
  y: number;
}

/** Axis-aligned crop / subject rectangle. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Full engine output after auto (or manual) crop.
 * Notes: confidenceScore is 0–100; cropLossPercentage is discarded area %.
 */
export interface CropEngineResult {
  processedBuffer?: ArrayBuffer | Uint8Array;
  focalPoint: FocalPoint;
  detectedType: DetectedType;
  /** e.g. 94.5 — MediaPipe score or calibrated saliency band */
  confidenceScore: number;
  /** e.g. 18.2 — ((origArea - cropArea) / origArea) * 100 */
  cropLossPercentage: number;
  headPaddingApplied: boolean;
  /** true if subject touches crop edge or cropLoss > 25% */
  hasTruncationRisk: boolean;
}

/** Metrics persisted inside photos.crop_data JSON. */
export interface CropMetrics {
  detectedType: DetectedType;
  confidenceScore: number;
  cropLossPercentage: number;
  headPaddingApplied: boolean;
  hasTruncationRisk: boolean;
}

/** Warn admins in red when discarded area exceeds this %. */
export const CROP_LOSS_WARN_PERCENT = 25;

/** Headroom above the topmost face edge. */
export const HEAD_TOP_PADDING_RATIO = 0.15;

/**
 * Notes: Exact crop-loss ratio used by badges and truncation risk.
 * cropLoss = ((Original Area - Cropped Area) / Original Area) * 100
 */
export function calculateCropLossPercentage(
  imgW: number,
  imgH: number,
  cropBox: BoundingBox,
): number {
  const originalArea = Math.max(1, imgW * imgH);
  const croppedArea = Math.max(1, cropBox.width * cropBox.height);
  return clamp(((originalArea - croppedArea) / originalArea) * 100, 0, 100);
}

/**
 * Notes: Flag risk when loss is high or the detected subject intersects the crop rim.
 */
export function calculateTruncationRisk(
  cropBox: BoundingBox,
  subjectBox: BoundingBox | null | undefined,
  cropLossPercentage: number,
): boolean {
  if (cropLossPercentage > CROP_LOSS_WARN_PERCENT) return true;
  if (!subjectBox) return false;
  const pad = 2;
  return (
    subjectBox.x < cropBox.x + pad ||
    subjectBox.y < cropBox.y + pad ||
    subjectBox.x + subjectBox.width > cropBox.x + cropBox.width - pad ||
    subjectBox.y + subjectBox.height > cropBox.y + cropBox.height - pad
  );
}

/**
 * Notes: Map confidence to badge tone for the admin card.
 */
export function confidenceTone(score: number): 'green' | 'yellow' | 'red' {
  if (score > 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

/**
 * Notes: Human-readable detection label for UI badges.
 */
export function detectionLabel(type: DetectedType, lang: 'he' | 'en' = 'en'): string {
  const map = {
    face: { en: 'Face Detected', he: 'זוהו פנים' },
    object: { en: 'Object Detected', he: 'זוהה אובייקט' },
    saliency_landscape: { en: 'Saliency Fallback', he: 'מרכוז ויזואלי' },
  } as const;
  return map[type][lang];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
