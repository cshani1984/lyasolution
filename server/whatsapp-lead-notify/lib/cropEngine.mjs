/**
 * Smart Crop & Saliency Engine (Node.js)
 * --------------------------------------
 * Multi-pass print cropper:
 *   1) Face / skin-tone subject detection (+15% headroom)
 *   2) Object / edge-mass fallback
 *   3) Sobel saliency landscape fallback
 *
 * MediaPipe Tasks Vision is browser-first; this engine mirrors its
 * face → object → saliency cascade with Sharp so it runs reliably on
 * the Express worker. Optional MediaPipe WASM can be plugged in later
 * via detectWithMediaPipe() without changing the public API.
 *
 * @typedef {'face' | 'object' | 'saliency_landscape'} DetectedType
 *
 * @typedef {{ x: number, y: number }} FocalPoint
 *
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 * }} BoundingBox
 *
 * @typedef {{
 *   processedBuffer: Buffer,
 *   buffer: Buffer,
 *   cropData: object,
 *   focalPoint: FocalPoint,
 *   detectedType: DetectedType,
 *   confidenceScore: number,
 *   cropLossPercentage: number,
 *   headPaddingApplied: boolean,
 *   hasTruncationRisk: boolean,
 * }} CropEngineResult
 */
import sharp from 'sharp';
import { orientAspectRatio } from './printSizes.mjs';

/** Top safety padding above faces / hair (8–15%). */
const HEAD_TOP_PADDING_RATIO = 0.12;

/** Crop-loss thresholds for admin badges. */
export const CROP_LOSS_WARN_PERCENT = 25;
export const CROP_LOSS_OK_PERCENT = 15;

/**
 * Notes: Auto-crop → shop status.
 * Small change → approved; significant change → pending for owner review.
 * @param {object | null | undefined} metrics
 * @returns {'approved' | 'pending'}
 */
export function photoStatusFromAutoCrop(metrics) {
  if (!metrics) return 'pending';
  const loss = Number(metrics.cropLossPercentage) || 0;
  const shift = Number(metrics.correctionDelta?.distancePercent) || 0;
  const significantChange =
    Boolean(metrics.hasTruncationRisk) ||
    Boolean(metrics.shouldRecommendGenerativeFill) ||
    loss > CROP_LOSS_OK_PERCENT ||
    (Boolean(metrics.usedSmartShift) && shift > 10) ||
    (Boolean(metrics.isCroppingNecessary) && loss > CROP_LOSS_OK_PERCENT);
  return significantChange ? 'pending' : 'approved';
}

/** Central zone — loosely balanced VCG. */
const CENTER_ZONE_RATIO = 0.4;
/** Print shop guillotine bleed buffer (5–8%). */
export const PRINT_SAFETY_MARGIN_RATIO = 0.06;
const PRINT_SAFETY_MARGIN_MIN = 0.05;
const PRINT_SAFETY_MARGIN_MAX = 0.08;
const ASPECT_MATCH_TOLERANCE = 0.05;
const RULE_OF_THIRDS_TOLERANCE = 0.08;

/**
 * Main entry: analyze image, pick focal point, crop to print aspect ratio.
 * Notes: Prefer manual crop when provided; otherwise run the 3-pass AI pipeline.
 * Auto-orients portrait print ratios when the source photo is landscape (width > height).
 *
 * @param {Buffer} inputBuffer
 * @param {{
 *   aspectRatio?: number,
 *   manualCrop?: object | null,
 *   resetToAi?: boolean,
 *   autoOrient?: boolean,
 * }} opts
 * @returns {Promise<CropEngineResult>}
 */
