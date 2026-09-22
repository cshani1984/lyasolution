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

  isConfigured(): boolean {
    return Boolean(this.baseUrl());
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
}
