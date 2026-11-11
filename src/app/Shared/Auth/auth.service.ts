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
  /** The Organisation's default currency (ISO code, e.g. "INR"), or '' when not known. */
  currency: string;
}

const initialsOf = (name: string): string =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || 'U';

/**
 * The built-in roles by the names the rest of the product uses (NEW-15). The header printed the
 * tidied role CODE, so an Organisation Admin read "Tenant admin" and the Platform Admin "Super
 * admin", names no screen, menu or guide uses. These are the names IAM gives the system roles
 * (RoleCodes.cs, TenantRoleDefinitions.cs); a role an Organisation creates for itself falls back
 * to its tidied code.
 */
const SYSTEM_ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'Platform Admin',
  TENANT_ADMIN: 'Organisation Admin',
  CAMPAIGN_MANAGER: 'Campaign Manager',
  FUNDRAISING_MANAGER: 'Fundraising Manager',
  CAMPAIGN_EXECUTIVE: 'Campaign Executive',
  FUNDRAISER_EXECUTIVE: 'Fundraiser Executive',
  DONOR_CARE: 'DonorCare',
  DONOR: 'Donor'
};

/** SUPER_ADMIN -> "Platform Admin"; an unknown code -> its words ("GRANTS_LEAD" -> "Grants lead"). */
const roleLabel = (code: string): string => {
  const known = SYSTEM_ROLE_NAMES[code.trim().toUpperCase()];
  if (known) return known;
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
      org: this.tokens.organisationName() || 'Platform',
      currency: this.tokens.organisationCurrency()
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