export async function processSmartCrop(inputBuffer, opts = {}) {
  const meta = await sharp(inputBuffer).rotate().metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;
  if (!imgW || !imgH) {
    throw new Error('Could not read image dimensions');
  }

  const portraitAspect = Number(opts.aspectRatio) || 2 / 3;
  const autoOrient = opts.autoOrient !== false;
  const isLandscape = imgW > imgH;
  const aspectRatio =
    autoOrient && !(opts.manualCrop && !opts.resetToAi)
      ? orientAspectRatio(portraitAspect, imgW, imgH)
      : portraitAspect;

  const manual = opts.manualCrop && !opts.resetToAi ? opts.manualCrop : null;
  let cropBox;
  let analysis = null;
  let headPaddingApplied = false;
  let isCroppingNecessary = true;
  let usedSmartShift = false;
  let addedSafetyMargin = false;
  let safetyMarginPercentage = Math.round(PRINT_SAFETY_MARGIN_RATIO * 100);
  let compositionMode = 'geometric';
  let subjectTruncatedByMargin = false;

  if (isValidManualCrop(manual)) {
    // Notes: Admin override — trust the locked-aspect box from the crop modal.
    cropBox = clampCropBox(
      {
        x: Math.round(manual.x),
        y: Math.round(manual.y),
        width: Math.round(manual.width),
        height: Math.round(manual.height),
      },
      imgW,
      imgH,
    );
    analysis = {
      focalPoint: {
        x: cropBox.x + cropBox.width / 2,
        y: cropBox.y + cropBox.height * 0.38,
      },
      detectedType: /** @type {DetectedType} */ (
        manual.metrics?.detectedType || 'saliency_landscape'
      ),
      confidenceScore: Number(manual.metrics?.confidenceScore) || 100,
      subjectBox: null,
      headPaddingApplied: Boolean(manual.metrics?.headPaddingApplied),
    };
    usedSmartShift = Boolean(manual.metrics?.usedSmartShift);
    isCroppingNecessary = true;
  } else {
    // Notes: VCG framing — geometric / thirds first; smart-shift + print bleed when needed.
    analysis = await analyzeImageSubject(inputBuffer, imgW, imgH);
    headPaddingApplied = analysis.headPaddingApplied;
    const framed = computePhotographerCropBox(imgW, imgH, aspectRatio, analysis.focalPoint, {
      subjectBox: analysis.subjectBox,
      headPaddingApplied,
      detectedType: analysis.detectedType,
    });
    cropBox = framed.cropBox;
    isCroppingNecessary = framed.isCroppingNecessary;
    usedSmartShift = framed.usedSmartShift;
    addedSafetyMargin = framed.addedSafetyMargin;
    safetyMarginPercentage = framed.safetyMarginPercentage;
    compositionMode = framed.compositionMode;
    subjectTruncatedByMargin = framed.subjectTruncatedByMargin;
  }

  const processedBuffer = await sharp(inputBuffer)
    .rotate()
    .extract({
      left: cropBox.x,
      top: cropBox.y,
      width: cropBox.width,
      height: cropBox.height,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const cropLossPercentage = calculateCropLossPercentage(imgW, imgH, cropBox);
  const hasTruncationRisk =
    calculateTruncationRisk(cropBox, analysis.subjectBox, cropLossPercentage) ||
    subjectTruncatedByMargin;
  const shouldRecommendGenerativeFill =
    cropLossPercentage > CROP_LOSS_WARN_PERCENT || subjectTruncatedByMargin;
  const photographerNote = buildPhotographerNote(cropLossPercentage, {
    shouldRecommendGenerativeFill,
    usedSmartShift,
    isCroppingNecessary,
    addedSafetyMargin,
    safetyMarginPercentage,
    compositionMode,
  });

  const focalPoint = analysis.focalPoint;
  const correctionDelta = calculateCorrectionDelta(imgW, imgH, focalPoint);
  const focus = await analyzeBufferFocus(inputBuffer, analysis.subjectBox ?? cropBox);
  const metrics = {
    detectedType: analysis.detectedType,
    confidenceScore: round1(analysis.confidenceScore),
    cropLossPercentage: round1(cropLossPercentage),
    headPaddingApplied,
    hasTruncationRisk,
    correctionDelta,
    isLandscape,
    orientedAspectRatio: aspectRatio,
    isCroppingNecessary,
    usedSmartShift,
    addedSafetyMargin,
    safetyMarginPercentage,
    compositionMode,
    shouldRecommendGenerativeFill,
    photographerNote,
    focusScore: focus.focusScore,
    isLowFocus: focus.isLowFocus,
    focusWarning: focus.isLowFocus
      ? '⚠️ פוקוס נמוך: התמונה עלולה לצאת מטושטשת בהדפסה'
      : undefined,
  };

  const cropData = {
    x: cropBox.x,
    y: cropBox.y,
    width: cropBox.width,
    height: cropBox.height,
    zoom: manual?.zoom ?? 1,
    rotation: manual?.rotation ?? 0,
    focalPoint,
    isManuallyEdited: Boolean(manual && !opts.resetToAi),
    metrics,
  };

  return {
    processedBuffer,
    buffer: processedBuffer,
    cropData,
    focalPoint,
    detectedType: metrics.detectedType,
    confidenceScore: metrics.confidenceScore,
    cropLossPercentage: metrics.cropLossPercentage,
    headPaddingApplied: metrics.headPaddingApplied,
    hasTruncationRisk: metrics.hasTruncationRisk,
    correctionDelta,
    isLandscape,
    aspectRatio,
    isCroppingNecessary,
    usedSmartShift,
    addedSafetyMargin,
    safetyMarginPercentage,
    shouldRecommendGenerativeFill,
    photographerNote,
  };
}

/**
 * Notes: Validates a manual crop box from the admin editor.
 * @param {any} manual
 * @returns {boolean}
 */
function isValidManualCrop(manual) {
  return Boolean(
    manual &&
      typeof manual.x === 'number' &&
      typeof manual.y === 'number' &&
      typeof manual.width === 'number' &&
      typeof manual.height === 'number' &&
      manual.width > 0 &&
      manual.height > 0,
  );
}

/**
 * Notes: Cascade detector — face → object → saliency landscape.
 * Returns focal point, detection type, confidence, and optional subject AABB.
 *
 * @param {Buffer} inputBuffer
 * @param {number} imgW
 * @param {number} imgH
 */
export async function analyzeImageSubject(inputBuffer, imgW, imgH) {
  // Optional MediaPipe hook (no-op / null when WASM unavailable in Node).
  const mp = await detectWithMediaPipe(inputBuffer, imgW, imgH);
  if (mp) return mp;

  const face = await detectFacesPrimary(inputBuffer, imgW, imgH);
  if (face) return face;

  const objectHit = await detectObjectsSecondary(inputBuffer, imgW, imgH);
  if (objectHit) return objectHit;

  return detectSaliencyTertiary(inputBuffer, imgW, imgH);
}

/**
 * Notes: Optional MediaPipe Tasks Vision bridge.
 * Returns null on Node so Sharp cascade always remains the production path.
 * Swap in a Playwright/WASM worker here if you later host MediaPipe server-side.
 *
 * @param {Buffer} _inputBuffer
 * @param {number} _imgW
 * @param {number} _imgH
 * @returns {Promise<null | object>}
 */
async function detectWithMediaPipe(_inputBuffer, _imgW, _imgH) {
  // MediaPipe @mediapipe/tasks-vision is browser/WASM-DOM oriented.
  // Keep this stub so the public cascade stays MediaPipe-compatible.
  return null;
}

/**
 * Primary pass — human / face detection via skin-tone + upper-frame energy.
 * Notes: Builds a combined people box and applies 15% top padding above faces.
 *
 * @param {Buffer} inputBuffer
 * @param {number} imgW
 * @param {number} imgH
 */
async function detectFacesPrimary(inputBuffer, imgW, imgH) {
  const sample = await sampleRgba(inputBuffer, 96);
  const { data, width: w, height: h } = sample;

  /** @type {{ x: number, y: number, w: number, h: number, score: number }[]} */
  const blobs = [];
  const visited = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (visited[i]) continue;
      if (!isSkinTone(data, i)) {
        visited[i] = 1;
        continue;
      }
      const blob = floodSkinBlob(data, visited, w, h, x, y);
      // Faces tend to be mid-size blobs in the upper 70% of the frame.
      const cy = blob.y + blob.h / 2;
      const area = blob.w * blob.h;
      const areaRatio = area / (w * h);
      if (areaRatio < 0.004 || areaRatio > 0.45) continue;
      if (cy > h * 0.78) continue;
      if (blob.w < 3 || blob.h < 3) continue;
      const aspect = blob.w / blob.h;
      if (aspect < 0.35 || aspect > 2.4) continue;
      blobs.push({
        ...blob,
        score: Math.min(0.99, 0.55 + areaRatio * 4 + (1 - cy / h) * 0.25),
      });
    }
  }

  if (!blobs.length) return null;

  // Prefer larger / higher blobs (heads), then union all strong faces.
  blobs.sort((a, b) => b.score - a.score);
  const strong = blobs.filter((b) => b.score >= blobs[0].score * 0.72).slice(0, 6);
  const union = unionBoxes(strong);

  // Notes: 15% top-safety padding above the topmost facial coordinate.
  const padY = union.h * HEAD_TOP_PADDING_RATIO;
  const padded = {
    x: union.x,
    y: Math.max(0, union.y - padY),
    w: union.w,
    h: Math.min(h - Math.max(0, union.y - padY), union.h + padY),
  };

  const focal = {
    x: ((padded.x + padded.w / 2) / w) * imgW,
    // Bias focal slightly below top so headroom stays inside the crop.
    y: ((padded.y + padded.h * 0.42) / h) * imgH,
  };

  const avgScore = strong.reduce((s, b) => s + b.score, 0) / strong.length;

  return {
    focalPoint: focal,
    detectedType: /** @type {DetectedType} */ ('face'),
    confidenceScore: clamp(avgScore * 100, 70, 99),
    subjectBox: scaleBox(padded, w, h, imgW, imgH),
    headPaddingApplied: true,
  };
}

