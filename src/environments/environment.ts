export const environment = {
  production: false,
  /** Supabase → Project Settings → API → Project URL */
  supabaseUrl: 'https://pntibywmzseguynujsle.supabase.co',
  /** Project Settings → API → anon public. Prefer env on Vercel; paste here for local dev only. */
  /** Copy from environment.example.ts locally; do not commit real keys if the repo is public. */
  supabaseAnonKey: '',
  /** Node server (whatsapp-web.js), e.g. http://localhost:3840 */
  whatsappNotifyApiUrl: '',
  /** Same value as API_KEY on the Node server */
  whatsappNotifyApiKey: '',
};
