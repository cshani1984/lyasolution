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
    const u = this.user();
    const p = this.profile();
    if (!u) return false;
    // Phone OTP login already verified the number on the auth user.
    if (u.phone?.trim()) return false;
    if (p?.phone?.trim()) return false;
    return Boolean(p);
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
    const authPhone = this.toE164(user.phone?.trim() || '') || null;
    const existing = await this.loadProfile(user.id);
    if (existing) {
      await this.applyPendingStudioRegistration();
      await this.syncPhoneFromAuthUser(user);
      return this.profile();
    }

    const meta = user.user_metadata ?? {};
    const row = {
      id: user.id,
      email: user.email ?? null,
      full_name: (meta['full_name'] as string) || (meta['name'] as string) || null,
      avatar_url: (meta['avatar_url'] as string) || (meta['picture'] as string) || null,
      phone: authPhone,
    };

    const client = this.supabase.requireClient();
    const { error } = await client.from('profiles').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[SmartcropAuth] ensureProfile', error.message);
      if (authPhone && (error.code === '23505' || /profiles_phone_key/i.test(error.message))) {
        const { error: retryErr } = await client.from('profiles').upsert(
          { ...row, phone: null },
          { onConflict: 'id' },
        );
        if (retryErr) console.warn('[SmartcropAuth] ensureProfile retry', retryErr.message);
        await this.reclaimPhoneIfOrphan(authPhone, user.id);
      } else {
        return null;
      }
    }
    await this.applyPendingStudioRegistration();
    await this.syncPhoneFromAuthUser(user);
    return this.loadProfile(user.id);
  }

  /**
   * Notes: After phone OTP, copy auth.user.phone onto profiles and link WhatsApp photos.
   * Idempotent — safe if the phone is already saved.
   */
  async syncPhoneFromAuthUser(user?: User | null): Promise<void> {
    const u = user ?? this.user();
    const phone = this.toE164(u?.phone?.trim() || '');
    if (!u || !phone) return;
    const profile = this.profile() ?? (await this.loadProfile(u.id));
    const existing = this.toE164(profile?.phone || '');
    if (existing === phone) {
      // Still rewrite canonical E.164 if DB has local 05… form
      if (profile?.phone && profile.phone !== phone) {
        await this.updatePhone(phone);
      } else {
        await this.linkPhotosByPhone(phone);
      }
      return;
    }
    if (existing && existing !== phone) {
      await this.linkPhotosByPhone(phone);
      return;
    }
    await this.updatePhone(phone);
  }

  /** Studio name/phone/code saved before Google OAuth / phone OTP from the register form. */
  stashPendingStudioRegistration(studioName: string, phone: string, storeCode?: string): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem('sc_studio_name', studioName.trim());
    sessionStorage.setItem('sc_studio_phone', phone.trim());
    if (storeCode?.trim()) sessionStorage.setItem('sc_studio_code', storeCode.trim());
  }

  private async applyPendingStudioRegistration(): Promise<void> {
    if (typeof sessionStorage === 'undefined') return;
    const name = sessionStorage.getItem('sc_studio_name');
    const phone = sessionStorage.getItem('sc_studio_phone');
    const storeCode = sessionStorage.getItem('sc_studio_code');
    if (!name && !phone) return;
    sessionStorage.removeItem('sc_studio_name');
    sessionStorage.removeItem('sc_studio_phone');
    sessionStorage.removeItem('sc_studio_code');
    await this.completeStudioRegistration({
      studioName: name || this.profile()?.full_name || 'Studio',
      phone: phone || undefined,
      storeCode: storeCode || undefined,
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
    const { data, error } = await client.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) return { error: new Error(error.message) };
    if (data.session) {
      this.session.set(data.session);
      this.user.set(data.session.user);
      await this.ensureProfile(data.session.user);
      // Force profiles.phone even if auth.user.phone lags behind the OTP input
      const e164 = this.toE164(phone);
      if (e164) await this.updatePhone(e164);
    }
    return { error: null };
  }

  async updatePhone(phone: string): Promise<{ error: Error | null }> {
    const user = this.user();
    if (!user) {
      return { error: new Error('Not signed in') };
    }
    const normalized = this.toE164(phone);
    if (!normalized) return { error: new Error('Invalid phone') };

    // Avoid recursive ensureProfile → updatePhone loops: load only.
    let profile = this.profile();
    if (!profile) profile = await this.loadProfile(user.id);

    if (profile?.phone === normalized) {
      await this.linkPhotosByPhone(normalized);
      return { error: null };
    }

    if (!profile) {
      const client = this.supabase.requireClient();
      const meta = user.user_metadata ?? {};
      await client.from('profiles').upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name: (meta['full_name'] as string) || (meta['name'] as string) || null,
          phone: normalized,
        },
        { onConflict: 'id' },
      );
      await this.linkPhotosByPhone(normalized);
      await this.loadProfile(user.id);
      return { error: null };
    }

    const client = this.supabase.requireClient();
    const { error } = await client.from('profiles').update({ phone: normalized }).eq('id', user.id);
    if (error) {
      // Already linked on this account (race) or unique conflict — reload and treat as OK if ours.
      if (error.code === '23505' || /profiles_phone_key/i.test(error.message)) {
        await this.loadProfile(user.id);
        if (this.profile()?.phone === normalized) {
          await this.linkPhotosByPhone(normalized);
          return { error: null };
        }
      }
      return { error: new Error(error.message) };
    }
    await this.linkPhotosByPhone(normalized);
    await this.loadProfile(user.id);
    return { error: null };
  }

  async completeStudioRegistration(input: {
    studioName: string;
    phone?: string;
    storeCode?: string;
  }): Promise<{ error: Error | null }> {
    const user = this.user();
    if (!user) {
      return { error: new Error('Not signed in') };
    }
    await this.ensureProfile(user);
    const phone = (input.phone?.trim() || user.phone?.trim() || '') || undefined;
    const storeName = input.studioName.trim();
    const storeCode = this.normalizeStoreCode(
      input.storeCode || this.suggestStoreCode(storeName, phone || user.id),
    );
    const patch: {
      full_name: string;
      store_name: string;
      store_code: string;
      phone?: string;
    } = {
      full_name: storeName,
      store_name: storeName,
      store_code: storeCode,
    };
    // Only set phone if profile does not already have it (avoids duplicate key).
    if (phone && this.profile()?.phone !== phone) {
      patch.phone = phone;
    }

    const client = this.supabase.requireClient();
    const { error } = await client.from('profiles').update(patch).eq('id', user.id);
    if (error) {
      if (error.code === '23505' || /store_code|profiles_phone_key/i.test(error.message)) {
        // Retry without unique-prone fields
        const fallback = {
          full_name: storeName,
          store_name: storeName,
          store_code: this.normalizeStoreCode(`${storeCode}${Math.floor(Math.random() * 90 + 10)}`),
        };
        await client.from('profiles').update(fallback).eq('id', user.id);
        await this.loadProfile(user.id);
        if (phone) await this.linkPhotosByPhone(phone);
        return { error: null };
      }
      return { error: new Error(error.message) };
    }
    if (phone) await this.linkPhotosByPhone(phone);
    await this.loadProfile(user.id);
    return { error: null };
  }

  /** Notes: Public store code — A–Z / 0–9, 3–16 chars. */
  normalizeStoreCode(raw: string): string {
    return String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16);
  }

  suggestStoreCode(studioName: string, seed: string): string {
    const base = String(studioName || '')
      .normalize('NFKD')
      .replace(/[\u0590-\u05FF]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8);
    const digits = String(seed || '').replace(/\D/g, '').slice(-3) || '101';
    return this.normalizeStoreCode((base || 'STORE') + digits) || `STORE${digits}`;
  }

  /** Notes: Backfill store_code for shops that registered before multi-store routing. */
  async ensureStoreCode(): Promise<string | null> {
    const profile = this.profile();
    const user = this.user();
    if (!user) return null;
    if (profile?.store_code) return profile.store_code;
    const code = this.suggestStoreCode(
      profile?.store_name || profile?.full_name || 'STORE',
      profile?.phone || user.id,
    );
    if (!code) return null;
    const client = this.supabase.requireClient();
    const patch = {
      store_code: code,
      store_name: profile?.store_name || profile?.full_name || code,
    };
    const { error } = await client.from('profiles').update(patch).eq('id', user.id);
    if (error && (error.code === '23505' || /store_code/i.test(error.message))) {
      const retry = this.normalizeStoreCode(`${code}${Math.floor(Math.random() * 90 + 10)}`);
      await client
        .from('profiles')
        .update({ store_code: retry, store_name: patch.store_name })
        .eq('id', user.id);
    } else if (error) {
      console.warn('[smartcrop] ensureStoreCode', error.message);
      return null;
    }
    await this.loadProfile(user.id);
    return this.profile()?.store_code ?? code;
  }

  async linkPhotosByPhone(phone: string): Promise<void> {
    const user = this.user();
    if (!user) return;
    const client = this.supabase.requireClient();
    const e164 = this.toE164(phone) || phone;
    await client
      .from('photos')
      .update({ user_id: user.id })
      .eq('sender_phone', e164)
      .is('user_id', null);
  }

  /**
   * Notes: If phone is stuck on another profile with no auth session value, move it here.
   * Used after unique-constraint races during OTP register.
   */
  private async reclaimPhoneIfOrphan(phone: string, userId: string): Promise<void> {
    const client = this.supabase.requireClient();
    const e164 = this.toE164(phone);
    if (!e164) return;
    const { data: owner } = await client.from('profiles').select('id, phone').eq('phone', e164).maybeSingle();
    if (!owner) {
      await client.from('profiles').update({ phone: e164 }).eq('id', userId);
      return;
    }
    if (owner.id === userId) return;
    // Clear from other row then assign (best-effort — needs RLS allowing update on own row only;
    // if blocked, server-side WhatsApp auth.admin fallback still works after deploy).
    await client.from('profiles').update({ phone: null }).eq('id', owner.id);
    await client.from('profiles').update({ phone: e164 }).eq('id', userId);
  }

  /** Same rules as server normalizePhoneE164 — WhatsApp match depends on this. */
  private toE164(raw: string): string {
    if (!raw) return '';
    let s = raw.trim().replace(/[\s\-().]/g, '');
    if (s.startsWith('00')) s = `+${s.slice(2)}`;
    if (/^05\d{8}$/.test(s)) s = `+972${s.slice(1)}`;
    if (/^5\d{8}$/.test(s) && !s.startsWith('+')) s = `+972${s}`;
    if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = `+${s}`;
    return s;
  }

  async signOut(): Promise<void> {
    // Clear local auth state first so /smartcrop does not bounce back to the dashboard.
    this.session.set(null);
    this.user.set(null);
    this.profile.set(null);
    this.authError.set(null);

    if (!this.supabase.isConfigured()) return;

    const client = this.supabase.requireClient();
    try {
      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) {
        await client.auth.signOut({ scope: 'local' });
      }
    } catch {
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        /* ignore — local signals already cleared */
      }
    }
  }

  isSignedIn(): boolean {
    return Boolean(this.user());
  }
}
