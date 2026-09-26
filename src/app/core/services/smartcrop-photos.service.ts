import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';
import { SmartcropAuthService } from './smartcrop-auth.service';
import type {
  CropData,
  PhotoStatus,
  PrintSize,
  SmartcropOrder,
  SmartcropPhoto,
} from '../models/smartcrop.model';
import { smartCropJpeg, smartCropFromUrl } from '../smartcrop/crop-engine.client';
import { photoStatusFromAutoCrop } from '../smartcrop/crop-engine.math';
import { DEMO_PRINT_SIZES, findPrintSize, getCalculatedAspectRatio } from '../smartcrop/print-sizes';

@Injectable({ providedIn: 'root' })
export class SmartcropPhotosService {
  private readonly supabase = inject(SupabaseClientService);
  private readonly auth = inject(SmartcropAuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly photos = signal<SmartcropPhoto[]>([]);
  readonly sizes = signal<PrintSize[]>([]);
  readonly orders = signal<SmartcropOrder[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private photosChannel: RealtimeChannel | null = null;
  private realtimeUserId: string | null = null;
  private realtimeCleanupBound = false;

  async loadSizes(): Promise<void> {
    if (!this.supabase.isConfigured()) {
      this.seedFallbackSizes();
      return;
    }
    const client = this.supabase.requireClient();
    const { data, error } = await client.from('print_sizes').select('*').order('name');
    if (error || !data?.length) {
      this.seedFallbackSizes();
      if (error) this.error.set(error.message);
      return;
    }
    this.sizes.set(
      (data as PrintSize[]).map((row) => {
        const demo = findPrintSize(DEMO_PRINT_SIZES, row.code || row.name);
        const width = Number(row.width_cm);
        const height = Number(row.height_cm);
        return {
          ...row,
          width_cm: width,
          height_cm: height,
          aspect_ratio: width && height ? width / height : Number(row.aspect_ratio) || 2 / 3,
          category: row.category || demo?.category,
          description: row.description || demo?.description,
          code: row.code || demo?.code,
        };
      }),
    );
  }

  /** Notes: Local print sizes when Supabase seeds are missing. */
  private seedFallbackSizes(): void {
    if (this.sizes().length) return;
    this.sizes.set(DEMO_PRINT_SIZES.map((s) => ({ ...s })));
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
    const remote = (data as SmartcropPhoto[]) ?? [];
    const remoteIds = new Set(remote.map((r) => r.id));
    // Keep in-session uploads (blob/data URLs) so size changes / refreshes don't wipe them.
    const localOnly = this.photos().filter(
      (p) =>
        !remoteIds.has(p.id) &&
        (p.original_url?.startsWith('blob:') ||
          p.original_url?.startsWith('data:') ||
          p.cropped_url?.startsWith('blob:') ||
          p.id.startsWith('demo-')),
    );
    this.photos.set([...localOnly, ...remote]);
    this.ensurePhotosRealtime(user.id);
  }

  /**
   * Notes: Live-update the studio when WhatsApp webhook inserts photos for this shop.
   * Requires Supabase Realtime enabled on public.photos (default for new tables).
   */
  ensurePhotosRealtime(userId: string): void {
    if (!this.supabase.isConfigured() || !userId) return;
    if (this.photosChannel && this.realtimeUserId === userId) return;
    this.teardownPhotosRealtime();
    const client = this.supabase.requireClient();
    this.realtimeUserId = userId;
    this.photosChannel = client
      .channel(`smartcrop-photos-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos', filter: `user_id=eq.${userId}` },
        () => {
          void this.loadPhotosQuiet();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[SmartcropPhotos] realtime', status);
        }
      });
    if (!this.realtimeCleanupBound) {
      this.realtimeCleanupBound = true;
      this.destroyRef.onDestroy(() => this.teardownPhotosRealtime());
    }
  }

  /** Reload without flipping the global loading spinner (realtime / background). */
  async loadPhotosQuiet(): Promise<void> {
    if (!this.supabase.isConfigured()) return;
    const user = this.auth.user();
    if (!user) return;
    const client = this.supabase.requireClient();
    const phone = this.auth.profile()?.phone;
    let query = client.from('photos').select('*').order('created_at', { ascending: false });
    if (phone) {
      query = query.or(`user_id.eq.${user.id},sender_phone.eq.${phone}`);
    } else {
      query = query.eq('user_id', user.id);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[SmartcropPhotos] quiet reload', error.message);
      return;
    }
    const remote = (data as SmartcropPhoto[]) ?? [];
    const remoteIds = new Set(remote.map((r) => r.id));
    const localOnly = this.photos().filter(
      (p) =>
        !remoteIds.has(p.id) &&
        (p.original_url?.startsWith('blob:') ||
          p.original_url?.startsWith('data:') ||
          p.cropped_url?.startsWith('blob:') ||
          p.id.startsWith('demo-')),
    );
    this.photos.set([...localOnly, ...remote]);
  }

  teardownPhotosRealtime(): void {
    if (this.photosChannel) {
      void this.supabase.getClient()?.removeChannel(this.photosChannel);
      this.photosChannel = null;
    }
    this.realtimeUserId = null;
  }

  /** Notes: Patch one photo in memory without a full list reload. */
  patchPhoto(id: string, patch: Partial<SmartcropPhoto>): void {
    this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  /** Notes: True when the photo only exists in this browser session. */
  isLocalOnly(photo: SmartcropPhoto): boolean {
    const url = photo.original_url || '';
    return (
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      photo.id.startsWith('demo-') ||
      photo.id.startsWith('local-')
    );
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
    // Always update local state first so UI never blanks while waiting on network.
    this.patchPhoto(id, patch as Partial<SmartcropPhoto>);
    const existing = this.photos().find((p) => p.id === id);
    if (!existing || this.isLocalOnly(existing) || !this.supabase.isConfigured()) {
      return { error: null };
    }
    const client = this.supabase.requireClient();
    // Never persist ephemeral blob:/data: URLs to Supabase.
    const dbPatch = { ...patch };
    if (
      dbPatch.cropped_url?.startsWith('blob:') ||
      dbPatch.cropped_url?.startsWith('data:')
    ) {
      delete dbPatch.cropped_url;
    }
    const { error } = await client.from('photos').update(dbPatch).eq('id', id);
    if (error) return { error: new Error(error.message) };
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
   * Client-side WhatsApp simulation — always runs MediaPipe / saliency AI crop.
   * Tries Supabase persist; falls back to in-session blob URLs.
   */
  async simulateFromFile(
    file: File,
    phone: string,
    sizeName?: string,
  ): Promise<{ error: Error | null; photoId?: string }> {
    const user = this.auth.user();
    if (!user) return { error: new Error('Not signed in') };

    const senderPhone =
      phone?.trim() ||
      this.auth.profile()?.phone?.trim() ||
      `+9725${user.id.replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`;

    if (!this.sizes().length) this.seedFallbackSizes();
    const size =
      (sizeName ? findPrintSize(this.sizes(), sizeName) : null) ??
      this.sizes().find((s) => s.is_default) ??
      this.sizes()[0] ??
      null;
    const aspect = size ? getCalculatedAspectRatio(size, false) : 2 / 3;
    const id = crypto.randomUUID();

    let originalUrl: string;
    let croppedUrl: string;
    let cropData: CropData;

    try {
      const cropped = await smartCropJpeg(file, aspect);
      cropData = cropped.cropData;
      originalUrl = URL.createObjectURL(file);
      croppedUrl = URL.createObjectURL(cropped.blob);

      if (this.supabase.isConfigured()) {
        const persisted = await this.persistSimulation({
          id,
          userId: user.id,
          phone: senderPhone,
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
      sender_phone: senderPhone,
      customer_name: this.auth.profile()?.full_name ?? null,
      caption_text: `שלום, אשמח להדפיס תמונה זו בגודל ${size?.name ?? '10x15'}`,
      parsed_summary: `${size?.name ?? '10x15'} | 1X`,
      parse_confidence: 88,
      original_url: originalUrl,
      cropped_url: croppedUrl,
      size_id: size?.id ?? null,
      target_size_name: size?.name ?? '10x15',
      crop_data: cropData,
      status: photoStatusFromAutoCrop(cropData.metrics),
      created_at: new Date().toISOString(),
    };
    this.photos.update((list) => [photo, ...list]);
    return { error: null, photoId: id };
  }

  /**
   * Notes: Re-run AI crop for an existing photo at a new print size (client-side).
   */
  async recropPhotoWithAi(
    photo: SmartcropPhoto,
    size: PrintSize,
  ): Promise<{ error: Error | null }> {
    try {
      const result = await smartCropFromUrl(
        photo.original_url,
        getCalculatedAspectRatio(size, false),
      );
      const croppedUrl = URL.createObjectURL(result.blob);
      const status = photoStatusFromAutoCrop(result.cropData.metrics);
      // In-place update only — never replace the whole photos list.
      await this.updatePhoto(photo.id, {
        size_id: size.id,
        target_size_name: size.name,
        crop_data: result.cropData,
        cropped_url: croppedUrl,
        status,
      });
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
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
      status: photoStatusFromAutoCrop(input.cropData.metrics),
    });
    if (photoErr) return { ok: false, error: photoErr.message };
    return { ok: true };
  }
}

