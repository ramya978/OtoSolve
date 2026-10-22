import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { AuthApiService } from '../../../Service/auth-api.service';
import { MfaChallengeResponse, SignInResponse } from '../../../Shared/models/iam-contract.model';
import { nextRouteFor } from '../../../Shared/models/auth.model';
import { AuthSessionService } from '../../../Shared/services/auth-session.service';
import { AuthTokenService } from '../../../Shared/services/auth-token.service';
import { DeviceIdentityService } from '../../../Shared/services/device-identity.service';
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

@Component({
  selector: 'app-login',
  templateUrl:'./login.html',
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



    /** Sends the person to whichever screen the status calls for. */
  private route4Way(response: SignInResponse): void {
    const destination = nextRouteFor(response);

    switch (response.status) {
      case 'mfaRequired': {
        // No access token exists yet — only a short-lived challenge token proving the password
        // step succeeded. It is held in memory (with a sessionStorage fallback for a page
        // refresh) rather than pushed through the URL, where it would end up in browser history,
        // in the Referer header of the next request, and in server access logs. The challenge
        // token is a credential and deserves the same care the password just had.
        if (!response.challengeToken) {
          this.errorMessage.set('The second-factor step could not be started. Try signing in again.');
          return;
        }

        // THE WHOLE CHALLENGE, as the server issued it. The verification screen counts down to
        // its expiry and offers its other methods and recovery codes; built from the three flat
        // fields alone, it had no expiry and treated every code as already expired.
        const challenge: MfaChallengeResponse = {
          ...response.mfaChallenge,
          challengeToken: response.challengeToken,
          methodType: response.mfaChallenge?.methodType ?? response.mfaMethodType,
          maskedDestination: response.mfaChallenge?.maskedDestination ?? response.mfaMaskedDestination ?? null,
        };

        // The returnUrl rides in the handoff, not in the URL — see the note on MfaHandoff.
        // Dropping it here is what used to send every second-factor sign-in to the dashboard
        // regardless of the page they had actually asked for.
        this.handoff.store(challenge, this.remember(), this.returnUrl);
        void this.router.navigate([destination]).then((arrived) => {
          if (!arrived) {
            this.errorMessage.set('The verification step could not be opened. Try signing in again.');
          }
        });
        return;
      }

      case 'tenantSelectionRequired': {
        // A root user, who has no Organisation of their own. They are properly signed in - the
        // token in this response is real - and they go straight to the Organisation directory,
        // which is the screen their job actually starts on. Organisation-scoped screens ask
        // which Organisation at the point they need to know, not before.
        this.session.startSession(response);

        // FORWARDED, because select-organisation already reads a returnUrl and acts on it — it
        // simply never received one, so the branch was unreachable and a root user who followed
        // a deep link lost it at this hop. A query parameter is right here where it was wrong for
        // MFA: this one carries a route, not a credential.
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

        // The returnUrl is deliberately NOT honoured here: the person is signed in but must
        // deal with the password first, and dropping them on the page they asked for would
        // simply bounce them straight back.
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

        void this.router.navigateByUrl(this.returnUrl ?? destination);
      }
    }
  }

  /** Shows a toast for a few seconds, replacing any message already on screen. */
  private showToast(text: string, tone: ToastTone): void {
    this.toast.set({ text, tone });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), tone === 'danger' ? 6000 : 3200);
  }

  /** Closes the toast on demand with slide-out animation. */
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