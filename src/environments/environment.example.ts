export const environment = {
  production: false,
  /** Supabase → Project Settings → API → Project URL */
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  /** Project Settings → API → anon public key — required or the contact form will not send. */
  supabaseAnonKey: '',
  whatsappNotifyApiUrl: '',
  whatsappNotifyApiKey: '',
  /** POST /api/cv/enhance on lead-notify server — e.g. http://localhost:3840/api/cv/enhance */
  cvAiApiUrl: 'http://localhost:3840/api/cv/enhance',
  /** Same as server API_KEY — sent as x-api-key (never put OpenAI key in the frontend) */
  cvAiApiKey: '',
  /** SmartCrop Express base URL (no trailing path) — e.g. http://localhost:3840 */
  smartcropApiUrl: 'http://localhost:3840',
  /** Same as server API_KEY */
  smartcropApiKey: '',
};