/**
 * Secondary pass — object / pet / central-item mass from edge energy.
 * Notes: Used when no faces; center-of-mass of high-contrast regions.
 *
 * @param {Buffer} inputBuffer
 * @param {number} imgW
 * @param {number} imgH
 */
async function detectObjectsSecondary(inputBuffer, imgW, imgH) {
  const { edges, width: w, height: h } = await sobelEdgeMap(inputBuffer, 80);
  let sum = 0;
  let sumX = 0;
  let sumY = 0;
  let max = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = edges[y * w + x];
      if (e < 28) continue;
      // Mild center bias so background edges don't dominate.
      const nx = x / w - 0.5;
      const ny = y / h - 0.45;
      const bias = Math.exp(-(nx * nx * 3.2 + ny * ny * 2.6));
      const weight = e * bias;
      sum += weight;
      sumX += weight * x;
      sumY += weight * y;
      if (e > max) max = e;
    }
  }

  if (sum <= 0 || max < 40) return null;

  const cx = sumX / sum;
  const cy = sumY / sum;
  // Approximate subject box around center of mass (~36% of frame).
  const boxW = w * 0.36;
  const boxH = h * 0.4;
  const subject = {
    x: Math.max(0, cx - boxW / 2),
    y: Math.max(0, cy - boxH / 2),
    w: boxW,
    h: boxH,
  };

  const density = Math.min(1, sum / (w * h * 40));
  if (density < 0.08) return null;

  return {
    focalPoint: {
      x: (cx / w) * imgW,
      y: (cy / h) * imgH,
    },
    detectedType: /** @type {DetectedType} */ ('object'),
    confidenceScore: clamp(55 + density * 35, 55, 88),
    subjectBox: scaleBox(subject, w, h, imgW, imgH),
    headPaddingApplied: false,
  };
}

