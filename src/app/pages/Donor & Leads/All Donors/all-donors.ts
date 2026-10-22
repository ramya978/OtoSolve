import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DonorApiService } from '../../../Service/donor-api.service';
import { DonorListItem, DonorListSummary } from '../../../Shared/models/donor-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { fetchAllPages } from '../../../Shared/services/paging';
import { catchError, of, switchMap } from 'rxjs';


export type DonorStatus = 'Active' | 'Prospect' | 'Restricted' | 'Archived' | 'Merged';

export interface Donor {
  code: string;
  name: string;
  status: DonorStatus;
  phone: string;
  email: string;
  campaign: string;
  owner: string;
  /** card view extras */
  city: string;
  language: string;
  source: string;
  giftCount: number;
  campaigns: string[];
  lastGift: number;
  lastGiftAgo: string;
  lifetime: number;
  lifetimePct: number;
  followUp: 'none' | 'overdue';
  identity: 'unchecked' | 'verified';
  consent: 'allowed' | 'withdrawn' | 'unknown';
}


export const rupees = (n: number): string => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

export const rupeesLakh = (n: number): string => '₹' + (n / 100000).toFixed(2) + ' L';

const AGO_UNITS: [number, string][] = [[365, 'year'], [30, 'month'], [7, 'week'], [1, 'day']];

/** "3 weeks ago" from an ISO instant. */
function ago(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  for (const [size, label] of AGO_UNITS) {
    if (days >= size) {
      const n = Math.floor(days / size);
      return n + ' ' + label + (n > 1 ? 's' : '') + ' ago';
    }
  }
  return 'today';
}

const STATUSES: DonorStatus[] = ['Active', 'Prospect', 'Restricted', 'Archived', 'Merged'];

function toDonor(r: DonorListItem, maxLifetime: number): Donor {
  const status = (STATUSES.find((x) => x.toLowerCase() === (r.status ?? '').toLowerCase()) ?? 'Active') as DonorStatus;
  const verified = (r.verificationStatus ?? '').toLowerCase() === 'verified';
  const consent = (r.consentStatus ?? '').toLowerCase();
  return {
    code: r.displayCode,
    name: r.displayName,
    status,
    phone: r.mobileNumber ?? '',
    email: r.emailAddress ?? '',
    campaign: r.campaignName ?? '',
    owner: r.relationshipOwnerName ?? '',
    city: '',
    language: '',
    source: '',
    giftCount: r.giftCount ?? 0,
    campaigns: r.campaignName ? [r.campaignName] : [],
    lastGift: r.lastDonationAmount ?? 0,
    lastGiftAgo: ago(r.lastDonationAtUtc),
    lifetime: r.lifetimeGiving ?? 0,
    lifetimePct: maxLifetime > 0 ? Math.round(((r.lifetimeGiving ?? 0) / maxLifetime) * 100) : 0,
    followUp: (r.followUpStatus ?? '').toLowerCase() === 'overdue' ? 'overdue' : 'none',
    identity: verified ? 'verified' : 'unchecked',
    consent: consent === 'granted' || consent === 'partial' ? 'allowed' : consent === 'withdrawn' ? 'withdrawn' : 'unknown'
  };
}


export interface Tab {
  key: DonorStatus | 'all';
  label: string;
  count: number;
}

export const TABS: Tab[] = [];

/** Needs-attention items — counts are record-wide, as designed. */
export const ATTENTION: { count: number; label: string; tone: string }[] = [];

const ICON_PATHS: Record<string, string> = {
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  export: 'M12 3v12 M8 7l4-4 4 4 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  search: 'M3 11a8 8 0 1 0 16 0 8 8 0 0 0-16 0 M21 21l-4.35-4.35',
  chev: 'M6 9l6 6 6-6',
  sort: 'M12 4v16 M7 9l5-5 5 5 M7 15l5 5 5-5',
  filters: 'M4 5h16 M7 12h10 M10 19h4',
  table: 'M4 5h16v14H4z M4 10h16 M10 10v9',
  cards: 'M4 5h7v6H4z M13 5h7v6h-7z M4 13h7v6H4z M13 13h7v6h-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  note: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  schedule: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18 M12 14v4 M10 16h4',
  more: 'M12 6h.01 M12 12h.01 M12 18h.01',
  'calendar-alert': 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18 M12 13v3 M12 19h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  'shield-check': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  gift: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  rupee: 'M6 3h12 M6 8h12 M6 13l8.5 8 M6 13h3 M9 13c6.667 0 6.667-10 0-10',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  'id-card': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8.5 15.5a3.5 3.5 0 0 1 7 0',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  donations: 'M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17 M7 21l1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9 M2 16l6 6 M16 9.1a3 3 0 1 0 0-.2 M6 6a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  timeline: 'M21 12a9 9 0 1 1-4.2-7.6L21 3v5h-5 M12 7v5l3 3',
  reassign: 'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M18 8l3 3-3 3 M21 11h-6',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  check: 'M20 6 9 17l-5-5',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6'
};

