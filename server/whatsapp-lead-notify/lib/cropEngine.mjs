/**
 * Smart visual auto-centering for print aspect ratios.
 * Uses sharp + center-weighted saliency with top safety padding
 * so heads / main subjects are less likely to be truncated.
 */
import sharp from 'sharp';

/**
 * @param {Buffer} inputBuffer
 * @param {{ aspectRatio: number, manualCrop?: object | null, resetToAi?: boolean }} opts
 * @returns {Promise<{ buffer: Buffer, cropData: object }>}
 */
export async function processSmartCrop(inputBuffer, opts) {
  const aspectRatio = Number(opts.aspectRatio) || 2 / 3;
  const meta = await sharp(inputBuffer).rotate().metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;
  if (!imgW || !imgH) {
    throw new Error('Could not read image dimensions');
  }

  let cropBox;
  const manual = opts.manualCrop && !opts.resetToAi ? opts.manualCrop : null;

  if (
    manual &&
    typeof manual.x === 'number' &&
    typeof manual.y === 'number' &&
    typeof manual.width === 'number' &&
    typeof manual.height === 'number'
  ) {
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
  } else {
    const focal = await estimateFocalPoint(inputBuffer, imgW, imgH);
    cropBox = computeCropBox(imgW, imgH, aspectRatio, focal);
  }

  const buffer = await sharp(inputBuffer)
    .rotate()
    .extract({
      left: cropBox.x,
      top: cropBox.y,
      width: cropBox.width,
      height: cropBox.height,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const focalPoint = {
    x: cropBox.x + cropBox.width / 2,
    y: cropBox.y + cropBox.height * 0.38,
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
  };

  return { buffer, cropData };
}

/**
 * Estimate focal point via downsampled luminance energy (center-weighted).
 * Bias slightly upward so faces/heads stay in frame.
 */
async function estimateFocalPoint(inputBuffer, imgW, imgH) {
  const sampleW = 64;
  const sampleH = Math.max(1, Math.round((64 * imgH) / imgW));
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .resize(sampleW, sampleH, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  const w = info.width;
  const h = info.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const lum = data[i] ?? 0;
      // Prefer mid-upper region (heads) and image center
      const nx = x / w - 0.5;
      const ny = y / h - 0.35;
      const centerBias = Math.exp(-(nx * nx * 4 + ny * ny * 4));
      const weight = (lum / 255) * centerBias + 0.05 * centerBias;
      sumW += weight;
      sumX += weight * x;
      sumY += weight * y;
    }
  }

  if (sumW <= 0) {
    return { x: imgW / 2, y: imgH * 0.4 };
  }

  const sx = sumX / sumW;
  const sy = sumY / sumW;
  return {
    x: (sx / w) * imgW,
    y: (sy / h) * imgH,
  };
}

/**
 * Fit a crop of the target aspect ratio around the focal point,
 * with extra top padding so heads are not chopped.
 */
export function computeCropBox(imgW, imgH, aspectRatio, focal) {
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

  // Top safety: prefer keeping space above focal (heads)
  const topPadRatio = 0.18;
  let x = Math.round(focal.x - cropW / 2);
  let y = Math.round(focal.y - cropH * (0.5 - topPadRatio * 0.5));

  return clampCropBox({ x, y, width: cropW, height: cropH }, imgW, imgH);
}

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
 * Load image bytes from URL or base64 data URL / raw base64.
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
