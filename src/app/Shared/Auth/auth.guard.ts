import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, filter, map, of, take, timeout } from 'rxjs';
import { MenuNode, NavigationResponse } from '../models/auth.model';
import { NavigationService } from '../services/navigation.service';
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

/** Route `data` key: the server menu routes that grant a page, or 'any' for every signed-in person. */
export const GRANTS = 'grants';
export type Grants = readonly string[] | 'any';

/** Every route a server menu tree offers, at any depth. */
function menuRoutes(nodes: readonly MenuNode[] | null | undefined, into = new Set<string>()): Set<string> {
  for (const node of nodes ?? []) {
    if (node.route) into.add(node.route);
    menuRoutes(node.children, into);
  }
  return into;
}

/**
 * Opens a page only when the signed-in person's own menu offers it (NEW-03).
 *
 * `authGuard` checks only that somebody is signed in, so any page opened by its address rendered:
 * the Platform Admin could open some 35 Organisation pages and the Organisation Admin three
 * Platform pages, each an empty shell full of 403 and 409 errors. The API still refused the data,
 * so this is not where security lives - it is what keeps a person on screens they can use.
 *
 * Each route names, in `data.grants`, the menu entries that grant it: its own route for a menu
 * page, its module's menu pages for a page reached from inside a module (a detail, an edit form).
 * A route that names no grant is not guarded here.
 *
 * IF THE MENU CANNOT BE LOADED the page opens: an outage of the navigation call must not lock
 * everybody out of everything, and the API refuses the data regardless.
 */
export const menuGuard: CanActivateFn = (route, state) => {
  const grants = route.data?.[GRANTS] as Grants | undefined;
  if (!grants || grants === 'any') return true;

  const navigation = inject(NavigationService);
  const router = inject(Router);

  const decide = (tree: NavigationResponse | null): boolean | UrlTree => {
    if (!tree) return true;
    const offered = menuRoutes(tree.menu);
    return grants.some((g) => offered.has(g))
      ? true
      : router.createUrlTree(['/app/forbidden'], { queryParams: { page: state.url.split(/[?#]/)[0] } });
  };

  if (navigation.navigation()) return decide(navigation.navigation());

  // The menu is still on its way (a reload straight onto this address): wait for it.
  const state$ = computed(() => ({ tree: navigation.navigation(), loading: navigation.loading() }));
  if (!navigation.loading()) navigation.load().subscribe({ error: () => undefined });
  return toObservable(state$).pipe(
    filter((s) => s.tree !== null || !s.loading),
    take(1),
    timeout(15_000),
    map((s) => decide(s.tree)),
    catchError(() => of(true)),
  );
};
