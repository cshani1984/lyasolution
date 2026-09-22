import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SmartcropAuthService } from '../services/smartcrop-auth.service';

export const smartcropAuthGuard: CanActivateFn = async () => {
  const auth = inject(SmartcropAuthService);
  const router = inject(Router);

  for (let i = 0; i < 40 && auth.loading(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }

  if (auth.isSignedIn()) {
    return true;
  }
  return router.createUrlTree(['/smartcrop/login']);
};
