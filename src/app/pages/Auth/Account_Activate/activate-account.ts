import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toDataURL } from 'qrcode';

import { AuthApiService } from '../../../Service/auth-api.service';
import { AuthSessionService } from '../../../Shared/services/auth-session.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { MFA_METHOD_LABELS } from '../../../Shared/models/auth.model';
import { InvitationPreviewResponse, MfaEnrolmentResponse, MfaMethodType } from '../../../Shared/models/iam-contract.model';

const LOGIN_PATH = '/auth/sign-in';
const DASHBOARD_PATH = '/app/dashboard';

/**
 * IAM-AUTH-02 — Accept invitation and activate account.
 *
 * THE FOUR STEPS
 * --------------
 *   1. **Your details** — read-only facts pulled from the invitation token. Nothing is editable
 *      here on purpose: these are the terms of the access an administrator approved, and letting
 *      the invited person change their own role or scope would defeat the approval entirely.
 *   2. **Password** — with a live checklist so nothing is a surprise at submit time.
 *   3. **Two-step verification** — OPTIONAL unless the organisation requires it. It runs as three
 *      small screens so the page never gets long:
 *        3a. choose a method, then press Continue (or Enter on the chosen method)
 *        3b. scan the QR code (or read the e-mail) and type the code
 *        3c. confirmed, then Activate account
 *      Skipping it activates the account normally; the person can add a factor later from My Security.
 *   4. **Done** — the recovery codes, shown once and never again.
 *
 * HOW AUTHENTICATOR SETUP ACTUALLY WORKS HERE
 * -------------------------------------------
 *   a. Continue on "Authenticator application" calls `begin-mfa-enrolment`. The server creates a
 *      random shared secret, keeps an encrypted copy, and returns the readable copy exactly once.
 *   b. This screen turns the returned `otpauth://` URI into a QR code with the `qrcode` library.
 *      Scanning it copies the secret into the phone. There is nothing to type.
 *   c. The phone then computes a fresh six-digit code every thirty seconds, from the secret and
 *      the clock. Nothing is ever sent between phone and server — which is why it works offline.
 *   d. The person types the current code, and `verify-mfa-method` recomputes the same code
 *      server-side. Matching proves the secret arrived intact, so the method goes Active.
 *
 * That is why the QR code appears **here**, once, and never again on the sign-in screen.
 */
type Step = 'details' | 'password' | 'security' | 'complete';

/** Brand shown on the page and in the downloaded recovery-codes file. */
const BRAND = 'OtoSolve';

/** Inline SVG paths, so the page needs no icon font. */
const ICONS: Record<string, string> = {
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M7 7l10 10M17 7L7 17',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18 M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1 M6.3 6.3A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-1 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  shield: 'M12 3l7.5 3v6c0 4.6-3.1 8.2-7.5 9.2C7.6 20.2 4.5 16.6 4.5 12V6L12 3z M9 12l2.2 2.2L15.2 10',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7 M20 4v5h-5',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  alert: 'M12 3l10 18H2L12 3z M12 10v4 M12 17.5h.01',
  qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2v2h-2z M14 18h2v2h-2z M18 18h2v2h-2z',
  mailx: 'M3 6h18v12H3z M3 7l9 6 9-6 M9 11l6 6 M15 11l-6 6'
};

/** Copy for each step (kept for reuse; the card layout shows the step heading itself). */
const STEP_COPY: Record<Step, { title: string; text: string }> = {
  details: { title: 'You have been invited', text: 'Check the access your administrator approved, then set up your account in three short steps.' },
  password: { title: 'Choose a strong password', text: 'It is the first lock on your account. Make it long and keep it to yourself.' },
  security: { title: 'Add a second lock', text: 'A one-time code means a stolen password alone cannot open your account.' },
  complete: { title: 'You are all set', text: 'Keep your recovery codes safe. They are the way back in if you lose your phone.' }
};