/**
 * Tertiary pass — lightweight saliency / visual complexity heatmap.
 * Notes: Downsampled greyscale × Sobel × center-upper prior; confidence capped.
 *
 * @param {Buffer} inputBuffer
 * @param {number} imgW
 * @param {number} imgH
 */
async function detectSaliencyTertiary(inputBuffer, imgW, imgH) {
  const { edges, width: w, height: h } = await sobelEdgeMap(inputBuffer, 64);
  const { data: grey } = await sampleGreyscale(inputBuffer, w, h);

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const lum = grey[i] / 255;
      const edge = edges[i] / 255;
      const nx = x / w - 0.5;
      const ny = y / h - 0.38;
      const centerBias = Math.exp(-(nx * nx * 4 + ny * ny * 3.5));
      const weight = (0.45 * lum + 0.55 * edge) * centerBias + 0.04 * centerBias;
      sumW += weight;
      sumX += weight * x;
      sumY += weight * y;
    }
  }

  const sx = sumW > 0 ? sumX / sumW : w / 2;
  const sy = sumW > 0 ? sumY / sumW : h * 0.4;
  const peak = sumW / (w * h);

  return {
    focalPoint: {
      x: (sx / w) * imgW,
      y: (sy / h) * imgH,
    },
    detectedType: /** @type {DetectedType} */ ('saliency_landscape'),
    // Notes: Pure saliency is intentionally lower confidence (50–65%).
    confidenceScore: clamp(50 + peak * 40, 50, 65),
    subjectBox: null,
    headPaddingApplied: false,
  };
}

