import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ContactSubmissionPayload } from './contact-submissions.service';

/**
 * Fire-and-forget POST to the Node whatsapp-web.js server after a lead is saved.
 * If URL is empty, no request is made.
 */
@Injectable({ providedIn: 'root' })
export class LeadWhatsAppNotifyService {
  notify(payload: ContactSubmissionPayload): void {
    const base = environment.whatsappNotifyApiUrl?.trim();
    if (!base) return;

    const url = `${base.replace(/\/$/, '')}/api/notify-lead`;
    const key = environment.whatsappNotifyApiKey?.trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (key) {
      headers['x-api-key'] = key;
    }

    void fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).catch(() => {
      /* non-blocking; lead already in Supabase */
    });
  }
}
