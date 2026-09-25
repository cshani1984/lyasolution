import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

@Component({
  selector: 'app-smartcrop-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './smartcrop-login.component.html',
  styleUrl: './smartcrop-login.component.scss',
})
export class SmartcropLoginComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly supabase = inject(SupabaseClientService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  phone = '';
  otp = '';
  readonly otpSent = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.loading()) return;
      if (this.auth.isSignedIn()) {
        void this.router.navigateByUrl('/smartcrop/dashboard', { replaceUrl: true });
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const qError = this.route.snapshot.queryParamMap.get('error');
    if (qError) this.error.set(qError);

    // Google / Gmail login temporarily disabled
    // if (this.route.snapshot.queryParamMap.get('startGoogle') === '1') {
    //   await this.google();
    //   return;
    // }

    await this.auth.exchangeOAuthCodeIfPresent();
    await this.auth.waitUntilReady();
    if (this.auth.isSignedIn()) {
      await this.router.navigateByUrl('/smartcrop/dashboard', { replaceUrl: true });
    }
  }

  async google(): Promise<void> {
    // Google / Gmail login temporarily disabled — phone OTP only.
    this.error.set(this.i18n.t('smartcrop.auth.googleDisabled'));
    return;
    /*
    if (typeof window !== 'undefined' && window.location.hostname === 'lya-solution.com') {
      window.location.replace('https://www.lya-solution.com/smartcrop/login?startGoogle=1');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    const redirectTo = `${smartcropAuthOrigin()}/smartcrop/auth/callback`;
    const { error } = await this.auth.signInWithGoogle(redirectTo);
    this.busy.set(false);
    if (error) this.error.set(error.message);
    */
  }

  async sendOtp(): Promise<void> {
    const phone = this.normalize(this.phone);
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
    this.phone = phone;
    this.otpSent.set(true);
  }

  async verifyOtp(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.auth.verifyPhoneOtp(this.phone, this.otp.trim());
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    await this.auth.updatePhone(this.phone);
    await this.router.navigateByUrl('/smartcrop/dashboard');
  }

  async continueIfSession(): Promise<void> {
    if (this.auth.isSignedIn()) {
      await this.router.navigateByUrl('/smartcrop/dashboard');
    }
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
