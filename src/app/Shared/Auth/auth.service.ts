import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Authentication layer — talks to the real sign-in API and keeps the session in web
 * storage. Every /app/** page is gated behind it and signing out returns to /login.
 */

/** The signed-in user record shown in the top bar and account menu. */
export interface AuthUser {
  name: string;
  email: string;
  role: string;
  initials: string;
  org: string;
}

/** Dev API the sign-in form posts to (switch to a relative path + dev proxy if CORS blocks it). */
const API_BASE = 'http://localhost:6701';
const SIGN_IN_PATH = '/api/v1/users/sign-in';

const SESSION_KEY = 'otosolve-session';
const TOKEN_KEY = 'otosolve-token';
const DEVICE_KEY = 'otosolve-device-id';

type Rec = Record<string, unknown>;

/** Body the API expects (see the sign-in contract). */
interface SignInPayload {
  identifier: string;
  password: string;
  clientType: 'web';
  deviceIdentifier: string;
  deviceName: string;
  rememberMe: boolean;
}

const initialsOf = (name: string): string =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || 'U';

/** "superadmin" → "Superadmin", "priya.r" → "Priya R" — used when the API returns no name. */
function prettifyIdentifier(identifier: string): string {
  return (
    identifier
      .split('@')[0]!
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join(' ') || identifier
  );
}

const asRec = (value: unknown): Rec | null => (value && typeof value === 'object' ? (value as Rec) : null);
const asText = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
};

/** One stable pseudo-device id per browser — the API uses it to remember devices. */
function deviceIdentifier(): string {
  const uuid = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
          const r = (Math.random() * 16) | 0;
          return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return uuid(); // storage blocked — ephemeral id for this page load
  }
}

/** "Chrome on Windows"-style label, like the API contract examples. */
function detectDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Web';
  const os = /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux|X11/.test(ua) ? 'Linux' : 'Web';
  return `${browser} on ${os}`;
}

function readSession(): AuthUser | null {
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        const raw = store.getItem(SESSION_KEY);
        if (!raw) continue;
        const user = JSON.parse(raw) as AuthUser;
        if (user && user.email) return user;
      } catch { /* try the next store */ }
    }
  } catch { /* storage blocked — start signed out */ }
  return null;
}

/**
 * Maps the API response onto the app's AuthUser. The exact envelope isn't pinned down,
 * so common shapes are probed: token under {token|accessToken|access_token|jwt}, payload
 * under {data|result}, user under {user|profile}. A wrapped failure answers success:false.
 */
function mapSignInResponse(res: unknown, identifier: string): { token: string | null; user: AuthUser } {
  const root = asRec(res);
  if (!root) throw new Error('Unexpected sign-in response from the API.');
  const data = asRec(root['data']) ?? asRec(root['result']) ?? root;

  if (data['success'] === false) {
    throw new Error(asText(data['message']) ?? 'Sign-in failed. Check your credentials and try again.');
  }

  const token =
    asText(data['token']) ?? asText(data['accessToken']) ?? asText(data['access_token']) ?? asText(data['jwt']) ??
    asText(root['token']) ?? asText(root['accessToken']) ?? asText(root['jwt']);

  const u = asRec(data['user']) ?? asRec(data['profile']) ?? data;
  const firstName = asText(u['firstName']);
  const rawName =
    asText(u['fullName']) ?? asText(u['name']) ?? asText(u['displayName']) ??
    asText(u['userName']) ?? asText(u['username']) ??
    (firstName ? `${firstName} ${asText(u['lastName']) ?? ''}`.trim() : null);
  const name = rawName ?? prettifyIdentifier(identifier);
  const roles = u['roles'];
  const role =
    asText(u['roleName']) ?? asText(u['role']) ?? (Array.isArray(roles) ? roles.map(String).join(', ') : null) ?? 'Member';
  const org =
    asText(u['org']) ?? asText(u['orgName']) ?? asText(u['organisation']) ?? asText(u['organization']) ?? 'OtoSolve';
  const email =
    asText(u['email']) ?? asText(u['emailId']) ?? asText(u['userEmail']) ??
    (identifier.includes('@') ? identifier.trim().toLowerCase() : `${identifier.trim().toLowerCase()}@local`);

  return { token, user: { name, email, role, initials: initialsOf(name), org } };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly current = signal<AuthUser | null>(readSession());

  /** Signed-in user, or null when nobody is signed in. */
  readonly user = this.current.asReadonly();
  readonly isAuthenticated = computed(() => this.current() !== null);

  /**
   * Real sign-in: POSTs the payload to /api/v1/users/sign-in, stores the returned token
   * (when present) and keeps the user session. With `rememberMe` the session survives
   * browser restarts (localStorage); otherwise it lives in sessionStorage and clears
   * when the tab closes.
   */
  async signIn(identifier: string, password: string, rememberMe: boolean): Promise<AuthUser> {
    const payload: SignInPayload = {
      identifier: identifier.trim(),
      password,
      clientType: 'web',
      deviceIdentifier: deviceIdentifier(),
      deviceName: detectDeviceName(),
      rememberMe
    };

    try {
      const res = await firstValueFrom(this.http.post<unknown>(`${API_BASE}${SIGN_IN_PATH}`, payload));
      const mapped = mapSignInResponse(res, payload.identifier);
      if (mapped.token) this.persist(TOKEN_KEY, mapped.token, rememberMe);
      this.establish(mapped.user, rememberMe);
      return mapped.user;
    } catch (err) {
      throw new Error(this.errorMessage(err));
    }
  }

  /** Friendly text for anything the sign-in call can throw. */
  errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return `Cannot reach the sign-in service (${API_BASE}). Is the API running, and does it allow requests from this origin (CORS)?`;
      }
      const b = asRec(err.error);
      const msg = typeof err.error === 'string'
        ? err.error
        : b
          ? asText(b['message']) ?? asText(b['detail']) ?? asText(b['title']) ?? asText(b['error'])
          : null;
      if (msg) return msg;
      if (err.status === 401 || err.status === 403) return 'Invalid identifier or password.';
      return `Sign-in failed (HTTP ${err.status}).`;
    }
    return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
  }

  /** Bearer token from the last sign-in, ready for future API calls. */
  token(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /** Clears the session on this device; the router then shows the sign-in screen. */
  logout(): void {
    this.current.set(null);
    try {
      for (const key of [SESSION_KEY, TOKEN_KEY]) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      }
    } catch { /* storage blocked — nothing to clear */ }
  }

  private establish(user: AuthUser, rememberMe: boolean): void {
    this.current.set(user);
    this.persist(SESSION_KEY, JSON.stringify(user), rememberMe);
  }

  /** rememberMe → localStorage (survives restarts); otherwise sessionStorage (tab-scoped). */
  private persist(key: string, value: string, rememberMe: boolean): void {
    try {
      (rememberMe ? window.localStorage : window.sessionStorage).setItem(key, value);
      (rememberMe ? window.sessionStorage : window.localStorage).removeItem(key);
    } catch { /* storage blocked — in-memory session still works until reload */ }
  }
}