/**
 * Notes: Crop loss = share of original area discarded to fit print ratio.
 * cropLoss = ((OriginalArea - CroppedArea) / OriginalArea) * 100
 *
 * @param {number} imgW
 * @param {number} imgH
 * @param {BoundingBox} cropBox
 */
export function calculateCropLossPercentage(imgW, imgH, cropBox) {
  const originalArea = Math.max(1, imgW * imgH);
  const croppedArea = Math.max(1, cropBox.width * cropBox.height);
  return clamp(((originalArea - croppedArea) / originalArea) * 100, 0, 100);
}

/**
 * Notes: Offset between geometric image center and AI focal point.
 * distancePercent = (euclidean distance / image diagonal) * 100
 *
 * @param {number} imgW
 * @param {number} imgH
 * @param {{ x: number, y: number }} focal
 */
export function calculateCorrectionDelta(imgW, imgH, focal) {
  const cx = imgW / 2;
  const cy = imgH / 2;
  const dx = focal.x - cx;
  const dy = focal.y - cy;
  const distancePx = Math.hypot(dx, dy);
  const diagonal = Math.hypot(imgW, imgH) || 1;
  return {
    dx: round1(dx),
    dy: round1(dy),
    distancePx: round1(distancePx),
    distancePercent: round1((distancePx / diagonal) * 100),
  };
}

/**
 * Notes: Blind geometric-center crop (classic lab behavior) for before/after UI.
 *
 * @param {Buffer} inputBuffer
 * @param {number} aspectRatio
 */
export async function processBlindCenterCrop(inputBuffer, aspectRatio = 2 / 3) {
  const meta = await sharp(inputBuffer).rotate().metadata();
  const imgW = meta.width || 1;
  const imgH = meta.height || 1;
  const oriented = orientAspectRatio(aspectRatio, imgW, imgH);
  const cropBox = computeCropBox(imgW, imgH, oriented, { x: imgW / 2, y: imgH / 2 }, {
    headPaddingApplied: false,
  });
  const buffer = await sharp(inputBuffer)
    .rotate()
    .extract({
      left: cropBox.x,
      top: cropBox.y,
      width: cropBox.width,
      height: cropBox.height,
    })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer, cropBox };
}

/**
 * Notes: Truncation risk if crop loss is high OR subject AABB touches crop edge.
 *
 * @param {BoundingBox} cropBox
 * @param {BoundingBox | null} subjectBox
 * @param {number} cropLossPercentage
 */
export function calculateTruncationRisk(cropBox, subjectBox, cropLossPercentage) {
  if (cropLossPercentage > CROP_LOSS_WARN_PERCENT) return true;
  if (!subjectBox) return false;
  const pad = 2;
  const leftHit = subjectBox.x < cropBox.x + pad;
  const topHit = subjectBox.y < cropBox.y + pad;
  const rightHit = subjectBox.x + subjectBox.width > cropBox.x + cropBox.width - pad;
  const bottomHit = subjectBox.y + subjectBox.height > cropBox.y + cropBox.height - pad;
  return leftHit || topHit || rightHit || bottomHit;
}

/**
 * Notes: VCG crop — geometric / rule-of-thirds by default; smart-shift + bleed when needed.
 */
export function computeCropBox(imgW, imgH, aspectRatio, focal, opts = {}) {
  if (opts.forceSmartShift) {
    return computeSmartShiftCropBox(imgW, imgH, aspectRatio, focal, opts);
  }
  return computePhotographerCropBox(imgW, imgH, aspectRatio, focal, opts).cropBox;
}

