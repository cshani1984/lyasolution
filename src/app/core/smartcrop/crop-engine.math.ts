/** Shared crop metric math — Visual Center of Gravity + print safety margins. */

export const CROP_LOSS_WARN_PERCENT = 25;
export const CROP_LOSS_OK_PERCENT = 15;
/** Central zone — loosely balanced VCG. */
export const CENTER_ZONE_RATIO = 0.4;
/** Headroom above faces / hair (8–15%). */
export const HEAD_TOP_PADDING_RATIO = 0.12;
/** Print shop guillotine bleed buffer (5–8%). */
export const PRINT_SAFETY_MARGIN_RATIO = 0.06;
export const PRINT_SAFETY_MARGIN_MIN = 0.05;
export const PRINT_SAFETY_MARGIN_MAX = 0.08;
/** Aspect ratio match tolerance before declaring crop unnecessary. */
export const ASPECT_MATCH_TOLERANCE = 0.05;
/** How close to a rule-of-thirds line counts as intentional composition. */
export const RULE_OF_THIRDS_TOLERANCE = 0.08;

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotographerCropResult {
  cropBox: BoundingBox;
  isCroppingNecessary: boolean;
  usedSmartShift: boolean;
  addedSafetyMargin: boolean;
  safetyMarginPercentage: number;
  compositionMode: 'geometric' | 'rule_of_thirds' | 'smart_shift';
  subjectTruncatedByMargin: boolean;
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

/** Crop-loss traffic-light for photographer badges. */
export function cropLossTone(loss: number): 'green' | 'yellow' | 'red' {
  if (loss <= CROP_LOSS_OK_PERCENT) return 'green';
  if (loss <= CROP_LOSS_WARN_PERCENT) return 'yellow';
  return 'red';
}

/**
 * Notes: Offset between geometric image center and AI focal point.
 */
export function calculateCorrectionDelta(
  imgW: number,
  imgH: number,
  focal: { x: number; y: number },
): {
  dx: number;
  dy: number;
  distancePx: number;
  distancePercent: number;
} {
  const cx = imgW / 2;
  const cy = imgH / 2;
  const dx = focal.x - cx;
  const dy = focal.y - cy;
  const distancePx = Math.hypot(dx, dy);
  const diagonal = Math.hypot(imgW, imgH) || 1;
  return {
    dx: Math.round(dx * 10) / 10,
    dy: Math.round(dy * 10) / 10,
    distancePx: Math.round(distancePx * 10) / 10,
    distancePercent: Math.round((distancePx / diagonal) * 1000) / 10,
  };
}

/** Focal inside central zone → loosely balanced. */
export function isFocalWellCentered(
  focal: { x: number; y: number },
  imgW: number,
  imgH: number,
  zone = CENTER_ZONE_RATIO,
): boolean {
  const half = zone / 2;
  const nx = focal.x / Math.max(1, imgW);
  const ny = focal.y / Math.max(1, imgH);
  return nx >= 0.5 - half && nx <= 0.5 + half && ny >= 0.5 - half && ny <= 0.5 + half;
}

/**
 * Notes: Intentional Rule of Thirds placement — do NOT force to center.
 */
export function isOnRuleOfThirds(
  focal: { x: number; y: number },
  imgW: number,
  imgH: number,
  tolerance = RULE_OF_THIRDS_TOLERANCE,
): boolean {
  const tolX = Math.max(1, imgW * tolerance);
  const tolY = Math.max(1, imgH * tolerance);
  const xs = [imgW / 3, (2 * imgW) / 3];
  const ys = [imgH / 3, (2 * imgH) / 3];
  const nearX = xs.some((tx) => Math.abs(focal.x - tx) <= tolX);
  const nearY = ys.some((ty) => Math.abs(focal.y - ty) <= tolY);
  // On a third line or near an intersection = deliberate composition.
  return nearX || nearY;
}

/** Expand subject box with headroom (portrait) or even pad (objects). */
export function expandSubjectForProtection(
  subject: BoundingBox,
  opts: { isPortrait?: boolean; headroomRatio?: number; sidePadRatio?: number } = {},
): BoundingBox {
  const headroom = opts.headroomRatio ?? (opts.isPortrait ? HEAD_TOP_PADDING_RATIO : 0.04);
  const side = opts.sidePadRatio ?? 0.06;
  const padX = subject.width * side;
  const padTop = subject.height * headroom;
  const padBottom = subject.height * (opts.isPortrait ? 0.04 : side);
  return {
    x: subject.x - padX,
    y: subject.y - padTop,
    width: subject.width + padX * 2,
    height: subject.height + padTop + padBottom,
  };
}

/** Subject (+ optional headroom) fully inside crop box. */
export function subjectFitsInBox(
  subject: BoundingBox | null | undefined,
  box: BoundingBox,
  headroomRatio = HEAD_TOP_PADDING_RATIO,
): boolean {
  if (!subject) return true;
  const protectedBox = expandSubjectForProtection(subject, {
    isPortrait: true,
    headroomRatio,
  });
  const pad = 2;
  return (
    protectedBox.x >= box.x - pad &&
    protectedBox.y >= box.y - pad &&
    protectedBox.x + protectedBox.width <= box.x + box.width + pad &&
    protectedBox.y + protectedBox.height <= box.y + box.height + pad
  );
}

/** Geometric aspect-fit box centered on the image (no subject shift). */
export function computeGeometricCropBox(
  imgW: number,
  imgH: number,
  aspectRatio: number,
): BoundingBox {
  const imgAspect = imgW / Math.max(1, imgH);
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
  const y = Math.round((imgH - cropH) / 2);
  return clampBox(
    { x, y, width: Math.min(cropW, imgW), height: Math.min(cropH, imgH) },
    imgW,
    imgH,
  );
}

/**
 * Enforce 5–8% print bleed between subject contour and crop edges.
 * Shifts the crop box outward when the subject is too close to a rim.
 */
export function applyPrintSafetyMargin(
  cropBox: BoundingBox,
  subjectBox: BoundingBox | null | undefined,
  imgW: number,
  imgH: number,
  marginRatio: number = PRINT_SAFETY_MARGIN_RATIO,
  opts: { isPortrait?: boolean } = {},
): {
  cropBox: BoundingBox;
  addedSafetyMargin: boolean;
  safetyMarginPercentage: number;
  subjectTruncatedByMargin: boolean;
} {
  const ratio = Math.max(PRINT_SAFETY_MARGIN_MIN, Math.min(PRINT_SAFETY_MARGIN_MAX, marginRatio));
  const pct = Math.round(ratio * 1000) / 10;

  if (!subjectBox) {
    return {
      cropBox,
      addedSafetyMargin: false,
      safetyMarginPercentage: pct,
      subjectTruncatedByMargin: false,
    };
  }

  const protectedSubject = expandSubjectForProtection(subjectBox, {
    isPortrait: opts.isPortrait,
  });
  const padX = cropBox.width * ratio;
  const padY = cropBox.height * ratio;

  let x = cropBox.x;
  let y = cropBox.y;
  let shifted = false;

  const leftGap = protectedSubject.x - cropBox.x;
  const rightGap = cropBox.x + cropBox.width - (protectedSubject.x + protectedSubject.width);
  const topGap = protectedSubject.y - cropBox.y;
  const bottomGap =
    cropBox.y + cropBox.height - (protectedSubject.y + protectedSubject.height);

  if (leftGap < padX) {
    x = protectedSubject.x - padX;
    shifted = true;
  }
  if (rightGap < padX) {
    x = protectedSubject.x + protectedSubject.width + padX - cropBox.width;
    shifted = true;
  }
  if (topGap < padY) {
    y = protectedSubject.y - padY;
    shifted = true;
  }
  if (bottomGap < padY) {
    y = protectedSubject.y + protectedSubject.height + padY - cropBox.height;
    shifted = true;
  }

  const clamped = clampBox(
    { x, y, width: cropBox.width, height: cropBox.height },
    imgW,
    imgH,
  );

  // After clamp, check if margin still violated (subject too large for print frame).
  const stillTight =
    protectedSubject.x - clamped.x < padX * 0.5 ||
    clamped.x + clamped.width - (protectedSubject.x + protectedSubject.width) < padX * 0.5 ||
    protectedSubject.y - clamped.y < padY * 0.5 ||
    clamped.y + clamped.height - (protectedSubject.y + protectedSubject.height) < padY * 0.5;

  const truncated =
    protectedSubject.x < clamped.x - 1 ||
    protectedSubject.y < clamped.y - 1 ||
    protectedSubject.x + protectedSubject.width > clamped.x + clamped.width + 1 ||
    protectedSubject.y + protectedSubject.height > clamped.y + clamped.height + 1;

  return {
    cropBox: clamped,
    addedSafetyMargin: shifted || stillTight,
    safetyMarginPercentage: pct,
    subjectTruncatedByMargin: truncated || stillTight,
  };
}

/**
 * Visual Center of Gravity framing:
 * - Keep geometric / rule-of-thirds composition when balanced
 * - Smart-shift only when awkwardly skewed or clipped
 * - Always enforce print safety margin around the subject
 */
export function computePhotographerCropBox(
  imgW: number,
  imgH: number,
  aspectRatio: number,
  focal: { x: number; y: number },
  opts: {
    subjectBox?: BoundingBox | null;
    headPaddingApplied?: boolean;
    detectedType?: string;
    safetyMarginRatio?: number;
  } = {},
): PhotographerCropResult {
  const isPortrait = opts.headPaddingApplied || opts.detectedType === 'face';
  const geometric = computeGeometricCropBox(imgW, imgH, aspectRatio);
  const imgAspect = imgW / Math.max(1, imgH);
  const aspectClose =
    Math.abs(imgAspect - aspectRatio) / Math.max(aspectRatio, 0.01) <= ASPECT_MATCH_TOLERANCE;

  const wellCentered = isFocalWellCentered(focal, imgW, imgH);
  const onThirds = isOnRuleOfThirds(focal, imgW, imgH);
  const fitsGeometric = subjectFitsInBox(opts.subjectBox, geometric);

  let cropBox = geometric;
  let usedSmartShift = false;
  let compositionMode: PhotographerCropResult['compositionMode'] = 'geometric';

  // Deliberate thirds composition or already balanced → keep framing.
  if ((onThirds || wellCentered) && fitsGeometric) {
    cropBox = geometric;
    compositionMode = onThirds && !wellCentered ? 'rule_of_thirds' : 'geometric';
  } else if (!fitsGeometric || (!wellCentered && !onThirds)) {
    cropBox = computeSmartShiftCropBox(imgW, imgH, aspectRatio, focal, {
      subjectBox: opts.subjectBox,
      headPaddingApplied: opts.headPaddingApplied,
      isPortrait,
    });
    usedSmartShift = true;
    compositionMode = 'smart_shift';
  }

  const margin = applyPrintSafetyMargin(
    cropBox,
    opts.subjectBox,
    imgW,
    imgH,
    opts.safetyMarginRatio ?? PRINT_SAFETY_MARGIN_RATIO,
    { isPortrait },
  );

  const aspectForcesCrop =
    !aspectClose || geometric.width < imgW - 1 || geometric.height < imgH - 1;

  const isCroppingNecessary =
    (aspectForcesCrop && calculateCropLossPercentage(imgW, imgH, margin.cropBox) > 1) ||
    usedSmartShift ||
    margin.addedSafetyMargin;

  return {
    cropBox: margin.cropBox,
    isCroppingNecessary,
    usedSmartShift,
    addedSafetyMargin: margin.addedSafetyMargin,
    safetyMarginPercentage: margin.safetyMarginPercentage,
    compositionMode,
    subjectTruncatedByMargin: margin.subjectTruncatedByMargin,
  };
}

/**
 * Notes: Gentle VCG re-balance with headroom / chin protection for portraits.
 */
export function computeSmartShiftCropBox(
  imgW: number,
  imgH: number,
  aspectRatio: number,
  focal: { x: number; y: number },
  opts: {
    subjectBox?: BoundingBox | null;
    headPaddingApplied?: boolean;
    isPortrait?: boolean;
  } = {},
): BoundingBox {
  const geo = computeGeometricCropBox(imgW, imgH, aspectRatio);
  const cropW = geo.width;
  const cropH = geo.height;
  const isPortrait = opts.isPortrait ?? opts.headPaddingApplied;

  let x = Math.round(focal.x - cropW / 2);
  // Portraits: eyes ~38% from top; objects: nearer visual center.
  const eyeLine = isPortrait ? 0.38 : 0.48;
  let y = Math.round(focal.y - cropH * eyeLine);

  if (opts.subjectBox) {
    const sb = opts.subjectBox;
    const headPad = Math.round(sb.height * (isPortrait ? HEAD_TOP_PADDING_RATIO : 0.04));
    const preferX = Math.round(sb.x + sb.width / 2 - cropW / 2);
    const preferY = Math.round(sb.y - headPad);
    x = Math.round(x * 0.5 + preferX * 0.5);
    y = Math.round(y * 0.45 + preferY * 0.55);
  }

  return clampBox({ x, y, width: cropW, height: cropH }, imgW, imgH);
}

export function buildPhotographerNote(
  cropLossPercentage: number,
  opts: {
    shouldRecommendGenerativeFill?: boolean;
    usedSmartShift?: boolean;
    isCroppingNecessary?: boolean;
    addedSafetyMargin?: boolean;
    safetyMarginPercentage?: number;
    compositionMode?: string;
    lang?: 'he' | 'en';
  } = {},
): string {
  const loss = Math.round(cropLossPercentage * 10) / 10;
  const he = (opts.lang ?? 'he') === 'he';
  const marginPct = opts.safetyMarginPercentage ?? Math.round(PRINT_SAFETY_MARGIN_RATIO * 100);

  if (opts.shouldRecommendGenerativeFill || loss > CROP_LOSS_WARN_PERCENT) {
    return he
      ? `⚠️ אזהרה: חיתוך עמוק (נחתך ${loss}% מהמקור). מומלץ להפעיל מחולל AI להשלמת הרקע`
      : `⚠️ Warning: deep crop (${loss}% lost). Enable AI Generator to complete the background.`;
  }

  if (opts.addedSafetyMargin && loss <= CROP_LOSS_OK_PERCENT) {
    return he
      ? `נוספה הגנת שוליים ומרווח ביטחון של ${marginPct}% מקצוות התמונה`
      : `Added print safety margin of ${marginPct}% from frame edges`;
  }

  if (opts.compositionMode === 'rule_of_thirds') {
    return he
      ? `נשמרה קומפוזיציית שלישים מקורית עם מרווח ביטחון להדפסה (אובדן ${loss}%).`
      : `Kept original rule-of-thirds composition with print safety margin (loss ${loss}%).`;
  }

  if (!opts.isCroppingNecessary && !opts.usedSmartShift) {
    return he
      ? `קומפוזיציה מאוזנת — התאמת יחס מינימלית בלבד (אובדן ${loss}%).`
      : `Balanced composition — minimal aspect fit only (loss ${loss}%).`;
  }

  if (loss <= CROP_LOSS_OK_PERCENT) {
    return he
      ? `חיתוך אופטימלי | נוסף מרווח ביטחון ${marginPct}% בקצוות`
      : `Optimal crop | ${marginPct}% edge safety margin applied`;
  }

  return he
    ? `חיתוך סביר - מוקד התמונה ממורכז ומוגן`
    : `Acceptable crop — focal point centered and protected`;
}

function clampBox(box: BoundingBox, imgW: number, imgH: number): BoundingBox {
  let { x, y, width, height } = box;
  width = Math.min(Math.round(width), imgW);
  height = Math.min(Math.round(height), imgH);
  x = Math.max(0, Math.min(Math.round(x), imgW - width));
  y = Math.max(0, Math.min(Math.round(y), imgH - height));
  return { x, y, width, height };
}
