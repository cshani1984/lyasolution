import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ContactSubmissionPayload } from './contact-submissions.service';

/**
 * POST to the Node notify server (email-only in current backend mode).
 * Errors are silent in the browser; see server logs.
 */
@Injectable({ providedIn: 'root' })
export class LeadWhatsAppNotifyService {
  async notifyLeadChannels(payload: ContactSubmissionPayload): Promise<void> {
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        mode: 'cors',
      });
      if (!res.ok) {
        let details = '';
        try {
          details = await res.text();
        } catch {
          /* ignore read body failure */
        }
        console.error('[lead-notify] notify endpoint failed', {
          status: res.status,
          statusText: res.statusText,
          details,
        });
      }
    } catch {
      console.error('[lead-notify] request failed (network/CORS)');
    }
  }
}
