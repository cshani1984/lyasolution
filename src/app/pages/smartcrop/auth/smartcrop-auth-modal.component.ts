import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18nService } from '../../../core/services/i18n.service';
import {
  SmartcropAuthService,
  smartcropAuthOrigin,
} from '../../../core/services/smartcrop-auth.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export type AuthModalTab = 'login' | 'register';

@Component({
  selector: 'app-smartcrop-auth-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './smartcrop-auth-modal.component.html',
  styleUrl: './smartcrop-auth-modal.component.scss',
})
export class SmartcropAuthModalComponent implements OnChanges {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly supabase = inject(SupabaseClientService);
  private readonly router = inject(Router);

  @Input() open = false;
  @Input() initialTab: AuthModalTab = 'login';
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly authenticated = new EventEmitter<void>();

  readonly tab = signal<AuthModalTab>('login');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly otpSent = signal(false);
  readonly showUserMissing = signal(false);

  phone = '';
  otp = '';
  studioName = '';
  registerPhone = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.tab.set(this.initialTab);
      this.error.set(null);
      this.otpSent.set(false);
      this.showUserMissing.set(false);
      this.otp = '';
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.closed.emit();
  }

  setTab(tab: AuthModalTab): void {
    this.tab.set(tab);
    this.error.set(null);
    this.showUserMissing.set(false);
  }

  close(): void {
    this.closed.emit();
  }

  async google(fromRegister = false): Promise<void> {
    if (typeof window !== 'undefined' && window.location.hostname === 'lya-solution.com') {
      window.location.replace('https://www.lya-solution.com/smartcrop?login=1&startGoogle=1');
      return;
    }

    if (fromRegister) {
      const name = this.studioName.trim();
      const phone = this.normalize(this.registerPhone);
      if (!name) {
        this.error.set(this.i18n.t('smartcrop.auth.studioRequired'));
        return;
      }
      if (!phone) {
        this.error.set(this.i18n.t('smartcrop.phone.invalid'));
        return;
      }
      this.auth.stashPendingStudioRegistration(name, phone);
    }

    this.busy.set(true);
    this.error.set(null);
    const redirectTo = `${smartcropAuthOrigin()}/smartcrop/auth/callback`;
    const { error } = await this.auth.signInWithGoogle(redirectTo);
    this.busy.set(false);
    if (error) this.error.set(error.message);
  }

  async sendOtp(): Promise<void> {
    const phone = this.normalize(this.phone);
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
    this.phone = phone;
    this.otpSent.set(true);
  }

  async verifyOtp(): Promise<void> {
    if (!this.otp.trim()) {
      this.error.set(this.i18n.t('smartcrop.auth.otpRequired'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.auth.verifyPhoneOtp(this.phone, this.otp.trim());
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      this.showUserMissing.set(true);
      return;
    }
    await this.auth.updatePhone(this.phone);
    await this.finishAuth();
  }

  async submitLogin(): Promise<void> {
    if (this.otpSent()) {
      await this.verifyOtp();
      return;
    }
    if (!this.auth.isSignedIn()) {
      this.showUserMissing.set(true);
      this.error.set(null);
      return;
    }
    await this.finishAuth();
  }

  async submitRegister(): Promise<void> {
    const name = this.studioName.trim();
    const phone = this.normalize(this.registerPhone);
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

    // Not signed in — stash and start Google (creates account + applies studio).
    await this.google(true);
  }

  goRegister(): void {
    this.setTab('register');
  }

  private async finishAuth(): Promise<void> {
    this.authenticated.emit();
    this.closed.emit();
    await this.router.navigateByUrl('/smartcrop/dashboard');
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
