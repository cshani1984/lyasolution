/**
 * Clipdrop Uncrop / Generative Fill (outpainting).
 * Docs: POST https://clipdrop-api.co/uncrop/v1
 */
import sharp from 'sharp';

const CLIPDROP_UNCROP_URL = 'https://clipdrop-api.co/uncrop/v1';

/**
 * Notes: Pixel padding required so the full subject fits a print aspect
 * without chopping heads — used as Clipdrop extend_* values.
 *
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} aspectRatio  print width/height
 * @param {{ biasTop?: number }} [opts]
 * @returns {{ left: number, right: number, top: number, bottom: number, needed: boolean }}
 */
export function calculateExtendPadding(imgW, imgH, aspectRatio, opts = {}) {
  const target = Number(aspectRatio) || 2 / 3;
  const biasTop = opts.biasTop ?? 0.55;
  const imgAspect = imgW / Math.max(1, imgH);

  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  if (imgAspect > target) {
    // Image wider than print → grow height (top/bottom)
    const newH = Math.ceil(imgW / target);
    const pad = Math.max(0, newH - imgH);
    top = Math.round(pad * biasTop);
    bottom = pad - top;
  } else if (imgAspect < target) {
    // Image taller than print → grow width (left/right)
    const newW = Math.ceil(imgH * target);
    const pad = Math.max(0, newW - imgW);
    left = Math.floor(pad / 2);
    right = pad - left;
  }

  // Clipdrop typically caps per-side extend; clamp to a safe range.
  const clamp = (n) => Math.max(0, Math.min(2048, n));
  left = clamp(left);
  right = clamp(right);
  top = clamp(top);
  bottom = clamp(bottom);

  return {
    left,
    right,
    top,
    bottom,
    needed: left + right + top + bottom > 0,
  };
}

/**
 * @returns {boolean}
 */
export function isClipdropConfigured() {
  return Boolean(process.env.CLIPDROP_API_KEY?.trim());
}

/**
 * Notes: Call Clipdrop Uncrop. On missing key / HTTP error → { ok:false, fallback:true }.
 *
 * @param {Buffer} inputBuffer
 * @param {{ left?: number, right?: number, top?: number, bottom?: number }} extend
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, fallback?: boolean, error?: string }>}
 */
export async function uncropWithClipdrop(inputBuffer, extend = {}) {
  const key = process.env.CLIPDROP_API_KEY?.trim();
  if (!key) {
    return { ok: false, fallback: true, error: 'CLIPDROP_API_KEY missing' };
  }

  const left = Math.max(0, Number(extend.left) || 0);
  const right = Math.max(0, Number(extend.right) || 0);
  const top = Math.max(0, Number(extend.top) || 0);
  const bottom = Math.max(0, Number(extend.bottom) || 0);

  if (left + right + top + bottom === 0) {
    return { ok: true, buffer: inputBuffer };
  }

  try {
    const jpeg = await sharp(inputBuffer).rotate().jpeg({ quality: 92 }).toBuffer();
    const form = new FormData();
    form.append('image_file', new Blob([jpeg], { type: 'image/jpeg' }), 'image.jpg');
    form.append('extend_left', String(left));
    form.append('extend_right', String(right));
    form.append('extend_top', String(top));
    form.append('extend_bottom', String(bottom));

    const res = await fetch(CLIPDROP_UNCROP_URL, {
      method: 'POST',
      headers: { 'x-api-key': key },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return {
        ok: false,
        fallback: true,
        error: `Clipdrop ${res.status}: ${String(text).slice(0, 240)}`,
      };
    }

    const ab = await res.arrayBuffer();
    return { ok: true, buffer: Buffer.from(ab) };
  } catch (err) {
    return {
      ok: false,
      fallback: true,
      error: err?.message || String(err),
    };
  }
}

/**
 * Notes: Generative fill pipeline — Clipdrop first, caller falls back to Sharp crop.
 *
 * @param {Buffer} inputBuffer
 * @param {number} aspectRatio
 */
export async function generativeFillOrFallback(inputBuffer, aspectRatio) {
  const meta = await sharp(inputBuffer).rotate().metadata();
  const imgW = meta.width || 1;
  const imgH = meta.height || 1;
  const extend = calculateExtendPadding(imgW, imgH, aspectRatio);

  if (!extend.needed) {
    return { ok: true, buffer: inputBuffer, extend, usedClipdrop: false };
  }

  const result = await uncropWithClipdrop(inputBuffer, extend);
  if (result.ok && result.buffer) {
    return { ok: true, buffer: result.buffer, extend, usedClipdrop: true };
  }

  return {
    ok: false,
    fallback: true,
    error: result.error,
    extend,
    usedClipdrop: false,
  };
}
