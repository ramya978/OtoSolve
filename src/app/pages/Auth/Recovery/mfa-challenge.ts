import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';
import { MFA_METHOD_LABELS, MfaChallengeResponse, MfaMethodType, SignInResponse, nextRouteFor, methodSendsCode } from '../../../Shared/models/auth.model';
import { MfaMethodOptionResponse } from '../../../Shared/models/iam-contract.model';
import { AuthSessionService } from '../../../Shared/services/auth-session.service';
import { DeviceIdentityService } from '../../../Shared/services/device-identity.service';
import { MfaHandoffService } from '../../../Shared/services/mfa-handoff.service';
import { AuthFrame } from './auth-frame';

type EntryMode = 'code' | 'recovery';

/**
 * Where a finished sign-in lands when the API gives no usable route.
 * SET THIS TO YOUR REAL DASHBOARD PATH (the one in app.routes.ts) - a path that does not exist
 * falls into the wildcard route and looks exactly like "it did not navigate".
 */
const DEFAULT_HOME = '/app/dashboard';

/** Sign-in screens. Landing on one of these after a successful verify means something went wrong. */
const AUTH_PATHS = ['/login', '/mfa', '/forgot-password', '/reset-password', '/invitation'];

const EMPTY_DIGITS = ['', '', '', '', '', ''];

function isAuthPath(url: string | null | undefined): boolean {
  const path = (url ?? '').split(/[?#]/)[0].toLowerCase();
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

/**
 * Reads the API's expiry as UTC. The API can send it without a zone ("2026-11-10T15:30:00"), and
 * Date.parse reads that as LOCAL time - in India it lands 5h30m in the past, so the challenge
 * showed as expired the moment the screen opened. No zone → treat it as UTC.
 * Returns NaN when there is no usable date.
 */
function parseUtc(value: string | null | undefined): number {
  if (!value) return NaN;
  const s = value.trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  return Date.parse(hasZone ? s : s + 'Z');
}

/** Keeps only an in-app path that is not a sign-in screen; anything else is dropped. */
function safeReturnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u.startsWith('/') || u.startsWith('//')) return null;
  return isAuthPath(u) ? null : u;
}

/**
 * Some endpoints answer with the API envelope ({ success, data: {...} }) instead of the sign-in
 * itself. Reading `status` off the envelope gives undefined, nextRouteFor then falls back to the
 * sign-in route, and the user is sent back to /login. Unwrap it when that is what arrived.
 */
function unwrapSignIn(raw: unknown): SignInResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!('status' in r) && r['data'] && typeof r['data'] === 'object') return r['data'] as SignInResponse;
  return raw as SignInResponse;
}

/**
 * The challenge can arrive wrapped ({ success, data: {...} }) or with differently cased keys
 * (ChallengeToken, MethodType ...). Read either way, so the token is never lost - a missing
 * token is what makes the server answer "Some of the details are not valid".
 */
type Bag = Record<string, unknown>;

/** Case-insensitive key lookup: challengeToken / ChallengeToken / challengetoken. */
function getCI(obj: Bag, name: string): unknown {
  const key = Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? obj[key] : undefined;
}

/**
 * Finds the object that actually holds the challenge. The sign-in screen may hand over the
 * challenge itself, the API envelope ({ data: {...} }), or the whole sign-in answer with the
 * challenge nested inside it ({ status: 'mfaRequired', mfaChallenge: {...} }). Looks up to three
 * levels deep for an object carrying a challenge token.
 */
