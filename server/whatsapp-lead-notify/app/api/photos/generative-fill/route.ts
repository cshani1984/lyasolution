/**
 * Next.js App Router — Generative Fill via Clipdrop Uncrop (portable reference).
 *
 * Live endpoint in this repo (Express):
 *   POST /api/photos/generative-fill
 *
 * Flow: quotaService → generativeService (Clipdrop) → Supabase Storage → increment usage.
 * On QUOTA_EXCEEDED → HTTP 403 + WhatsApp supportUrl.
 */
import { NextRequest, NextResponse } from 'next/server';
import { quotaExceededPayload } from '../../../../lib/quotaService';
import { DEFAULT_SUPPORT_WA } from '../../../../lib/subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) {
    const header = req.headers.get('x-api-key') ?? '';
    if (header !== apiKey) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Example shape when quota is exceeded (handled live in Express generativeRoutes.mjs):
  void quotaExceededPayload;
  void DEFAULT_SUPPORT_WA;

  return NextResponse.json(
    {
      ok: false,
      error:
        'Use Express POST /api/photos/generative-fill in this monorepo, or wire generativeService + quotaService here.',
    },
    { status: 501 },
  );
}
