import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { SmartcropAuthService } from '../../core/services/smartcrop-auth.service';
import { SmartcropAuthModalComponent } from './auth/smartcrop-auth-modal.component';

@Component({
  selector: 'app-smartcrop',
  standalone: true,
  imports: [RouterLink, SmartcropAuthModalComponent],
  templateUrl: './smartcrop.component.html',
  styleUrl: './smartcrop.component.scss',
})
export class SmartcropComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loginOpen = signal(false);
  readonly authTab = signal<'login' | 'register'>('login');

  readonly features = [1, 2, 3] as const;

  async ngOnInit(): Promise<void> {
    await this.auth.waitUntilReady();
    if (this.auth.isSignedIn()) {
      await this.router.navigateByUrl('/smartcrop/dashboard');
      return;
    }
    const q = this.route.snapshot.queryParamMap;
    if (q.get('login') === '1' || q.get('startGoogle') === '1' || q.get('error') || q.get('register') === '1') {
      this.authTab.set(q.get('register') === '1' ? 'register' : 'login');
      this.loginOpen.set(true);
    }
  }

  openLogin(): void {
    this.authTab.set('login');
    this.loginOpen.set(true);
  }

  openRegister(): void {
    this.authTab.set('register');
    this.loginOpen.set(true);
  }

  toggleLang(): void {
    this.i18n.toggleLang();
  }
}
