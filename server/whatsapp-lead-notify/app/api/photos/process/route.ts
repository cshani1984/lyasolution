/**
 * Next.js App Router — standard free MediaPipe/Sharp auto-crop (portable reference).
 *
 * Live endpoint in this repo (Express):
 *   POST /api/photos/process
 *
 * Returns recommendGenerativeFill when cropLossPercentage > 20%.
 */
import { NextRequest, NextResponse } from 'next/server';

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

  // Portable reference — wire to processSmartCrop + calculateExtendPadding in a Next host.
  // This monorepo serves the live implementation via Express `/api/photos/process`.
  const ct = req.headers.get('content-type') || '';
  void ct;

  return NextResponse.json(
    {
      ok: false,
      error:
        'Use Express POST /api/photos/process in this monorepo, or wire processSmartCrop here.',
      recommendGenerativeFill: false,
    },
    { status: 501 },
  );
}
