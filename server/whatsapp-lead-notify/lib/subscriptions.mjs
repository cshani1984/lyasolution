/**
 * CropFlow subscription tiers (runtime ESM).
 */

/** @typedef {'demo' | 'basic' | 'pro'} SubscriptionTier */

export const TIER_CONFIGS = {
  demo: {
    name: 'דמו / פיילוט',
    maxMonthlyGenerativeAI: 50,
    canUseBatchUpload: true,
    canUseCustomWatermark: true,
  },
  basic: {
    name: 'מסלול בסיסי (Basic)',
    maxMonthlyGenerativeAI: 30,
    canUseBatchUpload: false,
    canUseCustomWatermark: false,
  },
  pro: {
    name: 'מסלול מקצועי (Pro)',
    maxMonthlyGenerativeAI: 150,
    canUseBatchUpload: true,
    canUseCustomWatermark: true,
  },
};

export const GENERATIVE_FILL_RECOMMEND_PERCENT = 25;

export const DEFAULT_SUPPORT_WA =
  'https://wa.me/972500000000?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A9%D7%93%D7%A8%D7%92%20%D7%90%D7%AA%20%D7%9E%D7%9B%D7%A1%D7%AA%20%D7%94-AI%20%D7%91%D7%97%D7%A0%D7%95%D7%AA%20%D7%A9%D7%9C%D7%99';

/**
 * @param {string | null | undefined} raw
 * @returns {keyof typeof TIER_CONFIGS}
 */
export function normalizeTier(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (t === 'demo' || t === 'pro' || t === 'basic') return t;
  return 'basic';
}

/** @param {Date} [d] */
export function currentPeriodYm(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function supportWhatsAppUrl() {
  return (process.env.SMARTCROP_SUPPORT_WA || DEFAULT_SUPPORT_WA).trim();
}
