import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SmartcropAuthService } from '../services/smartcrop-auth.service';

export const smartcropAuthGuard: CanActivateFn = async () => {
  const auth = inject(SmartcropAuthService);
  const router = inject(Router);

  // OAuth returns here with ?code= — wait for PKCE exchange before deciding.
  const hasOAuthParams =
    typeof window !== 'undefined' &&
    (window.location.search.includes('code=') || window.location.hash.includes('access_token'));

  await auth.waitUntilReady(hasOAuthParams ? 15_000 : 12_000);

  if (auth.isSignedIn()) {
    return true;
  }
  return router.createUrlTree(['/smartcrop/login']);
};
