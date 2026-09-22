import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private readonly client: SupabaseClient | null;

  constructor() {
    const { supabaseUrl, supabaseAnonKey } = environment;
    if (supabaseUrl && supabaseAnonKey) {
      this.client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // We exchange ?code= explicitly so apex→www redirects don't race PKCE.
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase is not configured');
    }
    return this.client;
  }
}
