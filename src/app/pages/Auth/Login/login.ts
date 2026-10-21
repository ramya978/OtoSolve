import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';
import { MfaChallengeResponse, SignInResponse, nextRouteFor } from '../../../Shared/models/auth.model';
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
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(AuthSessionService);
  private readonly tokens = inject(AuthTokenService);
  private readonly device = inject(DeviceIdentityService);
  private readonly handoff = inject(MfaHandoffService);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly remember = signal(false);
  protected readonly busy = signal(false);
  protected readonly fieldErrors = signal<FieldErrors>({});

  /** Transient message shown as a toast (errors + the sign-in confirmation). */
  protected readonly toast = signal<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Where to go after signing in - set by the auth guard when a page was blocked. */
  private readonly returnUrl: string | null = this.safeReturnUrl();

  constructor() {
    // Arriving here always means "start again": a half-finished MFA transaction is dropped.
    this.handoff.clear();

    // already signed in? straight to the workspace (the guest guard also covers this)
    if (this.tokens.user()) {
      void this.router.navigateByUrl(this.returnUrl ?? '/app/dashboard', { replaceUrl: true });
    }
  }

  protected readonly canSubmit = computed(
    () => this.identifier().trim().length > 0 && this.password().length > 0 && !this.busy()
  );

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;

    if (!navigator.onLine) {
      this.showToast('No internet connection detected. Reconnect and try again.', 'danger');
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

    this.busy.set(true);
    this.authApi
      .signIn({
        identifier,
        password: this.password(),
        clientType: 'web',
        // A stable, anonymous browser id: it is what makes "remember this device" possible.
        deviceIdentifier: this.device.getDeviceIdentifier(),
        deviceName: this.device.getDeviceName(),
        rememberMe: this.remember()
      })
      .subscribe({
        next: (response) => {
          this.busy.set(false);
          this.password.set('');
          this.routeByStatus(response);
        },
        error: (error: Error) => {
          this.busy.set(false);
          this.password.set('');
          this.showToast(error?.message || 'Sign-in failed. Please try again.', 'danger');
        }
      });
  }

  /** Sends the person to whichever screen the answer's status calls for. */
  private routeByStatus(response: SignInResponse): void {
    const destination = nextRouteFor(response);

    switch (response.status) {
      case 'mfaRequired': {
        // No access token yet - only a short-lived challenge token proving the password step
        // succeeded. It is held in memory (sessionStorage fallback for a refresh) and never put
        // in the URL, where it would end up in history, Referer headers and access logs.
        if (!response.challengeToken) {
          this.showToast('The second-factor step could not be started. Try signing in again.', 'danger');
          return;
        }

        const challenge: MfaChallengeResponse = {
          ...response.mfaChallenge,
          challengeToken: response.challengeToken,
          methodType: response.mfaChallenge?.methodType ?? response.mfaMethodType,
          maskedDestination: response.mfaChallenge?.maskedDestination ?? response.mfaMaskedDestination ?? null
        };

        // The returnUrl rides in the handoff, so the page asked for survives the MFA step.
        this.handoff.store(challenge, this.remember(), this.returnUrl);
        void this.router.navigate([destination]).then((arrived) => {
          if (!arrived) this.showToast('The verification step could not be opened. Try signing in again.', 'danger');
        });
        return;
      }

      case 'tenantSelectionRequired': {
        // A root user: properly signed in (the token is real); the Organisation is chosen from
        // the switcher in the top bar.
        this.session.startSession(response);
        void this.router.navigateByUrl(this.returnUrl ?? destination, { replaceUrl: true });
        return;
      }

      case 'passwordChangeRequired': {
        this.session.startSession(response);
        this.showToast(response.message ?? 'Your password must be changed before you continue.', 'danger');
        // The returnUrl is NOT honoured here: it would only bounce straight back.
        void this.router.navigate([destination], {
          queryParams: { token: response.passwordResetToken ?? undefined }
        });
        return;
      }

      case 'succeeded':
      default: {
        this.session.startSession(response);
        this.showToast(`Welcome back, ${this.tokens.displayName() || 'there'}.`, 'ok');
        void this.router.navigateByUrl(this.returnUrl ?? destination, { replaceUrl: true });
      }
    }
  }

  /** "Forgot password?" - opens the recovery screen. */
  protected forgotPassword(): void {
    void this.router.navigate(['/auth/forgot-password']);
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
}
