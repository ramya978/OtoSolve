import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { SignInResponse } from '../models/auth.model';
import { AuthTokenService } from './auth-token.service';

/**
 * KEEPING EVERY TAB ON THE ORGANISATION ITS HEADER NAMES (TS-220).
 *
 * WHY THIS EXISTS
 * ---------------
 * The Organisation a session works in is held by the SERVER, on the session, and every tab of the
 * browser shares that session through the one HttpOnly refresh cookie. When a Platform Admin
 * switched Organisation in one tab, the other tab kept its old header, and the moment its access
 * token was renewed it received a token for the NEW Organisation - so it showed HelpAge India's
 * people under a header that still said Smile Foundation. The renewal path also threw away the
 * Organisation the server sent back with the token.
 *
 * And within one tab, a switch or a sign-out was a router navigation: every root-level store
 * (the people directory, the communication and follow-up stores) kept the previous
 * Organisation's records, and screens that only loaded "when empty" went on showing them.
 *
 * THE RULES THIS FILE ENFORCES
 * ----------------------------
 * 1. A renewal stores EVERYTHING the server answered - token, identity and Organisation - and if
 *    that Organisation differs from the one this tab was showing, the tab reloads with a notice
 *    rather than replaying the request under the wrong label.
 * 2. A switch, an exit to platform scope and a sign-out are announced to the session's other tabs,
 *    which reconcile at once instead of at their next renewal.
 * 3. Moving between Organisations, or signing out, is a full page load, so nothing held in memory
 *    by the previous Organisation survives it.
 */

const CHANNEL_NAME = 'ydot.session';
const NOTICE_KEY = 'ydot.notice';
const REFRESH_LOCK = 'ydot.token-refresh';

/** A message one tab sends the session's other tabs. */
export type SessionMessage =
  | { type: 'scope-changed'; sessionId: string | null; tenantId: string | null; tenantName: string | null }
  | { type: 'signed-out'; sessionId: string | null };

/**
 * Raised by a renewal when the token came back for a different Organisation than the tab shows.
 * The tab must not replay the request: it reloads into the Organisation the session is now in.
 */
export class SessionScopeChangedError extends Error {
  constructor(readonly tenantName: string | null) {
    super(tenantName
      ? `This session is now working in ${tenantName}. It was switched in another tab.`
      : 'This session is now working at platform level. It was switched in another tab.');
    this.name = 'SessionScopeChangedError';
  }
}

/** Tells the session's other tabs what happened here. Browsers without the API simply skip it. */
export function broadcastSession(message: SessionMessage): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {
    // No BroadcastChannel (very old browser): the renewal check below still catches the change.
  }
}

/** Listens for the other tabs. Returns a function that stops listening. */
export function listenForSession(handler: (message: SessionMessage) => void): () => void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<SessionMessage>) => handler(event.data);
    return () => channel.close();
  } catch {
    return () => undefined;
  }
}

/**
 * A full page load to `url`, with a message for the shell to show once it has started.
 *
 * A FULL LOAD ON PURPOSE. Every root-level store starts empty, so no record of the previous
 * Organisation or the previous account can be shown after the move.
 */
export function reloadWithNotice(url: string, notice?: string): void {
  if (notice) {
    try {
      sessionStorage.setItem(NOTICE_KEY, notice);
    } catch {
      // Storage blocked: the move still happens, only the explanation is lost.
    }
  }

  window.location.assign(url);
}

/** The notice left by `reloadWithNotice`, removed as it is read. */
export function takeNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    if (notice) sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

/**
 * Renews the access token from the HttpOnly cookie and stores the whole answer.
 *
 * Emits the new access token, or fails with `SessionScopeChangedError` when the server issued it
 * for a different Organisation than this tab was showing (rule 1 above).
 *
 * ONE TAB AT A TIME, ACROSS THE WHOLE BROWSER. Every tab shares ONE refresh cookie, and two tabs
 * presenting it at the same moment look to the server like a stolen token. The Web Locks API
 * queues the second tab until the first has finished; by then the browser holds the rotated
 * cookie. Browsers without the API keep the old behaviour.
 *
 * A bare `fetch`, not HttpClient: going through the interceptor would loop.
 */
export function renewAccessToken(tokens: AuthTokenService): Observable<string> {
  return new Observable<string>((subscriber) => {
    const renew = () =>
      fetch(`${environment.apiBaseUrl}/users/tokens/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
        .then(async (response) => {
          const body = (await response.json()) as ApiResponse<SignInResponse>;
          const data = body.data;

          if (!response.ok || !body.success || !data?.accessToken) {
            subscriber.error(new Error(body.message ?? 'The session could not be renewed.'));
            return;
          }

          const before = tokens.tenant()?.tenantId ?? null;
          // An answer without a `tenant` field says nothing about the Organisation; one with
          // `tenant: null` says the session is at platform scope.
          const carriesTenant = Object.prototype.hasOwnProperty.call(data, 'tenant');
          const after = carriesTenant ? (data.tenant?.tenantId ?? null) : before;

          tokens.storeSignIn(data);
          if (carriesTenant) tokens.storeTenant(data.tenant ?? null);

          if (after !== before) {
            subscriber.error(new SessionScopeChangedError(data.tenant?.tenantName ?? null));
            return;
          }

          subscriber.next(data.accessToken);
          subscriber.complete();
        })
        .catch((error) => subscriber.error(error));

    const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;

    if (locks) {
      // The lock is held until `renew` settles, which is what makes the next tab wait.
      locks.request(REFRESH_LOCK, renew).catch((error) => subscriber.error(error));
    } else {
      void renew();
    }
  });
}
