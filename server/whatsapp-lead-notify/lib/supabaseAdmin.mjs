import { createClient } from '@supabase/supabase-js';

let admin = null;

export function isSupabaseAdminConfigured() {
  const url = (process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return Boolean(url && key);
}

export function getSupabaseAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  if (!admin) {
    const url = process.env.SUPABASE_URL.trim().replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
