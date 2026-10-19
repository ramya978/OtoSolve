import { Component, HostListener, computed, signal } from '@angular/core';


export type ConsentState = 'Granted' | 'Withdrawn' | 'Pending';
export type ConsentChannel = 'E-mail' | 'Call' | 'SMS' | 'WhatsApp' | 'Post';
export type Recognition = 'Anonymous' | 'Name only' | 'Name and amount';
export type CcAction = 'withdraw' | 'correct';
export type CcView = 'all' | 'email' | 'call' | 'granted' | 'withdrawn';
type CcMenu = 'more' | 'channel' | 'state' | 'recognition' | 'view' | 'expiry' | null;

export interface ConsentRecord {
  donorRef: string;
  donorCode: string;
  purpose: string;
  channel: ConsentChannel;
  state: ConsentState;
  notice: string;
  evidence: string;
  effective: string;        // yyyy-mm-dd
  expiry: string | null;    // yyyy-mm-dd
  recognition: Recognition;
  restrictions: string;
}

export interface ConsentHistory { state: ConsentState; channel: ConsentChannel; purpose: string; by: string; date: string; notice: string; reason?: string; }

export const CC_CHANNELS: ConsentChannel[] = ['E-mail', 'Call', 'SMS', 'WhatsApp', 'Post'];
export const CC_STATES: ConsentState[] = ['Granted', 'Pending', 'Withdrawn'];
export const CC_RECOGNITION: { key: Recognition; hint: string }[] = [
  { key: 'Anonymous', hint: 'No name in public lists' },
  { key: 'Name only', hint: 'Name without the amount' },
  { key: 'Name and amount', hint: 'Name and gift amount' }
];
export const CC_PERMISSIONS = ['View', 'Review evidence', 'Grant', 'Withdraw', 'Correct'];
export const CC_VIEWS: { key: CcView; label: string }[] = [
  { key: 'all', label: 'All consents' },
  { key: 'email', label: 'E-mail only' },
  { key: 'call', label: 'Call only' },
  { key: 'granted', label: 'Granted' },
  { key: 'withdrawn', label: 'Withdrawn' }
];
export const CC_ACTIONS: { key: CcAction; label: string; text: string }[] = [
  { key: 'withdraw', label: 'Withdraw consent', text: 'Consent is withdrawn. No further contact is permitted on this channel and scheduled follow-ups on it are blocked.' },
  { key: 'correct', label: 'Correct consent', text: 'A corrected consent supersedes this one. The original is kept in the trail rather than overwritten.' }
];
export const REASON_MIN = 10;
export const REASON_MAX = 2000;

const SAMPLE: ConsentRecord = {
  donorRef: '5eed413f-1b7b-e945-c073-c2c790503ac8',
  donorCode: 'DON-2026-000053',
  purpose: 'Fundraising updates, impact reports and appeal communication.',
  channel: 'E-mail',
  state: 'Granted',
  notice: 'PN-2026-01',
  evidence: 'Online donation form',
  effective: '2026-10-13',
  expiry: null,
  recognition: 'Anonymous',
  restrictions: 'None'
};

