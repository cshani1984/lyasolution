import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export interface ContactSubmissionPayload {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ContactSubmissionsService {
  private readonly client: SupabaseClient | null;

  constructor() {
    const { supabaseUrl, supabaseAnonKey } = environment;
    if (supabaseUrl && supabaseAnonKey) {
      this.client = createClient(supabaseUrl, supabaseAnonKey);
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async save(row: ContactSubmissionPayload): Promise<{ error: Error | null }> {
    if (!this.client) {
      return { error: new Error('Supabase is not configured') };
    }

    const { error } = await this.client.from('contact_submissions').insert({
      first_name: row.firstName.trim(),
      last_name: row.lastName.trim(),
      phone: row.phone.trim(),
      email: row.email.trim().toLowerCase(),
      message: row.message.trim(),
    });

    if (error) {
      return { error: new Error(error.message) };
    }
    return { error: null };
  }
}
