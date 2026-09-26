import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { CropData } from '../models/smartcrop.model';

@Injectable({ providedIn: 'root' })
export class SmartcropApiService {
  private baseUrl(): string {
    const url = environment.smartcropApiUrl?.trim() || environment.whatsappNotifyApiUrl?.trim() || '';
    return url.replace(/\/$/, '');
  }

  private apiKey(): string {
    return (
      environment.smartcropApiKey?.trim() ||
      environment.whatsappNotifyApiKey?.trim() ||
      environment.cvAiApiKey?.trim() ||
      ''
    );
  }

  /**
   * Notes: Only treat API as available when a base URL is set AND an API key exists
   * (avoids failing uploads when localhost URL is present but the server is down).
   */
  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.apiKey());
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.apiKey();
    if (key) h['x-api-key'] = key;
    return h;
  }

  async simulateWhatsApp(payload: {
    sender_phone: string;
    media_url?: string;
    media_base64?: string;
    caption_text?: string;
    user_id?: string;
  }): Promise<{ ok: boolean; photoId?: string; error?: string }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const res = await fetch(`${base}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; photoId?: string; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? res.statusText };
    }
    return { ok: true, photoId: data.photoId };
  }

  async processCrop(payload: {
    photoId: string;
    sizeId?: string;
    cropData?: CropData;
    resetToAi?: boolean;
  }): Promise<{ ok: boolean; croppedUrl?: string; cropData?: CropData; error?: string }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const res = await fetch(`${base}/api/crop/process`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      croppedUrl?: string;
      cropData?: CropData;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? res.statusText };
    }
    return { ok: true, croppedUrl: data.croppedUrl, cropData: data.cropData };
  }

  async batchUpdate(payload: {
    photoIds: string[];
    sizeId?: string;
    status?: 'pending' | 'approved' | 'printed';
  }): Promise<{ ok: boolean; updated?: number; error?: string }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const res = await fetch(`${base}/api/photos/batch-update`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; updated?: number; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? res.statusText };
    }
    return { ok: true, updated: data.updated };
  }

  /**
   * Notes: Multipart browser upload → server AI crop → persisted photo rows.
   */
  async uploadPhotos(payload: {
    files: File[];
    sizeName: string;
    senderPhone: string;
    userId?: string;
    customerName?: string;
    captionText?: string;
  }): Promise<{
    ok: boolean;
    photos?: Array<{
      photoId: string;
      originalUrl: string;
      croppedUrl: string;
      blindUrl?: string | null;
      sizeName: string;
      cropData?: CropData;
      metrics?: CropData['metrics'];
    }>;
    error?: string;
  }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const form = new FormData();
    for (const file of payload.files) form.append('files', file);
    form.append('sizeName', payload.sizeName || '10x15');
    form.append('sender_phone', payload.senderPhone);
    if (payload.userId) form.append('user_id', payload.userId);
    if (payload.customerName) form.append('customer_name', payload.customerName);
    if (payload.captionText) form.append('caption_text', payload.captionText);

    const headers: Record<string, string> = {};
    const key = this.apiKey();
    if (key) headers['x-api-key'] = key;

    const res = await fetch(`${base}/api/photos/upload`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      photos?: Array<{
        photoId: string;
        originalUrl: string;
        croppedUrl: string;
        blindUrl?: string | null;
        sizeName: string;
        cropData?: CropData;
        metrics?: CropData['metrics'];
      }>;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? res.statusText };
    }
    return { ok: true, photos: data.photos };
  }

  /**
   * Notes: Mark photos printed and return lab hotfolder paths.
   */
  async sendToPrint(photoIds: string[]): Promise<{
    ok: boolean;
    updated?: number;
    hotfolderPaths?: string[];
    error?: string;
  }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const res = await fetch(`${base}/api/photos/send-to-print`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ photoIds }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      updated?: number;
      hotfolderPaths?: string[];
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? res.statusText };
    }
    return { ok: true, updated: data.updated, hotfolderPaths: data.hotfolderPaths };
  }

  /**
   * Notes: Free MediaPipe/Sharp auto-crop; flags recommendGenerativeFill when loss > 20%.
   */
  async processPhoto(payload: {
    media_base64?: string;
    media_url?: string;
    aspectRatio?: number;
    photoId?: string;
  }): Promise<{
    ok: boolean;
    croppedBase64?: string;
    cropData?: CropData;
    metrics?: CropData['metrics'];
    confidenceScore?: number;
    cropLossPercentage?: number;
    recommendGenerativeFill?: boolean;
    error?: string;
  }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const res = await fetch(`${base}/api/photos/process`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || !data['ok']) {
      return { ok: false, error: String(data['error'] ?? res.statusText) };
    }
    return {
      ok: true,
      croppedBase64: data['croppedBase64'] as string | undefined,
      cropData: data['cropData'] as CropData | undefined,
      metrics: data['metrics'] as CropData['metrics'] | undefined,
      confidenceScore: data['confidenceScore'] as number | undefined,
      cropLossPercentage: data['cropLossPercentage'] as number | undefined,
      recommendGenerativeFill: Boolean(data['recommendGenerativeFill']),
    };
  }

  /**
   * Notes: Paid Clipdrop Generative Fill with quota enforcement.
   * On HTTP 403 QUOTA_EXCEEDED → returns quotaExceeded + supportUrl.
   */
  async generativeFill(payload: {
    photoId?: string;
    userId?: string;
    media_base64?: string;
    media_url?: string;
    aspectRatio?: number;
    demoMode?: boolean;
    simulateUsed?: number;
    simulateTier?: string;
  }): Promise<{
    ok: boolean;
    usedClipdrop?: boolean;
    croppedUrl?: string;
    generativeFillUrl?: string;
    croppedBase64?: string;
    generativeBase64?: string | null;
    cropData?: CropData;
    metrics?: CropData['metrics'];
    cropLossPercentage?: number;
    quota?: { tier: string; used: number; max: number };
    quotaExceeded?: boolean;
    supportUrl?: string;
    message?: string;
    error?: string;
  }> {
    const base = this.baseUrl();
    if (!base) return { ok: false, error: 'SmartCrop API URL not configured' };
    const res = await fetch(`${base}/api/photos/generative-fill`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.status === 403 && data['error'] === 'QUOTA_EXCEEDED') {
      return {
        ok: false,
        quotaExceeded: true,
        supportUrl: String(data['supportUrl'] ?? ''),
        message: String(data['message'] ?? ''),
        error: 'QUOTA_EXCEEDED',
      };
    }
    if (!res.ok || !data['ok']) {
      return { ok: false, error: String(data['error'] ?? res.statusText) };
    }
    return {
      ok: true,
      usedClipdrop: Boolean(data['usedClipdrop']),
      croppedUrl: data['croppedUrl'] as string | undefined,
      generativeFillUrl: data['generativeFillUrl'] as string | undefined,
      croppedBase64: data['croppedBase64'] as string | undefined,
      generativeBase64: (data['generativeBase64'] as string | null | undefined) ?? null,
      cropData: data['cropData'] as CropData | undefined,
      metrics: data['metrics'] as CropData['metrics'] | undefined,
      cropLossPercentage: data['cropLossPercentage'] as number | undefined,
      quota: data['quota'] as { tier: string; used: number; max: number } | undefined,
    };
  }
}
