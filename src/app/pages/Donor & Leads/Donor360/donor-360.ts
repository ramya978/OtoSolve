import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

export type FollowFilter = 'all' | 'open' | 'overdue' | 'closed';

export interface D360Gift { ref: string; date: string; campaign: string; amount: number; status: 'Recorded' | 'Reconciled' | 'Pending'; }
export interface D360Campaign { name: string; code: string; via: string; converted: string; given: number; gifts: number; status: 'Converted' | 'Open' | 'Lost'; }
export interface D360Promise { due: string; amount: number; status: 'Pending' | 'Fulfilled'; }
export interface D360FollowUp { due: string; title: string; owner: string; priority: 'Urgent' | 'High' | 'Normal'; status: 'Open' | 'Completed'; }
export interface D360Channel { channel: string; state: 'Granted' | 'Withdrawn' | 'Pending'; since: string; publicThanks: boolean; }
export interface D360Activity { date: string; text: string; by: string; kind: 'view' | 'gift' | 'note' | 'consent'; }

export interface D360Donor {
  code: string;
  name: string;
  status: 'Active' | 'Prospect' | 'Restricted' | 'Archived' | 'Merged';
  updated: string;
  phone: string;
  email: string;
  owner: string;
  language: string;
  contactBy: string[];
  pledged: number;
  documents: number;
  stages: { label: string; amount: number; asOf: string; tone: 'primary' | 'green' | 'amber' | 'blue' }[];
  gifts: D360Gift[];
  campaigns: D360Campaign[];
  promises: D360Promise[];
  followUps: D360FollowUp[];
  consent: { state: 'Granted' | 'Withdrawn' | 'Unknown'; doNotContact: boolean; lastRecorded: string; notice: string };
  channels: D360Channel[];
  activity: D360Activity[];
  latestDocument: string | null;
}

const SAMPLE: D360Donor = {
  code: 'DON-2026-000053',
  name: 'Abhijit Tarun',
  status: 'Active',
  updated: '14 Oct 2026',
  phone: '+919831047265',
  email: 'abhijit.tarun@mail.test',
  owner: 'Imran Iqbal',
  language: 'bn-IN',
  contactBy: ['Email', 'PhoneCall'],
  pledged: 0,
  documents: 0,
  stages: [{ label: 'Received', amount: 12000, asOf: '14 Oct 2026', tone: 'primary' }],
  gifts: [
    { ref: 'DON-V9DNEK5WDN74', date: '2026-10-14', campaign: 'Mobile Healthcare Units - Care at the Doorstep', amount: 12000, status: 'Recorded' }
  ],
  campaigns: [
    { name: 'Mobile Healthcare Units - Care at the Doorstep', code: 'HAI-MOBILECARE-2026', via: 'LED-2026-000087', converted: '14 Oct 2026', given: 12000, gifts: 1, status: 'Converted' }
  ],
  promises: [],
  followUps: [
    { due: '2026-10-13', title: 'Send the payment link', owner: 'Imran Iqbal', priority: 'Urgent', status: 'Completed' },
    { due: '2026-10-05', title: 'Make first contact', owner: 'Imran Iqbal', priority: 'Urgent', status: 'Completed' }
  ],
  consent: { state: 'Granted', doNotContact: false, lastRecorded: '13 Oct 2026', notice: 'PN-2026-01' },
  channels: [
    { channel: 'E-mail', state: 'Granted', since: '13 Oct 2026', publicThanks: false },
    { channel: 'Call', state: 'Granted', since: '13 Oct 2026', publicThanks: false }
  ],
  activity: [
    { date: '2026-10-19', text: 'DON-2026-000053 opened on Donor 360 with elevated visibility.', by: 'Vikram Anand', kind: 'view' },
    { date: '2026-10-19', text: 'DON-2026-000053 opened on Donor 360 with elevated visibility.', by: 'Vikram Anand', kind: 'view' },
    { date: '2026-10-19', text: 'DON-2026-000053 opened on Donor 360 with elevated visibility.', by: 'Vikram Anand', kind: 'view' },
    { date: '2026-10-19', text: 'DON-2026-000053 opened on Donor 360 with elevated visibility.', by: 'Vikram Anand', kind: 'view' }
  ],
  latestDocument: null
};

