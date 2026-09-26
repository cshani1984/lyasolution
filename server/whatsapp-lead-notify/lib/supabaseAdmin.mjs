import { createClient } from '@supabase/supabase-js';

let admin = null;
/** @type {null | { ok: boolean, detail: string }} */
let adminProbe = null;

export function isSupabaseAdminConfigured() {
  const url = (process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return Boolean(url && key);
}

/**
 * Notes: Detect anon / publishable keys mistakenly set as SERVICE_ROLE.
 * Those pass createClient but fail auth.admin.* and see zero profiles under RLS.
 */
export function describeSupabaseServiceKey() {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!key) return { kind: 'missing', warning: 'SUPABASE_SERVICE_ROLE_KEY is empty' };

  if (/^sb_publishable_/i.test(key) || /^sb_anon_/i.test(key)) {
    return {
      kind: 'anon',
      warning:
        'SUPABASE_SERVICE_ROLE_KEY looks like an anon/publishable key. Use the service_role / sb_secret key from Supabase → Settings → API.',
    };
  }
  if (/^sb_secret_/i.test(key)) {
    return { kind: 'secret', warning: null };
  }

  // Legacy JWT keys — decode payload role without verifying signature
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const role = String(payload.role || '');
      if (role === 'anon' || role === 'authenticated') {
        return {
          kind: 'anon-jwt',
          warning: `SUPABASE_SERVICE_ROLE_KEY JWT role is "${role}" — need role "service_role" (secret key), not the anon key.`,
        };
      }
      if (role === 'service_role') {
        return { kind: 'service_role', warning: null };
      }
    }
  } catch {
    /* ignore */
  }

  return { kind: 'unknown', warning: null };
}

export function getSupabaseAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  const desc = describeSupabaseServiceKey();
  if (desc.warning) {
    throw Object.assign(new Error(desc.warning), { status: 503, code: 'BAD_SERVICE_ROLE_KEY' });
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

/**
 * Notes: One-shot probe so Render logs show bad keys at boot / first WhatsApp message.
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function probeSupabaseAdmin() {
  if (adminProbe) return adminProbe;
  if (!isSupabaseAdminConfigured()) {
    adminProbe = { ok: false, detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' };
    return adminProbe;
  }
  const desc = describeSupabaseServiceKey();
  if (desc.warning) {
    adminProbe = { ok: false, detail: desc.warning };
    return adminProbe;
  }
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      adminProbe = {
        ok: false,
        detail: `auth.admin.listUsers failed: ${error.message}. Fix SUPABASE_SERVICE_ROLE_KEY (must be service_role secret, not anon).`,
      };
      return adminProbe;
    }
    const { count, error: pErr } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (pErr) {
      adminProbe = { ok: false, detail: `profiles probe failed: ${pErr.message}` };
      return adminProbe;
    }
    adminProbe = { ok: true, detail: `ok (profiles visible, count≈${count ?? '?'})` };
  } catch (err) {
    adminProbe = { ok: false, detail: String(err?.message || err) };
  }
  return adminProbe;
}
