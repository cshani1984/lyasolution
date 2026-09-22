import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../../core/services/smartcrop-auth.service';

@Component({
  selector: 'app-smartcrop-phone-verification-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './phone-verification-modal.component.html',
  styleUrl: './phone-verification-modal.component.scss',
})
export class SmartcropPhoneVerificationModalComponent {
  readonly i18n = inject(I18nService);
  private readonly auth = inject(SmartcropAuthService);

  @Input() open = false;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly verified = new EventEmitter<string>();

  phone = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    const normalized = this.normalize(this.phone);
    if (!normalized) {
      this.error.set(this.i18n.t('smartcrop.phone.invalid'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.auth.updatePhone(normalized);
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.verified.emit(normalized);
    this.closed.emit();
  }

  private normalize(raw: string): string {
    let s = raw.trim().replace(/[\s\-().]/g, '');
    if (s.startsWith('00')) s = `+${s.slice(2)}`;
    if (/^05\d{8}$/.test(s)) s = `+972${s.slice(1)}`;
    if (/^5\d{8}$/.test(s) && !s.startsWith('+')) s = `+972${s}`;
    if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = `+${s}`;
    return /^\+\d{10,15}$/.test(s) ? s : '';
  }
}
