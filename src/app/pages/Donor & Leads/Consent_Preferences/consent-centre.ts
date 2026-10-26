import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DonorApiService } from '../../../Service/donor-api.service';
import { ConsentListItem } from '../../../Shared/models/donor-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';


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
  /** API id and version of the consent row. */
  id?: string;
  version?: number;
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

const BLANK: ConsentRecord = {
  donorRef: '', donorCode: '', purpose: '', channel: 'E-mail', state: 'Pending', notice: '', evidence: '',
  effective: '', expiry: null, recognition: 'Anonymous', restrictions: 'None'
};

const nk = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z]/g, '');
const dayOf = (utc: string | null | undefined): string => (utc ? utc.slice(0, 10) : '');

function channelOf(v: string): ConsentChannel {
  const k = nk(v);
  return k.includes('whatsapp') ? 'WhatsApp' : k.includes('sms') ? 'SMS' : k.includes('mail') ? 'E-mail' : k.includes('post') ? 'Post' : 'Call';
}
function stateOf(v: string): ConsentState {
  const k = nk(v);
  return k.startsWith('grant') ? 'Granted' : k.startsWith('withdr') ? 'Withdrawn' : 'Pending';
}
function toRecord(c: ConsentListItem, code: string): ConsentRecord {
  return {
    id: c.id, version: c.version,
    donorRef: c.donorId ?? '', donorCode: code, purpose: c.purpose, channel: channelOf(c.channel), state: stateOf(c.consentState),
    notice: c.noticeVersion, evidence: [c.evidenceSource, c.evidenceReference].filter(Boolean).join(' · '),
    effective: dayOf(c.effectiveAtUtc), expiry: c.expiryAtUtc ? dayOf(c.expiryAtUtc) : null,
    recognition: c.publicRecognitionPreference ? 'Name only' : 'Anonymous', restrictions: c.contactRestrictions || 'None'
  };
}
function toHistory(c: ConsentListItem): ConsentHistory {
  return {
    state: stateOf(c.consentState), channel: channelOf(c.channel), purpose: c.purpose, by: c.capturedByName ?? '',
    date: dayOf(c.effectiveAtUtc || c.createdAtUtc), notice: c.noticeVersion, reason: c.withdrawalReason ?? c.correctionReason ?? undefined
  };
}

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
  imports:[PageHeader],
  templateUrl: './consent-centre.html',
  styleUrls: ['./consent-centre.css', '../../../Shared/layout/page-header/page-header.css']
})
export class ConsentCentre implements OnInit {
  private readonly api = inject(DonorApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly code = this.route.snapshot.queryParamMap.get('ref') ?? '';
  private donorId = '';

  protected readonly channels = CC_CHANNELS;
  protected readonly states = CC_STATES;
  protected readonly recognitions = CC_RECOGNITION;
  protected readonly permissions = CC_PERMISSIONS;
  protected readonly views = CC_VIEWS;
  protected readonly actions = CC_ACTIONS;
  protected readonly reasonMin = REASON_MIN;
  protected readonly reasonMax = REASON_MAX;

  /** Saved record and the editable copy (edits are applied with "Correct consent"). */
  protected readonly record = signal<ConsentRecord>({ ...BLANK, donorCode: this.code });
  protected readonly draft = signal<ConsentRecord>({ ...BLANK, donorCode: this.code });
  protected readonly history = signal<ConsentHistory[]>([]);
  protected readonly updatedAt = signal(new Date());
  protected readonly loading = signal(false);

  protected readonly menu = signal<CcMenu>(null);
  protected readonly view = signal<CcView>('all');
  protected readonly dialog = signal<CcAction | null>(null);
  protected readonly evidenceOpen = signal(false);
  protected readonly reason = signal('');
  protected readonly tried = signal(false);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* calendar (expiry) */
  protected readonly calMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  ngOnInit(): void {
    if (!this.code) { this.flash('Open the consent centre from a donor profile.'); return; }
    this.loading.set(true);
    this.api.searchDonors({ search: this.code, pageSize: 10 }).subscribe({
      next: (p) => {
        const hit = p.items.find((x) => x.displayCode === this.code) ?? p.items[0];
        if (!hit) { this.loading.set(false); this.flash('That donor could not be found.'); return; }
        this.donorId = hit.id;
        this.load();
      },
      error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.getConsentCentre({ donorId: this.donorId, page: 1, pageSize: 50 }).subscribe({
      next: (r) => {
        const rows = r.consents.items;
        const current = rows.find((c) => stateOf(c.consentState) === 'Granted') ?? rows[0];
        if (current) {
          const rec = toRecord(current, this.code);
          this.record.set(rec);
          this.draft.set({ ...rec });
        }
        this.history.set((r.consentHistory?.length ? r.consentHistory : rows).map(toHistory));
        this.updatedAt.set(new Date());
        this.loading.set(false);
      },
      error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

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
    const rec = this.record();
    if (!rec.id) { this.flash('There is no consent record to change.'); return; }
    const reason = this.reason().trim();
    const done = (message: string) => {
      this.dialog.set(null);
      this.load();
      this.flash(message);
    };
    const fail = (e: unknown) => this.flash(apiErrorMessage(e));
    if (k === 'withdraw') {
      this.api.withdrawConsent(rec.id, { reason, expectedVersion: rec.version }).subscribe({
        next: () => done('Consent withdrawn.'), error: fail
      });
      return;
    }
    const d = this.draft();
    if (d.channel !== rec.channel || d.state !== rec.state || d.notice.trim() !== rec.notice.trim()) {
      this.flash('Channel, state and notice version cannot be corrected. Withdraw this consent and record a new one.');
      return;
    }
    this.api.correctConsent(rec.id, {
      correctionReason: reason,
      purpose: d.purpose.trim(),
      effectiveAtUtc: d.effective ? new Date(d.effective + 'T00:00:00').toISOString() : null,
      expiryAtUtc: d.expiry ? new Date(d.expiry + 'T23:59:00').toISOString() : null,
      publicRecognitionPreference: d.recognition !== 'Anonymous',
      contactRestrictions: d.restrictions.trim() === 'None' ? null : d.restrictions.trim(),
      expectedVersion: rec.version
    }).subscribe({ next: () => done('Consent corrected. The original is kept in the trail.'), error: fail });
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