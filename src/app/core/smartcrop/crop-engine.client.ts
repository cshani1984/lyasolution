/**
 * Browser Smart Crop engine — MediaPipe Tasks Vision (WASM) + canvas crop.
 * Notes: Face → object → canvas-saliency cascade (MediaPipe runs in the browser).
 */
import {
  FaceDetector,
  FilesetResolver,
  ObjectDetector,
  type Detection,
} from '@mediapipe/tasks-vision';
import type {
  CropData,
  CropMetrics,
  DetectedType,
  FocalPoint,
} from '../models/smartcrop.model';
import type { BoundingBox } from './crop-engine.math';
import {
  HEAD_TOP_PADDING_RATIO,
  calculateCropLossPercentage,
  calculateTruncationRisk,
} from './crop-engine.math';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const OBJECT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

let faceDetectorPromise: Promise<FaceDetector> | null = null;
let objectDetectorPromise: Promise<ObjectDetector> | null = null;

export interface ClientCropResult {
  blob: Blob;
  cropData: CropData;
  metrics: CropMetrics;
}

/**
 * Notes: Entry for client WhatsApp simulation / local preview crops.
 * Lazy-loads MediaPipe; falls back to canvas saliency if WASM fails.
 */
export async function smartCropJpeg(
  file: File,
  aspectRatio: number,
): Promise<ClientCropResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return await smartCropFromBitmap(bitmap, aspectRatio);
  } finally {
    bitmap.close();
  }
}

/**
 * Notes: Same AI pipeline from an image URL (demo assets / stored originals).
 */
export async function smartCropFromUrl(
  imageUrl: string,
  aspectRatio: number,
): Promise<ClientCropResult> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    return await smartCropFromBitmap(bitmap, aspectRatio);
  } finally {
    bitmap.close();
  }
}

/** Notes: Shared analyze → crop → JPEG encode for File or URL bitmaps. */
async function smartCropFromBitmap(
  bitmap: ImageBitmap,
  aspectRatio: number,
): Promise<ClientCropResult> {
  const imgW = bitmap.width;
  const imgH = bitmap.height;

  let analysis: {
    focalPoint: FocalPoint;
    detectedType: DetectedType;
    confidenceScore: number;
    subjectBox: BoundingBox | null;
    headPaddingApplied: boolean;
  };

  try {
    analysis = await analyzeWithMediaPipe(bitmap, imgW, imgH);
  } catch {
    analysis = analyzeCanvasSaliency(bitmap, imgW, imgH);
  }

  const cropBox = computeCropBox(imgW, imgH, aspectRatio, analysis.focalPoint, {
    subjectBox: analysis.subjectBox,
    headPaddingApplied: analysis.headPaddingApplied,
  });

  const cropLossPercentage = calculateCropLossPercentage(imgW, imgH, cropBox);
  const hasTruncationRisk = calculateTruncationRisk(
    cropBox,
    analysis.subjectBox,
    cropLossPercentage,
  );

  const metrics: CropMetrics = {
    detectedType: analysis.detectedType,
    confidenceScore: round1(analysis.confidenceScore),
    cropLossPercentage: round1(cropLossPercentage),
    headPaddingApplied: analysis.headPaddingApplied,
    hasTruncationRisk,
  };

  const outBlob = await renderCropBlob(bitmap, cropBox, aspectRatio);

  const cropData: CropData = {
    x: cropBox.x,
    y: cropBox.y,
    width: cropBox.width,
    height: cropBox.height,
    zoom: 1,
    rotation: 0,
    focalPoint: analysis.focalPoint,
    isManuallyEdited: false,
    metrics,
  };

  return { blob: outBlob, cropData, metrics };
}

/**
 * Notes: Primary FaceDetector, then ObjectDetector; else saliency.
 */