/** Items in a card's "more" menu. */
export const CARD_MENU = [
  { key: 'open', label: 'Open Donor 360', icon: 'user' },
  { key: 'donations', label: 'Donations', icon: 'donations' },
  { key: 'timeline', label: 'Communication timeline', icon: 'timeline' },
  { key: 'schedule', label: 'Schedule follow-up', icon: 'schedule' },
  { key: 'reassign', label: 'Reassign owner', icon: 'reassign' },
  { key: 'export', label: 'Export history', icon: 'download', divider: true }
] as const;

export type CardMenuKey = (typeof CARD_MENU)[number]['key'];

@Component({
  selector: 'app-all-donors',
  imports: [RouterLink],
  templateUrl: './all-donors.html',
  styleUrl: './all-donors.css'
})
export class AllDonors implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(DonorApiService);
  private readonly route = inject(ActivatedRoute);
  /** My Donors is this same screen, told by the route to list only the donors assigned to the signed-in user. */
  private readonly mine = this.route.snapshot.data['mine'] === true;
  protected get heading(): string { return this.mine ? 'My Donors' : 'All Donors'; }

  private readonly rows = signal<Donor[]>([]);
  private readonly summary = signal<DonorListSummary | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected get all(): Donor[] { return this.rows(); }
  protected readonly rupees = rupees;
  protected readonly rupeesLakh = rupeesLakh;
  protected readonly cardMenu = CARD_MENU;

  private readonly tabsC = computed<Tab[]>(() => {
    const counts = this.summary()?.statusCounts ?? {};
    const count = (k: string) =>
      Object.entries(counts).find(([key]) => key.toLowerCase() === k.toLowerCase())?.[1]
      ?? this.rows().filter((d) => d.status === k).length;
    return [
      { key: 'all', label: 'All donors', count: this.summary()?.donorsOnRecord ?? this.rows().length },
      ...STATUSES.map((k) => ({ key: k, label: k, count: count(k) }))
    ];
  });
  protected get tabs(): Tab[] { return this.tabsC(); }

  private readonly attentionC = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      { count: s.followUpsOverdue, label: 'Follow-ups overdue', tone: 'danger' },
      { count: s.followUpsDueToday, label: 'Follow-ups due today', tone: 'warning' },
      { count: s.identityNotVerified, label: 'Identity not verified', tone: 'info' },
      { count: s.consentToReview, label: 'Consent to review', tone: 'purple' },
      { count: s.withoutOwner, label: 'Without an owner', tone: 'muted' }
    ];
  });
  protected get attention() { return this.attentionC(); }

  /** Header KPI values (record-wide, from the server). */
  private readonly kpisC = computed(() => {
    const s = this.summary();
    const total = s?.donorsOnRecord ?? 0;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    const c = (k: string) =>
      Object.entries(s?.statusCounts ?? {}).find(([key]) => key.toLowerCase() === k)?.[1] ?? 0;
    const active = c('active');
    const prospect = c('prospect');
    const other = Math.max(0, total - active - prospect);
    return {
      lifetime: rupeesLakh(s?.lifetimeReceived ?? 0),
      perDonor: rupees(s?.averagePerGiver ?? 0),
      donors: total,
      active,
      prospect,
      other,
      recent: s?.recentGivers ?? 0,
      recentAmount: rupees(s?.recentGiving ?? 0),
      yetToGive: s?.yetToGive ?? 0,
      activePct: pct(active),
      prospectPct: pct(prospect),
      otherPct: pct(other),
      recentPct: pct(s?.recentGivers ?? 0),
      yetPct: pct(s?.yetToGive ?? 0)
    };
  });
  protected get kpis() { return this.kpisC(); }

  ngOnInit(): void {
    this.load();
  }

  private load(done?: () => void): void {
    this.loading.set(true);
    this.loadError.set(null);
    const onlyMine = this.mine ? true : null;
    // The summary comes first: it carries the order the server opens the list in, and the server
    // rejects a sort it does not know, so the screen never invents one.
    this.api.getDonorSummary(this.mine).pipe(
      catchError(() => of(null)),
      switchMap((summary) => {
        this.summary.set(summary);
        const sort = summary?.options?.defaultSort || undefined;
        return fetchAllPages((page, size) => this.api.searchDonors({ page, pageSize: size, onlyMine, sort }));
      }),
    ).subscribe({
      next: (items) => {
        const max = Math.max(0, ...items.map((i) => i.lifetimeGiving ?? 0));
        this.ids.clear();
        items.forEach((i) => this.ids.set(i.displayCode, i.id));
        this.rows.set(items.map((i) => toDonor(i, max)));
        this.loading.set(false);
        done?.();
      },
      error: (e) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(e));
        this.flash(apiErrorMessage(e));
      }
    });
  }

  protected readonly query = signal('');
  protected readonly tab = signal<DonorStatus | 'all'>('all');
  protected readonly view = signal<'table' | 'cards'>('table');
  protected readonly sortDir = signal<'desc' | 'asc'>('desc');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly toast = signal<string | null>(null);
  /** Cards ticked with the checkbox (by donor code). */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  /** Donor code whose "more" menu is open on a card. */
  protected readonly menuFor = signal<string | null>(null);
  private toastTimer = 0;
  /** donor code -> API id */
  private readonly ids = new Map<string, string>();
  private idOf(code: string): string { return this.ids.get(code) ?? ''; }

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const tab = this.tab();
    const rows = this.all.filter(
      (d) => (tab === 'all' || d.status === tab) &&
        (!q || [d.name, d.code, d.phone, d.email, d.campaign, d.owner].some((v) => v.toLowerCase().includes(q)))
    );
    const dir = this.sortDir() === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => (a.lastGift - b.lastGift) * dir);
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly pageRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });
  protected readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
  protected readonly from = computed(() => (this.filtered().length === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  protected readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.filtered().length));

  setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  setTab(key: DonorStatus | 'all'): void {
    this.tab.set(key);
    this.page.set(1);
  }

  toggleDir(): void {
    this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
  }

  /** Donor 360 opens with the donor reference in the query string. */
  open(d: Donor): void {
    this.router.navigate(['/app/fundraising/relationships/donor-360'], { queryParams: { ref: d.code } });
  }

  act(d: Donor, kind: 'note' | 'schedule' | 'more'): void {
    if (kind === 'note') {
      this.router.navigate(['/app/fundraising/relationships/communication-timeline/log'], { queryParams: { ref: d.code } });
    } else if (kind === 'schedule') {
      this.router.navigate(['/app/fundraising/relationships/follow-up-queue/new'], { queryParams: { ref: d.code } });
    } else {
      this.open(d);
    }
  }

  refresh(): void {
    this.load(() => this.flash('Donor list refreshed.'));
  }

  exportList(): void {
    const ids = this.filtered().map((d) => this.idOf(d.code)).filter(Boolean);
    if (!ids.length) { this.flash('No donors to export.'); return; }
    this.api.exportDonors({ donorIds: ids.join(',') }).subscribe({
      next: ({ blob, fileName }) => { this.download(blob, fileName); this.flash(ids.length + ' donor records exported.'); },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  private download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  flash(message: string): void {
    this.toast.set(message);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 2600);
  }

  // ---------- card view: selection + more menu ----------
  isSelected(d: Donor): boolean {
    return this.selected().has(d.code);
  }

  toggleSelect(d: Donor): void {
    const next = new Set(this.selected());
    if (next.has(d.code)) next.delete(d.code); else next.add(d.code);
    this.selected.set(next);
  }

  toggleMenu(d: Donor, ev: Event): void {
    ev.stopPropagation();
    this.menuFor.set(this.menuFor() === d.code ? null : d.code);
  }

  menuAction(d: Donor, key: CardMenuKey): void {
    this.menuFor.set(null);
    switch (key) {
      case 'open': this.open(d); break;
      case 'donations': this.router.navigate(['/app/fundraising/relationships/donor-360'], { queryParams: { ref: d.code } }); break;
      case 'timeline': this.router.navigate(['/app/fundraising/relationships/communication-timeline'], { queryParams: { ref: d.code } }); break;
      case 'schedule': this.act(d, 'schedule'); break;
      case 'reassign': this.router.navigate(['/app/fundraising/relationships/assignment-board'], { queryParams: { ref: d.code } }); break;
      case 'export':
        this.api.exportDonorHistory(this.idOf(d.code)).subscribe({
          next: ({ blob, fileName }) => { this.download(blob, fileName); this.flash('History exported for ' + d.name + '.'); },
          error: (e) => this.flash(apiErrorMessage(e))
        });
        break;
    }
  }

  /** Any click outside an open menu closes it. */
  @HostListener('document:click')
  onDocClick(): void {
    this.menuFor.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.toast.set(null);
    this.menuFor.set(null);
  }

  icon(name: string): string {
    return ICON_PATHS[name] ?? '';
  }

  /** Two-letter initials ("Abhijit Tarun" -> "AT"). */
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Stable avatar colour per donor name. */
  avatarTone(name: string): string {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
    return 'av-' + (h % 4);
  }

  followLabel(d: Donor): string {
    return d.followUp === 'overdue' ? 'Follow-up overdue' : 'Nothing planned';
  }

  idLabel(d: Donor): string {
    return d.identity === 'verified' ? 'ID verified' : 'ID not checked';
  }

  /** "Allowed" / "Withdrawn" / "Unknown" for the card consent pill. */
  consentLabel(d: Donor): string {
    return d.consent === 'allowed' ? 'Allowed' : d.consent === 'withdrawn' ? 'Withdrawn' : 'Unknown';
  }

  /** Short standing words for the card: "Nothing planned" / "Overdue", "Not checked" / "Verified", "Granted"... */
  followShort(d: Donor): string {
    return d.followUp === 'overdue' ? 'Overdue' : 'Nothing planned';
  }

  idShort(d: Donor): string {
    return d.identity === 'verified' ? 'Verified' : 'Not checked';
  }

  consentShort(d: Donor): string {
    return d.consent === 'allowed' ? 'Granted' : d.consent === 'withdrawn' ? 'Withdrawn' : 'Unknown';
  }

  /** Campaigns line for the card ("Community Care · Learning Together"). */
  campaignsLine(d: Donor): string {
    return d.campaigns.join(' · ');
  }
}