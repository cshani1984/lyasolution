/**
 * Monthly Generative AI quota checks against Supabase profiles.
 */
import { getSupabaseAdmin } from './supabaseAdmin.mjs';
import {
  TIER_CONFIGS,
  currentPeriodYm,
  normalizeTier,
  supportWhatsAppUrl,
} from './subscriptions.mjs';

/**
 * @param {string} userId
 * @returns {Promise<{
 *   allowed: boolean,
 *   tier: string,
 *   used: number,
 *   max: number,
 *   error?: string,
 *   supportUrl?: string,
 * }>}
 */
export async function checkGenerativeQuota(userId) {
  if (!userId) {
    // Anonymous / demo API key flows — treat as demo tier with env override
    const max = TIER_CONFIGS.demo.maxMonthlyGenerativeAI;
    return { allowed: true, tier: 'demo', used: 0, max };
  }

  const supabase = getSupabaseAdmin();
  const period = currentPeriodYm();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_tier, generative_ai_used_this_month, generative_ai_period_ym')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      tier: 'basic',
      used: 0,
      max: TIER_CONFIGS.basic.maxMonthlyGenerativeAI,
      error: error.message,
      supportUrl: supportWhatsAppUrl(),
    };
  }

  let tier = normalizeTier(profile?.subscription_tier);
  let used = Number(profile?.generative_ai_used_this_month ?? 0) || 0;
  const storedPeriod = profile?.generative_ai_period_ym || '';

  if (storedPeriod !== period) {
    used = 0;
    await supabase
      .from('profiles')
      .update({
        generative_ai_used_this_month: 0,
        generative_ai_period_ym: period,
      })
      .eq('id', userId);
  }

  const max = TIER_CONFIGS[tier].maxMonthlyGenerativeAI;
  if (used >= max) {
    return {
      allowed: false,
      tier,
      used,
      max,
      error: 'QUOTA_EXCEEDED',
      supportUrl: supportWhatsAppUrl(),
    };
  }

  return { allowed: true, tier, used, max };
}

/**
 * Notes: Atomically increment usage after a successful Clipdrop call.
 * @param {string} userId
 */
export async function incrementGenerativeUsage(userId) {
  if (!userId) return { used: 0 };
  const supabase = getSupabaseAdmin();
  const period = currentPeriodYm();
  const { data: profile } = await supabase
    .from('profiles')
    .select('generative_ai_used_this_month, generative_ai_period_ym')
    .eq('id', userId)
    .maybeSingle();

  let used = Number(profile?.generative_ai_used_this_month ?? 0) || 0;
  if (profile?.generative_ai_period_ym !== period) used = 0;
  used += 1;

  await supabase
    .from('profiles')
    .update({
      generative_ai_used_this_month: used,
      generative_ai_period_ym: period,
    })
    .eq('id', userId);

  return { used };
}

/**
 * Notes: Dev/demo helpers — force usage or reset counter.
 * @param {string} userId
 * @param {number} used
 * @param {string} [tier]
 */
export async function setGenerativeUsage(userId, used, tier) {
  if (!userId) return;
  const supabase = getSupabaseAdmin();
  const patch = {
    generative_ai_period_ym: currentPeriodYm(),
  };
  if (used !== undefined && used !== null) {
    patch.generative_ai_used_this_month = Math.max(0, Number(used) || 0);
  }
  if (tier) patch.subscription_tier = normalizeTier(tier);
  await supabase.from('profiles').update(patch).eq('id', userId);
}

export function quotaExceededPayload(check) {
  return {
    error: 'QUOTA_EXCEEDED',
    message:
      'הגעת למכסת ה-Generative AI החודשית שלך. המרכוז הסטנדרטי ממשיך לעבוד בחינם!',
    supportUrl: check.supportUrl || supportWhatsAppUrl(),
    tier: check.tier,
    used: check.used,
    max: check.max,
  };
}
