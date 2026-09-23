import { Injectable, inject, signal, computed } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';
import type { SmartcropProfile } from '../models/smartcrop.model';

/** Live site always lands on www — OAuth PKCE breaks if apex ≠ www. */
export function smartcropAuthOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  const host = hostname === 'lya-solution.com' ? 'www.lya-solution.com' : hostname;
  const portPart = port && port !== '80' && port !== '443' ? `:${port}` : '';
  return `${protocol}//${host}${portPart}`;
}

@Injectable({ providedIn: 'root' })
export class SmartcropAuthService {
  private readonly supabase = inject(SupabaseClientService);

  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly profile = signal<SmartcropProfile | null>(null);
  readonly loading = signal(true);
  readonly authError = signal<string | null>(null);
  readonly needsPhone = computed(() => {
    const p = this.profile();
    return Boolean(this.user()) && Boolean(p) && !p?.phone;
  });

  /** New Google/OTP user without a studio name — show register step. */
  readonly needsStudioRegister = computed(() => {
    const p = this.profile();
    return Boolean(this.user()) && Boolean(p) && !String(p?.full_name ?? '').trim();
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

    await this.exchangeOAuthCodeIfPresent();

    const { data } = await client.auth.getSession();
    this.session.set(data.session);
    this.user.set(data.session?.user ?? null);
    this.markReady();
    if (data.session?.user) {
      void this.ensureProfile(data.session.user);
    }
  }

  /**
   * Explicit PKCE exchange. Safe if detectSessionInUrl already consumed the code
   * (second call just logs and continues).
   */
  async exchangeOAuthCodeIfPresent(): Promise<{ error: string | null }> {
    if (typeof window === 'undefined' || !this.supabase.isConfigured()) {
      return { error: null };
    }
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError =
      params.get('error_description') ||
      params.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');
    if (oauthError) {
      this.authError.set(oauthError);
      return { error: oauthError };
    }

    const code = params.get('code');
    if (!code) return { error: null };

    const client = this.supabase.requireClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      // Already exchanged by detectSessionInUrl — treat as soft failure if session exists
      const existing = await client.auth.getSession();
      if (existing.data.session) {
        this.stripOAuthParamsFromUrl();
        return { error: null };
      }
      this.authError.set(error.message);
      return { error: error.message };
    }
    this.session.set(data.session);
    this.user.set(data.session?.user ?? null);
    this.stripOAuthParamsFromUrl();
    return { error: null };
  }

  private stripOAuthParamsFromUrl(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code') && !url.searchParams.has('state')) return;
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
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

  async ensureProfile(user: User): Promise<SmartcropProfile | null> {
    const existing = await this.loadProfile(user.id);
    if (existing) {
      await this.applyPendingStudioRegistration();
      return this.profile();
    }

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
    await this.applyPendingStudioRegistration();
    return this.loadProfile(user.id);
  }

  /** Studio name/phone saved before Google OAuth from the register form. */
  stashPendingStudioRegistration(studioName: string, phone: string): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem('sc_studio_name', studioName.trim());
    sessionStorage.setItem('sc_studio_phone', phone.trim());
  }

  private async applyPendingStudioRegistration(): Promise<void> {
    if (typeof sessionStorage === 'undefined') return;
    const name = sessionStorage.getItem('sc_studio_name');
    const phone = sessionStorage.getItem('sc_studio_phone');
    if (!name && !phone) return;
    sessionStorage.removeItem('sc_studio_name');
    sessionStorage.removeItem('sc_studio_phone');
    await this.completeStudioRegistration({
      studioName: name || this.profile()?.full_name || 'Studio',
      phone: phone || undefined,
    });
  }

  async signInWithGoogle(redirectTo: string): Promise<{ error: Error | null }> {
    if (!this.supabase.isConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }
    this.authError.set(null);
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

  async completeStudioRegistration(input: {
    studioName: string;
    phone?: string;
  }): Promise<{ error: Error | null }> {
    const user = this.user();
    if (!user) {
      return { error: new Error('Not signed in') };
    }
    await this.ensureProfile(user);
    const patch: { full_name: string; phone?: string } = {
      full_name: input.studioName.trim(),
    };
    const phone = input.phone?.trim();
    if (phone) patch.phone = phone;

    const client = this.supabase.requireClient();
    const { error } = await client.from('profiles').update(patch).eq('id', user.id);
    if (error) {
      return { error: new Error(error.message) };
    }
    if (phone) await this.linkPhotosByPhone(phone);
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
