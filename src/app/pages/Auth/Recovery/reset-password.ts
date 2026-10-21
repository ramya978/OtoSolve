import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';
import { ResetPasswordViewResponse } from '../../../Shared/models/auth.model';
import { AuthTokenService } from '../../../Shared/services/auth-token.service';
import { AuthFrame } from './auth-frame';

/**
 * Set a new password from a recovery link (also used after `passwordChangeRequired`). The token
 * (?token=... from the e-mail, or /auth/reset-password/:token) is checked with
 * GET /users/reset-password before the form is drawn, so a dead link fails at once and offers a
 * new one instead of failing after the person has typed a password.
 */
@Component({
  selector: 'app-reset-password',
  imports: [AuthFrame],
  templateUrl: './reset-password.html',
  styleUrl: '../Login/login.css'
})
export class ResetPassword implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);
  private readonly tokens = inject(AuthTokenService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly completed = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly view = signal<ResetPasswordViewResponse | null>(null);
  protected readonly isReactivation = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly showRequestNew = signal(false);
  protected readonly recoveryIdentifier = signal('');
  protected readonly requestingNew = signal(false);
  protected readonly secondsRemaining = signal(0);

  private token = '';
  private countdown: ReturnType<typeof setInterval> | null = null;

  protected readonly minimumLength = computed(() => this.view()?.passwordMinimumLength ?? 12);
  protected readonly rules = computed(() => {
    const p = this.password();
    return [
      { label: `At least ${this.minimumLength()} characters`, ok: p.length >= this.minimumLength() },
      { label: 'An upper-case letter', ok: /[A-Z]/.test(p) },
      { label: 'A lower-case letter', ok: /[a-z]/.test(p) },
      { label: 'A number', ok: /\d/.test(p) },
      { label: 'A symbol', ok: /[^A-Za-z0-9]/.test(p) }
    ];
  });
  protected readonly match = computed(() => this.confirm().length > 0 && this.confirm() === this.password());
  protected readonly linkExpired = computed(() => this.view() !== null && !this.view()!.isTokenValid);
  protected readonly canSubmit = computed(
    () => this.rules().every((r) => r.ok) && this.match() && !this.submitting() && !this.linkExpired()
  );
  protected readonly countdownLabel = computed(() => {
    const t = this.secondsRemaining();
    return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? this.route.snapshot.paramMap.get('token') ?? '';
    this.isReactivation.set(this.route.snapshot.queryParamMap.get('mode') === 'reactivate');

    if (!this.token) {
      this.loading.set(false);
      this.errorMessage.set('This link is incomplete. Open the link from the e-mail again, or ask for a new one.');
      this.showRequestNew.set(true);
      return;
    }

    this.authApi.getResetPasswordView(this.token).subscribe({
      next: (view) => {
        this.loading.set(false);
        this.view.set(view);
        if (!view.isTokenValid) {
          this.errorMessage.set(view.message ?? 'That link has expired or has already been used. Ask for a new one.');
          this.showRequestNew.set(true);
          return;
        }
        if (view.tokenExpiresAtUtc) this.startCountdown(view.tokenExpiresAtUtc);
      },
      error: (error: Error) => {
        this.loading.set(false);
        this.errorMessage.set(error.message);
        this.showRequestNew.set(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi
      .resetPassword({ token: this.token, password: this.password(), confirmPassword: this.confirm() })
      .subscribe({
        next: (outcome) => {
          this.submitting.set(false);
          this.completed.set(true);
          this.successMessage.set(outcome.message ?? 'Your password has been changed.');
          this.stopCountdown();
          // Every session was revoked server-side, so the local copy is cleared too.
          this.tokens.clear();
        },
        error: (error: Error) => {
          this.submitting.set(false);
          this.errorMessage.set(error.message);
          this.showRequestNew.set(true);
        }
      });
  }

  protected requestNewLink(event: Event): void {
    event.preventDefault();
    const value = this.recoveryIdentifier().trim();
    if (!value) {
      this.errorMessage.set('Enter the e-mail address or username on the account.');
      return;
    }
    this.requestingNew.set(true);
    this.authApi.requestNewRecoveryLink(value).subscribe({
      next: (outcome) => {
        this.requestingNew.set(false);
        this.successMessage.set(
          outcome.message ?? 'If that account exists, we have sent a password reset link to its e-mail address.'
        );
        this.errorMessage.set('');
      },
      error: (error: Error) => {
        this.requestingNew.set(false);
        this.errorMessage.set(error.message);
      }
    });
  }

  protected goToSignIn(): void {
    void this.router.navigate(['/login']);
  }

  private startCountdown(expiresAtUtc: string): void {
    this.stopCountdown();
    const tick = () => {
      const remaining = Math.floor((Date.parse(expiresAtUtc) - Date.now()) / 1000);
      this.secondsRemaining.set(Math.max(0, remaining));
      if (remaining <= 0) {
        this.stopCountdown();
        const current = this.view();
        if (current) this.view.set({ ...current, isTokenValid: false });
        this.errorMessage.set('This link has expired. Ask for a new one below.');
        this.showRequestNew.set(true);
      }
    };
    tick();
    this.countdown = setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.countdown) clearInterval(this.countdown);
    this.countdown = null;
  }
}
