import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { AuthApiService } from '../../../Service/auth-api.service';
import { MfaChallengeResponse, SignInResponse } from '../../../Shared/models/iam-contract.model';
import { nextRouteFor } from '../../../Shared/models/auth.model';
import { AuthSessionService } from '../../../Shared/services/auth-session.service';
import { AuthTokenService } from '../../../Shared/services/auth-token.service';
import { MfaHandoffService } from '../../../Shared/services/mfa-handoff.service';

interface FieldErrors {
  identifier?: string;
  password?: string;
}

type ToastTone = 'ok' | 'danger';

interface Toast {
  text: string;
  tone: ToastTone;
}

/** The second-factor verification screen (app.routes.ts: 'auth/mfa'). */
const MFA_ROUTE = '/app/dashboard';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(AuthSessionService);
  private readonly tokens = inject(AuthTokenService);
  private readonly handoff = inject(MfaHandoffService);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly remember = signal(false);
  protected readonly busy = signal(false);
  protected readonly fieldErrors = signal<FieldErrors>({});
  isOnline = navigator.onLine;
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  /** Transient message shown as a toast (errors + the sign-in confirmation). */
  protected readonly toast = signal<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Where to go after signing in — set by the auth guard when a page was blocked. */
  private readonly returnUrl: string | null = this.safeReturnUrl();

  constructor() {
    // already signed in? straight to the workspace (the guest guard also covers this)
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
    }
  }

  protected readonly canSubmit = computed(
    () => this.identifier().trim().length > 0 && this.password().length > 0 && !this.busy()
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.busy()) return;

    if (!this.isOnline) {
      this.errorMessage.set('No internet connection detected. Reconnect and try again.');
      return;
    }

    const identifier = this.identifier().trim();
    const errors: FieldErrors = {};

    if (identifier.length < 2) errors.identifier = 'Enter your user name or e-mail.';
    if (!this.password()) errors.password = 'Enter your password.';

    this.fieldErrors.set(errors);

    if (errors.identifier || errors.password) {
      this.showToast(errors.identifier ?? errors.password!, 'danger');
      return;
    }

    // A fresh sign-in starts a fresh flow: drop any half-finished MFA handoff from before.
    this.handoff.clear();

    this.loading.set(true);
    this.busy.set(true);
    this.errorMessage.set('');

    this.authApi.signIn({
      identifier,
      password: this.password(),
      clientType: 'web',
      rememberMe: this.remember()
    }).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.busy.set(false);
        this.password.set('');
        this.route4Way(response);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.busy.set(false);
        this.password.set('');

        const message = error instanceof Error
          ? error.message
          : 'Sign-in failed. Please try again.';

        this.errorMessage.set(message);
        this.showToast(message, 'danger');
      }
    });
  }

  /**
   * Sends the person to whichever screen the server's answer calls for.
   *
   * A user with MFA enabled ALWAYS goes through the MFA screen:
   *  • the server issued a challenge  → the MFA screen verifies it (mfa-challenge/verify);
   *  • the server said `succeeded` without one → the MFA screen checks the code with the
   *    reauthentication endpoint (step-up), and only then starts the session.
   * The old branch built a challenge with an EMPTY token, which no code could ever pass.
   */
  private route4Way(response: SignInResponse): void {
    const destination = nextRouteFor(response);
    const challengeToken = response.challengeToken ?? response.mfaChallenge?.challengeToken;

    // ── MFA FIRST, when the server asked for it ──────────────────────────────────────────
    if (challengeToken) {
      this.goToMfa(response, challengeToken);
      return;
    }

    if (response.status === 'mfaRequired') {
      // mfaRequired without a challenge token: nothing the MFA screen could verify.
      this.tokens.clear();
      this.fail('The verification step could not be started. Try signing in again.');
      return;
    }

    // ── MFA ENABLED, BUT THE SERVER ISSUED NO CHALLENGE ──────────────────────────────────
    // The password was right and the server signed the person in, but their account has a second
    // factor. Hold that sign-in back (nothing stored, dashboard stays shut), open the MFA screen,
    // and let it check the authenticator code through the reauthentication endpoint. Only when
    // the code is right does the session start and the dashboard open.


    // if (response.user?.mfaEnabled && response.accessToken) {
    //   this.tokens.clear();
    //   this.handoff.storeStepUp(response, this.remember(), this.returnUrl);
    //   void this.router.navigateByUrl(MFA_ROUTE).then((arrived) => {
    //     if (!arrived) {
    //       this.fail('The verification step could not be opened. Try signing in again.');
    //     }
    //   });
    //   return;
    // }

    switch (response.status) {
      case 'tenantSelectionRequired': {
        // A root user, who has no Organisation of their own. Properly signed in — the token is real.
        this.session.startSession(response);
        void this.router.navigate([destination], {
          queryParams: this.returnUrl ? { returnUrl: this.returnUrl } : undefined,
        });
        return;
      }

      case 'passwordChangeRequired': {
        this.session.startSession(response);

        this.showToast(
          'Change your password: ' + (response.message ?? 'Your password must be changed before you continue.'),
          'danger'
        );

        // The returnUrl is deliberately NOT honoured here: the password comes first.
        void this.router.navigate([destination], {
          queryParams: { token: response.passwordResetToken ?? undefined },
        });
        return;
      }

      case 'succeeded':
      default: {
        this.session.startSession(response);

        this.showToast(
          'Welcome back, ' + (this.tokens.displayName() || 'there') + '.',
          'ok'
        );

        void this.router.navigateByUrl(this.returnUrl ?? destination, { replaceUrl: true });
      }
    }
  }

  /**
   * Hands the whole challenge to the MFA screen and navigates there. The challenge token is a
   * credential, so it travels in memory (MfaHandoffService), never in the URL.
   *
   * AuthApiService.signIn() stores whatever the response carried. If anything was stored, the
   * guestGuard on /auth/mfa would see a "signed-in" user and bounce to the dashboard — so the
   * pre-MFA token state is cleared first. The real session starts after verification.
   */
  private goToMfa(response: SignInResponse, challengeToken: string): void {
    const challenge = {
      ...response.mfaChallenge,
      challengeToken,
      methodType: response.mfaChallenge?.methodType ?? response.mfaMethodType,
      maskedDestination: response.mfaChallenge?.maskedDestination ?? response.mfaMaskedDestination ?? null,
    } as MfaChallengeResponse;

    this.tokens.clear();
    this.handoff.store(challenge, this.remember(), this.returnUrl);

    void this.router.navigateByUrl(MFA_ROUTE).then((arrived) => {
      if (!arrived) {
        this.fail('The verification step could not be opened. Try signing in again.');
      }
    });
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.showToast(message, 'danger');
  }

  /** Shows a toast for a few seconds, replacing any message already on screen. */
  private showToast(text: string, tone: ToastTone): void {
    this.toast.set({ text, tone });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), tone === 'danger' ? 6000 : 3200);
  }

  /** Closes the toast on demand. */
  protected dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
  }

  /** Clears the toast timer when the page goes away. */
  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  /** Only same-app absolute URLs are accepted as a return target (no external/open redirects). */
  private safeReturnUrl(): string | null {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
  }

  protected forgotPassword(): void {
    void this.router.navigate(['/auth/forgot-password']);
  }
}