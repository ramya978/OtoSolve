import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../../Service/auth-api.service';
import { MFA_METHOD_LABELS, MfaChallengeResponse, MfaMethodType, SignInResponse, nextRouteFor } from '../../../Shared/models/auth.model';
import { MfaMethodOptionResponse } from '../../../Shared/models/iam-contract.model';
import { AuthSessionService } from '../../../Shared/services/auth-session.service';
import { DeviceIdentityService } from '../../../Shared/services/device-identity.service';
import { MfaHandoffService } from '../../../Shared/services/mfa-handoff.service';
import { AuthFrame } from './auth-frame';

type EntryMode = 'code' | 'recovery';

/**
 * Second-factor step of a sign-in (POST /users/mfa-challenge/...). Reached from the sign-in
 * screen when the API answers `mfaRequired`; the challenge token comes from MfaHandoffService
 * (never from the URL). Offers the six-digit code, e-mail resend, other enrolled methods and a
 * one-time recovery code, then starts the session exactly like a normal sign-in.
 */
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

  protected readonly challenge = signal<MfaChallengeResponse | null>(null);
  protected readonly mode = signal<EntryMode>('code');
  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly infoMessage = signal('');
  protected readonly code = signal('');
  protected readonly recoveryCode = signal('');
  protected readonly secondsRemaining = signal(0);
  private rememberDevice = false;
  private countdown: ReturnType<typeof setInterval> | null = null;

  protected readonly isAuthenticatorApp = computed(() => this.challenge()?.methodType === 'authenticatorApp');
  protected readonly canSubmitCode = computed(() => this.code().length === 6 && !this.submitting());
  protected readonly canSubmitRecovery = computed(() => this.recoveryCode().trim().length >= 8 && !this.submitting());
  protected readonly alternatives = computed<MfaMethodOptionResponse[]>(() => {
    const current = this.challenge();
    return (current?.availableMethods ?? []).filter(
      (m) => m.methodType !== current?.methodType || (m.maskedDestination ?? null) !== (current?.maskedDestination ?? null)
    );
  });
  protected readonly recoveryAvailable = computed(() => this.challenge()?.recoveryCodeAccepted ?? false);
  protected readonly expired = computed(() => this.secondsRemaining() <= 0);
  protected readonly attemptsLabel = computed(() => {
    const n = this.challenge()?.attemptsRemaining ?? 0;
    return n === 1 ? '1 attempt remaining.' : `${n} attempts remaining.`;
  });
  protected readonly countdownLabel = computed(() => {
    const total = this.secondsRemaining();
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
  });

  ngOnInit(): void {
    const handoff = this.handoff.mfa();
    // Landing here without a challenge (typed URL, cleared transaction): start again.
    if (!handoff) {
      void this.router.navigate(['/login']);
      return;
    }
    this.challenge.set(handoff.challenge);
    this.rememberDevice = handoff.rememberDevice;
    this.infoMessage.set(handoff.challenge.instruction ?? '');
    this.startCountdown(handoff.challenge.expiresAtUtc);
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  protected onCode(event: Event): void {
    const el = event.target as HTMLInputElement;
    el.value = el.value.replace(/\D/g, '').slice(0, 6);
    this.code.set(el.value);
    this.errorMessage.set('');
  }

  protected onRecovery(event: Event): void {
    this.recoveryCode.set((event.target as HTMLInputElement).value);
    this.errorMessage.set('');
  }

  protected setMode(mode: EntryMode): void {
    this.mode.set(mode);
    this.errorMessage.set('');
  }

  protected methodLabel(method: MfaMethodType | undefined): string {
    return method ? MFA_METHOD_LABELS[method] : 'another method';
  }

  protected verify(event?: Event): void {
    event?.preventDefault();
    const challenge = this.challenge();
    if (!challenge || !this.canSubmitCode()) return;
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
        trustThisDevice: this.rememberDevice,
        deviceIdentifier: this.device.getDeviceIdentifier(),
        deviceName: this.device.getDeviceName(),
        clientType: 'web'
      })
      .subscribe({ next: (r) => this.complete(r), error: (e: Error) => this.fail(e) });
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
    if (!challenge || this.isAuthenticatorApp()) return;
    this.resending.set(true);
    this.errorMessage.set('');
    this.authApi.resendMfaChallenge(challenge.challengeToken ?? '').subscribe({
      next: (updated) => {
        this.resending.set(false);
        this.apply(updated);
        this.code.set('');
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
        this.code.set('');
        this.mode.set('code');
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
      this.handoff.clear();
      void this.router.navigate(['/login']);
    };
    if (!challenge) return leave();
    this.authApi
      .cancelMfaChallenge(challenge.challengeToken ?? '', 'Cancelled from the verification screen.')
      .subscribe({ next: leave, error: leave });
  }

  private complete(response: SignInResponse): void {
    this.submitting.set(false);
    // Read BEFORE the clear, which wipes the handoff it is stored in.
    const returnUrl = this.handoff.mfa()?.returnUrl ?? null;
    this.handoff.clear();
    this.session.startSession(response);

    const destination = nextRouteFor(response);
    if (response.status === 'passwordChangeRequired') {
      void this.router.navigate([destination], { queryParams: { token: response.passwordResetToken ?? undefined } });
      return;
    }
    void this.router.navigateByUrl(returnUrl ?? destination, { replaceUrl: true });
  }

  private fail(error: Error): void {
    this.submitting.set(false);
    this.code.set('');
    this.errorMessage.set(error.message);
    const current = this.challenge();
    if (!current) return;
    const remaining = Math.max(0, (current.attemptsRemaining ?? 1) - 1);
    this.challenge.set({ ...current, attemptsRemaining: remaining });
    if (remaining === 0) {
      setTimeout(() => {
        this.handoff.clear();
        void this.router.navigate(['/login']);
      }, 1500);
    }
  }

  private apply(updated: MfaChallengeResponse): void {
    const current = this.challenge();
    const merged: MfaChallengeResponse = { ...updated, challengeToken: updated.challengeToken || current?.challengeToken || '' };
    this.challenge.set(merged);
    this.handoff.updateChallenge(merged);
    this.infoMessage.set(merged.instruction ?? '');
    this.startCountdown(merged.expiresAtUtc);
  }

  private startCountdown(expiresAtUtc: string | undefined): void {
    this.stopCountdown();
    if (!expiresAtUtc) {
      this.secondsRemaining.set(0);
      return;
    }
    const tick = () => {
      const remaining = Math.floor((Date.parse(expiresAtUtc) - Date.now()) / 1000);
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
