/** Shared crop metric math (client + docs). */

export const CROP_LOSS_WARN_PERCENT = 25;
/** Extra space above faces so hair / headroom is never chopped. */
export const HEAD_TOP_PADDING_RATIO = 0.22;

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Notes: cropLoss = ((Original Area - Cropped Area) / Original Area) * 100
 */
export function calculateCropLossPercentage(
  imgW: number,
  imgH: number,
  cropBox: BoundingBox,
): number {
  const originalArea = Math.max(1, imgW * imgH);
  const croppedArea = Math.max(1, cropBox.width * cropBox.height);
  return Math.max(0, Math.min(100, ((originalArea - croppedArea) / originalArea) * 100));
}

/**
 * Notes: Risk when loss > 25% or subject AABB touches the crop rim.
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

/** Notes: Badge color bands for confidence score. */
export function confidenceTone(score: number): 'green' | 'yellow' | 'red' {
  if (score > 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}
