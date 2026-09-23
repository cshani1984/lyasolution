import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SmartcropAuthService } from './smartcrop-auth.service';
import type {
  CropData,
  PhotoStatus,
  PrintSize,
  SmartcropOrder,
  SmartcropPhoto,
} from '../models/smartcrop.model';

@Injectable({ providedIn: 'root' })
export class SmartcropPhotosService {
  private readonly supabase = inject(SupabaseClientService);
  private readonly auth = inject(SmartcropAuthService);

  readonly photos = signal<SmartcropPhoto[]>([]);
  readonly sizes = signal<PrintSize[]>([]);
  readonly orders = signal<SmartcropOrder[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async loadSizes(): Promise<void> {
    if (!this.supabase.isConfigured()) return;
    const client = this.supabase.requireClient();
    const { data, error } = await client.from('print_sizes').select('*').order('name');
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.sizes.set((data as PrintSize[]) ?? []);
  }

  async loadPhotos(): Promise<void> {
    if (!this.supabase.isConfigured()) return;
    const user = this.auth.user();
    if (!user) {
      this.photos.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const client = this.supabase.requireClient();
    const phone = this.auth.profile()?.phone;
    let query = client.from('photos').select('*').order('created_at', { ascending: false });
    if (phone) {
      query = query.or(`user_id.eq.${user.id},sender_phone.eq.${phone}`);
    } else {
      query = query.eq('user_id', user.id);
    }
    const { data, error } = await query;
    this.loading.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.photos.set((data as SmartcropPhoto[]) ?? []);
  }

  async loadOrders(): Promise<void> {
    if (!this.supabase.isConfigured()) return;
    const user = this.auth.user();
    if (!user) {
      this.orders.set([]);
      return;
    }
    const client = this.supabase.requireClient();
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.orders.set((data as SmartcropOrder[]) ?? []);
  }

  async refreshAll(): Promise<void> {
    await Promise.all([this.loadSizes(), this.loadPhotos(), this.loadOrders()]);
  }

  async updatePhoto(
    id: string,
    patch: Partial<{
      status: PhotoStatus;
      size_id: string | null;
      target_size_name: string;
      crop_data: CropData | null;
      cropped_url: string | null;
    }>,
  ): Promise<{ error: Error | null }> {
    const client = this.supabase.requireClient();
    const { error } = await client.from('photos').update(patch).eq('id', id);
    if (error) return { error: new Error(error.message) };
    await this.loadPhotos();
    return { error: null };
  }

  async deletePhoto(id: string): Promise<{ error: Error | null }> {
    const client = this.supabase.requireClient();
    const { error } = await client.from('photos').delete().eq('id', id);
    if (error) return { error: new Error(error.message) };
    await this.loadPhotos();
    return { error: null };
  }

  async deletePhotos(ids: string[]): Promise<{ error: Error | null }> {
    if (!ids.length) return { error: null };
    const client = this.supabase.requireClient();
    const { error } = await client.from('photos').delete().in('id', ids);
    if (error) return { error: new Error(error.message) };
    await this.loadPhotos();
    return { error: null };
  }

  async approvePhotos(ids: string[]): Promise<{ error: Error | null }> {
    if (!ids.length) return { error: null };
    const client = this.supabase.requireClient();
    const { error } = await client.from('photos').update({ status: 'approved' }).in('id', ids);
    if (error) return { error: new Error(error.message) };
    await this.loadPhotos();
    return { error: null };
  }

  /**
   * Client-side WhatsApp simulation (when Express API is not configured).
   * Tries Supabase storage + photos insert; falls back to in-session preview URLs.
   */
  async simulateFromFile(
    file: File,
    phone: string,
  ): Promise<{ error: Error | null; photoId?: string }> {
    const user = this.auth.user();
    if (!user) return { error: new Error('Not signed in') };
    if (!phone) return { error: new Error('Phone required') };

    const size = this.sizes().find((s) => s.is_default) ?? this.sizes()[0] ?? null;
    const aspect = size ? Number(size.aspect_ratio) || 2 / 3 : 2 / 3;
    const id = crypto.randomUUID();

    let originalUrl: string;
    let croppedUrl: string;
    let cropData: CropData;

    try {
      const cropped = await centerCropJpeg(file, aspect);
      cropData = cropped.cropData;
      originalUrl = URL.createObjectURL(file);
      croppedUrl = URL.createObjectURL(cropped.blob);

      if (this.supabase.isConfigured()) {
        const persisted = await this.persistSimulation({
          id,
          userId: user.id,
          phone,
          size,
          originalFile: file,
          croppedBlob: cropped.blob,
          cropData,
        });
        if (persisted.ok) {
          URL.revokeObjectURL(originalUrl);
          URL.revokeObjectURL(croppedUrl);
          await this.refreshAll();
          return { error: null, photoId: id };
        }
        console.warn('[SmartcropPhotos] persist simulation failed:', persisted.error);
      }
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }

    const photo: SmartcropPhoto = {
      id,
      order_id: null,
      user_id: user.id,
      sender_phone: phone,
      original_url: originalUrl,
      cropped_url: croppedUrl,
      size_id: size?.id ?? null,
      target_size_name: size?.name ?? '10x15',
      crop_data: cropData,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    this.photos.update((list) => [photo, ...list]);
    return { error: null, photoId: id };
  }

  private async persistSimulation(input: {
    id: string;
    userId: string;
    phone: string;
    size: PrintSize | null;
    originalFile: File;
    croppedBlob: Blob;
    cropData: CropData;
  }): Promise<{ ok: boolean; error?: string }> {
    const client = this.supabase.requireClient();
    const folder = input.phone.replace(/\+/g, '');
    const originalPath = `${folder}/${input.id}-original.jpg`;
    const croppedPath = `${folder}/${input.id}-cropped.jpg`;

    const upOrig = await client.storage
      .from('photo-prints')
      .upload(originalPath, input.originalFile, { contentType: input.originalFile.type || 'image/jpeg', upsert: false });
    if (upOrig.error) return { ok: false, error: upOrig.error.message };

    const upCrop = await client.storage
      .from('photo-prints')
      .upload(croppedPath, input.croppedBlob, { contentType: 'image/jpeg', upsert: false });
    if (upCrop.error) return { ok: false, error: upCrop.error.message };

    const { data: origPub } = client.storage.from('photo-prints').getPublicUrl(originalPath);
    const { data: cropPub } = client.storage.from('photo-prints').getPublicUrl(croppedPath);

    let orderId: string | null = null;
    const { data: openOrder } = await client
      .from('orders')
      .select('id, total_photos')
      .eq('user_id', input.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openOrder) {
      orderId = openOrder.id as string;
      await client
        .from('orders')
        .update({ total_photos: (openOrder.total_photos as number) + 1 })
        .eq('id', orderId);
    } else {
      const { data: created, error: orderErr } = await client
        .from('orders')
        .insert({ user_id: input.userId, status: 'pending', total_photos: 1 })
        .select('id')
        .single();
      if (orderErr) return { ok: false, error: orderErr.message };
      orderId = created.id as string;
    }

    const { error: photoErr } = await client.from('photos').insert({
      id: input.id,
      order_id: orderId,
      user_id: input.userId,
      sender_phone: input.phone,
      original_url: origPub.publicUrl,
      cropped_url: cropPub.publicUrl,
      size_id: input.size?.id ?? null,
      target_size_name: input.size?.name ?? '10x15',
      crop_data: input.cropData,
      status: 'pending',
    });
    if (photoErr) return { ok: false, error: photoErr.message };
    return { ok: true };
  }
}

async function centerCropJpeg(
  file: File,
  aspectRatio: number,
): Promise<{ blob: Blob; cropData: CropData }> {
  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  let cropW = srcW;
  let cropH = cropW / aspectRatio;
  if (cropH > srcH) {
    cropH = srcH;
    cropW = cropH * aspectRatio;
  }
  const x = (srcW - cropW) / 2;
  // Bias slightly upward (headroom) like the server crop engine
  const y = Math.max(0, (srcH - cropH) / 2 - cropH * 0.08);

  const canvas = document.createElement('canvas');
  const outW = Math.round(Math.min(1800, cropW));
  const outH = Math.round(outW / aspectRatio);
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas not available');
  }
  ctx.drawImage(bitmap, x, y, cropW, cropH, 0, 0, outW, outH);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', 0.92);
  });

  return {
    blob,
    cropData: {
      x,
      y,
      width: cropW,
      height: cropH,
      zoom: 1,
      rotation: 0,
      focalPoint: { x: x + cropW / 2, y: y + cropH * 0.38 },
      isManuallyEdited: false,
    },
  };
}
