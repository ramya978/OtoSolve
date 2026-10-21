import { Injectable, computed, inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';
import { AuthTokenService } from '../services/auth-token.service';

/**
 * Authentication facade for the shell (top bar, account menu, route guards).
 *
 * It owns no state of its own. Everything comes from `AuthTokenService`, which holds what the IAM
 * API returned at sign-in (identity, roles, permissions, Organisation) and from
 * `AuthSessionService`, which owns the idle clock and the sign-out call. The sign-in itself is
 * done by `AuthApiService.signIn()` from the Login screen - this class never guesses at response
 * shapes or keeps a second copy of the session, which is what made the guard and the API disagree
 * about whether somebody was signed in.
 */

/** The signed-in user record shown in the top bar and account menu. */
export interface AuthUser {
  name: string;
  email: string;
  role: string;
  initials: string;
  org: string;
}

const initialsOf = (name: string): string =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || 'U';

/** SUPER_ADMIN -> "Super admin": a role code is an identifier, not something to read. */
const roleLabel = (code: string): string => {
  const text = code.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Member';
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokens = inject(AuthTokenService);
  private readonly session = inject(AuthSessionService);

  /** Signed-in user, or null when nobody is signed in. Live: updates on sign-in / sign-out. */
  readonly user = computed<AuthUser | null>(() => {
    const identity = this.tokens.user();
    if (!identity) return null;

    const name = identity.displayName || identity.email || 'User';
    return {
      name,
      email: identity.email ?? '',
      role: roleLabel(this.tokens.roles()[0] ?? ''),
      initials: initialsOf(name),
      org: this.tokens.organisationName() || 'Platform'
    };
  });

  /** True when an identity is held and the idle window has not asked for re-confirmation. */
  readonly isAuthenticated = computed(() => this.tokens.user() !== null);

  /** Bearer token of the current session (the interceptor attaches it to every API call). */
  token(): string | null {
    return this.tokens.getAccessToken();
  }

  /**
   * Ends the session: the API revokes it and clears the HttpOnly refresh cookie, local storage
   * is wiped either way, and the router then shows the sign-in screen.
   */
  logout(everywhere = false): void {
    this.session.endSession(everywhere);
  }
}