export function computeGeometricCropBox(imgW, imgH, aspectRatio) {
  const imgAspect = imgW / Math.max(1, imgH);
  let cropW;
  let cropH;
  if (imgAspect > aspectRatio) {
    cropH = imgH;
    cropW = Math.round(cropH * aspectRatio);
  } else {
    cropW = imgW;
    cropH = Math.round(cropW / aspectRatio);
  }
  return clampCropBox(
    {
      x: Math.round((imgW - cropW) / 2),
      y: Math.round((imgH - cropH) / 2),
      width: cropW,
      height: cropH,
    },
    imgW,
    imgH,
  );
}

function isFocalWellCentered(focal, imgW, imgH, zone = CENTER_ZONE_RATIO) {
  const half = zone / 2;
  const nx = focal.x / Math.max(1, imgW);
  const ny = focal.y / Math.max(1, imgH);
  return nx >= 0.5 - half && nx <= 0.5 + half && ny >= 0.5 - half && ny <= 0.5 + half;
}

function isOnRuleOfThirds(focal, imgW, imgH, tolerance = RULE_OF_THIRDS_TOLERANCE) {
  const tolX = Math.max(1, imgW * tolerance);
  const tolY = Math.max(1, imgH * tolerance);
  const xs = [imgW / 3, (2 * imgW) / 3];
  const ys = [imgH / 3, (2 * imgH) / 3];
  return xs.some((tx) => Math.abs(focal.x - tx) <= tolX) || ys.some((ty) => Math.abs(focal.y - ty) <= tolY);
}

function expandSubjectForProtection(subject, opts = {}) {
  const isPortrait = Boolean(opts.isPortrait);
  const headroom = opts.headroomRatio ?? (isPortrait ? HEAD_TOP_PADDING_RATIO : 0.04);
  const side = opts.sidePadRatio ?? 0.06;
  const padX = subject.width * side;
  const padTop = subject.height * headroom;
  const padBottom = subject.height * (isPortrait ? 0.04 : side);
  return {
    x: subject.x - padX,
    y: subject.y - padTop,
    width: subject.width + padX * 2,
    height: subject.height + padTop + padBottom,
  };
}

function subjectFitsInBox(subject, box) {
  if (!subject) return true;
  const protectedBox = expandSubjectForProtection(subject, { isPortrait: true });
  const pad = 2;
  return (
    protectedBox.x >= box.x - pad &&
    protectedBox.y >= box.y - pad &&
    protectedBox.x + protectedBox.width <= box.x + box.width + pad &&
    protectedBox.y + protectedBox.height <= box.y + box.height + pad
  );
}

