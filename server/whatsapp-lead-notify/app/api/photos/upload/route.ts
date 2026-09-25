/**
 * Next.js App Router — manual browser photo upload (portable reference).
 *
 * Live endpoint in this repo (Express + multer):
 *   POST https://YOUR_API_HOST/api/photos/upload
 *   multipart/form-data: files[], sizeName, sender_phone, user_id
 *   header: x-api-key
 *
 * Runtime crop engine: `lib/cropEngine.mjs` (Sharp cascade).
 * Browser MediaPipe twin: Angular `crop-engine.client.ts`.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notes: Accepts multipart image files + print size, runs Smart AI crop,
 * returns processed URLs + CropMetrics (confidence, cropLoss, correctionDelta).
 *
 * In a real Next.js app, call the same helpers used by Express
 * `registerSmartcropRoutes` → ingestSmartcropPhoto / processSmartCrop.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) {
    const header = req.headers.get('x-api-key') ?? '';
    if (header !== apiKey) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const form = await req.formData();
  const sizeName = String(form.get('sizeName') ?? form.get('size_name') ?? '10x15');
  const senderPhone = String(form.get('sender_phone') ?? '');
  const userId = form.get('user_id') ? String(form.get('user_id')) : null;

  const files = form.getAll('files').filter((f): f is File => typeof File !== 'undefined' && f instanceof File);
  if (!files.length) {
    return NextResponse.json({ ok: false, error: 'No image files provided (field: files)' }, { status: 400 });
  }

  // Portable reference — wire to your Supabase + cropEngine in a Next host.
  // This repo serves the live implementation via Express `/api/photos/upload`.
  return NextResponse.json({
    ok: false,
    error:
      'Use Express POST /api/photos/upload in this monorepo, or wire processSmartCrop + Supabase here.',
    hint: { sizeName, senderPhone, userId, fileCount: files.length },
  }, { status: 501 });
}
