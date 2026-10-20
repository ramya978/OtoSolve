import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  IAM_NOW, IamSession, ME, SECURITY_ACTIVITY, SESSIONS, SecurityActivity, fmtDate, fmtDateTime, fmtTime, initialsOf
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
export class MySecurity {
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly me = ME;
  readonly initials = initialsOf;
  readonly fmtDateTime = fmtDateTime;
  readonly fmtTime = fmtTime;

  readonly passwordChanged = signal(ME.passwordChanged);
  readonly sessions = signal<IamSession[]>(SESSIONS.map((s) => ({ ...s })));
  readonly activity = signal<SecurityActivity[]>([...SECURITY_ACTIVITY]);
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

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  // ---------------------------------------------------------------- status
  readonly mfaOn = computed(() => this.methods().length > 0);
  readonly passwordGood = computed(() => (IAM_NOW.getTime() - new Date(this.passwordChanged()).getTime()) / 86400000 <= 90);

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
    let s = '';
    for (let i = 0; i < 32; i++) s += B32[Math.floor(Math.random() * 32)];
    this.secret.set(s);
    this.beginCode('app');
  }

  startEmail(): void {
    this.beginCode('email');
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
  readonly maskedEmail = computed(() => ME.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(6, b.length)) + c));

  /** QR-style matrix for the secret (visual only — use your QR library with the real otpauth:// URI). */
  readonly qrPath = computed(() => {
    const n = 25;
    let seed = 0;
    for (const ch of this.secret()) seed = (seed * 33 + ch.charCodeAt(0)) >>> 0;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const finder = (x: number, y: number): boolean | null => {
      for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
        const dx = x - fx;
        const dy = y - fy;
        if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
          if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          return ring !== 2;
        }
      }
      return null;
    };
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const f = finder(x, y);
        if (f === true || (f === null && rnd() > 0.52)) d += `M${x} ${y}h1v1h-1z`;
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

  /** Demo verification: any 6 digits before expiry. In production send code + secret to the API. */
  verify(): void {
    this.verifyTried.set(true);
    if (!this.codeFull() || this.secondsLeft() === 0) return;
    const kind = this.dialog() === 'email' ? 'email' : 'app';
    this.methods.update((m) => [...m, {
      id: 'm' + Date.now(), kind,
      label: kind === 'app' ? 'Authenticator app' : 'E-mail OTP',
      device: kind === 'app' ? (this.deviceName().trim() || 'Authenticator') : this.maskedEmail(),
      addedAt: IAM_NOW.toISOString()
    }]);
    this.log(kind === 'app' ? 'Authenticator app enrolled' : 'E-mail OTP enrolled');
    if (!this.recoveryCodes().length) this.generateCodes(false);
    this.stopTimer();
    this.dialog.set('codes');
  }

  removeMethod(m: MfaMethod): void {
    this.methods.update((list) => list.filter((x) => x.id !== m.id));
    this.log(m.label + ' removed');
  }

  // ---------------------------------------------------------------- recovery codes
  generateCodes(logIt = true): void {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      let c = '';
      for (let k = 0; k < 8; k++) c += B32[Math.floor(Math.random() * 32)];
      codes.push(c.slice(0, 4) + '-' + c.slice(4));
    }
    this.recoveryCodes.set(codes);
    if (logIt) this.log('Recovery codes generated');
  }

  // ---------------------------------------------------------------- sessions
  revoke(s: IamSession): void {
    this.sessions.update((list) => list.filter((x) => x.id !== s.id));
    this.log('Session revoked');
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
    if (!this.canChange()) return;
    this.passwordChanged.set(IAM_NOW.toISOString());
    this.log('Password changed');
    this.dialog.set(null);
  }

  // ---------------------------------------------------------------- activity
  private log(title: string): void {
    this.activity.update((a) => [{ id: 'a' + Date.now(), title, detail: 'Chrome on Windows · from 172.18.0.1', at: IAM_NOW.toISOString() }, ...a]);
  }

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