const ICONS: Record<string, string> = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  timeline: 'M21 12a9 9 0 1 1-4.2-7.6L21 3v5h-5 M12 7v5l3 3',
  schedule: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18 M12 14v4 M10 16h4',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  gift: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  pledge: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z',
  promise: 'M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  note: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  copy: 'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  check: 'M20 6 9 17l-5-5',
  settings: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  x: 'M18 6 6 18 M6 6l12 12',
  chev: 'M6 9l6 6 6-6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  intent: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 14l2 2 4-4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Create donation intent: currencies and the "expected by" shortcuts. */
export type IntentWhen = '2w' | 'eom' | '3m' | 'none' | 'custom';
export const INTENT_CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'Indian rupee' },
  { code: 'USD', symbol: '$', label: 'US dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'Pound sterling' }
] as const;
export type IntentCurrency = (typeof INTENT_CURRENCIES)[number]['code'];
export const INTENT_QUICK = [5000, 10000, 25000, 50000, 100000];
export const INTENT_WHEN: { key: IntentWhen; label: string }[] = [
  { key: '2w', label: 'In 2 weeks' },
  { key: 'eom', label: 'End of month' },
  { key: '3m', label: 'In 3 months' },
  { key: 'none', label: 'No date' }
];
const NOTES_MIN = 10;

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 125000 -> "one lakh twenty-five thousand" (Indian grouping). */
function inWords(n: number): string {
  if (!n) return '';
  const two = (x: number): string => (x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? '-' + ONES[x % 10] : ''));
  const three = (x: number): string => (x >= 100 ? ONES[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(three(crore) + ' crore');
  if (lakh) parts.push(two(lakh) + ' lakh');
  if (thousand) parts.push(two(thousand) + ' thousand');
  if (n) parts.push(three(n));
  return parts.join(' ');
}

const iso = (d: Date): string => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const rupees = (n: number): string => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
const parse = (iso: string): Date => new Date(iso + 'T00:00:00');

@Component({
  selector: 'app-donor-360',
  imports: [RouterLink],
  templateUrl: './donor-360.html',
  styleUrl: './donor-360.css'
})
export class Donor360 {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly rupees = rupees;
  protected readonly listPath = '/app/fundraising/relationships/all-donors';
  protected readonly editPath = '/app/fundraising/relationships/donor-360/edit';
  /** "today" for overdue checks - the server date in the real app */
  private readonly today = new Date().toISOString().slice(0, 10);

  /** Donor on screen - the ref from the URL is kept; the rest is sample data for now. */
  protected readonly d = signal<D360Donor>({ ...SAMPLE, code: this.route.snapshot.queryParamMap.get('ref') ?? SAMPLE.code });

  protected readonly followFilter = signal<FollowFilter>('all');
  protected readonly followQuery = signal('');
  protected readonly activityQuery = signal('');
  protected readonly toast = signal<string | null>(null);
  private toastTimer = 0;
  // ---------- create donation intent (popup) ----------
  protected readonly currencies = INTENT_CURRENCIES;
  protected readonly quickAmounts = INTENT_QUICK;
  protected readonly whenOptions = INTENT_WHEN;
  protected readonly notesMin = NOTES_MIN;
  protected readonly intentOpen = signal(false);
  protected readonly iCurrency = signal<IntentCurrency>('INR');
  protected readonly iAmount = signal('');
  protected readonly iWhen = signal<IntentWhen>('none');
  protected readonly iDate = signal('');
  protected readonly iNotes = signal('');
  protected readonly iTried = signal(false);
  protected readonly curOpen = signal(false);
  protected readonly calOpen = signal(false);
  protected readonly calMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  /** Section highlighted in the left menu. */
  protected readonly section = signal('overview');

  // ---------- giving ----------
  protected readonly received = computed(() => this.d().gifts.reduce((s, g) => s + g.amount, 0));

  protected readonly stages = computed(() => {
    const parts = this.d().stages;
    const total = parts.reduce((s, p) => s + p.amount, 0);
    return { total, parts: parts.map((p) => ({ ...p, pct: total ? Math.round((p.amount / total) * 100) : 0 })) };
  });

  /** Giving journey for the overview: pledged -> promised -> received -> reconciled. */
  protected readonly journey = computed(() => {
    const d = this.d();
    const promised = d.promises.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.amount, 0);
    const reconciled = d.gifts.filter((g) => g.status === 'Reconciled').reduce((s, g) => s + g.amount, 0);
    return [
      { key: 'pledged', label: 'Pledged', amount: d.pledged, note: d.pledged ? 'Open pledges' : 'None yet', icon: 'pledge' },
      { key: 'promised', label: 'Promised', amount: promised, note: promised ? 'Awaiting payment' : 'No promises', icon: 'promise' },
      { key: 'received', label: 'Received', amount: this.received(), note: d.gifts.length + (d.gifts.length === 1 ? ' gift' : ' gifts'), icon: 'gift' },
      { key: 'reconciled', label: 'Reconciled', amount: reconciled, note: reconciled ? 'Matched to bank' : 'To reconcile', icon: 'check' }
    ].map((s) => ({ ...s, on: s.amount > 0 }));
  });

  protected readonly promiseCounts = computed(() => {
    const p = this.d().promises;
    return { pending: p.filter((x) => x.status === 'Pending').length, fulfilled: p.filter((x) => x.status === 'Fulfilled').length };
  });

  // ---------- follow-ups ----------
  private isOpen(f: D360FollowUp): boolean { return f.status !== 'Completed'; }
  private isOverdue(f: D360FollowUp): boolean { return this.isOpen(f) && f.due < this.today; }

  protected readonly followCounts = computed(() => {
    const list = this.d().followUps;
    return {
      all: list.length,
      open: list.filter((f) => this.isOpen(f)).length,
      overdue: list.filter((f) => this.isOverdue(f)).length,
      closed: list.filter((f) => !this.isOpen(f)).length
    };
  });

  protected readonly followTabs = computed(() => {
    const c = this.followCounts();
    return [
      { key: 'all' as FollowFilter, label: 'All', count: c.all },
      { key: 'open' as FollowFilter, label: 'Open', count: c.open },
      { key: 'overdue' as FollowFilter, label: 'Overdue', count: c.overdue },
      { key: 'closed' as FollowFilter, label: 'Closed', count: c.closed }
    ];
  });

  protected readonly followRows = computed(() => {
    const f = this.followFilter();
    const q = this.followQuery().trim().toLowerCase();
    return this.d().followUps
      .filter((x) => f === 'all' || (f === 'open' && this.isOpen(x)) || (f === 'overdue' && this.isOverdue(x)) || (f === 'closed' && !this.isOpen(x)))
      .filter((x) => !q || (x.title + ' ' + x.owner).toLowerCase().includes(q))
      .sort((a, b) => b.due.localeCompare(a.due));
  });

  // ---------- activity, grouped by month ----------
  protected readonly activityGroups = computed(() => {
    const q = this.activityQuery().trim().toLowerCase();
    const groups: { label: string; items: D360Activity[] }[] = [];
    for (const a of [...this.d().activity].sort((x, y) => y.date.localeCompare(x.date))) {
      if (q && !(a.text + ' ' + a.by).toLowerCase().includes(q)) continue;
      const dt = parse(a.date);
      const label = MONTHS[dt.getMonth()] + ' ' + dt.getFullYear();
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(a); else groups.push({ label, items: [a] });
    }
    return groups;
  });

  // ---------- headline figures ----------
  protected readonly stats = computed(() => {
    const d = this.d();
    const pc = this.promiseCounts();
    const fc = this.followCounts();
    return [
      { key: 'lifetime', label: 'Lifetime received', value: rupees(this.received()), note: d.gifts.length + (d.gifts.length === 1 ? ' gift' : ' gifts'), icon: 'gift', tone: 'primary' },
      { key: 'pledged', label: 'Pledged', value: rupees(d.pledged), note: d.pledged ? 'Open pledges' : 'None yet', icon: 'pledge', tone: 'blue' },
      { key: 'promises', label: 'Promises pending', value: String(pc.pending), note: pc.fulfilled + ' fulfilled', icon: 'promise', tone: 'amber' },
      { key: 'followups', label: 'Open follow-ups', value: String(fc.open), note: fc.overdue + ' overdue', icon: 'flag', tone: fc.overdue ? 'red' : 'green' },
      { key: 'documents', label: 'Documents', value: String(d.documents), note: d.documents ? 'On file' : 'None on file', icon: 'file', tone: 'muted' }
    ];
  });

  protected readonly comingUp = computed(() => {
    const d = this.d();
    const next = d.followUps.filter((f) => this.isOpen(f)).sort((a, b) => a.due.localeCompare(b.due))[0];
    const promise = d.promises.find((p) => p.status === 'Pending');
    return [
      { key: 'followup', label: 'Next follow-up', text: next ? next.title + ' · ' + this.longDate(next.due) : 'Nothing scheduled.', empty: !next, icon: 'schedule' },
      { key: 'promise', label: 'Promise due', text: promise ? rupees(promise.amount) + ' · ' + (promise.due ? this.longDate(promise.due) : 'no date set') : 'No pending promises.', empty: !promise, icon: 'promise' },
      { key: 'document', label: 'Latest document', text: d.latestDocument ?? 'No documents uploaded.', empty: !d.latestDocument, icon: 'file' }
    ];
  });

  // ---------- intent: derived values ----------
  protected readonly iSymbol = computed(() => INTENT_CURRENCIES.find((c) => c.code === this.iCurrency())?.symbol ?? '₹');
  protected readonly iAmountNum = computed(() => Number(this.iAmount().replace(/\D/g, '')) || 0);
  /** Amount shown with grouping (Indian style for INR). */
  protected readonly iAmountText = computed(() => {
    const n = this.iAmountNum();
    if (!n) return '';
    return new Intl.NumberFormat(this.iCurrency() === 'INR' ? 'en-IN' : 'en-US').format(n);
  });
  protected readonly iWords = computed(() => {
    const n = this.iAmountNum();
    if (!n) return '';
    const unit = { INR: 'rupees', USD: 'dollars', EUR: 'euros', GBP: 'pounds' }[this.iCurrency()];
    const w = inWords(n);
    return w.charAt(0).toUpperCase() + w.slice(1) + ' ' + unit + ' only';
  });
  protected readonly iDateLabel = computed(() => (this.iDate() ? this.longDate(this.iDate()) : ''));

  protected readonly iErrors = computed(() => ({
    amount: this.iAmountNum() > 0 ? '' : 'Enter the amount the donor intends to give',
    date: this.iWhen() === 'custom' && !this.iDate() ? 'Pick a date' : '',
    notes: this.iNotes().trim().length >= NOTES_MIN ? '' : 'Add at least ' + NOTES_MIN + ' characters'
  }));
  protected readonly iValid = computed(() => !Object.values(this.iErrors()).some((e) => e));

  /** Calendar grid for the custom date picker: weeks of { iso, day, out (other month), past, today }. */
  protected readonly calWeeks = computed(() => {
    const m = this.calMonth();
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start on Monday
    const weeks: { iso: string; day: number; out: boolean; past: boolean; today: boolean }[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + i);
        const id = iso(d);
        row.push({ iso: id, day: d.getDate(), out: d.getMonth() !== m.getMonth(), past: id < this.today, today: id === this.today });
      }
      weeks.push(row);
    }
    return weeks;
  });
  protected readonly calTitle = computed(() => MONTHS[this.calMonth().getMonth()] + ' ' + this.calMonth().getFullYear());

  // ---------- intent: actions ----------
  createIntent(): void {
    this.iCurrency.set('INR');
    this.iAmount.set('');
    this.iWhen.set('none');
    this.iDate.set('');
    this.iNotes.set('');
    this.iTried.set(false);
    this.curOpen.set(false);
    this.calOpen.set(false);
    this.intentOpen.set(true);
  }

  closeIntent(): void {
    this.intentOpen.set(false);
    this.curOpen.set(false);
    this.calOpen.set(false);
  }

  setAmount(v: string): void { this.iAmount.set(v.replace(/\D/g, '').slice(0, 12)); }
  pickCurrency(code: IntentCurrency): void { this.iCurrency.set(code); this.curOpen.set(false); }

  /** Shortcut chips fill in the date. */
  setWhen(k: IntentWhen): void {
    const d = new Date(this.today + 'T00:00:00');
    if (k === '2w') d.setDate(d.getDate() + 14);
    if (k === 'eom') d.setMonth(d.getMonth() + 1, 0);
    if (k === '3m') d.setMonth(d.getMonth() + 3);
    this.iWhen.set(k);
    this.iDate.set(k === 'none' ? '' : iso(d));
    if (k !== 'none') this.calMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    this.calOpen.set(false);
  }

  toggleCal(): void {
    if (!this.calOpen() && this.iDate()) {
      const d = new Date(this.iDate() + 'T00:00:00');
      this.calMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.calOpen.set(!this.calOpen());
    this.curOpen.set(false);
  }

  moveCal(step: number): void {
    const m = this.calMonth();
    this.calMonth.set(new Date(m.getFullYear(), m.getMonth() + step, 1));
  }

  pickDate(id: string): void {
    if (id < this.today) return;
    this.iDate.set(id);
    this.iWhen.set('custom');
    this.calOpen.set(false);
  }

  clearDate(): void { this.setWhen('none'); }

  submitIntent(): void {
    this.iTried.set(true);
    if (!this.iValid()) return;
    const amount = this.iAmountNum();
    this.d.update((d) => ({
      ...d,
      promises: [...d.promises, { due: this.iDate(), amount, status: 'Pending' as const }],
      activity: [{ date: this.today, text: 'Donation intent of ' + this.iSymbol() + this.iAmountText() + ' recorded.', by: 'You', kind: 'gift' as const }, ...d.activity]
    }));
    this.closeIntent();
    this.flash('Donation intent of ' + this.iSymbol() + this.iAmountText() + ' recorded for ' + this.d().name + '.');
  }

  /** Left menu: one entry per section card. */
  protected readonly sections = computed(() => {
    const d = this.d();
    return [
      { id: 'overview', label: 'Overview', icon: 'gift', count: null as number | null },
      { id: 'profile', label: 'Profile', icon: 'user', count: null },
      { id: 'activity', label: 'Activity', icon: 'timeline', count: d.activity.length },
      { id: 'gifts', label: 'Gifts', icon: 'pledge', count: d.gifts.length },
      { id: 'campaigns', label: 'Campaigns', icon: 'flag', count: d.campaigns.length },
      { id: 'promises', label: 'Promises', icon: 'promise', count: d.promises.length },
      { id: 'followups', label: 'Follow-ups', icon: 'schedule', count: d.followUps.length },
      { id: 'consent', label: 'Consent', icon: 'shield', count: d.channels.length }
    ];
  });

  /** Jump to a section card. */
  go(id: string): void {
    this.section.set(id);
    document.getElementById('dx-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- template helpers ----------
  icon(n: string): string { return ICONS[n] ?? ''; }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  /** '2026-10-13' -> '13', 'Oct 2026', 'Tue', '13 Oct 2026' */
  day(iso: string): string { return String(parse(iso).getDate()).padStart(2, '0'); }
  monthYear(iso: string): string { const d = parse(iso); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  weekday(iso: string): string { return DAYS[parse(iso).getDay()]; }
  longDate(iso: string): string { const d = parse(iso); return this.day(iso) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  consentTone(state: string): string {
    return state === 'Granted' ? 'tone-green' : state === 'Withdrawn' ? 'tone-red' : 'tone-amber';
  }

  // ---------- actions (wire to the real dialogs / services) ----------
  /** Timeline button: scroll to the activity card. */
  timeline(): void { this.go('activity'); }
  schedule(): void { this.flash('Schedule a follow-up for ' + this.d().name + '.'); }
  exportHistory(): void { this.flash('History export queued for ' + this.d().name + '.'); }
  editProfile(): void {
    this.router.navigate([this.editPath], { queryParams: { ref: this.d().code } });
  }
  manageConsent(): void { this.flash('Manage consent opened.'); }
  refresh(): void { this.flash('Donor record refreshed.'); }

  copy(text: string): void {
    navigator.clipboard?.writeText(text);
    this.flash('Copied ' + text);
  }

  flash(message: string): void {
    this.toast.set(message);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 2600);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.curOpen() || this.calOpen()) { this.curOpen.set(false); this.calOpen.set(false); return; }
    if (this.intentOpen()) { this.closeIntent(); return; }
    this.toast.set(null);
  }
}