/**
 * Clipdrop Uncrop / Generative Fill — TypeScript contract + helpers.
 */

export interface ExtendPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
  needed: boolean;
}

export interface GenerativeFillResult {
  ok: boolean;
  buffer?: Buffer | Uint8Array;
  fallback?: boolean;
  error?: string;
  extend?: ExtendPadding;
  usedClipdrop?: boolean;
}

/**
 * Notes: Pixel padding so the full frame fits print aspect without crop.
 */
export function calculateExtendPadding(
  imgW: number,
  imgH: number,
  aspectRatio: number,
  opts: { biasTop?: number } = {},
): ExtendPadding {
  const target = Number(aspectRatio) || 2 / 3;
  const biasTop = opts.biasTop ?? 0.55;
  const imgAspect = imgW / Math.max(1, imgH);
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  if (imgAspect > target) {
    const newH = Math.ceil(imgW / target);
    const pad = Math.max(0, newH - imgH);
    top = Math.round(pad * biasTop);
    bottom = pad - top;
  } else if (imgAspect < target) {
    const newW = Math.ceil(imgH * target);
    const pad = Math.max(0, newW - imgW);
    left = Math.floor(pad / 2);
    right = pad - left;
  }

  const clamp = (n: number) => Math.max(0, Math.min(2048, n));
  left = clamp(left);
  right = clamp(right);
  top = clamp(top);
  bottom = clamp(bottom);

  return { left, right, top, bottom, needed: left + right + top + bottom > 0 };
}

export function isClipdropConfigured(): boolean {
  return Boolean(typeof process !== 'undefined' && process.env?.CLIPDROP_API_KEY?.trim());
}
