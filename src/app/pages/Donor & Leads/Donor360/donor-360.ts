import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DonorApiService } from '../../../Service/donor-api.service';
import { DonLookupItem, Donor360Response } from '../../../Shared/models/donor-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

export type FollowFilter = 'all' | 'open' | 'overdue' | 'closed';
export type D360Tab = 'overview' | 'giving' | 'activity' | 'profile' | 'documents';
export type ActivityKind = D360Activity['kind'];

export interface D360Gift { ref: string; date: string; campaign: string; amount: number; status: 'Recorded' | 'Reconciled' | 'Pending'; }
export interface D360Campaign { name: string; code: string; via: string; converted: string; given: number; gifts: number; status: 'Converted' | 'Open' | 'Lost'; }
export interface D360Promise { due: string; amount: number; status: 'Pending' | 'Fulfilled'; }
export interface D360FollowUp { due: string; title: string; owner: string; priority: 'Urgent' | 'High' | 'Normal'; status: 'Open' | 'Completed'; }
export interface D360Channel {
  channel: string; state: 'Granted' | 'Withdrawn' | 'Pending'; since: string; publicThanks: boolean;
  /** The API's channel code, the consent record in force and its version, and what this caller may do ("Grant" / "Withdraw"). */
  value: string; consentId: string | null; version: number | null; actions: string[]; stateLabel: string;
}
export interface D360Activity { date: string; title: string; text: string; by: string; kind: 'view' | 'gift' | 'note' | 'consent'; }

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

const EMPTY: D360Donor = {
  code: '', name: '', status: 'Active', updated: '', phone: '', email: '', owner: '', language: '', contactBy: [],
  pledged: 0, documents: 0, stages: [], gifts: [], campaigns: [], promises: [], followUps: [],
  consent: { state: 'Unknown', doNotContact: false, lastRecorded: '', notice: '' }, channels: [], activity: [], latestDocument: null
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (utc: string | null | undefined): string => {
  if (!utc) return '';
  const d = new Date(utc);
  return d.getDate() + ' ' + SHORT_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
};
const dayOf = (utc: string | null | undefined): string => {
  if (!utc) return '';
  const d = new Date(utc);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const n = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z]/g, '');
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const humanize = (code: string | null | undefined): string => {
  const last = (code ?? '').split('.').pop() ?? '';
  const s = last.replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Activity';
};

