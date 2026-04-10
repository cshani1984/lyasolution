/**
 * Verifies anon insert into public.contact_submissions (same as the Angular form).
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_ANON_KEY="eyJ..."
 *   node scripts/test-supabase-contact-insert.mjs
 */
const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (anon public key).');
  process.exit(1);
}

const row = {
  first_name: 'Test',
  last_name: 'Insert',
  phone: '0501234567',
  email: `test+${Date.now()}@example.com`,
  message: 'Smoke test from scripts/test-supabase-contact-insert.mjs — delete this row if you like.',
};

const res = await fetch(`${url}/rest/v1/contact_submissions`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(row),
});

const text = await res.text();
if (!res.ok) {
  console.error('Insert failed:', res.status, text);
  process.exit(1);
}

console.log('OK — row inserted. Check Table Editor → contact_submissions.');
console.log(text.slice(0, 500));