const HISTORY: ConsentHistory[] = [
  { state: 'Granted', channel: 'Call', purpose: 'Fundraising updates, impact reports and appeal communication.', by: 'Imran Iqbal', date: '2026-10-13', notice: 'PN-2026-01' },
  { state: 'Granted', channel: 'E-mail', purpose: 'Fundraising updates, impact reports and appeal communication.', by: 'Imran Iqbal', date: '2026-10-13', notice: 'PN-2026-01' },
  { state: 'Granted', channel: 'E-mail', purpose: 'Contact about the campaign the lead enquired about.', by: 'Imran Iqbal', date: '2026-09-16', notice: 'PN-2026-01' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const ICONS: Record<string, string> = {
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chev: 'M6 9l6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18 M6 6l12 12',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M4.9 4.9l14.2 14.2',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'
};

@Component({
  selector: 'app-consent-centre',
  standalone: true,
  templateUrl: './consent-centre.html',
  styleUrl: './consent-centre.css'
})
export class ConsentCentre {
  protected readonly channels = CC_CHANNELS;
  protected readonly states = CC_STATES;
  protected readonly recognitions = CC_RECOGNITION;
  protected readonly permissions = CC_PERMISSIONS;
  protected readonly views = CC_VIEWS;
  protected readonly actions = CC_ACTIONS;
  protected readonly reasonMin = REASON_MIN;
  protected readonly reasonMax = REASON_MAX;

  /** Saved record and the editable copy (edits are applied with "Correct consent"). */
  protected readonly record = signal<ConsentRecord>({ ...SAMPLE });
  protected readonly draft = signal<ConsentRecord>({ ...SAMPLE });
  protected readonly history = signal<ConsentHistory[]>([...HISTORY]);
  protected readonly updatedAt = signal(new Date(2026, 9, 19, 17, 16));

  protected readonly menu = signal<CcMenu>(null);
  protected readonly view = signal<CcView>('all');
  protected readonly dialog = signal<CcAction | null>(null);
  protected readonly evidenceOpen = signal(false);
  protected readonly reason = signal('');
  protected readonly tried = signal(false);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* calendar (expiry) */
  protected readonly calMonth = signal(new Date(2026, 9, 1));

  /* ---------- derived ---------- */
  protected readonly reference = computed(() => `${this.record().channel} consent - ${this.record().donorCode}`);

  protected readonly changedFields = computed(() => {
    const a = this.record();
    const b = this.draft();
    const out: { label: string; from: string; to: string }[] = [];
    const add = (label: string, x: string, y: string) => { if (x.trim() !== y.trim()) out.push({ label, from: x || '—', to: y || '—' }); };
    add('Purpose', a.purpose, b.purpose);
    add('Channel', a.channel, b.channel);
    add('Consent state', a.state, b.state);
    add('Notice version', a.notice, b.notice);
    add('Expiry time', this.date(a.expiry), this.date(b.expiry));
    add('Public recognition', a.recognition, b.recognition);
    add('Contact restrictions', a.restrictions, b.restrictions);
    return out;
  });
  protected readonly dirty = computed(() => this.changedFields().length > 0);

  protected readonly draftErrors = computed(() => {
    const d = this.draft();
    const e: Record<string, string> = {};
    if (!d.purpose.trim()) e['purpose'] = 'Enter the purpose.';
    if (!d.notice.trim()) e['notice'] = 'Enter the notice version.';
    if (d.expiry && d.expiry < d.effective) e['expiry'] = 'Expiry must be after the effective time.';
    return e;
  });

  protected readonly viewRows = computed(() => {
    const v = this.view();
    return this.history().filter((h) =>
      v === 'all' ? true :
      v === 'email' ? h.channel === 'E-mail' :
      v === 'call' ? h.channel === 'Call' :
      v === 'granted' ? h.state === 'Granted' : h.state === 'Withdrawn');
  });
  protected readonly viewLabel = computed(() => {
    const v = CC_VIEWS.find((x) => x.key === this.view());
    return `${v?.label ?? ''} (${this.viewRows().length})`;
  });

  /** Confirm popup content. */
  protected readonly dialogInfo = computed(() => {
    const k = this.dialog();
    if (!k) return null;
    const a = CC_ACTIONS.find((x) => x.key === k)!;
    const from = this.record().state;
    const to: ConsentState = k === 'withdraw' ? 'Withdrawn' : this.draft().state;
    return { ...a, from, to, title: k === 'withdraw' ? 'Withdraw consent' : 'Correct consent' };
  });
  protected readonly reasonLen = computed(() => this.reason().trim().length);
  protected readonly reasonError = computed(() => {
    const n = this.reasonLen();
    if (n < REASON_MIN) return `Write at least ${REASON_MIN} characters.`;
    if (this.reason().length > REASON_MAX) return `Keep it under ${REASON_MAX} characters.`;
    return '';
  });

  protected readonly calWeeks = computed(() => {
    const m = this.calMonth();
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const min = this.draft().effective;
    const weeks: { iso: string; day: number; out: boolean; off: boolean }[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + i);
        const id = isoOf(d);
        row.push({ iso: id, day: d.getDate(), out: d.getMonth() !== m.getMonth(), off: id < min });
      }
      weeks.push(row);
    }
    return weeks;
  });
  protected readonly calTitle = computed(() => MONTHS[this.calMonth().getMonth()] + ' ' + this.calMonth().getFullYear());

  /* ---------- helpers ---------- */
  icon(n: string): string { return ICONS[n] ?? ''; }
  date(v: string | null): string {
    if (!v) return '';
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  stamp(d: Date): string { return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  tone(s: ConsentState): string { return s === 'Granted' ? 'green' : s === 'Withdrawn' ? 'red' : 'amber'; }
  isChanged(label: string): boolean { return this.changedFields().some((c) => c.label === label); }
  viewCount(k: CcView): number {
    return this.history().filter((h) =>
      k === 'all' ? true : k === 'email' ? h.channel === 'E-mail' : k === 'call' ? h.channel === 'Call' :
      k === 'granted' ? h.state === 'Granted' : h.state === 'Withdrawn').length;
  }

  /* ---------- editing ---------- */
  set<K extends keyof ConsentRecord>(k: K, v: ConsentRecord[K]): void { this.draft.update((d) => ({ ...d, [k]: v })); }
  text(k: 'purpose' | 'notice' | 'restrictions', e: Event): void { this.set(k, (e.target as HTMLInputElement).value); }
  discard(): void { this.draft.set({ ...this.record() }); }

  toggle(m: Exclude<CcMenu, null>, e: Event): void {
    e.stopPropagation();
    if (m === 'expiry' && this.menu() !== 'expiry') {
      const base = this.draft().expiry ?? this.draft().effective;
      const [y, mo] = base.split('-').map(Number);
      this.calMonth.set(new Date(y, mo - 1, 1));
    }
    this.menu.set(this.menu() === m ? null : m);
  }
  pick<K extends 'channel' | 'state' | 'recognition'>(k: K, v: ConsentRecord[K]): void { this.set(k, v); this.menu.set(null); }
  pickView(v: CcView): void { this.view.set(v); this.menu.set(null); }
  moveCal(step: number): void { const m = this.calMonth(); this.calMonth.set(new Date(m.getFullYear(), m.getMonth() + step, 1)); }
  pickExpiry(id: string | null): void {
    if (id && id < this.draft().effective) return;
    this.set('expiry', id);
    this.menu.set(null);
  }

  /* ---------- actions ---------- */
  open(k: CcAction): void {
    this.menu.set(null);
    if (k === 'withdraw' && this.record().state === 'Withdrawn') { this.flash('Consent is already withdrawn.'); return; }
    if (k === 'correct' && Object.keys(this.draftErrors()).length) { this.flash('Fix the highlighted fields first.'); return; }
    this.reason.set('');
    this.tried.set(false);
    this.dialog.set(k);
  }
  close(): void { this.dialog.set(null); }
  setReason(e: Event): void { this.reason.set((e.target as HTMLTextAreaElement).value); }

  confirm(): void {
    const k = this.dialog();
    if (!k) return;
    this.tried.set(true);
    if (this.reasonError()) return;
    const now = new Date();
    // TODO: call the API with { action: k, record: this.draft(), reason: this.reason().trim() }
    const next: ConsentRecord = k === 'withdraw' ? { ...this.record(), state: 'Withdrawn' } : { ...this.draft() };
    this.record.set(next);
    this.draft.set({ ...next });
    this.history.update((h) => [{ state: next.state, channel: next.channel, purpose: next.purpose, by: 'You', date: isoOf(now), notice: next.notice, reason: this.reason().trim() }, ...h]);
    this.updatedAt.set(now);
    this.dialog.set(null);
    this.flash(k === 'withdraw' ? 'Consent withdrawn.' : 'Consent corrected. The original is kept in the trail.');
  }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menu()) { this.menu.set(null); return; }
    if (this.dialog()) { this.dialog.set(null); return; }
    this.evidenceOpen.set(false);
  }
}