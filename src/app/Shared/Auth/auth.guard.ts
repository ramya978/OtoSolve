import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSessionService } from '../services/auth-session.service';
import { AuthTokenService } from '../services/auth-token.service';

/**
 * Protects every /app/** route.
 *   • no identity held        -> /login, remembering where the person was headed
 *   • idle for too long       -> /auth/reauthenticate
 *   • otherwise               -> allow
 * Navigation convenience only: the API re-checks the token and the permission on every call.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const tokens = inject(AuthTokenService);
  const session = inject(AuthSessionService);
  const router = inject(Router);

  if (!tokens.user()) {
    const returnUrl = state.url && state.url !== '/' ? { returnUrl: state.url } : undefined;
    return router.createUrlTree(['/login'], { queryParams: returnUrl });
  }

  if (session.isReauthRequired() || session.isIdleTimedOut()) {
    return router.createUrlTree(['/auth/reauthenticate'], { queryParams: { returnUrl: state.url } });
  }

  return true;
};

/** The sign-in and recovery screens: somebody already signed in goes to the dashboard instead. */
export const guestGuard: CanActivateFn = () => {
  const tokens = inject(AuthTokenService);
  const session = inject(AuthSessionService);
  const router = inject(Router);

  return tokens.user() && !session.isReauthRequired() && !session.isIdleTimedOut()
    ? router.createUrlTree(['/app/dashboard'])
    : true;
};
