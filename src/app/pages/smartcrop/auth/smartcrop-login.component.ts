import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

  phone = '';
  otp = '';
  readonly otpSent = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    for (let i = 0; i < 40 && this.auth.loading(); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.auth.isSignedIn()) {
      await this.router.navigateByUrl('/smartcrop/dashboard');
    }
  }

  async google(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const redirectTo = `${window.location.origin}/smartcrop/login`;
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