function toD360(r: Donor360Response): D360Donor {
  const d = r.donor;
  const tones: D360Donor['stages'][number]['tone'][] = ['primary', 'green', 'amber', 'blue'];
  const statusOf = (s: string): D360Donor['status'] => {
    const k = n(s);
    return k === 'prospect' ? 'Prospect' : k === 'restricted' ? 'Restricted' : k === 'archived' ? 'Archived' : k === 'merged' ? 'Merged' : 'Active';
  };
  const consentState = (s: string): 'Granted' | 'Withdrawn' | 'Unknown' => {
    const k = n(s);
    return k.startsWith('grant') || k.startsWith('partial') ? 'Granted' : k.startsWith('withdr') ? 'Withdrawn' : 'Unknown';
  };
  const chState = (s: string): 'Granted' | 'Withdrawn' | 'Pending' => {
    const k = n(s);
    return k.startsWith('grant') ? 'Granted' : k.startsWith('withdr') ? 'Withdrawn' : 'Pending';
  };
  const giftStatus = (s: string): D360Gift['status'] => {
    const k = n(s);
    return k.includes('reconcil') ? 'Reconciled' : k.includes('pend') ? 'Pending' : 'Recorded';
  };
  const prefs = r.communicationPreferences ?? [];
  return {
    code: r.donorReference || d.donorNumber,
    name: d.displayName,
    status: statusOf(d.status),
    updated: fmt(d.updatedAtUtc ?? d.createdAtUtc),
    phone: d.primaryPhone ?? '',
    email: d.primaryEmail ?? '',
    owner: d.relationshipOwnerName ?? '',
    language: d.preferredLanguage ?? '',
    contactBy: prefs.filter((p) => consentState(p.consentState) === 'Granted').map((p) => p.channel),
    pledged: (r.donationTotalsByStage ?? []).filter((t) => n(t.stage).includes('pledge')).reduce((x, t) => x + t.totalAmount, 0),
    documents: (r.documents ?? []).length,
    stages: (r.donationTotalsByStage ?? []).map((t, i) => ({
      label: t.stage, amount: t.totalAmount, asOf: fmt(t.asAtUtc), tone: tones[i % tones.length]
    })),
    gifts: (r.donations ?? []).map((g) => ({
      ref: g.reference, date: dayOf(g.donatedAtUtc), campaign: g.campaignName ?? '', amount: g.amount - (g.refundedAmount ?? 0),
      status: giftStatus(g.statusLabel ?? g.status)
    })),
    campaigns: (r.campaignHistory ?? []).map((c) => ({
      name: c.campaignName, code: c.campaignCode, via: c.leadReference, converted: fmt(c.convertedAtUtc),
      given: c.amount, gifts: c.giftCount, status: c.convertedAtUtc ? 'Converted' as const : c.giftCount ? 'Open' as const : 'Lost' as const
    })),
    promises: (r.promises ?? []).map((p) => ({
      due: dayOf(p.dueAtUtc), amount: p.amount, status: n(p.statusLabel ?? p.status).startsWith('fulfil') ? 'Fulfilled' as const : 'Pending' as const
    })),
    followUps: (r.followUps ?? []).map((f) => ({
      due: dayOf(f.dueAtUtc), title: f.nextAction ?? f.purpose ?? f.followUpReference, owner: f.relationshipOwnerName ?? '',
      priority: n(f.priority) === 'urgent' ? 'Urgent' as const : n(f.priority) === 'high' ? 'High' as const : 'Normal' as const,
      status: f.isOpen ? 'Open' as const : 'Completed' as const
    })),
    consent: {
      state: consentState(r.consentStatus?.overallState ?? ''),
      doNotContact: d.doNotContact,
      lastRecorded: fmt(r.consentStatus?.lastRecordedAtUtc),
      notice: r.consentStatus?.noticeVersion ?? ''
    },
    channels: prefs.map((p) => ({
      channel: p.channelLabel ?? p.channel, state: chState(p.consentState), since: fmt(p.effectiveAtUtc), publicThanks: p.publicRecognitionPreference,
      value: p.channel, consentId: p.consentId ?? null, version: p.version ?? null, actions: p.permittedActions ?? [],
      stateLabel: p.consentStateLabel ?? p.consentState
    })),
    activity: (r.activityHistory ?? []).map((a) => {
      const k = n(a.actionCode);
      const kind = k.includes('view') ? 'view' as const
        : k.includes('consent') ? 'consent' as const
        : k.includes('donation') || k.includes('gift') ? 'gift' as const
        : 'note' as const;
      const title = kind === 'view' ? 'Donor record reviewed'
        : kind === 'consent' ? 'Consent updated'
        : kind === 'gift' ? 'Gift activity'
        : humanize(a.actionCode);
      return { date: dayOf(a.occurredAtUtc), title, text: a.reason || a.actionCode, by: a.actorName ?? '', kind };
    }),
    latestDocument: (r.documents ?? [])[0]?.name ?? null
  };
}

