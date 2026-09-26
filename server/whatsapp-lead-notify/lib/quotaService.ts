/**
 * Monthly Generative AI quota — TypeScript contract (runtime: quotaService.mjs).
 */
import type { SubscriptionTier } from './subscriptions';
import { TIER_CONFIGS, DEFAULT_SUPPORT_WA, normalizeTier, currentPeriodYm } from './subscriptions';

export interface QuotaCheckResult {
  allowed: boolean;
  tier: SubscriptionTier;
  used: number;
  max: number;
  error?: string;
  supportUrl?: string;
}

export interface QuotaExceededResponse {
  error: 'QUOTA_EXCEEDED';
  message: string;
  supportUrl: string;
  tier?: SubscriptionTier;
  used?: number;
  max?: number;
}

export function quotaExceededPayload(check: Partial<QuotaCheckResult>): QuotaExceededResponse {
  return {
    error: 'QUOTA_EXCEEDED',
    message:
      'הגעת למכסת ה-Generative AI החודשית שלך. המרכוז הסטנדרטי ממשיך לעבוד בחינם!',
    supportUrl: check.supportUrl || DEFAULT_SUPPORT_WA,
    tier: check.tier,
    used: check.used,
    max: check.max,
  };
}

export function evaluateQuota(
  tierRaw: string | null | undefined,
  usedRaw: number,
  periodYm: string | null | undefined,
  now = new Date(),
): QuotaCheckResult {
  const tier = normalizeTier(tierRaw);
  const period = currentPeriodYm(now);
  const used = periodYm !== period ? 0 : Math.max(0, Number(usedRaw) || 0);
  const max = TIER_CONFIGS[tier].maxMonthlyGenerativeAI;
  if (used >= max) {
    return {
      allowed: false,
      tier,
      used,
      max,
      error: 'QUOTA_EXCEEDED',
      supportUrl: DEFAULT_SUPPORT_WA,
    };
  }
  return { allowed: true, tier, used, max };
}
