import { Injectable, inject, signal, computed } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';
import type { SmartcropProfile } from '../models/smartcrop.model';

@Injectable({ providedIn: 'root' })
export class SmartcropAuthService {
  private readonly supabase = inject(SupabaseClientService);

  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly profile = signal<SmartcropProfile | null>(null);
  readonly loading = signal(true);
  readonly needsPhone = computed(() => {
    const p = this.profile();
    return Boolean(this.user()) && Boolean(p) && !p?.phone;
  });

  private readyResolve: (() => void) | null = null;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });

  constructor() {
    void this.init();
  }

  /** Resolves after session (incl. OAuth ?code= exchange) is applied. */
  async waitUntilReady(timeoutMs = 12_000): Promise<void> {
    if (!this.loading()) return;
    await Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private markReady(): void {
    if (this.loading()) {
      this.loading.set(false);
      this.readyResolve?.();
      this.readyResolve = null;
    }
  }

  private async init(): Promise<void> {
    if (!this.supabase.isConfigured()) {
      this.markReady();
      return;
    }
    const client = this.supabase.requireClient();

    client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
      if (session?.user) {
        void this.ensureProfile(session.user);
      } else {
        this.profile.set(null);
      }
    });

    // getSession() waits for client init (PKCE code exchange from URL when present)
    const { data } = await client.auth.getSession();
    this.session.set(data.session);
    this.user.set(data.session?.user ?? null);
    if (data.session?.user) {
      await this.ensureProfile(data.session.user);
    }
    this.markReady();
  }

  async loadProfile(userId: string): Promise<SmartcropProfile | null> {
    const client = this.supabase.requireClient();
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      console.warn('[SmartcropAuth] loadProfile', error.message);
      return null;
    }
    const profile = (data as SmartcropProfile | null) ?? null;
    this.profile.set(profile);
    return profile;
  }

  /** Create profile row if the signup trigger did not run. */
  async ensureProfile(user: User): Promise<SmartcropProfile | null> {
    const existing = await this.loadProfile(user.id);
    if (existing) return existing;

    const meta = user.user_metadata ?? {};
    const row = {
      id: user.id,
      email: user.email ?? null,
      full_name: (meta['full_name'] as string) || (meta['name'] as string) || null,
      avatar_url: (meta['avatar_url'] as string) || (meta['picture'] as string) || null,
    };

    const client = this.supabase.requireClient();
    const { error } = await client.from('profiles').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[SmartcropAuth] ensureProfile', error.message);
      return null;
    }
    return this.loadProfile(user.id);
  }

  async signInWithGoogle(redirectTo: string): Promise<{ error: Error | null }> {
    if (!this.supabase.isConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }
    const client = this.supabase.requireClient();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
    return { error: error ? new Error(error.message) : null };
  }

  async signInWithPhone(phone: string): Promise<{ error: Error | null }> {
    if (!this.supabase.isConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }
    const client = this.supabase.requireClient();
    const { error } = await client.auth.signInWithOtp({ phone });
    return { error: error ? new Error(error.message) : null };
  }

  async verifyPhoneOtp(phone: string, token: string): Promise<{ error: Error | null }> {
    if (!this.supabase.isConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }
    const client = this.supabase.requireClient();
    const { error } = await client.auth.verifyOtp({ phone, token, type: 'sms' });
    return { error: error ? new Error(error.message) : null };
  }

  async updatePhone(phone: string): Promise<{ error: Error | null }> {
    const user = this.user();
    if (!user) {
      return { error: new Error('Not signed in') };
    }
    await this.ensureProfile(user);
    const client = this.supabase.requireClient();
    const { error } = await client.from('profiles').update({ phone }).eq('id', user.id);
    if (error) {
      return { error: new Error(error.message) };
    }
    await this.linkPhotosByPhone(phone);
    await this.loadProfile(user.id);
    return { error: null };
  }

  async linkPhotosByPhone(phone: string): Promise<void> {
    const user = this.user();
    if (!user) return;
    const client = this.supabase.requireClient();
    await client
      .from('photos')
      .update({ user_id: user.id })
      .eq('sender_phone', phone)
      .is('user_id', null);
  }

  async signOut(): Promise<void> {
    if (!this.supabase.isConfigured()) return;
    await this.supabase.requireClient().auth.signOut();
    this.profile.set(null);
  }

  isSignedIn(): boolean {
    return Boolean(this.user());
  }
}
