import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';

/**
 * OAuth return URL (no auth guard). Exchanges ?code= then sends user to the dashboard.
 * Must stay on the same host as the Google button click (www) for PKCE.
 */
@Component({
  selector: 'app-smartcrop-auth-callback',
  standalone: true,
  template: `
    <section class="container" style="padding: 4rem 1rem; text-align: center">
      <p>{{ message() }}</p>
    </section>
  `,
})
export class SmartcropAuthCallbackComponent implements OnInit {
  private readonly auth = inject(SmartcropAuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  readonly message = signal('…');

  async ngOnInit(): Promise<void> {
    this.message.set(this.i18n.t('smartcrop.login.signingIn'));
    await this.auth.exchangeOAuthCodeIfPresent();
    await this.auth.waitUntilReady(15_000);

    if (this.auth.isSignedIn()) {
      await this.router.navigateByUrl('/smartcrop/dashboard', { replaceUrl: true });
      return;
    }

    const err = this.auth.authError() || this.i18n.t('smartcrop.login.oauthFailed');
    await this.router.navigate(['/smartcrop/login'], {
      replaceUrl: true,
      queryParams: { error: err },
    });
  }
}
