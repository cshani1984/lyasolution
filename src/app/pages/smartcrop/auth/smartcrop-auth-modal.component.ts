import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  QueryList,
  SimpleChanges,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export type AuthModalTab = 'login' | 'register';

const OTP_LEN = 6;
const RESEND_SEC = 60;

@Component({
  selector: 'app-smartcrop-auth-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './smartcrop-auth-modal.component.html',
  styleUrl: './smartcrop-auth-modal.component.scss',
})
export class SmartcropAuthModalComponent implements OnChanges, OnDestroy {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly supabase = inject(SupabaseClientService);
  private readonly router = inject(Router);

  @Input() open = false;
  @Input() initialTab: AuthModalTab = 'login';
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly authenticated = new EventEmitter<void>();

  @ViewChildren('otpBox') otpBoxes!: QueryList<ElementRef<HTMLInputElement>>;

  readonly tab = signal<AuthModalTab>('login');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly otpSent = signal(false);
  readonly regOtpSent = signal(false);
  readonly showUserMissing = signal(false);
  readonly resendSeconds = signal(0);
  readonly otpDigits = signal<string[]>(Array.from({ length: OTP_LEN }, () => ''));

  phoneLocal = '';
  studioName = '';
  /** E.164 used for OTP verify after send. */
  private verifiedPhoneE164 = '';
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  readonly otpLen = OTP_LEN;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.tab.set(this.initialTab);
      this.resetFormState();
    }
    if (changes['open'] && !this.open) {
      this.clearResendTimer();
    }
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.closed.emit();
  }

  setTab(tab: AuthModalTab): void {
    this.tab.set(tab);
    this.resetFormState();
  }

  close(): void {
    this.closed.emit();
  }

  /** Local IL mobile (05xxxxxxxx) is valid. */
  phoneValid(): boolean {
    return Boolean(this.normalizeLocal(this.phoneLocal));
  }

  displayPhone(): string {
    const digits = this.phoneLocal.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  onPhoneInput(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    this.phoneLocal = digits;
  }

  otpCode(): string {
    return this.otpDigits().join('');
  }

  otpComplete(): boolean {
    return this.otpCode().length === OTP_LEN && this.otpDigits().every((d) => /^\d$/.test(d));
  }

  onOtpInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = (input.value || '').replace(/\D/g, '').slice(-1);
    const next = [...this.otpDigits()];
    next[index] = digit;
    this.otpDigits.set(next);
    input.value = digit;
    if (digit && index < OTP_LEN - 1) {
      this.focusOtp(index + 1);
    }
    if (this.otpComplete() && !this.busy()) {
      void this.submitActiveOtp();
    }
  }

  onOtpKeydown(index: number, event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'Backspace') {
      const cur = this.otpDigits()[index];
      if (!cur && index > 0) {
        const next = [...this.otpDigits()];
        next[index - 1] = '';
        this.otpDigits.set(next);
        this.focusOtp(index - 1);
        event.preventDefault();
      } else {
        const next = [...this.otpDigits()];
        next[index] = '';
        this.otpDigits.set(next);
      }
      return;
    }
    if (key === 'ArrowLeft' && index > 0) {
      this.focusOtp(index - 1);
      event.preventDefault();
    }
    if (key === 'ArrowRight' && index < OTP_LEN - 1) {
      this.focusOtp(index + 1);
      event.preventDefault();
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LEN);
    if (!text) return;
    const next = Array.from({ length: OTP_LEN }, (_, i) => text[i] ?? '');
    this.otpDigits.set(next);
    this.focusOtp(Math.min(text.length, OTP_LEN - 1));
    if (this.otpComplete() && !this.busy()) {
      void this.submitActiveOtp();
    }
  }

  async sendOtpLogin(): Promise<void> {
    const phone = this.normalizeLocal(this.phoneLocal);
    if (!phone) {
      this.error.set(this.i18n.t('smartcrop.phone.invalid'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.showUserMissing.set(false);
    const { error } = await this.auth.signInWithPhone(phone);
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      this.showUserMissing.set(true);
      return;
    }
    this.verifiedPhoneE164 = phone;
    this.otpSent.set(true);
    this.resetOtpDigits();
    this.startResendTimer();
    queueMicrotask(() => this.focusOtp(0));
  }

  async resendCode(): Promise<void> {
    if (this.resendSeconds() > 0 || this.busy()) return;
    const phone = this.verifiedPhoneE164 || this.normalizeLocal(this.phoneLocal);
    if (!phone) {
      this.error.set(this.i18n.t('smartcrop.phone.invalid'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.auth.signInWithPhone(phone);
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.verifiedPhoneE164 = phone;
    this.resetOtpDigits();
    this.startResendTimer();
    queueMicrotask(() => this.focusOtp(0));
  }

  async submitLogin(): Promise<void> {
    if (this.otpSent()) {
      await this.verifyLoginOtp();
      return;
    }
    if (!this.auth.isSignedIn()) {
      await this.sendOtpLogin();
      return;
    }
    await this.finishAuth();
  }

  async submitRegister(): Promise<void> {
    const name = this.studioName.trim();
    const phone = this.normalizeLocal(this.phoneLocal);
    if (!name) {
      this.error.set(this.i18n.t('smartcrop.auth.studioRequired'));
      return;
    }
    if (!phone) {
      this.error.set(this.i18n.t('smartcrop.phone.invalid'));
      return;
    }

    if (this.auth.isSignedIn()) {
      this.busy.set(true);
      const { error } = await this.auth.completeStudioRegistration({ studioName: name, phone });
      this.busy.set(false);
      if (error) {
        this.error.set(error.message);
        return;
      }
      await this.finishAuth();
      return;
    }

    if (!this.regOtpSent()) {
      this.busy.set(true);
      this.error.set(null);
      this.auth.stashPendingStudioRegistration(name, phone);
      const { error } = await this.auth.signInWithPhone(phone);
      this.busy.set(false);
      if (error) {
        this.error.set(error.message);
        return;
      }
      this.verifiedPhoneE164 = phone;
      this.regOtpSent.set(true);
      this.resetOtpDigits();
      this.startResendTimer();
      queueMicrotask(() => this.focusOtp(0));
      return;
    }

    await this.verifyRegisterOtp();
  }

  goRegister(): void {
    this.setTab('register');
  }

  resendLabel(): string {
    const s = this.resendSeconds();
    if (s <= 0) return this.i18n.t('smartcrop.auth.resendNow');
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return this.i18n.t('smartcrop.auth.resendIn').replace('{time}', `${mm}:${ss}`);
  }

  private async submitActiveOtp(): Promise<void> {
    if (this.tab() === 'register') await this.verifyRegisterOtp();
    else await this.verifyLoginOtp();
  }

  private async verifyLoginOtp(): Promise<void> {
    if (!this.otpComplete()) {
      this.error.set(this.i18n.t('smartcrop.auth.otpRequired'));
      return;
    }
    const phone = this.verifiedPhoneE164 || this.normalizeLocal(this.phoneLocal);
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.auth.verifyPhoneOtp(phone, this.otpCode());
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      this.showUserMissing.set(true);
      return;
    }
    await this.auth.updatePhone(phone);
    await this.finishAuth();
  }

  private async verifyRegisterOtp(): Promise<void> {
    const name = this.studioName.trim();
    const phone = this.verifiedPhoneE164 || this.normalizeLocal(this.phoneLocal);
    if (!this.otpComplete()) {
      this.error.set(this.i18n.t('smartcrop.auth.otpRequired'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.auth.verifyPhoneOtp(phone, this.otpCode());
    if (error) {
      this.busy.set(false);
      this.error.set(error.message);
      return;
    }
    const done = await this.auth.completeStudioRegistration({ studioName: name, phone });
    this.busy.set(false);
    if (done.error) {
      this.error.set(done.error.message);
      return;
    }
    await this.finishAuth();
  }

  private async finishAuth(): Promise<void> {
    this.clearResendTimer();
    this.authenticated.emit();
    this.closed.emit();
    await this.router.navigateByUrl('/smartcrop/dashboard');
  }

  private normalizeLocal(raw: string): string {
    let s = raw.trim().replace(/[\s\-().]/g, '');
    if (s.startsWith('+972')) return /^\+9725\d{8}$/.test(s) ? s : '';
    if (s.startsWith('972')) s = `+${s}`;
    if (/^05\d{8}$/.test(s)) return `+972${s.slice(1)}`;
    if (/^5\d{8}$/.test(s)) return `+972${s}`;
    return /^\+9725\d{8}$/.test(s) ? s : '';
  }

  private resetFormState(): void {
    this.error.set(null);
    this.otpSent.set(false);
    this.regOtpSent.set(false);
    this.showUserMissing.set(false);
    this.resetOtpDigits();
    this.clearResendTimer();
    this.resendSeconds.set(0);
    this.verifiedPhoneE164 = '';
  }

  private resetOtpDigits(): void {
    this.otpDigits.set(Array.from({ length: OTP_LEN }, () => ''));
  }

  private focusOtp(index: number): void {
    const el = this.otpBoxes?.get(index)?.nativeElement;
    el?.focus();
    el?.select();
  }

  private startResendTimer(): void {
    this.clearResendTimer();
    this.resendSeconds.set(RESEND_SEC);
    this.resendTimer = setInterval(() => {
      const next = this.resendSeconds() - 1;
      if (next <= 0) {
        this.resendSeconds.set(0);
        this.clearResendTimer();
      } else {
        this.resendSeconds.set(next);
      }
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }
}
