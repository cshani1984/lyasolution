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
}