export function applyPrintSafetyMargin(
  cropBox,
  subjectBox,
  imgW,
  imgH,
  marginRatio = PRINT_SAFETY_MARGIN_RATIO,
  opts = {},
) {
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

  if (protectedSubject.x - cropBox.x < padX) {
    x = protectedSubject.x - padX;
    shifted = true;
  }
  if (cropBox.x + cropBox.width - (protectedSubject.x + protectedSubject.width) < padX) {
    x = protectedSubject.x + protectedSubject.width + padX - cropBox.width;
    shifted = true;
  }
  if (protectedSubject.y - cropBox.y < padY) {
    y = protectedSubject.y - padY;
    shifted = true;
  }
  if (cropBox.y + cropBox.height - (protectedSubject.y + protectedSubject.height) < padY) {
    y = protectedSubject.y + protectedSubject.height + padY - cropBox.height;
    shifted = true;
  }

  const clamped = clampCropBox(
    { x, y, width: cropBox.width, height: cropBox.height },
    imgW,
    imgH,
  );
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

export function computePhotographerCropBox(imgW, imgH, aspectRatio, focal, opts = {}) {
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
  let compositionMode = 'geometric';

  if ((onThirds || wellCentered) && fitsGeometric) {
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
  const loss = calculateCropLossPercentage(imgW, imgH, margin.cropBox);
  const isCroppingNecessary =
    (aspectForcesCrop && loss > 1) || usedSmartShift || margin.addedSafetyMargin;

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

export function computeSmartShiftCropBox(imgW, imgH, aspectRatio, focal, opts = {}) {
  const geo = computeGeometricCropBox(imgW, imgH, aspectRatio);
  const cropW = geo.width;
  const cropH = geo.height;
  const isPortrait = opts.isPortrait ?? opts.headPaddingApplied;

  let x = Math.round(focal.x - cropW / 2);
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

  return clampCropBox({ x, y, width: cropW, height: cropH }, imgW, imgH);
}

export function buildPhotographerNote(cropLossPercentage, opts = {}) {
  const loss = Math.round(Number(cropLossPercentage) * 10) / 10;
  const marginPct = opts.safetyMarginPercentage ?? Math.round(PRINT_SAFETY_MARGIN_RATIO * 100);

  if (opts.shouldRecommendGenerativeFill || loss > CROP_LOSS_WARN_PERCENT) {
    return `⚠️ אזהרה: חיתוך עמוק (נחתך ${loss}% מהמקור). מומלץ להפעיל מחולל AI להשלמת הרקע`;
  }
  if (opts.addedSafetyMargin && loss <= CROP_LOSS_OK_PERCENT) {
    return `נוספה הגנת שוליים ומרווח ביטחון של ${marginPct}% מקצוות התמונה`;
  }
  if (opts.compositionMode === 'rule_of_thirds') {
    return `נשמרה קומפוזיציית שלישים מקורית עם מרווח ביטחון להדפסה (אובדן ${loss}%).`;
  }
  if (!opts.isCroppingNecessary && !opts.usedSmartShift) {
    return `קומפוזיציה מאוזנת — התאמת יחס מינימלית בלבד (אובדן ${loss}%).`;
  }
  if (loss <= CROP_LOSS_OK_PERCENT) {
    return `חיתוך אופטימלי | נוסף מרווח ביטחון ${marginPct}% בקצוות`;
  }
  return `חיתוך סביר - מוקד התמונה ממורכז ומוגן`;
}

/**
 * Notes: Keep crop rectangle inside image bounds without changing aspect.
 */
function clampCropBox(box, imgW, imgH) {
  let { x, y, width, height } = box;
  width = Math.min(width, imgW);
  height = Math.min(height, imgH);
  x = Math.max(0, Math.min(x, imgW - width));
  y = Math.max(0, Math.min(y, imgH - height));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Notes: Load bytes from URL or base64 for ingest routes.
 * @param {{ media_url?: string, media_base64?: string }} source
 * @returns {Promise<Buffer>}
 */
export async function loadImageBuffer(source) {
  if (source.media_base64) {
    const raw = source.media_base64.includes(',')
      ? source.media_base64.split(',')[1]
      : source.media_base64;
    return Buffer.from(raw, 'base64');
  }
  if (source.media_url) {
    const res = await fetch(source.media_url);
    if (!res.ok) {
      throw new Error(`Failed to download media: ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  throw new Error('media_url or media_base64 required');
}

/**
 * Notes: Downsample to RGBA for skin / blob analysis.
 * @param {Buffer} inputBuffer
 * @param {number} maxSide
 */
async function sampleRgba(inputBuffer, maxSide) {
  const meta = await sharp(inputBuffer).rotate().metadata();
  const srcW = meta.width ?? maxSide;
  const srcH = meta.height ?? maxSide;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Notes: Greyscale sample matching an existing edge map size.
 * @param {Buffer} inputBuffer
 * @param {number} width
 * @param {number} height
 */
async function sampleGreyscale(inputBuffer, width, height) {
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Notes: Sobel magnitude map for object / saliency passes.
 * @param {Buffer} inputBuffer
 * @param {number} maxSide
 */
async function sobelEdgeMap(inputBuffer, maxSide) {
  const meta = await sharp(inputBuffer).rotate().metadata();
  const srcW = meta.width ?? maxSide;
  const srcH = meta.height ?? maxSide;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const grey = await sharp(inputBuffer)
    .rotate()
    .resize(w, h, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const src = grey.data;
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] -
        2 * src[i - 1] -
        src[i + w - 1] +
        src[i - w + 1] +
        2 * src[i + 1] +
        src[i + w + 1];
      const gy =
        -src[i - w - 1] -
        2 * src[i - w] -
        src[i - w + 1] +
        src[i + w - 1] +
        2 * src[i + w] +
        src[i + w + 1];
      edges[i] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return { edges, width: w, height: h };
}

/**
 * Notes: Classic YCbCr-ish skin test on RGBA sample.
 * @param {Uint8Array|Buffer} data
 * @param {number} pixelIndex
 */
function isSkinTone(data, pixelIndex) {
  const i = pixelIndex * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r < 60 || g < 30 || b < 15) return false;
  if (r < g || r < b) return false;
  if (Math.abs(r - g) < 12) return false;
  if (r - g < 10 || r - b < 10) return false;
  // Exclude very saturated reds / yellows that are not skin.
  if (r > 240 && g > 210 && b > 180) return false;
  return true;
}

/**
 * Notes: Flood-fill connected skin pixels into one blob AABB.
 * @param {Uint8Array|Buffer} data
 * @param {Uint8Array} visited
 * @param {number} w
 * @param {number} h
 * @param {number} startX
 * @param {number} startY
 */
function floodSkinBlob(data, visited, w, h, startX, startY) {
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  const stack = [startX, startY];
  visited[startY * w + startX] = 1;

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (!isSkinTone(data, ni)) continue;
      stack.push(nx, ny);
    }
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Notes: Axis-aligned union of detection blobs.
 * @param {{ x: number, y: number, w: number, h: number }[]} boxes
 */
function unionBoxes(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Notes: Map sample-space box to full-resolution pixels.
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {number} sw
 * @param {number} sh
 * @param {number} imgW
 * @param {number} imgH
 * @returns {BoundingBox}
 */
function scaleBox(box, sw, sh, imgW, imgH) {
  return {
    x: (box.x / sw) * imgW,
    y: (box.y / sh) * imgH,
    width: (box.w / sw) * imgW,
    height: (box.h / sh) * imgH,
  };
}

/** Notes: Clamp numeric range helper. */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Notes: Laplacian variance focus score (0–100) on a subject / crop region via Sharp.
 * @param {Buffer} inputBuffer
 * @param {{ x: number, y: number, width: number, height: number } | null | undefined} region
 */
async function analyzeBufferFocus(inputBuffer, region) {
  try {
    const meta = await sharp(inputBuffer).rotate().metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (!imgW || !imgH) return { focusScore: 50, isLowFocus: false };

    const box =
      region && region.width > 8 && region.height > 8
        ? {
            left: Math.max(0, Math.floor(region.x)),
            top: Math.max(0, Math.floor(region.y)),
            width: Math.max(8, Math.floor(region.width)),
            height: Math.max(8, Math.floor(region.height)),
          }
        : {
            left: Math.floor(imgW * 0.25),
            top: Math.floor(imgH * 0.25),
            width: Math.floor(imgW * 0.5),
            height: Math.floor(imgH * 0.5),
          };
    // Clamp extract inside image (Sharp throws if area overflows)
    box.left = Math.min(box.left, Math.max(0, imgW - 8));
    box.top = Math.min(box.top, Math.max(0, imgH - 8));
    box.width = Math.min(box.width, imgW - box.left);
    box.height = Math.min(box.height, imgH - box.top);
    if (box.width < 8 || box.height < 8) return { focusScore: 50, isLowFocus: false };

    const maxSide = 160;
    const scale = Math.min(1, maxSide / Math.max(box.width, box.height, 1));
    const tw = Math.max(8, Math.floor(box.width * scale));
    const th = Math.max(8, Math.floor(box.height * scale));

    const { data, info } = await sharp(inputBuffer)
      .rotate()
      .extract(box)
      .resize(tw, th, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (!n) return { focusScore: 50, isLowFocus: false };
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    const score = Math.max(0, Math.min(100, Math.round(((Math.log1p(variance) / Math.log1p(2500)) * 100) * 10) / 10));
    return { focusScore: score, isLowFocus: score < 40 };
  } catch {
    return { focusScore: 50, isLowFocus: false };
  }
}

/** Notes: One-decimal display rounding for UI badges. */
function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}
