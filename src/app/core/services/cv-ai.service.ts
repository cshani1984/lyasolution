import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { CvEnhanceField } from '../models/cv-resume.model';
import { CvResumeStore } from './cv-resume.store';
import { I18nService } from './i18n.service';

@Injectable({ providedIn: 'root' })
export class CvAiService {
  private readonly i18n = inject(I18nService);
  private readonly resumeStore = inject(CvResumeStore);

  async enhance(text: string, field: CvEnhanceField): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) {
      return trimmed;
    }

    const apiUrl = environment.cvAiApiUrl?.trim();
    if (apiUrl) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const apiKey = environment.cvAiApiKey?.trim();
        if (apiKey) {
          headers['x-api-key'] = apiKey;
        }

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: trimmed,
            field,
            lang: this.i18n.lang(),
            desiredRole: this.resumeStore.resume().personal.desiredRole.trim(),
          }),
        });

        const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
        if (res.ok && data.text?.trim()) {
          return data.text.trim();
        }
        console.warn('[CvAi] enhance failed', res.status, data.error ?? res.statusText);
      } catch (err) {
        console.warn('[CvAi] enhance request error', err);
      }
    }

    await new Promise((r) => setTimeout(r, 650));
    return this.localEnhance(trimmed, field);
  }

  private localEnhance(text: string, field: CvEnhanceField): string {
    const isHe = this.i18n.lang() === 'he';
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const bulletize = (line: string): string => {
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (!cleaned) {
        return '';
      }
      const hasVerb =
        /^(led|managed|built|developed|designed|improved|increased|reduced|הובלתי|ניהלתי|פיתחתי|בניתי|שיפרתי)/i.test(
          cleaned,
        );
      if (hasVerb) {
        return `• ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
      }
      const verb = isHe ? 'הובלתי' : 'Led';
      return `• ${verb} ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
    };

    if (field === 'headline' || field === 'summary') {
      const intro = isHe
        ? 'אנשי מקצוע בתחום עם ניסיון מוכח, המתמחים במתן ערך עסקי מדיד וביצועים גבוהים.'
        : 'Results-driven professional with proven impact, focused on measurable business outcomes and excellence.';
      const body = lines.length > 1 ? lines.map(bulletize).join('\n') : text;
      return `${intro}\n\n${body}`.trim();
    }

    if (field === 'experience' || field === 'education') {
      return lines.map(bulletize).join('\n');
    }

    return text;
  }
}
