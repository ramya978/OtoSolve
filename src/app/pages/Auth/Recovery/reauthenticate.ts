import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';
import { ReauthenticationViewResponse } from '../../../Shared/models/auth.model';
import { AuthSessionService } from '../../../Shared/services/auth-session.service';
import { AuthTokenService } from '../../../Shared/services/auth-token.service';
import { AuthFrame } from './auth-frame';

/**
 * "Confirm it is still you" - shown after the idle window closes or before a protected action.
 * The session is not over (the refresh cookie is still valid), so only the password - plus a
 * code where a second factor is enrolled - is asked, and the API checks it
 * (POST /users/reauthenticate). Nothing is compared in the browser.
 */
@Component({
  selector: 'app-reauthenticate',
  imports: [AuthFrame],
  templateUrl: './reauthenticate.html',
  styleUrl: '../Login/login.css'
})
export class Reauthenticate implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(AuthSessionService);
  private readonly tokens = inject(AuthTokenService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly view = signal<ReauthenticationViewResponse | null>(null);
  protected readonly password = signal('');
  protected readonly verificationCode = signal('');
  protected readonly showPassword = signal(false);
  private readonly draftToken = signal<string | null>(null);
  private returnUrl: string | null = null;

  protected readonly displayName = computed(() => this.tokens.displayName());
  protected readonly needsCode = computed(() => this.view()?.verificationCodeRequired ?? false);
  protected readonly summary = computed(
    () => this.view()?.protectedActionSummary ?? 'Your session has been idle. Confirm it is still you to carry on.'
  );
  protected readonly canSubmit = computed(() => {
    if (this.submitting() || !this.password().trim()) return false;
    return !this.needsCode() || this.verificationCode().trim().length >= 6;
  });

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    // Nothing to reauthenticate without an identity: that is a full sign-in.
    if (!this.tokens.user()) {
      void this.router.navigate(['/login']);
      return;
    }
    // Arrived by accident with a healthy session: back to work.
    if (!this.session.isReauthRequired() && !this.session.isIdleTimedOut()) {
      void this.router.navigateByUrl(this.returnUrl ?? '/app/dashboard');
      return;
    }

    this.authApi
      .getReauthenticationView(
        this.route.snapshot.queryParamMap.get('action') ?? undefined,
        this.route.snapshot.queryParamMap.get('draftToken') ?? undefined
      )
      .subscribe({
        next: (view) => {
          this.loading.set(false);
          this.view.set(view);
          this.draftToken.set(view.draftToken ?? null);
        },
        error: (error: Error) => {
          this.loading.set(false);
          this.errorMessage.set(error.message);
        }
      });
  }

  ngOnDestroy(): void {
    this.password.set('');
    this.verificationCode.set('');
  }

  protected confirm(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi
      .reauthenticate({
        password: this.password(),
        mfaCode: this.needsCode() ? this.verificationCode().trim() : null,
        draftToken: this.draftToken()
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.password.set('');
          this.verificationCode.set('');
          this.session.resumeSession();
          void this.router.navigateByUrl(this.returnUrl ?? '/app/dashboard');
        },
        error: (error: Error) => {
          this.submitting.set(false);
          this.password.set('');
          this.errorMessage.set(error.message);
        }
      });
  }

  protected signOut(): void {
    this.session.endSession();
  }
}
