/**
 * Canonical origin for SEO & social previews (HTTPS, no trailing slash).
 * Browsers at localhost use the current origin so local checks stay accurate.
 */
export const SITE_ORIGIN_DEFAULT = 'https://lyasolution.com';

export function resolveSiteOrigin(): string {
  if (typeof window === 'undefined') {
    return SITE_ORIGIN_DEFAULT;
  }
  const o = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)) {
    return o;
  }
  return SITE_ORIGIN_DEFAULT;
}
