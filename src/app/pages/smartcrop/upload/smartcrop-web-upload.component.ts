import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { I18nService } from '../../../core/services/i18n.service';
import { FooterComponent } from '../../../layout/footer/footer.component';

@Component({
  selector: 'app-smartcrop-web-upload',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, FooterComponent],
  templateUrl: './smartcrop-web-upload.component.html',
  styleUrl: './smartcrop-web-upload.component.scss',
})
export class SmartcropWebUploadComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);

  readonly storeCode = signal('');
  readonly storeName = signal('');
  readonly loadingStore = signal(true);
  readonly storeError = signal<string | null>(null);

  customerName = '';
  customerPhone = '';
  sizeName = '10x15';
  readonly files = signal<File[]>([]);
  readonly busy = signal(false);
  readonly doneMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  ngOnInit(): void {
    const code = String(this.route.snapshot.paramMap.get('storeCode') || '')
      .trim()
      .toUpperCase();
    this.storeCode.set(code);
    const phoneQ = this.route.snapshot.queryParamMap.get('phone');
    if (phoneQ) this.customerPhone = phoneQ;
    void this.loadStore(code);
  }

  private apiBase(): string {
    return (environment.smartcropApiUrl || environment.whatsappNotifyApiUrl || '').replace(/\/$/, '');
  }

  private async loadStore(code: string): Promise<void> {
    this.loadingStore.set(true);
    this.storeError.set(null);
    try {
      if (!code) {
        this.storeError.set('קוד חנות חסר בכתובת');
        return;
      }
      const base = this.apiBase();
      if (!base) {
        this.storeError.set('שרת ההעלאה לא מוגדר');
        return;
      }
      const res = await fetch(`${base}/api/stores/${encodeURIComponent(code)}`);
      const data = (await res.json()) as {
        ok?: boolean;
        store?: { code: string; name: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.store) {
        this.storeError.set(data.error || 'החנות לא נמצאה');
        return;
      }
      this.storeName.set(data.store.name);
      this.storeCode.set(data.store.code);
    } catch {
      this.storeError.set('לא ניתן לטעון את פרטי החנות');
    } finally {
      this.loadingStore.set(false);
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = Array.from(input.files ?? []);
    this.addFiles(list);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const list = Array.from(event.dataTransfer?.files ?? []);
    this.addFiles(list);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private addFiles(list: File[]): void {
    const allowed = list.filter(
      (f) =>
        /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(f.type) ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name),
    );
    if (!allowed.length) {
      this.errorMsg.set('נא לבחור קבצי תמונה (JPG / PNG / HEIC)');
      return;
    }
    this.files.update((prev) => [...prev, ...allowed].slice(0, 20));
    this.errorMsg.set(null);
    this.doneMsg.set(null);
  }

  removeFile(index: number): void {
    this.files.update((prev) => prev.filter((_, i) => i !== index));
  }

  async submit(): Promise<void> {
    this.errorMsg.set(null);
    this.doneMsg.set(null);
    const phone = this.customerPhone.trim();
    const name = this.customerName.trim();
    const files = this.files();
    if (!phone) {
      this.errorMsg.set('נא להזין מספר טלפון');
      return;
    }
    if (!files.length) {
      this.errorMsg.set('נא לבחור לפחות תמונה אחת');
      return;
    }
    const base = this.apiBase();
    if (!base) {
      this.errorMsg.set('שרת ההעלאה לא מוגדר');
      return;
    }

    this.busy.set(true);
    try {
      const form = new FormData();
      form.append('storeCode', this.storeCode());
      form.append('phone', phone);
      if (name) form.append('name', name);
      form.append('sizeName', this.sizeName || '10x15');
      for (const f of files) form.append('files', f, f.name);

      const res = await fetch(`${base}/api/upload/web`, { method: 'POST', body: form });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string; count?: number };
      if (!res.ok || !data.ok) {
        this.errorMsg.set(data.error || 'העלאה נכשלה');
        return;
      }
      this.doneMsg.set(data.message || `הועלו ${data.count ?? files.length} תמונות בהצלחה`);
      this.files.set([]);
    } catch {
      this.errorMsg.set('שגיאת רשת — נסו שוב');
    } finally {
      this.busy.set(false);
    }
  }
}
