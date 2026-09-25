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

/** Top safety padding above the topmost face/subject edge (never chop heads). */
const HEAD_TOP_PADDING_RATIO = 0.15;

/** Crop-loss threshold that should warn the admin UI (red badge). */
export const CROP_LOSS_WARN_PERCENT = 25;

/**
 * Main entry: analyze image, pick focal point, crop to print aspect ratio.
 * Notes: Prefer manual crop when provided; otherwise run the 3-pass AI pipeline.
 *
 * @param {Buffer} inputBuffer
 * @param {{
 *   aspectRatio?: number,
 *   manualCrop?: object | null,
 *   resetToAi?: boolean,
 * }} opts
 * @returns {Promise<CropEngineResult>}
 */
export async function processSmartCrop(inputBuffer, opts = {}) {
  const aspectRatio = Number(opts.aspectRatio) || 2 / 3;
  const meta = await sharp(inputBuffer).rotate().metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;
  if (!imgW || !imgH) {
    throw new Error('Could not read image dimensions');
  }

  const manual = opts.manualCrop && !opts.resetToAi ? opts.manualCrop : null;
  let cropBox;
  let analysis = null;
  let headPaddingApplied = false;

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
  } else {
    // Notes: Auto path — detect subject, then build aspect-locked crop around it.
    analysis = await analyzeImageSubject(inputBuffer, imgW, imgH);
    headPaddingApplied = analysis.headPaddingApplied;
    cropBox = computeCropBox(imgW, imgH, aspectRatio, analysis.focalPoint, {
      subjectBox: analysis.subjectBox,
      headPaddingApplied,
    });
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
  const hasTruncationRisk = calculateTruncationRisk(
    cropBox,
    analysis.subjectBox,
    cropLossPercentage,
  );

  const focalPoint = analysis.focalPoint;
  const metrics = {
    detectedType: analysis.detectedType,
    confidenceScore: round1(analysis.confidenceScore),
    cropLossPercentage: round1(cropLossPercentage),
    headPaddingApplied,
    hasTruncationRisk,
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
 * Notes: Fit target aspect around focal point; keep headroom when faces detected.
 *
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} aspectRatio
 * @param {FocalPoint} focal
 * @param {{ subjectBox?: BoundingBox | null, headPaddingApplied?: boolean }} [opts]
 */
export function computeCropBox(imgW, imgH, aspectRatio, focal, opts = {}) {
  const imgAspect = imgW / imgH;
  let cropW;
  let cropH;

  if (imgAspect > aspectRatio) {
    cropH = imgH;
    cropW = Math.round(cropH * aspectRatio);
  } else {
    cropW = imgW;
    cropH = Math.round(cropW / aspectRatio);
  }

  // Notes: When head padding was applied, bias crop upward (heads stay in frame).
  const topBias = opts.headPaddingApplied ? HEAD_TOP_PADDING_RATIO : 0.08;
  let x = Math.round(focal.x - cropW / 2);
  let y = Math.round(focal.y - cropH * (0.5 - topBias * 0.55));

  // If we know the subject box, nudge crop to contain it when possible.
  if (opts.subjectBox) {
    const sb = opts.subjectBox;
    const preferX = Math.round(sb.x + sb.width / 2 - cropW / 2);
    const preferY = Math.round(sb.y + sb.height * 0.35 - cropH * 0.35);
    x = Math.round(x * 0.35 + preferX * 0.65);
    y = Math.round(y * 0.35 + preferY * 0.65);
  }

  return clampCropBox({ x, y, width: cropW, height: cropH }, imgW, imgH);
}

/**
 * Notes: Keep crop rectangle inside image bounds without changing aspect.
 *
 * @param {BoundingBox} box
 * @param {number} imgW
 * @param {number} imgH
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

/** Notes: One-decimal display rounding for UI badges. */
function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}
