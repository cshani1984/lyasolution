## Lead Automation Setup

### Windows / `supabase` is not recognized

The CLI is installed **in this repo** (dev dependency). From the project folder use either:

- `npx supabase <command>` — e.g. `npx supabase login`
- `npm run sb -- <command>` — e.g. `npm run sb -- login`

You do **not** need a global `supabase` install in PATH.

This adds:
- WhatsApp notification to you when a new lead is inserted (Twilio).
- Optional confirmation email to the client (Resend). **Off by default** — set secret `SEND_CLIENT_EMAIL=true` to enable (and configure Resend secrets below).

### 1) Deploy the Edge Function

Run:

`npx supabase functions deploy notify-new-lead --no-verify-jwt`

(or `npm run sb -- functions deploy notify-new-lead --no-verify-jwt`)

### 2) Set Edge Function secrets

Run (same pattern: prefix with `npx supabase` or `npm run sb --`):

`npx supabase secrets set TWILIO_ACCOUNT_SID=...`

`npx supabase secrets set TWILIO_AUTH_TOKEN=...`

`npx supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`

`npx supabase secrets set OWNER_WHATSAPP_TO=whatsapp:+9725XXXXXXXX`

**Email (only if you enable it):**

`npx supabase secrets set SEND_CLIENT_EMAIL=true`

`npx supabase secrets set RESEND_API_KEY=...`

`npx supabase secrets set RESEND_FROM_EMAIL=leads@yourdomain.com`

### 3) Configure DB settings for trigger -> function call

Run in Supabase SQL Editor:

`alter database postgres set app.settings.supabase_url = 'https://<project-ref>.supabase.co';`

`alter database postgres set app.settings.service_role_key = '<SERVICE_ROLE_KEY>';`

### 4) Create trigger

Run in Supabase SQL Editor:

- `supabase/contact_submissions.sql` (if not already applied)
- `supabase/lead_automation.sql`

### Notes

- Without `SEND_CLIENT_EMAIL=true`, Resend secrets are not required; only WhatsApp runs.
- If you enable email: verify your `RESEND_FROM_EMAIL` domain in Resend.
- Twilio WhatsApp sandbox or approved sender is required for production delivery.