function findChallengeObject(raw: unknown, depth = 0): Bag | null {
  if (!raw || typeof raw !== 'object' || depth > 3) return null;
  const obj = raw as Bag;
  if (typeof getCI(obj, 'challengeToken') === 'string' && getCI(obj, 'challengeToken')) return obj;
  for (const value of Object.values(obj)) {
    const found = findChallengeObject(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Last resort: any non-empty string field whose name contains "token" (mfaToken, transactionToken ...). */
function findAnyToken(raw: unknown, depth = 0): string | null {
  if (!raw || typeof raw !== 'object' || depth > 3) return null;
  for (const [k, v] of Object.entries(raw as Bag)) {
    if (/token/i.test(k) && !/access|refresh|reset/i.test(k) && typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(raw as Bag)) {
    const t = findAnyToken(v, depth + 1);
    if (t) return t;
  }
  return null;
}

function normalizeChallenge(raw: unknown): MfaChallengeResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = findChallengeObject(raw) ?? (raw as Bag);
  const pick = (name: string) => getCI(r, name);
  return {
    ...(r as object),
    challengeToken: (pick('challengeToken') as string) || findAnyToken(raw) || '',
    methodType: pick('methodType'),
    maskedDestination: pick('maskedDestination'),
    expiresAtUtc: pick('expiresAtUtc'),
    attemptsRemaining: pick('attemptsRemaining'),
    instruction: pick('instruction'),
    availableMethods: pick('availableMethods'),
    recoveryCodeAccepted: pick('recoveryCodeAccepted')
  } as MfaChallengeResponse;
}

@Component({
  selector: 'app-mfa-challenge',
  imports: [AuthFrame],
  templateUrl: './mfa-challenge.html',
  styleUrl: '../Login/login.css'
})
export class MfaChallenge implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(AuthSessionService);
  private readonly device = inject(DeviceIdentityService);
  private readonly handoff = inject(MfaHandoffService);

  // ---- Challenge state ----
  protected readonly challenge = signal<MfaChallengeResponse | null>(null);
  protected readonly mode = signal<EntryMode>('code');
  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly infoMessage = signal('');

  // ---- Input ----
  /** Six separate boxes read better than one field and make paste and backspace behave. */
  protected readonly digits = signal<string[]>([...EMPTY_DIGITS]);
  protected readonly recoveryCode = signal('');
  protected readonly rememberDevice = signal(false);

  // ---- Countdown ----
  protected readonly secondsRemaining = signal(0);
  /** False when the API sent no usable expiry: then the server alone decides, and the screen never blocks. */
  protected readonly hasExpiry = signal(false);
  private countdown: ReturnType<typeof setInterval> | null = null;

  // ---- Resend cooldown (TS-227) ----
  /** Seconds before "Send the code again" can be used. A code that was just sent needs a moment to arrive. */
  protected readonly resendIn = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  protected readonly resendLabel = computed(() => {
    const s = this.resendIn();
    return s > 0 ? `Send the code again in ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : 'Send the code again';
  });

  /**
   * Step-up mode: the server already signed the person in without a challenge, but MFA is
   * enabled. The code is checked with the reauthentication endpoint, then this sign-in starts.
   */
  private pendingSignIn: SignInResponse | null = null;
  protected readonly stepUp = signal(false);

  // ---- Derived ----
  /** Case-insensitive, so 'AuthenticatorApp' / 'authenticatorapp' from the API still count. */
  protected readonly isAuthenticatorApp = computed(
    () => String(this.challenge()?.methodType ?? '').toLowerCase() === 'authenticatorapp'
  );
  /** Only for methods that actually send a code (e-mail). An authenticator app has nothing to resend. */
  protected readonly canResend = computed(() => !this.stepUp() && !this.isAuthenticatorApp() && methodSendsCode(this.challenge()?.methodType ?? null));
  protected readonly code = computed(() => this.digits().join(''));
  protected readonly expired = computed(() => this.hasExpiry() && this.secondsRemaining() <= 0);
  protected readonly canSubmitCode = computed(() => this.code().length === 6 && !this.submitting() && !this.expired());
  protected readonly canSubmitRecovery = computed(() => this.recoveryCode().trim().length >= 8 && !this.submitting() && !this.expired());
  protected readonly alternatives = computed<MfaMethodOptionResponse[]>(() => {
    const current = this.challenge();
    return (current?.availableMethods ?? []).filter(
      (m) => m.methodType !== current?.methodType || (m.maskedDestination ?? null) !== (current?.maskedDestination ?? null)
    );
  });
  protected readonly recoveryAvailable = computed(() => this.challenge()?.recoveryCodeAccepted ?? false);
  protected readonly attemptsLeft = computed(() => this.challenge()?.attemptsRemaining ?? 0);
  protected readonly countdownLabel = computed(() => {
    const total = this.secondsRemaining();
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
  });
  /**
   * The line under the heading. For an authenticator app the API's instruction can still say
   * "we sent you", which is wrong - nothing is sent - so that method always gets its own wording.
   */
  protected readonly subtitle = computed(() => {
    if (this.isAuthenticatorApp()) return 'Open your authenticator app and enter the 6-digit code it shows for this account.';
    if (this.infoMessage()) return this.infoMessage();
    return 'Enter the 6-digit code we sent you.';
  });

  // =========================================================================================
  // Lifecycle
  // =========================================================================================

  ngOnInit(): void {
    const handoff = this.handoff.mfa();
    // Landing here without a challenge (typed URL, cleared transaction): start again.
    if (!handoff) {
      void this.router.navigate(['/login']);
      return;
    }
    // Step-up: signed in already, MFA enabled, no challenge. Check the code, then go on.
    if (handoff.pendingSignIn?.accessToken) {
      this.pendingSignIn = handoff.pendingSignIn;
      this.stepUp.set(true);
      this.challenge.set(handoff.challenge);
      this.rememberDevice.set(!!handoff.rememberDevice);
      console.info('[MFA] step-up mode (signed in without a challenge, MFA enabled)');
      this.focusBox(0);
      return;
    }

    // Same as the reference: the challenge comes from the handoff. It is searched in the challenge
    // first and then in the whole handoff, so a token stored one level up is still found.
    const challenge = normalizeChallenge(handoff.challenge) ?? normalizeChallenge(handoff);
    if (challenge && !challenge.challengeToken) challenge.challengeToken = findAnyToken(handoff) ?? '';
    console.info('[MFA] challenge', {
      hasToken: !!challenge?.challengeToken,
      methodType: challenge?.methodType,
      expiresAtUtc: challenge?.expiresAtUtc,
      handoffKeys: Object.keys((handoff as object) ?? {}),
      challengeKeys: Object.keys((handoff.challenge as object) ?? {})
    });
    if (!challenge?.challengeToken) {
      this.errorMessage.set('This sign-in did not start properly. Go back and sign in again.');
    }
    this.challenge.set(challenge);
    this.rememberDevice.set(!!handoff.rememberDevice);
    this.infoMessage.set(challenge?.instruction ?? '');
    this.startCountdown(challenge?.expiresAtUtc);
    if (challenge?.codeWasSent) this.startResendCooldown();
    this.focusBox(0);
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    this.stopResendCooldown();
  }

  private startResendCooldown(seconds = 30): void {
    this.stopResendCooldown();
    this.resendIn.set(seconds);
    this.resendTimer = setInterval(() => {
      const next = this.resendIn() - 1;
      this.resendIn.set(Math.max(0, next));
      if (next <= 0) this.stopResendCooldown();
    }, 1000);
  }

  private stopResendCooldown(): void {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = null;
  }

  // =========================================================================================
  // Code boxes
  // =========================================================================================

  protected onDigitInput(index: number, event: Event): void {
    const el = event.target as HTMLInputElement;
    const typed = el.value.replace(/\D/g, '');

    // Some phones and password managers drop the whole code into one box.
    if (typed.length > 1) {
      this.fillFrom(index, typed);
      return;
    }

    const next = [...this.digits()];
    next[index] = typed;
    this.digits.set(next);
    el.value = typed;
    this.errorMessage.set('');
    if (typed && index < 5) this.focusBox(index + 1);
  }

  protected onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      event.preventDefault();
      const next = [...this.digits()];
      next[index - 1] = '';
      this.digits.set(next);
      this.focusBox(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      this.focusBox(index + 1);
    }
  }

  /** Pasting the whole code from a password manager or an e-mail should just work. */
  protected onPaste(event: ClipboardEvent): void {
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    this.fillFrom(0, pasted);
  }

  /** Focusing a box selects its digit, so typing replaces it. */
  protected selectBox(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  private fillFrom(start: number, value: string): void {
    const next = [...this.digits()];
    const chars = value.slice(0, 6 - start).split('');
    chars.forEach((c, i) => (next[start + i] = c));
    this.digits.set(next);
    this.errorMessage.set('');
    this.focusBox(Math.min(5, start + chars.length));
  }

  private focusBox(index: number): void {
    // Let Angular finish rendering before the focus moves.
    setTimeout(() => document.getElementById(`mfa-digit-${index}`)?.focus(), 0);
  }

  protected onRecovery(event: Event): void {
    this.recoveryCode.set((event.target as HTMLInputElement).value);
    this.errorMessage.set('');
  }

  protected onRemember(event: Event): void {
    this.rememberDevice.set((event.target as HTMLInputElement).checked);
  }

  protected setMode(mode: EntryMode): void {
    this.mode.set(mode);
    this.errorMessage.set('');
    if (mode === 'code') this.focusBox(0);
  }

  protected methodLabel(method: MfaMethodType | undefined): string {
    return method ? MFA_METHOD_LABELS[method] ?? 'another method' : 'another method';
  }

  // =========================================================================================
  // Actions
  // =========================================================================================

  protected verify(event?: Event): void {
    event?.preventDefault();
    const challenge = this.challenge();
    if (!challenge || this.code().length !== 6 || this.submitting()) return;
    if (this.stepUp()) {
      this.verifyStepUp();
      return;
    }
    if (!challenge.challengeToken) {
      this.errorMessage.set('This sign-in did not start properly. Go back and sign in again.');
      return;
    }
    if (this.expired()) {
      this.errorMessage.set('This sign-in has expired. Start again from the sign-in screen.');
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi
      .verifyMfa({
        challengeToken: challenge.challengeToken,
        code: this.code(),
        trustThisDevice: this.rememberDevice(),
        deviceIdentifier: this.device.getDeviceIdentifier(),
        deviceName: this.device.getDeviceName(),
        clientType: 'web'
      })
      .subscribe({ next: (r) => this.complete(r), error: (e: Error) => this.fail(e) });
  }

  /** Step-up: the reauthentication endpoint checks the code; on success the held sign-in starts. */
  private verifyStepUp(): void {
    const pending = this.pendingSignIn;
    if (!pending?.accessToken) {
      this.errorMessage.set('This sign-in did not start properly. Go back and sign in again.');
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi.reauthenticateWithToken(pending.accessToken, { mfaCode: this.code() }).subscribe({
      next: (result) => {
        if (result?.succeeded === false) {
          this.fail(new Error(result.message || 'That code is not right. Check your app and try again.'));
          return;
        }
        this.complete(pending);
      },
      error: (e: Error) => this.fail(e)
    });
  }

  protected useRecovery(event?: Event): void {
    event?.preventDefault();
    const challenge = this.challenge();
    if (!challenge || !this.canSubmitRecovery()) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi
      .redeemRecoveryCode({ challengeToken: challenge.challengeToken, recoveryCode: this.recoveryCode().trim() })
      .subscribe({ next: (r) => this.complete(r), error: (e: Error) => this.fail(e) });
  }

  protected resend(): void {
    const challenge = this.challenge();
    if (!challenge || !this.canResend() || this.resendIn() > 0) return;
    this.resending.set(true);
    this.errorMessage.set('');
    this.authApi.resendMfaChallenge(challenge.challengeToken ?? '').subscribe({
      next: (updated) => {
        this.resending.set(false);
        this.apply(updated);
        this.startResendCooldown();
        this.digits.set([...EMPTY_DIGITS]);
        this.focusBox(0);
      },
      error: (e: Error) => {
        this.resending.set(false);
        this.errorMessage.set(e.message);
      }
    });
  }

  protected switchMethod(methodId: string | undefined): void {
    const challenge = this.challenge();
    if (!challenge || !methodId) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi.switchMfaMethod(challenge.challengeToken ?? '', methodId).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.apply(updated);
        this.digits.set([...EMPTY_DIGITS]);
        this.mode.set('code');
        this.focusBox(0);
      },
      error: (e: Error) => {
        this.submitting.set(false);
        this.errorMessage.set(e.message);
      }
    });
  }

  protected cancel(): void {
    const challenge = this.challenge();
    const leave = () => {
      this.pendingSignIn = null;
      this.handoff.clear();
      void this.router.navigate(['/login']);
    };
    if (!challenge || this.stepUp() || !challenge.challengeToken) return leave();
    this.authApi
      .cancelMfaChallenge(challenge.challengeToken ?? '', 'Cancelled from the verification screen.')
      .subscribe({ next: leave, error: leave });
  }

  // =========================================================================================
  // Internals
  // =========================================================================================

  /**
   * Code accepted: start the session, then go on.
   *  • Organisation still to choose, or password must change → that screen, carrying the returnUrl.
   *  • Otherwise → the page originally asked for, else the dashboard.
   * Every way this can silently end up back on a sign-in screen is caught and shown, with one
   * console line ("[MFA] ...") saying where it tried to go and what happened.
   */
  private complete(raw: SignInResponse): void {
    this.stopCountdown();

    const response = unwrapSignIn(raw);
    if (!response) {
      this.submitting.set(false);
      this.errorMessage.set('The code was accepted, but the server sent back no sign-in. Start again.');
      console.warn('[MFA] verify succeeded but the response was empty', raw);
      return;
    }

    // Read BEFORE the clear, which wipes the handoff it is stored in.
    const returnUrl = safeReturnUrl(this.handoff.mfa()?.returnUrl);

    try {
      this.session.startSession(response);
    } catch (e) {
      this.submitting.set(false);
      this.errorMessage.set('The code was accepted, but the session could not be saved. Start again.');
      console.error('[MFA] startSession failed', e);
      return;
    }
    this.handoff.clear();

    const statusKey = String(response.status ?? '').toLowerCase();
    let destination = nextRouteFor(response);

    if (statusKey === 'tenantselectionrequired' || statusKey === 'passwordchangerequired') {
      console.info('[MFA] verified, next step', { status: response.status, destination });
      void this.router.navigate([destination || DEFAULT_HOME], {
        queryParams: {
          returnUrl: returnUrl ?? undefined,
          token: statusKey === 'passwordchangerequired' ? (response.passwordResetToken ?? undefined) : undefined
        }
      });
      return;
    }

    // A finished sign-in must never be routed back to a sign-in screen.
    if (!destination || isAuthPath(destination)) destination = DEFAULT_HOME;
    const target = returnUrl ?? destination;
    console.info('[MFA] verified, navigating', { status: response.status, target, fallback: destination });

    this.router.navigateByUrl(target, { replaceUrl: true })
      .then((ok) => (ok || target === destination ? ok : this.router.navigateByUrl(destination, { replaceUrl: true })))
      .then((ok) => {
        // Still here, or a guard bounced us to /login: the session is not being recognised.
        if (!ok || isAuthPath(this.router.url)) this.navigationFailed(target, this.router.url);
      })
      .catch((e) => {
        console.error('[MFA] navigation threw', e);
        this.navigationFailed(target, this.router.url);
      });
  }

  private navigationFailed(target: string, landedOn: string): void {
    this.submitting.set(false);
    this.errorMessage.set('You are verified, but the dashboard did not open. Refresh the page or sign in again.');
    console.warn(
      `[MFA] could not open ${target}; ended on ${landedOn}. ` +
      `Either that route does not exist (check DEFAULT_HOME against app.routes.ts) ` +
      `or the auth guard does not see the session that startSession() just saved.`
    );
  }

  private fail(error: Error): void {
    // The full server answer (field errors included) - the on-screen message is only the summary.
    console.warn('[MFA] verify rejected', error);
    this.submitting.set(false);
    this.digits.set([...EMPTY_DIGITS]);
    this.errorMessage.set(error.message);
    this.focusBox(0);

    // The server counts the attempts; at zero the transaction is dead and the only way is to start again.
    const current = this.challenge();
    if (!current || current.attemptsRemaining == null) return;
    const remaining = Math.max(0, current.attemptsRemaining - 1);
    this.challenge.set({ ...current, attemptsRemaining: remaining });
    if (remaining === 0) {
      setTimeout(() => {
        this.handoff.clear();
        void this.router.navigate(['/login']);
      }, 1500);
    }
  }

  private apply(raw: MfaChallengeResponse): void {
    const current = this.challenge();
    const updated = normalizeChallenge(raw) ?? raw;
    const merged: MfaChallengeResponse = { ...updated, challengeToken: updated.challengeToken || current?.challengeToken || '' };
    this.challenge.set(merged);
    this.handoff.updateChallenge(merged);
    this.infoMessage.set(merged.instruction ?? '');
    this.startCountdown(merged.expiresAtUtc);
  }

  private startCountdown(expiresAtUtc: string | undefined | null): void {
    this.stopCountdown();
    const expiresAt = parseUtc(expiresAtUtc);
    // No expiry, or one we cannot read: do not guess. The server rejects a stale challenge itself.
    if (Number.isNaN(expiresAt)) {
      this.hasExpiry.set(false);
      this.secondsRemaining.set(0);
      return;
    }
    this.hasExpiry.set(true);
    const tick = () => {
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      this.secondsRemaining.set(Math.max(0, remaining));
      if (remaining <= 0) this.stopCountdown();
    };
    tick();
    this.countdown = setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.countdown) clearInterval(this.countdown);
    this.countdown = null;
  }
}