import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import QRCode from 'qrcode';
import { SecurityApiService } from '../../../Service/security-api.service';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { UserSecurityResponse } from '../../../Shared/models/iam-contract.model';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  IAM_NOW, IamSession, SecurityActivity, fmtDate, fmtDateTime, fmtTime, initialsOf
} from '../../../Shared/IAM/iam-data';

type Dialog = 'methods' | 'app' | 'email' | 'password' | 'codes' | null;

interface MfaMethod { id: string; kind: 'app' | 'email'; label: string; device: string; addedAt: string; }

interface PwRule { key: string; label: string; ok: boolean; }

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_TTL = 120; // seconds a verification code stays valid

/** My security — Workspace Kit account workspace ("My profile" pattern): identity card, summary strip,
 *  tabs (Protection · Sessions & devices · Activity), "Protect your account" side card, MFA set-up,
 *  backup-code and change-password dialogs. */
@Component({
  selector: 'app-iam-my-security',
  templateUrl: './my-security.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './my-security.css']
})
export class MySecurity implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(SecurityApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingMethodId = '';
  private pendingUri = '';

  readonly loading = signal(false);
  readonly busy = signal(false);
  private readonly sec = signal<UserSecurityResponse | null>(null);

  private readonly meC = computed(() => {
    const u = this.auth.user();
    const sec = this.sec();
    const email = u?.email ?? '';
    return {
      name: u?.name ?? sec?.displayName ?? '',
      username: email.split('@')[0] ?? '',
      email,
      passwordChanged: sec?.passwordChangedAtUtc ?? '',
      mfaRequirement: sec?.mfaRequirementDisplay ?? '',
      failedSignIns: sec?.accessFailedCount ?? 0,
      attemptsLeft: sec?.attemptsRemaining ?? 0,
      recoveryCodesLeft: sec?.recoveryCodesRemaining ?? 0,
    };
  });
  get me() { return this.meC(); }
  readonly initials = initialsOf;
  readonly fmtDateTime = fmtDateTime;
  readonly fmtTime = fmtTime;

  readonly passwordChanged = signal('');
  readonly sessions = signal<IamSession[]>([]);
  readonly activity = signal<SecurityActivity[]>([]);
  readonly methods = signal<MfaMethod[]>([]);
  readonly recoveryCodes = signal<string[]>([]);
  readonly rememberedDevices = signal(0);
  readonly devicesReviewed = signal(false);

  readonly dialog = signal<Dialog>(null);
  readonly tab = signal<'protection' | 'sessions' | 'activity'>('protection');

  // ---- authenticator / e-mail enrolment ----
  readonly secret = signal('');
  readonly code = signal<string[]>(['', '', '', '', '', '']);
  readonly deviceName = signal('');
  readonly secondsLeft = signal(CODE_TTL);
  readonly copied = signal(false);
  readonly verifyTried = signal(false);

  // ---- change password ----
  readonly pw = signal({ current: '', next: '', confirm: '' });
  readonly show = signal({ current: false, next: false, confirm: false });
  readonly pwTried = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.getMySecurity().subscribe({
      next: (r) => {
        this.sec.set(r);
        this.passwordChanged.set(r.passwordChangedAtUtc ?? '');
        this.sessions.set((r.activeSessions ?? []).map((x) => ({
          id: x.id ?? '', device: x.deviceName || [x.browser, x.operatingSystem].filter(Boolean).join(' on ') || 'Device',
          detail: [x.browser, x.operatingSystem].filter(Boolean).join(' on ') + (x.ipAddress ? ' · ' + x.ipAddress : ''),
          lastActive: x.lastActivityAtUtc ?? '', current: !!x.isCurrent,
        })));
        this.methods.set((r.mfaMethods ?? []).filter((m) => m.status !== 'revoked' && m.status !== 'pending').map((m) => ({
          id: m.id ?? '', kind: m.methodType === 'email' ? 'email' as const : 'app' as const,
          label: m.methodTypeDisplay ?? (m.methodType === 'email' ? 'E-mail OTP' : 'Authenticator app'),
          device: m.label || m.maskedDestination || '', addedAt: m.verifiedAtUtc ?? m.createdAtUtc ?? '',
        })));
        if (!this.recoveryCodes().length && (r.recoveryCodesRemaining ?? 0) > 0) {
          this.recoveryCodes.set(Array.from({ length: r.recoveryCodesRemaining ?? 0 }, () => '••••-••••'));
        }
        this.activity.set((r.recentAttempts ?? []).map((a) => ({
          id: a.id ?? '', title: a.succeeded ? 'Signed in' : (a.headline || a.outcomeDisplay || 'Sign-in attempt'),
          detail: [a.browser, a.operatingSystem].filter(Boolean).join(' on ') + (a.ipAddress ? ' · from ' + a.ipAddress : ''),
          at: a.attemptedAtUtc ?? '',
        })));
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.show('Could not load', apiErrorMessage(e, 'Your security details could not be loaded.'), 'error');
      },
    });
  }

  private fail(e: unknown, fallback: string): void {
    this.busy.set(false);
    this.toast.show('Not saved', apiErrorMessage(e, fallback), 'error');
  }

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  // ---------------------------------------------------------------- status
  readonly mfaOn = computed(() => this.methods().length > 0);
  readonly passwordGood = computed(() => !!this.passwordChanged() && (IAM_NOW.getTime() - new Date(this.passwordChanged()).getTime()) / 86400000 <= 90);

  /** four checks behind the security level */
  readonly checks = computed(() => [
    { key: 'mfa', label: 'MFA', icon: 'fingerprint', ok: this.mfaOn(), state: this.mfaOn() ? 'Enabled' : 'Not enabled', action: 'methods' as Dialog },
    { key: 'password', label: 'Password', icon: 'lock', ok: this.passwordGood(), state: this.passwordGood() ? 'Good' : 'Change it', action: 'password' as Dialog },
    { key: 'recovery', label: 'Recovery', icon: 'refresh', ok: this.recoveryCodes().length > 0,
      state: this.recoveryCodes().length ? this.recoveryCodes().length + ' codes left' : 'No codes left', action: 'codes' as Dialog },
    { key: 'devices', label: 'Devices', icon: 'devices', ok: this.devicesReviewed(), state: this.devicesReviewed() ? 'Reviewed' : 'Review', action: null as Dialog }
  ]);
  readonly score = computed(() => this.checks().filter((c) => c.ok).length);
  readonly level = computed(() => ['At risk', 'Fair', 'Good', 'Strong', 'Excellent'][this.score()]);
  readonly levelNote = computed(() =>
    this.score() === 4 ? 'Your account has every protection switched on.' : 'A few more steps will make your account safer.');

  /** gauge arc (semicircle, pathLength 100) */
  readonly gaugeDash = computed(() => `${(this.score() / 4) * 100} 100`);

  // ---------------------------------------------------------------- dialogs
  open(d: Dialog): void {
    this.stopTimer();
    if (d === 'codes' && !this.mfaOn()) d = 'methods';
    this.dialog.set(d);
  }

  close(): void {
    this.stopTimer();
    this.dialog.set(null);
  }

  reviewDevices(): void {
    this.devicesReviewed.set(true);
  }

  // ---------------------------------------------------------------- MFA enrolment
  startApp(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.beginMfaEnrolment('authenticatorApp').subscribe({
      next: (r) => {
        this.busy.set(false);
        this.pendingMethodId = r.methodId ?? '';
        this.pendingUri = r.provisioningUri ?? '';
        this.secret.set(r.sharedSecret ?? '');
        this.beginCode('app');
      },
      error: (e) => this.fail(e, 'Authenticator set-up could not be started.'),
    });
  }

  startEmail(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.beginMfaEnrolment('email').subscribe({
      next: (r) => {
        this.busy.set(false);
        this.pendingMethodId = r.methodId ?? '';
        this.beginCode('email');
      },
      error: (e) => this.fail(e, 'A code could not be sent.'),
    });
  }

  private beginCode(kind: 'app' | 'email'): void {
    this.code.set(['', '', '', '', '', '']);
    this.deviceName.set('');
    this.verifyTried.set(false);
    this.copied.set(false);
    this.secondsLeft.set(CODE_TTL);
    this.stopTimer();
    this.timer = setInterval(() => this.secondsLeft.set(Math.max(0, this.secondsLeft() - 1)), 1000);
    this.dialog.set(kind);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  readonly secretGroups = computed(() => this.secret().match(/.{1,4}/g)?.join(' ') ?? '');
  readonly expires = computed(() => `${Math.floor(this.secondsLeft() / 60)}:${String(this.secondsLeft() % 60).padStart(2, '0')}`);
  readonly codeFull = computed(() => this.code().every((c) => /^\d$/.test(c)));
  readonly maskedEmail = computed(() => this.meC().email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(6, b.length)) + c));

  /** The real otpauth:// URI as a QR matrix, drawn into the existing 25×25 viewBox. */
  readonly qrPath = computed(() => {
    const text = this.pendingUri || '';
    if (!this.secret() || !text) return '';
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const k = 25 / n;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${+(x * k).toFixed(3)} ${+(y * k).toFixed(3)}h${+k.toFixed(3)}v${+k.toFixed(3)}h-${+k.toFixed(3)}z`;
      }
    }
    return d;
  });

  async copySecret(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.secret());
    } catch { /* clipboard blocked — the key is still selectable */ }
    this.copied.set(true);
  }

  setDigit(i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '');
    const next = [...this.code()];
    if (digits.length > 1) {
      // pasted a whole code
      digits.slice(0, 6 - i).split('').forEach((d, k) => (next[i + k] = d));
      this.code.set(next);
      this.focusBox(el, Math.min(5, i + digits.length));
      return;
    }
    next[i] = digits;
    this.code.set(next);
    el.value = digits;
    if (digits && i < 5) this.focusBox(el, i + 1);
  }

  backDigit(i: number, e: KeyboardEvent): void {
    if (e.key === 'Backspace' && !this.code()[i] && i > 0) this.focusBox(e.target as HTMLElement, i - 1);
  }

  private focusBox(from: HTMLElement, i: number): void {
    const boxes = from.closest('.ms-code')?.querySelectorAll<HTMLInputElement>('input');
    boxes?.[i]?.focus();
  }

  verify(): void {
    this.verifyTried.set(true);
    if (!this.codeFull() || this.secondsLeft() === 0 || this.busy() || !this.pendingMethodId) return;
    this.busy.set(true);
    this.api.confirmMfaEnrolment(this.pendingMethodId, this.code().join('')).subscribe({
      next: () => {
        this.stopTimer();
        const afterwards = (): void => {
          this.busy.set(false);
          this.pendingMethodId = '';
          this.reload();
          this.dialog.set('codes');
        };
        if (!this.recoveryCodes().length) {
          this.api.generateRecoveryCodes().subscribe({
            next: (c) => { this.recoveryCodes.set(c.codes ?? []); afterwards(); },
            error: () => afterwards(),
          });
        } else {
          afterwards();
        }
      },
      error: (e) => this.fail(e, 'That code was not accepted.'),
    });
  }

  removeMethod(m: MfaMethod): void {
    this.api.revokeMyMfaMethod(m.id, 'Removed from My security').subscribe({
      next: () => { this.toast.show('Removed', m.label, 'success'); this.reload(); },
      error: (e) => this.fail(e, 'The method could not be removed.'),
    });
  }

  // ---------------------------------------------------------------- recovery codes
  generateCodes(_logIt = true): void {
    this.api.generateRecoveryCodes().subscribe({
      next: (c) => { this.recoveryCodes.set(c.codes ?? []); this.reload(); },
      error: (e) => this.fail(e, 'Recovery codes could not be generated.'),
    });
  }

  // ---------------------------------------------------------------- sessions
  revoke(s: IamSession): void {
    this.api.revokeMySession(s.id, 'Revoked from My security').subscribe({
      next: () => { this.toast.show('Session revoked', s.device, 'success'); this.reload(); },
      error: (e) => this.fail(e, 'The session could not be revoked.'),
    });
  }

  // ---------------------------------------------------------------- password
  setPw(key: 'current' | 'next' | 'confirm', v: string): void {
    this.pw.update((p) => ({ ...p, [key]: v }));
  }

  toggleShow(key: 'current' | 'next' | 'confirm'): void {
    this.show.update((s) => ({ ...s, [key]: !s[key] }));
  }

  readonly rules = computed<PwRule[]>(() => {
    const p = this.pw().next;
    return [
      { key: 'len', label: 'At least 10 characters (at most 128)', ok: p.length >= 10 && p.length <= 128 },
      { key: 'upper', label: 'An upper-case letter', ok: /[A-Z]/.test(p) },
      { key: 'lower', label: 'A lower-case letter', ok: /[a-z]/.test(p) },
      { key: 'digit', label: 'A digit', ok: /\d/.test(p) },
      { key: 'symbol', label: 'A symbol, such as ! @ # $', ok: /[^A-Za-z0-9]/.test(p) },
      { key: 'diff', label: 'Different from your current password', ok: !!p && p !== this.pw().current }
    ];
  });
  readonly rulesOk = computed(() => this.rules().every((r) => r.ok));
  readonly matchOk = computed(() => !!this.pw().confirm && this.pw().confirm === this.pw().next);
  readonly canChange = computed(() => !!this.pw().current && this.rulesOk() && this.matchOk());

  openPassword(): void {
    this.pw.set({ current: '', next: '', confirm: '' });
    this.show.set({ current: false, next: false, confirm: false });
    this.pwTried.set(false);
    this.dialog.set('password');
  }

  changePassword(): void {
    this.pwTried.set(true);
    if (!this.canChange() || this.busy()) return;
    this.busy.set(true);
    const p = this.pw();
    this.api.changeMyPassword({
      currentPassword: p.current, newPassword: p.next, confirmPassword: p.confirm, signOutOtherSessions: false,
    }).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.toast.show('Password changed', o.message ?? 'Your password has been updated.', 'success');
        this.dialog.set(null);
        this.reload();
      },
      error: (e) => this.fail(e, 'The password could not be changed.'),
    });
  }

  // ---------------------------------------------------------------- activity

  /** activity grouped by day for the journal tab */
  readonly activityDays = computed(() => {
    const out: { key: string; label: string; items: SecurityActivity[] }[] = [];
    for (const a of this.activity()) {
      const key = a.at.slice(0, 10);
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, label: fmtDate(a.at), items: [] }; out.push(g); }
      g.items.push(a);
    }
    return out;
  });

  readonly lastSignIn = computed(() => this.activity().find((a) => a.title === 'Signed in')?.at ?? '');

  activityIcon(a: SecurityActivity): string {
    return a.title === 'Signed in' ? 'checkCircle' : a.title.includes('Password') ? 'lock' : a.title.includes('revoked') || a.title.includes('removed') ? 'xCircle' : 'shieldCheck';
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.close();
  }
}
