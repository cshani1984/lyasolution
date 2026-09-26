export const environment = {
  production: false,
  /** Supabase → Project Settings → API → Project URL */
  supabaseUrl: 'https://pntibywmzseguynujsle.supabase.co',
  /** Project Settings → API → anon public key — required or the contact form will not send. */
  supabaseAnonKey: 'sb_publishable_i3B-cBoAdEcGwh50-k0X6w_Z4s3Tecp',
  whatsappNotifyApiUrl: '',
  whatsappNotifyApiKey: '',
  /** POST /api/cv/enhance on lead-notify server — e.g. http://localhost:3840/api/cv/enhance */
  cvAiApiUrl: 'http://localhost:3840/api/cv/enhance',
  /** Same as server API_KEY — sent as x-api-key (never put OpenAI key in the frontend) */
  cvAiApiKey: '',
  /** SmartCrop Express base URL */
  smartcropApiUrl: 'http://localhost:3840',
  smartcropApiKey: '',
};