async function analyzeWithMediaPipe(
  bitmap: ImageBitmap,
  imgW: number,
  imgH: number,
) {
  const faceDetector = await getFaceDetector();
  const faceResult = faceDetector.detect(bitmap as unknown as HTMLImageElement);
  const faces = faceResult.detections ?? [];

  if (faces.length) {
    const union = unionDetections(faces, imgW, imgH);
    // Notes: Pad top (hair) + slight sides so faces stay centered and uncropped.
    const padY = Math.max(union.height * HEAD_TOP_PADDING_RATIO, imgH * 0.04);
    const padX = union.width * 0.18;
    const top = Math.max(0, union.y - padY);
    const left = Math.max(0, union.x - padX);
    const right = Math.min(imgW, union.x + union.width + padX);
    const bottom = Math.min(imgH, union.y + union.height + union.height * 0.35);
    const padded: BoundingBox = {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
    const avg =
      faces.reduce((s, d) => s + (d.categories?.[0]?.score ?? 0.8), 0) / faces.length;

    return {
      focalPoint: {
        x: padded.x + padded.width / 2,
        y: padded.y + padded.height * 0.42,
      },
      detectedType: 'face' as const,
      confidenceScore: clamp(avg * 100, 70, 99.5),
      subjectBox: padded,
      headPaddingApplied: true,
    };
  }

  const objectDetector = await getObjectDetector();
  const objectResult = objectDetector.detect(bitmap as unknown as HTMLImageElement);
  const objects = (objectResult.detections ?? []).filter(
    (d) => (d.categories?.[0]?.score ?? 0) >= 0.35,
  );

  if (objects.length) {
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    for (const d of objects) {
      const box = detectionToBox(d, imgW, imgH);
      const score = d.categories?.[0]?.score ?? 0.5;
      sumW += score;
      sumX += (box.x + box.width / 2) * score;
      sumY += (box.y + box.height / 2) * score;
    }
    const union = unionDetections(objects, imgW, imgH);
    const avg = sumW / objects.length;

    return {
      focalPoint: { x: sumX / sumW, y: sumY / sumW },
      detectedType: 'object' as const,
      confidenceScore: clamp(avg * 100, 55, 92),
      subjectBox: union,
      headPaddingApplied: false,
    };
  }

  return analyzeCanvasSaliency(bitmap, imgW, imgH);
}

/**
 * Notes: Tertiary canvas saliency — edge energy on a 64px grid.
 */
function analyzeCanvasSaliency(bitmap: ImageBitmap, imgW: number, imgH: number) {
  const sampleW = 64;
  const sampleH = Math.max(1, Math.round((64 * imgH) / imgW));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      focalPoint: { x: imgW / 2, y: imgH * 0.4 },
      detectedType: 'saliency_landscape' as const,
      confidenceScore: 55,
      subjectBox: null,
      headPaddingApplied: false,
    };
  }
  ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const i = (y * sampleW + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const right = (data[i + 4] + data[i + 5] + data[i + 6]) / 3;
      const down =
        (data[i + sampleW * 4] + data[i + sampleW * 4 + 1] + data[i + sampleW * 4 + 2]) / 3;
      const edge = Math.abs(lum - right) + Math.abs(lum - down);
      const nx = x / sampleW - 0.5;
      const ny = y / sampleH - 0.38;
      const bias = Math.exp(-(nx * nx * 4 + ny * ny * 3.5));
      const weight = (edge / 255) * bias + 0.04 * bias;
      sumW += weight;
      sumX += weight * x;
      sumY += weight * y;
    }
  }

  const sx = sumW > 0 ? sumX / sumW : sampleW / 2;
  const sy = sumW > 0 ? sumY / sumW : sampleH * 0.4;

  return {
    focalPoint: {
      x: (sx / sampleW) * imgW,
      y: (sy / sampleH) * imgH,
    },
    detectedType: 'saliency_landscape' as const,
    confidenceScore: clamp(50 + (sumW / (sampleW * sampleH)) * 80, 50, 65),
    subjectBox: null,
    headPaddingApplied: false,
  };
}

/** Notes: Lazy-init BlazeFace short-range FaceDetector. */
async function getFaceDetector(): Promise<FaceDetector> {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
    })();
  }
  return faceDetectorPromise;
}

/** Notes: Lazy-init EfficientDet-Lite0 ObjectDetector for pets/objects. */
async function getObjectDetector(): Promise<ObjectDetector> {
  if (!objectDetectorPromise) {
    objectDetectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
      return ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        scoreThreshold: 0.35,
        maxResults: 8,
      });
    })();
  }
  return objectDetectorPromise;
}

/** Notes: MediaPipe box → pixel AABB (handles normalized or pixel coords). */
function detectionToBox(d: Detection, imgW: number, imgH: number): BoundingBox {
  const bb = d.boundingBox;
  if (!bb) return { x: 0, y: 0, width: imgW, height: imgH };
  const { originX: x, originY: y, width, height } = bb;
  const normalized = width <= 1.5 && height <= 1.5;
  return normalized
    ? { x: x * imgW, y: y * imgH, width: width * imgW, height: height * imgH }
    : { x, y, width, height };
}

/** Notes: Combined subject AABB for headroom + truncation checks. */
function unionDetections(detections: Detection[], imgW: number, imgH: number): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of detections) {
    const b = detectionToBox(d, imgW, imgH);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Notes: Aspect-locked crop around focal point; nudge to contain subject when known.
 */
export function computeCropBox(
  imgW: number,
  imgH: number,
  aspectRatio: number,
  focal: FocalPoint,
  opts: { subjectBox?: BoundingBox | null; headPaddingApplied?: boolean } = {},
): BoundingBox {
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

  const topBias = opts.headPaddingApplied ? HEAD_TOP_PADDING_RATIO : 0.08;
  let x = Math.round(focal.x - cropW / 2);
  let y = Math.round(focal.y - cropH * (0.5 - topBias * 0.55));

  if (opts.subjectBox) {
    const sb = opts.subjectBox;
    const preferX = Math.round(sb.x + sb.width / 2 - cropW / 2);
    const preferY = Math.round(sb.y + sb.height * 0.35 - cropH * 0.35);
    x = Math.round(x * 0.35 + preferX * 0.65);
    y = Math.round(y * 0.35 + preferY * 0.65);
  }

  x = Math.max(0, Math.min(x, imgW - cropW));
  y = Math.max(0, Math.min(y, imgH - cropH));
  return { x, y, width: Math.round(cropW), height: Math.round(cropH) };
}

/** Notes: Encode crop rectangle as JPEG preview/upload blob. */
async function renderCropBlob(
  bitmap: ImageBitmap,
  cropBox: BoundingBox,
  aspectRatio: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const outW = Math.round(Math.min(1800, cropBox.width));
  const outH = Math.round(outW / aspectRatio);
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(
    bitmap,
    cropBox.x,
    cropBox.y,
    cropBox.width,
    cropBox.height,
    0,
    0,
    outW,
    outH,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      0.92,
    );
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