@Component({
  selector: 'app-activate-account',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './activate-account.html',
  styleUrls: ['./activate-account.css'],
})
export class ActivateAccount implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(AuthSessionService);

  // ---- Toast (local) --------------------------------------------------------------------------
  readonly toastMsg = signal<{ title: string; text: string } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  dismissToast(): void { this.toastMsg.set(null); }
  private notify(title: string, text: string): void {
    this.toastMsg.set({ title, text });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(null), 3500);
  }
  /** Add ?state=expired to the address to preview the "invitation cannot be used" screen. */

  // ---- Presentation helpers -------------------------------------------------------------------
  readonly brand = BRAND;
  readonly year = new Date().getFullYear();
  readonly stepLabels = ['Your details', 'Password', 'Two-step', 'Done'];
  readonly stepCopy = computed(() => STEP_COPY[this.step()]);
  icon(name: string): string { return ICONS[name] ?? ''; }

  // ---- Screen state --------------------------------------------------------------------------
  readonly step = signal<Step>('details');
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly infoMessage = signal('');
  readonly token = signal('');
  readonly invitation = signal<InvitationPreviewResponse | null>(null);

  // ---- Step 2: password -----------------------------------------------------------------------
  password = '';
  confirmPassword = '';
  readonly passwordValue = signal('');
  readonly confirmValue = signal('');
  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);
  readonly termsAccepted = signal(false);

  // ---- Step 3: second factor --------------------------------------------------------------------
  readonly enrolMfa = signal(false);
  readonly selectedMethod = signal<MfaMethodType>('authenticatorApp');
  readonly setup = signal<MfaEnrolmentResponse | null>(null);
  readonly qrDataUrl = signal('');
  readonly qrFailed = signal(false);
  readonly settingUp = signal(false);
  readonly methodVerified = signal(false);
  readonly secretVisible = signal(false);
  readonly secretCopied = signal(false);
  /** A signal, so canVerifyMethod re-evaluates as the passcode is typed. */
  readonly verificationCode = signal('');

  // ---- Step 4: recovery codes ---------------------------------------------------------------------
  readonly recoveryCodes = signal<string[]>([]);
  readonly recoveryNotice = signal('');
  readonly recoveryAcknowledged = signal(false);
  readonly mfaEnrolledResult = signal(false);
  readonly userCode = signal('');

  // =========================================================================================
  // Password rules
  // =========================================================================================

  readonly minimumLength = computed(() => this.invitation()?.passwordMinimumLength ?? 12);

  // Each rule is checked only when the SERVER says it applies. Hard-coding all five would mean
  // the checklist demands a symbol on an Organisation whose policy does not, and the person
  // would be told their perfectly acceptable password is wrong.
  readonly hasLength = computed(() => this.passwordValue().length >= this.minimumLength());

  readonly hasUpper = computed(
    () => !this.requires('passwordRequireUppercase') || /[A-Z]/.test(this.passwordValue()));

  readonly hasLower = computed(
    () => !this.requires('passwordRequireLowercase') || /[a-z]/.test(this.passwordValue()));

  readonly hasNumber = computed(
    () => !this.requires('passwordRequireDigit') || /\d/.test(this.passwordValue()));

  readonly hasSymbol = computed(
    () => !this.requires('passwordRequireNonAlphanumeric') || /[^A-Za-z0-9]/.test(this.passwordValue()));

  readonly rulesMet = computed(
    () => [this.hasLength(), this.hasUpper(), this.hasLower(), this.hasNumber(), this.hasSymbol()].filter(Boolean).length,
  );

  /** Whether the Organisation policy insists on one of the optional character classes. */
  private requires(
    rule: 'passwordRequireUppercase' | 'passwordRequireLowercase'
      | 'passwordRequireDigit' | 'passwordRequireNonAlphanumeric',
  ): boolean {
    // Defaults to true when the invitation has not loaded, so the checklist starts strict and
    // relaxes once the real policy arrives - never the other way round.
    return this.invitation()?.[rule] ?? true;
  }

  readonly strengthPercent = computed(() => this.rulesMet() * 20);
  readonly strengthLabel = computed(
    () => ['Very weak', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'][this.rulesMet()] ?? 'Very weak',
  );
  readonly strengthClass = computed(() => {
    const met = this.rulesMet();
    return met <= 2 ? 'bg-danger' : met === 3 ? 'bg-warning' : met === 4 ? 'bg-info' : 'bg-success';
  });

  readonly passwordsMatch = computed(
    () => this.confirmValue().length > 0 && this.confirmValue() === this.passwordValue(),
  );

  readonly canLeavePasswordStep = computed(
    () => this.rulesMet() === 5 && this.passwordsMatch() && this.termsAccepted(),
  );

  // =========================================================================================
  // Second-factor rules
  // =========================================================================================

  readonly isAuthenticatorSelected = computed(() => this.selectedMethod() === 'authenticatorApp');
  readonly mfaMandatory = computed(() => this.invitation()?.mfaMandatory ?? false);

  /** The factors this Organisation permits, in the order the server wants them offered. */
  readonly allowedMethods = computed<MfaMethodType[]>(
    () => this.invitation()?.allowedMfaMethods ?? ['authenticatorApp', 'email']);

  readonly canVerifyMethod = computed(
    () => this.setup() !== null && this.verificationCode().trim().length >= 6 && !this.submitting(),
  );

  /** Activation is allowed when MFA was skipped, or when a chosen factor is confirmed. */
  readonly canActivate = computed(() => {
    if (!this.enrolMfa()) {
      return !this.mfaMandatory() && !this.submitting();
    }

    return this.methodVerified() && !this.submitting();
  });

  readonly stepNumber = computed(() => {
    switch (this.step()) {
      case 'details': return 1;
      case 'password': return 2;
      case 'security': return 3;
      default: return 4;
    }
  });

  // =========================================================================================
  // Lifecycle
  // =========================================================================================

  ngOnInit(): void {
    // The e-mail sends ?token=...; /auth/invitation/:token stays supported for links already out.
    const token = this.route.snapshot.queryParamMap.get('token') ?? this.route.snapshot.paramMap.get('token') ?? '';
    this.token.set(token);

    if (!token) {
      this.loading.set(false);
      this.errorMessage.set('This activation link is incomplete. Open the link from your invitation e-mail again.');
      return;
    }

    this.authApi.previewInvitation(token).subscribe({
      next: (view) => {
        this.loading.set(false);
        this.invitation.set(view);
        if (!view.isValid) { this.errorMessage.set(view.message ?? 'That invitation link is not valid.'); return; }
        // Start on whichever factor the organisation lists first.
        const [first] = view.allowedMfaMethods ?? [];
        if (first) this.selectedMethod.set(first);
        // Mandatory: the toggle starts on and cannot be turned off. Otherwise it is the person's choice.
        this.enrolMfa.set(view.mfaMandatory === true);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(apiErrorMessage(e, 'The invitation could not be read.'));
      }
    });
  }

  // =========================================================================================
  // Navigation
  // =========================================================================================

  goToPassword(): void {
    this.step.set('password');
    this.errorMessage.set('');
  }

  goToSecurity(): void {
    if (!this.canLeavePasswordStep()) {
      return;
    }

    this.step.set('security');
    this.errorMessage.set('');
  }

  backToDetails(): void {
    this.step.set('details');
    this.errorMessage.set('');
  }

  backToPassword(): void {
    this.step.set('password');
    this.errorMessage.set('');
  }

  // =========================================================================================
  // Step 2 inputs
  // =========================================================================================

  onPasswordInput(value: string): void {
    this.password = value;
    this.passwordValue.set(value);
  }

  onConfirmInput(value: string): void {
    this.confirmPassword = value;
    this.confirmValue.set(value);
  }

  togglePassword(): void {
    this.showPassword.update((shown) => !shown);
  }

  toggleConfirm(): void {
    this.showConfirm.update((shown) => !shown);
  }

  toggleTerms(checked: boolean): void {
    this.termsAccepted.set(checked);
  }

  /** ENTER FLOW refs — Enter in a field first moves focus to the step button, then advances. */
  @ViewChild('confirmInput') private readonly confirmInput?: ElementRef<HTMLInputElement>;
  @ViewChild('continueBtn') private readonly continueBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('verifyCodeBtn') private readonly verifyCodeBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('codeInput') private readonly codeInput?: ElementRef<HTMLInputElement>;

  /**
   * ENTER FLOW (step 2) — password field + Enter → confirm field-ku focus;
   * confirm field + Enter → Continue button-ku focus poyi auto next step pogum.
   */
  onPasswordStepEnter(next: 'confirm' | 'submit', event: Event): void {
    event.preventDefault();

    if (next === 'confirm') {
      this.confirmInput?.nativeElement.focus();
      return;
    }

    this.continueBtn?.nativeElement.focus();
    this.goToSecurity();
  }

  /**
   * ENTER FLOW (step 3, verify box) — code field + Enter → Verify button focus + auto verify.
   */
  onSetupCodeEnter(event: Event): void {
    event.preventDefault();
    this.verifyCodeBtn?.nativeElement.focus();
    this.verifyMethod();
  }

  /**
   * ENTER FLOW (step 3a, method list) — Enter on a method that is already selected moves on to
   * the next screen. Enter on an unselected one just selects it (the button's normal click).
   */
  onMethodEnter(method: MfaMethodType, event: Event): void {
    if (this.selectedMethod() !== method) {
      return;
    }

    event.preventDefault();
    this.startSetup();
  }

  // =========================================================================================
  // Step 3 — second factor
  // =========================================================================================

  /** Turning the toggle off discards any half-finished setup, so nothing dangles. */
  toggleEnrolMfa(enabled: boolean): void {
    if (this.mfaMandatory() && !enabled) {
      return;
    }

    this.enrolMfa.set(enabled);
    this.errorMessage.set('');

    if (!enabled) {
      this.resetSetup();
    }
  }

  chooseMethod(method: MfaMethodType): void {
    if (this.selectedMethod() === method) {
      return;
    }

    // Switching method invalidates whatever was set up for the previous one.
    this.selectedMethod.set(method);
    this.resetSetup();
    this.errorMessage.set('');
  }

  /** From the scan / code screen back to the method list. */
  changeMethod(): void {
    this.resetSetup();
    this.errorMessage.set('');
  }

  private resetSetup(): void {
    this.setup.set(null);
    this.qrDataUrl.set('');
    this.qrFailed.set(false);
    this.secretVisible.set(false);
    this.methodVerified.set(false);
    this.verificationCode.set('');
  }

  /** How each factor is described on the picker. Kept beside the hint so the two stay in step. */
  methodLabel(method: MfaMethodType): string {
    return MFA_METHOD_LABELS[method];
  }

  /** One line of plain explanation under each option, so the choice is an informed one. */
  methodHint(method: MfaMethodType): string {
    switch (method) {
      case 'authenticatorApp':
        return 'Codes are generated on your phone and work without a signal.';
      case 'email':
        return 'A code is e-mailed to you each time you sign in.';
      default:
        return '';
    }
  }

  /** Starts the setup: creates the secret (or sends a code) and draws the QR. */
  startSetup(): void {
    this.settingUp.set(true);
    this.errorMessage.set('');
    this.qrFailed.set(false);
    this.qrDataUrl.set('');
    this.verificationCode.set('');

    this.authApi.beginInvitationMfaEnrolment({ token: this.token(), methodType: this.selectedMethod() }).subscribe({
      next: (setup: MfaEnrolmentResponse) => {
        this.settingUp.set(false);
        this.setup.set(setup);
        this.infoMessage.set(setup.message ?? '');
        if (setup.provisioningUri) void this.renderQrCode(setup.provisioningUri);
        if (this.selectedMethod() === 'email') {
          this.notify('Code sent', setup.message ?? 'We sent a six-digit code to your e-mail.');
          // the e-mail screen has nothing to scan, so the cursor goes straight to the code box
          setTimeout(() => this.codeInput?.nativeElement.focus(), 60);
        }
      },
      error: (e: unknown) => {
        this.settingUp.set(false);
        this.errorMessage.set(apiErrorMessage(e, 'The second factor could not be set up.'));
      }
    });
  }

  /**
   * Draws the otpauth URI as a QR code.
   *
   * A data URL on an <img> is used rather than a <canvas>, because a canvas only exists once
   * Angular has rendered that branch of the template — which was the cause of the old "Generating
   * QR code…" spinner that sometimes never went away. An image has no such timing problem.
   *
   * If the library fails for any reason, the setup key is shown instead, so the person is never stuck.
   */
  private async renderQrCode(otpAuthUri: string): Promise<void> {
    try {
      const url = await toDataURL(otpAuthUri, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
      // ignore a late result if the person already went back or asked for a new key
      if (this.setup()?.provisioningUri !== otpAuthUri) return;
      this.qrDataUrl.set(url);
      this.qrFailed.set(false);
    } catch {
      if (this.setup()?.provisioningUri !== otpAuthUri) return;
      this.qrDataUrl.set('');
      this.qrFailed.set(true);
      this.secretVisible.set(true);
    }
  }

  toggleSecret(): void {
    this.secretVisible.update((shown) => !shown);
  }

  copySecret(): void {
    const secret = this.setup()?.sharedSecret;
    if (!secret) {
      return;
    }

    void navigator.clipboard.writeText(secret.replace(/\s/g, '')).then(() => {
      this.secretCopied.set(true);
      setTimeout(() => this.secretCopied.set(false), 2000);
    });
  }

  /** Confirms the setup with the first passcode, before the account is activated. */
  verifyMethod(): void {
    if (!this.setup() || !this.canVerifyMethod()) return;
    this.submitting.set(true);
    this.errorMessage.set('');

    const setup = this.setup();
    this.authApi.verifyInvitationMfaMethod({ token: this.token(), methodId: setup!.methodId!, code: this.verificationCode().trim() }).subscribe({
      next: (outcome) => {
        this.submitting.set(false);
        this.methodVerified.set(true);
        this.infoMessage.set(outcome.message ?? '');
        this.notify('Verified', 'Your second factor is confirmed.');
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.verificationCode.set('');
        this.errorMessage.set(apiErrorMessage(e, 'That code was not accepted.'));
      }
    });
  }

  // =========================================================================================
  // Step 4 — activate
  // =========================================================================================

  activateAccount(): void {
    if (!this.canActivate()) return;
    this.submitting.set(true);
    this.errorMessage.set('');

    this.authApi.acceptInvitation({
      token: this.token(),
      password: this.password,
      confirmPassword: this.confirmPassword,
      acceptTerms: this.termsAccepted(),
      clientType: 'web'
    }).subscribe({
      next: (activation) => {
        this.submitting.set(false);
        this.recoveryCodes.set(activation.recoveryCodes ?? []);
        this.recoveryNotice.set(activation.recoveryCodeNotice ?? '');
        this.mfaEnrolledResult.set(activation.mfaEnrolled === true);
        this.userCode.set(activation.user?.code ?? '');
        // Activation signs the person in, so the session starts now. The recovery codes stay on
        // screen until they are acknowledged - this is the only time they are shown.
        this.session.startSession(activation);
        this.step.set('complete');
        this.password = '';
        this.confirmPassword = '';
        this.notify('Account activated', activation.message ?? 'Your account is active.');
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(e, 'The account could not be activated.'));
      }
    });
  }

  // =========================================================================================
  // Recovery codes
  // =========================================================================================

  copyRecoveryCodes(): void {
    void navigator.clipboard.writeText(this.recoveryCodes().join('\n')).then(
      () => this.notify('Copied', 'Your recovery codes are on the clipboard.'),
      () => this.notify('Could not copy', 'Select the codes and copy them by hand.'));
  }

  /** Offers the codes as a plain text file, which is easier to store safely than a screenshot. */
  downloadRecoveryCodes(): void {
    const content = [
      `${BRAND} recovery codes`,
      `Account: ${this.userCode()}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each code signs you in once if you lose access to your second factor.',
      'Keep this file somewhere safe and offline.',
      '',
      ...this.recoveryCodes(),
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${BRAND.toLowerCase()}-recovery-codes-${this.userCode() || 'account'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  acknowledgeRecoveryCodes(checked: boolean): void {
    this.recoveryAcknowledged.set(checked);
  }

  goToDashboard(): void {
    void this.router.navigate([DASHBOARD_PATH]);
  }

  /** Asks for a replacement when the invitation has expired. */
  requestNewInvitation(): void {
    this.submitting.set(true);
    this.errorMessage.set('');
    this.authApi.requestNewInvitation(this.token()).subscribe({
      next: (outcome) => {
        this.submitting.set(false);
        const message = outcome.message ?? 'If that invitation is still open, a new link is on its way.';
        this.infoMessage.set(message);
        this.notify('New invitation sent', message);
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(e, 'A new invitation could not be requested.'));
      }
    });
  }

  goToSignIn(): void {
    void this.router.navigate([LOGIN_PATH]);
  }

  /**
   * The close (X) on the card - BUG-125: there was no way to leave the screen.
   *
   * WHERE IT GOES. A `returnUrl` on the link wins (My Security passes one), so the person lands
   * back where they started. Otherwise: once the account is active the person is signed in, so
   * the dashboard; before that they are not, so the sign-in page.
   *
   * THE RECOVERY CODES ARE THE ONE THING CLOSE MUST NOT LOSE SILENTLY. They are shown once and
   * never again, so closing before ticking "I have saved these codes" asks first.
   */
  closeActivation(): void {
    if (this.step() === 'complete' && this.recoveryCodes().length > 0 && !this.recoveryAcknowledged()) {
      const leave = window.confirm(
        'You have not confirmed that you saved your recovery codes. They will not be shown again. Close anyway?');
      if (!leave) {
        return;
      }
    }

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only an in-app path is followed, never an absolute URL handed in on the link.
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      void this.router.navigateByUrl(returnUrl);
      return;
    }

    void this.router.navigate([this.step() === 'complete' ? DASHBOARD_PATH : LOGIN_PATH]);
  }
}