const ICONS: Record<string, string> = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  timeline: 'M21 12a9 9 0 1 1-4.2-7.6L21 3v5h-5 M12 7v5l3 3',
  schedule: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18 M12 14v4 M10 16h4',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  gift: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  pledge: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z',
  heart: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z',
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
export class Donor360 implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DonorApiService);
  private donorId = '';
  protected readonly loading = signal(false);

  protected readonly rupees = rupees;
  protected readonly listPath = '/app/fundraising/relationships/all-donors';
  protected readonly editPath = '/app/fundraising/relationships/donor-360/edit';
  /** "today" for overdue checks - the server date in the real app */
  private readonly today = new Date().toISOString().slice(0, 10);

  /** Donor on screen - loaded from the API for the reference in the URL. */
  protected readonly d = signal<D360Donor>({ ...EMPTY, code: this.route.snapshot.queryParamMap.get('ref') ?? '' });

  ngOnInit(): void {
    this.load();
    // The pledge form's currencies: the active ones in the currency master, from /donors/reference-data.
    this.api.getReferenceData().subscribe({
      next: (r) => this.currencyCatalogue.set(r.currencies ?? []),
      error: () => this.currencyCatalogue.set([])
    });
  }

  /** Resolves the reference to the donor's id, then loads the one Donor 360 payload. */
  private load(done?: () => void): void {
    const ref = this.route.snapshot.queryParamMap.get('ref') ?? '';
    this.loading.set(true);
    const fetch = (id: string) => this.api.getDonor360(id).subscribe({
      next: (r) => {
        this.donorId = r.donor.id; this.d.set(toD360(r)); this.loading.set(false); done?.();
      },
      error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); }
    });
    if (this.donorId) { fetch(this.donorId); return; }
    this.api.searchDonors({ search: ref, pageSize: 10 }).subscribe({
      next: (p) => {
        const hit = p.items.find((x) => x.displayCode === ref) ?? p.items[0];
        if (!hit) { this.loading.set(false); this.flash('That donor could not be found.'); return; }
        fetch(hit.id);
      },
      error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  protected readonly followFilter = signal<FollowFilter>('all');
  protected readonly activityKind = signal<'all' | ActivityKind>('all');
  /** search boxes (bound in the template) */
  protected readonly activityQuery = signal('');
  protected readonly followQuery = signal('');
  protected readonly toast = signal<string | null>(null);
  private toastTimer = 0;

  // ---------- create donation intent (popup) ----------
  private readonly currencyCatalogue = signal<DonLookupItem[]>([]);
  protected get currencies(): { code: string; symbol: string; label: string }[] {
    return this.currencyCatalogue().map((c) => ({ code: c.value, symbol: c.description || this.symbolOf(c.value), label: c.label }));
  }
  /** The currency's own glyph, from the platform's locale data rather than a list of ours. */
  private symbolOf(code: string): string {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
    } catch { return code; }
  }
  protected readonly quickAmounts = INTENT_QUICK;
  protected readonly whenOptions = INTENT_WHEN;
  protected readonly notesMin = NOTES_MIN;
  protected readonly intentOpen = signal(false);
  protected readonly iCurrency = signal<string>('INR');
  protected readonly iAmount = signal('');
  protected readonly iWhen = signal<IntentWhen>('none');
  protected readonly iDate = signal('');
  protected readonly iNotes = signal('');
  protected readonly iTried = signal(false);
  protected readonly curOpen = signal(false);
  protected readonly calOpen = signal(false);
  protected readonly calMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // ---------- tabs ----------
  protected readonly tab = signal<D360Tab>('overview');
  protected readonly tabs = computed(() => [
    { key: 'overview' as D360Tab, label: 'Overview', count: null as number | null },
    { key: 'giving' as D360Tab, label: 'Giving & promises', count: this.d().gifts.length || null },
    { key: 'activity' as D360Tab, label: 'Activity & follow-ups', count: null },
    { key: 'profile' as D360Tab, label: 'Profile & consent', count: null },
    { key: 'documents' as D360Tab, label: 'Documents', count: null }
  ]);

  setTab(t: D360Tab): void { this.tab.set(t); }

  protected readonly showLeft = computed(() => ['overview', 'profile', 'documents'].includes(this.tab()));
  protected readonly showProfile = computed(() => ['overview', 'profile'].includes(this.tab()));
  protected readonly showDocuments = computed(() => ['overview', 'documents'].includes(this.tab()));
  protected readonly showCentre = computed(() => ['overview', 'giving', 'activity'].includes(this.tab()));
  protected readonly showGiving = computed(() => ['overview', 'giving'].includes(this.tab()));
  protected readonly showTimeline = computed(() => ['overview', 'activity'].includes(this.tab()));
  protected readonly showRight = computed(() => ['overview', 'giving'].includes(this.tab()));
  protected readonly showNext = computed(() => this.tab() === 'overview');
  protected readonly showFollow = computed(() => ['overview', 'activity'].includes(this.tab()));

  // ---------- giving ----------
  protected readonly received = computed(() => this.d().gifts.reduce((s, g) => s + g.amount, 0));
  protected readonly avgGift = computed(() => (this.d().gifts.length ? this.received() / this.d().gifts.length : 0));

  protected readonly stages = computed(() => {
    const parts = this.d().stages;
    const total = parts.reduce((s, p) => s + p.amount, 0);
    return { total, parts: parts.map((p) => ({ ...p, pct: total ? Math.round((p.amount / total) * 100) : 0 })) };
  });

  private readonly giftsNewestFirst = computed(() => [...this.d().gifts].sort((a, b) => b.date.localeCompare(a.date)));
  protected readonly latestGift = computed(() => this.giftsNewestFirst()[0] ?? null);
  protected readonly firstGift = computed(() => { const g = this.giftsNewestFirst(); return g[g.length - 1] ?? null; });

  /** Received per month, last three months - drives the small chart. */
  protected readonly monthBars = computed(() => {
    const base = new Date(this.today + 'T00:00:00');
    const rows = [2, 1, 0].map((back) => {
      const m = new Date(base.getFullYear(), base.getMonth() - back, 1);
      const key = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
      const total = this.d().gifts.filter((g) => g.date.startsWith(key)).reduce((s, g) => s + g.amount, 0);
      return { label: MONTHS[m.getMonth()].toUpperCase(), total };
    });
    const max = Math.max(1, ...rows.map((r) => r.total));
    return rows.map((r) => ({ ...r, h: r.total ? Math.max(8, Math.round((r.total / max) * 62)) : 3, mini: r.total ? Math.max(8, Math.round((r.total / max) * 27)) : 4 }));
  });
  protected readonly chartYear = computed(() => this.today.slice(0, 4));

  /** Giving journey: pledged -> promised -> received -> reconciled (each step has icon + note for the template). */
  protected readonly journey = computed(() => {
    const d = this.d();
    const pend = d.promises.filter((p) => p.status === 'Pending');
    const promised = pend.reduce((s, p) => s + p.amount, 0);
    const rec = d.gifts.filter((g) => g.status === 'Reconciled');
    const reconciled = rec.reduce((s, g) => s + g.amount, 0);
    const steps = [
      { key: 'pledged',    label: 'Pledged',    amount: d.pledged,        icon: 'pledge',  note: d.pledged ? 'Open pledges' : 'None yet' },
      { key: 'promised',   label: 'Promised',   amount: promised,         icon: 'promise', note: pend.length + (pend.length === 1 ? ' pending' : ' pending') },
      { key: 'received',   label: 'Received',   amount: this.received(),  icon: 'gift',    note: d.gifts.length + (d.gifts.length === 1 ? ' gift' : ' gifts') },
      { key: 'reconciled', label: 'Reconciled', amount: reconciled,       icon: 'check',   note: rec.length + (rec.length === 1 ? ' gift' : ' gifts') }
    ];
    const lastOn = steps.reduce((acc, s, i) => (s.amount > 0 ? i : acc), -1);
    return steps.map((s, i) => ({ ...s, on: s.amount > 0, current: i === lastOn }));
  });

  /** Share of promised + received money that has actually been received. */
  protected readonly ringPct = computed(() => {
    const pending = this.d().promises.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.amount, 0);
    const den = this.received() + pending;
    return den ? Math.round((this.received() / den) * 100) : 0;
  });
  protected readonly ringDash = computed(() => ((this.ringPct() / 100) * 308).toFixed(1) + ' 308');

  protected readonly awaiting = computed(() => this.d().gifts.filter((g) => g.status !== 'Reconciled').reduce((s, g) => s + g.amount, 0));

  protected readonly promiseCounts = computed(() => {
    const p = this.d().promises;
    const pending = p.filter((x) => x.status === 'Pending');
    return {
      pending: pending.length,
      fulfilled: p.filter((x) => x.status === 'Fulfilled').length,
      overdue: pending.filter((x) => x.due && x.due < this.today).length
    };
  });

  protected campaignShare(given: number): number {
    const r = this.received();
    return r ? Math.min(100, Math.round((given / r) * 100)) : 0;
  }

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

  /** Next open follow-up. */
  protected readonly nextFollow = computed(() =>
    this.d().followUps.filter((f) => this.isOpen(f)).sort((a, b) => a.due.localeCompare(b.due))[0] ?? null);

  /** Three "coming up" items under the journey (next follow-up, next promise, latest gift). */
  protected readonly comingUp = computed(() => {
    const nf = this.nextFollow();
    const pr = this.d().promises
      .filter((p) => p.status === 'Pending' && p.due)
      .sort((a, b) => a.due.localeCompare(b.due))[0];
    const lg = this.latestGift();
    return [
      { key: 'follow', icon: 'calendar', label: 'Next follow-up', text: nf ? nf.title + ' · ' + this.longDate(nf.due) : 'Nothing scheduled', empty: !nf },
      { key: 'promise', icon: 'promise', label: 'Next promise', text: pr ? rupees(pr.amount) + ' · ' + this.longDate(pr.due) : 'No pending promise', empty: !pr },
      { key: 'gift', icon: 'gift', label: 'Latest gift', text: lg ? rupees(lg.amount) + ' · ' + this.longDate(lg.date) : 'No gifts yet', empty: !lg }
    ];
  });

  // ---------- activity timeline, grouped by month ----------
  protected readonly activityTabs = computed(() => {
    const a = this.d().activity;
    const c = (k: ActivityKind) => a.filter((x) => x.kind === k).length;
    return [
      { key: 'all' as const, label: 'All activity', count: a.length },
      { key: 'gift' as const, label: 'Giving', count: c('gift') },
      { key: 'consent' as const, label: 'Contact', count: c('consent') },
      { key: 'note' as const, label: 'Notes', count: c('note') },
      { key: 'view' as const, label: 'System', count: c('view') }
    ];
  });

  protected readonly activityShown = computed(() => {
    const k = this.activityKind();
    return this.d().activity.filter((a) => k === 'all' || a.kind === k).length;
  });

  protected readonly activityGroups = computed(() => {
    const k = this.activityKind();
    const q = this.activityQuery().trim().toLowerCase();
    const groups: { label: string; items: D360Activity[] }[] = [];
    for (const a of [...this.d().activity].sort((x, y) => y.date.localeCompare(x.date))) {
      if (k !== 'all' && a.kind !== k) continue;
      if (q && !(a.title + ' ' + a.text + ' ' + a.by).toLowerCase().includes(q)) continue;
      const dt = parse(a.date);
      const label = (FULL_MONTHS[dt.getMonth()] + ' ' + dt.getFullYear()).toUpperCase();
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(a); else groups.push({ label, items: [a] });
    }
    return groups;
  });

  protected readonly activityCount = computed(() => this.activityGroups().reduce((s, g) => s + g.items.length, 0));

  protected activityIcon(kind: ActivityKind): string {
    return kind === 'gift' ? 'gift' : kind === 'consent' ? 'shield' : kind === 'note' ? 'note' : 'user';
  }

  // ---------- headline figures ----------
  protected readonly stats = computed(() => {
    const d = this.d();
    const pc = this.promiseCounts();
    const fc = this.followCounts();
    return [
      { key: 'lifetime', label: 'Lifetime received', value: rupees(this.received()), note: d.gifts.length + (d.gifts.length === 1 ? ' successful gift' : ' successful gifts'), icon: 'gift', tone: 'green', view: 'giving' as D360Tab },
      { key: 'pledged', label: 'Pledged amount', value: rupees(d.pledged), note: d.pledged ? 'Open pledges' : 'No pledge recorded', icon: 'heart', tone: 'primary', view: 'giving' as D360Tab },
      { key: 'promises', label: 'Pending promises', value: String(pc.pending), note: pc.pending ? pc.pending + ' awaiting payment' : 'Nothing awaiting payment', icon: 'calendar', tone: 'amber', view: 'giving' as D360Tab },
      { key: 'followups', label: 'Open follow-ups', value: String(fc.open), note: fc.closed + ' completed · ' + fc.overdue + ' overdue', icon: 'clock', tone: 'blue', view: 'activity' as D360Tab },
      { key: 'documents', label: 'Documents', value: String(d.documents), note: d.documents ? 'On file' : 'No files attached', icon: 'file', tone: 'red', view: 'documents' as D360Tab }
    ];
  });

  /** "Relationship next step" card - picks the most useful nudge. */
  protected readonly next = computed(() => {
    const d = this.d();
    const fc = this.followCounts();
    const pc = this.promiseCounts();
    const first = d.name.split(' ')[0] || 'this donor';
    const gifts = d.gifts.length;
    if (fc.overdue) {
      return { title: 'A follow-up is overdue.', text: `Reach out to ${first} today and note how it went, so the relationship does not go quiet.`, reason: fc.overdue + (fc.overdue === 1 ? ' overdue follow-up' : ' overdue follow-ups') };
    }
    if (pc.pending) {
      return { title: 'A promise is waiting to be paid.', text: `Send ${first} a gentle reminder and share the donation link.`, reason: pc.pending + (pc.pending === 1 ? ' pending promise' : ' pending promises') };
    }
    if (!fc.open) {
      return {
        title: gifts === 1 ? 'Turn a first gift into a lasting relationship.' : 'Keep the relationship warm.',
        text: gifts ? `Schedule a personal thank-you and share how the campaign is progressing.` : `Make a first personal contact and learn what ${first} cares about.`,
        reason: gifts + (gifts === 1 ? ' gift received' : ' gifts received') + ' · no upcoming follow-up'
      };
    }
    return { title: 'Stay on track with the plan.', text: `A follow-up with ${first} is already scheduled. Add notes as you go.`, reason: fc.open + (fc.open === 1 ? ' open follow-up' : ' open follow-ups') };
  });

  // ---------- consent: grant / withdraw one channel (POST consent-and-preference-centre/grant | {id}/withdraw) ----------
  protected readonly consentEdit = signal<{ action: 'Grant' | 'Withdraw'; ch: D360Channel } | null>(null);
  protected readonly consentReason = signal('');
  protected readonly consentTried = signal(false);
  protected readonly consentBusy = signal(false);
  protected readonly consentMin = 10;

  protected openConsent(ch: D360Channel, action: string): void {
    if (!ch.actions.includes(action)) return;
    this.consentReason.set('');
    this.consentTried.set(false);
    this.consentEdit.set({ action: action as 'Grant' | 'Withdraw', ch });
  }
  protected closeConsent(): void { if (!this.consentBusy()) this.consentEdit.set(null); }

  protected confirmConsent(): void {
    const e = this.consentEdit();
    if (!e || this.consentBusy()) return;
    this.consentTried.set(true);
    const reason = this.consentReason().trim();
    if (reason.length < this.consentMin) return;
    const grant = e.action === 'Grant';
    if (!grant && !e.ch.consentId) return;
    this.consentBusy.set(true);
    const call = grant
      ? this.api.grantConsent({
          donorId: this.donorId, purpose: reason, channel: e.ch.value, evidenceSource: 'Donor 360',
          effectiveAtUtc: new Date().toISOString(), publicRecognitionPreference: e.ch.publicThanks
        })
      : this.api.withdrawConsent(e.ch.consentId!, { reason, expectedVersion: e.ch.version });
    call.subscribe({
      next: () => {
        this.consentBusy.set(false);
        this.consentEdit.set(null);
        this.load(() => this.flash(grant ? `${e.ch.channel} consent recorded.` : `${e.ch.channel} consent withdrawn. No further contact is permitted on this channel.`));
      },
      error: (err: unknown) => { this.consentBusy.set(false); this.flash(apiErrorMessage(err)); }
    });
  }

  protected consentTitle(): string {
    const s = this.d().consent.state;
    return s === 'Granted' ? 'Contact permitted' : s === 'Withdrawn' ? 'Contact withdrawn' : 'Consent not recorded';
  }

  // ---------- intent: derived values ----------
  protected readonly iSymbol = computed(() => {
    const code = this.iCurrency();
    const hit = this.currencyCatalogue().find((c) => c.value === code);
    return hit?.description || this.symbolOf(code);
  });
  protected readonly iAmountNum = computed(() => Number(this.iAmount().replace(/\D/g, '')) || 0);
  protected readonly iAmountText = computed(() => {
    const n = this.iAmountNum();
    if (!n) return '';
    return new Intl.NumberFormat(this.iCurrency() === 'INR' ? 'en-IN' : 'en-US').format(n);
  });
  protected readonly iWords = computed(() => {
    const n = this.iAmountNum();
    if (!n) return '';
    // "Indian Rupee" -> "rupees": the unit comes from the currency's own name
    let name: string = this.iCurrency();
    try { name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(this.iCurrency()) ?? name; } catch { /* keep the code */ }
    const unit = (name.split(/\s+/).pop() ?? name).toLowerCase() + 's';
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
    const known = this.currencyCatalogue().map((c) => c.value);
    this.iCurrency.set(known.includes('INR') || !known.length ? 'INR' : known[0]);
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
  pickCurrency(code: string): void { this.iCurrency.set(code); this.curOpen.set(false); }

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
    const label = this.iSymbol() + this.iAmountText();
    this.api.createDonorIntent(this.donorId, {
      amount,
      currency: this.iCurrency(),
      dueAtUtc: this.iDate() ? new Date(this.iDate() + 'T23:59:00').toISOString() : null,
      notes: this.iNotes().trim()
    }).subscribe({
      next: () => {
        this.closeIntent();
        this.load(() => this.flash('Donation intent of ' + label + ' recorded for ' + this.d().name + '.'));
      },
      error: (e: unknown) => this.flash(apiErrorMessage(e))
    });
  }

  // ---------- template helpers (all safe for empty dates) ----------
  icon(n: string): string { return ICONS[n] ?? ''; }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }

  day(iso: string): string { return iso ? String(parse(iso).getDate()).padStart(2, '0') : ''; }
  monthShort(iso: string): string { return iso ? MONTHS[parse(iso).getMonth()] : ''; }
  monthYear(iso: string): string { if (!iso) return ''; const d = parse(iso); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  weekday(iso: string): string { return iso ? DAYS[parse(iso).getDay()] : ''; }
  longDate(iso: string): string { if (!iso) return ''; const d = parse(iso); return this.day(iso) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  consentTone(state: string): string {
    return state === 'Granted' ? 'tone-green' : state === 'Withdrawn' ? 'tone-red' : 'tone-amber';
  }

  // ---------- actions ----------
  timeline(): void { this.tab.set('activity'); }
  schedule(): void {
    this.router.navigate(['/app/fundraising/relationships/follow-up-queue/plan'], { queryParams: { ref: this.d().code } });
  }
  logActivity(): void { this.tab.set('activity'); this.flash('Add the note from the timeline.'); }
  addDocument(): void { this.flash('Document upload is not connected yet.'); }
  exportHistory(): void {
    this.api.exportDonorHistory(this.donorId).subscribe({
      next: ({ blob, fileName }) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
        this.flash('History exported for ' + this.d().name + '.');
      },
      error: (e: unknown) => this.flash(apiErrorMessage(e))
    });
  }
  editProfile(): void {
    this.router.navigate([this.editPath], { queryParams: { ref: this.d().code } });
  }
  manageConsent(): void {
    this.router.navigate(['/app/fundraising/relationships/consent-and-preference-centre'], { queryParams: { ref: this.d().code } });
  }
  refresh(): void { this.load(() => this.flash('Donor record refreshed.')); }

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