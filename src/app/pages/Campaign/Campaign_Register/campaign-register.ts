import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CampaignApiService } from '../../../Service/campaign-api.service';
import { CampaignStatistics } from '../../../Shared/models/campaign-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { ToastService } from '../../../Shared/services/toast.service';
import { Router } from '@angular/router';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { CampaignInfo, PEOPLE } from '../../../Shared/Campaign/cw.data';
import { formatMoney } from '../../../Shared/services/money-format';

export type CampaignStatus = 'draft' | 'submitted' | 'scheduled' | 'active' | 'paused' | 'closing' | 'closed';

export interface CampaignRow {
  id: string;
  name: string;
  code: string;
  status: CampaignStatus;
  progress: number;
  owner: string;
  /** Every owner of the campaign, main owner first (the "owner" field above is "Name +n"). */
  owners?: string[];
  launch: string;
  ends: string;
  /** List-view engagement metrics that back the KPI strip (single source of truth). */
  received: number;
  target: number;
  currency: string;
  delivered: number;
  replies: number;
  overdue: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmtDate = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Label + theme status tone for each campaign state. */
const STATUS_META: Record<CampaignStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  scheduled: { label: 'Scheduled', tone: 'purple' },
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  closing: { label: 'Closing', tone: 'warning' },
  closed: { label: 'Closed', tone: 'ink' }
};

const ICON_PATHS: Record<string, string> = {
  search: 'M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0 M21 21l-4.35-4.35',
  plus: 'M12 5v14 M5 12h14',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z M14.5 6.5l3 3',
  copy: 'M9 9h10v10H9z M5 15H4V4h11v1',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  filter: 'M3 5h18 M6 12h12 M10 19h4',
  heart: 'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 1 10 8 16 7-6 13-11 8-16z',
  flag: 'M5 21V4 M5 4h13l-3 4 3 4H5',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  case: 'M4 8h16v12H4z M9 8V5h6v3 M4 13h16',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M3 12h18 M12 2c3 3.5 3 16.5 0 20-3-3.5-3-16.5 0-20z',
  pause: 'M9 5v14 M15 5v14',
  money: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6.5v11 M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 2s1.1 1.8 2.5 2 2.5.7 2.5 2-1.1 2-2.5 2A2.5 2 0 0 1 9.5 15',
  x: 'M18 6 6 18 M6 6l12 12',
  // ---- campaign logo marks ----
  walk: 'M13 4a1.6 1.6 0 1 0 0 .1 M10 21l2.5-6 2.5 2v4 M9 11l2.5-3 3 2.5 2.5 1 M11.5 8l-1 5.5',
  care: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z M9 11h2l1-2 1.5 4 1-2h1.5',
  sprout: 'M12 21v-9 M12 12c0-4-3-6-7-6 0 4 3 6 7 6z M12 10c0-3.5 2.5-6 7-6 0 4-3 6-7 6z',
  snow: 'M12 2v20 M4.9 6l14.2 12 M19.1 6 4.9 18 M9.5 3.5 12 6l2.5-2.5 M9.5 20.5 12 18l2.5 2.5',
  van: 'M2 7h11v9H2z M13 10h4l3 3v3h-7 M6 19a1.8 1.8 0 1 0 0-.1 M17 19a1.8 1.8 0 1 0 0-.1 M6.5 9.5v4 M4.5 11.5h4',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  bowl: 'M3 11h18a9 9 0 0 1-18 0z M8 7c0-1.5 1-2 1-3.5 M12 7c0-1.5 1-2 1-3.5 M16 7c0-1.5 1-2 1-3.5',
  drop: 'M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  ear: 'M7 10a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2 M10 10a2 2 0 0 1 4 0c0 1.2-1 1.6-1.6 2.3',
  home: 'M3 11l9-7 9 7 M5 9.5V20h14V9.5 M10 20v-6h4v6'
};

/** Unsplash image for a campaign / owner photo, cropped square. */
const unsplash = (id: string, size = 96): string =>
  `https://images.unsplash.com/photo-${id}?w=${size}&h=${size}&fit=crop&crop=faces,center&auto=format&q=70`;

/** Owner profile photos. Replace with your user photo URLs (e.g. from the users API / 'assets/people/ritu.jpg'). */
const OWNER_PHOTOS: Record<string, string> = {
  'Ritu Anil': 'https://randomuser.me/api/portraits/women/68.jpg',
  'Priyanka Naveen': 'https://randomuser.me/api/portraits/women/44.jpg',
  'Aditya Ganesh': 'https://randomuser.me/api/portraits/men/32.jpg',
  'Arvind Murali': 'https://randomuser.me/api/portraits/men/75.jpg',
  'Vikram Anand': 'https://randomuser.me/api/portraits/men/46.jpg'
};

/** Campaign code keyword → logo mark (first match wins; shown if the image fails to load). */
const LOGO_MARKS: [RegExp, string][] = [
  [/WALK/, 'walk'], [/MOBILE/, 'van'], [/PALLIATIVE|CARE/, 'care'], [/LIVELIHOOD/, 'sprout'], [/CSR/, 'case'],
  [/WINTER/, 'snow'], [/SIGHT/, 'eye'], [/PHYSIO/, 'people'],
  [/HELPLINE/, 'phone'], [/HEAT/, 'sun'], [/NUTRITION/, 'bowl'], [/WATER/, 'drop'],
  [/DIABETES/, 'pulse'], [/HEARING/, 'ear'], [/PENSION/, 'money'], [/SHELTER/, 'home']
];

/** Columns that support sorting. */
export type SortKey = 'name' | 'status' | 'progress' | 'owner' | 'launch' | 'ends';

export type RowAction = 'view' | 'edit' | 'duplicate' | 'readiness' | 'launch' | 'delete';

export interface CampaignKpi {
  key: 'total' | 'active' | 'scheduled' | 'approval' | 'ending' | 'paused' | 'received';
  label: string;
  value: string;
  note: string;
  icon: string;
  /** second figure shown on the right of the main value (fills the empty side of the widget) */
  side: { value: string; label: string };
}

const ACTIONS: Record<CampaignStatus, RowAction[]> = {
  draft: ['view', 'edit', 'duplicate', 'delete'],
  submitted: ['view', 'duplicate', 'readiness'],
  scheduled: ['view', 'edit', 'duplicate', 'launch'],
  active: ['view', 'edit', 'duplicate'],
  paused: ['view', 'edit', 'duplicate'],
  closing: ['view', 'duplicate'],
  closed: ['view', 'duplicate']
};

const STATUS_ORDER: CampaignStatus[] = ['draft', 'submitted', 'scheduled', 'active', 'paused', 'closing', 'closed'];

const ownerBase = (o: string): string => o.replace(/\s\+\d+$/, '');

@Component({
  selector: 'app-campaign-register',
  imports: [PageHeader, NgTemplateOutlet],
  templateUrl: './campaign-register.html',
  styleUrls: ['./campaign-register.css', '../../../Shared/layout/page-header/page-header.css']
})
export class CampaignRegister {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly store = inject(CampaignWorkspaceStore);
  private readonly api = inject(CampaignApiService);
  protected readonly paths = CW_PATHS;

  /** The server's counts per status (GET /campaigns/statistics), over every campaign rather than a loaded page. */
  private readonly stats = signal<CampaignStatistics | null>(null);

  constructor() {
    this.api.getCampaignStatistics().subscribe({ next: (s) => this.stats.set(s), error: () => this.stats.set(null) });
  }

  private readonly rows = computed<CampaignRow[]>(() =>
    this.store.campaigns().map((c) => {
      const owners = c.owners;
      const startDate = c.start ? new Date(c.start + 'T00:00:00Z') : null;
      const endDate = c.end ? new Date(c.end + 'T00:00:00Z') : null;
      return {
        id: c.id ?? c.code, name: c.name, code: c.code, status: c.lifecycle,
        progress: c.target ? Math.min(100, Math.round((c.raised / c.target) * 100)) : 0,
        owner: owners.length > 1 ? `${owners[0]} +${owners.length - 1}` : (owners[0] ?? '—'),
        owners: owners.filter(Boolean),
        launch: startDate ? fmtDate(startDate) : '—', ends: endDate ? fmtDate(endDate) : '—',
        received: c.raised, target: c.target, currency: c.currency ?? '', delivered: 0, replies: 0, overdue: 0
      };
    }));
  protected get campaigns(): CampaignRow[] { return this.rows(); }
  protected readonly statusOrder = STATUS_ORDER;

  readonly query = signal('');
  readonly statusFilter = signal<'all' | CampaignStatus>('all');
  readonly ownerFilter = signal('all');
  readonly sortKey = signal<SortKey>('launch');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly selected = signal<CampaignRow | null>(null);
  /** ids of rows ticked with the row checkbox. */
  readonly checked = signal<Set<string>>(new Set());
  /** Campaign whose owners are shown in the owners popup (null = closed). */
  readonly ownersFor = signal<CampaignRow | null>(null);
  /** Which custom dropdown is open ('owner' | 'rows' | null). */
  readonly openMenu = signal<'owner' | 'rows' | null>(null);

  get total(): number { return this.rows().length; }
  readonly pageSizes = [10, 25, 50];

  /** Distinct owners (base name before "+n") for the owner dropdown. */
  get owners(): string[] { return Array.from(new Set(this.rows().map((c) => ownerBase(c.owner)))).sort(); }

  readonly statusLabel = (s: CampaignStatus): string => STATUS_META[s].label;
  readonly statusTone = (s: CampaignStatus): string => STATUS_META[s].tone;
  readonly iconPath = (name: string): string => ICON_PATHS[name] ?? '';

  /** Top KPI strip - built only from what the list view shows (status, progress, owner, launch / end),
   *  for the rows matching the current search + owner filter. */
  readonly kpis = computed<CampaignKpi[]>(() => {
    const rows = this.baseRows();
    // With no search or owner narrowing the list, the status counts are the server's.
    const st = !this.query().trim() && this.ownerFilter() === 'all' ? this.stats() : null;
    const time = (d: string): number => Date.parse(d + ' UTC') || 0;
    const now = Date.now();
    const count = (s: CampaignStatus): number => rows.filter((r) => r.status === s).length;

    const owners = new Set(rows.map((r) => ownerBase(r.owner))).size;

    const active = rows.filter((r) => r.status === 'active');
    const lead = active.slice().sort((a, b) => b.progress - a.progress)[0];
    const avgProgress = active.length ? Math.round(active.reduce((t, r) => t + r.progress, 0) / active.length) : 0;

    // Money is only added up within one currency: the most used one among these campaigns.
    const tally = new Map<string, number>();
    for (const r of rows) tally.set(r.currency, (tally.get(r.currency) ?? 0) + 1);
    const currency = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const money = (n: number): string => formatMoney(n, currency, { style: 'whole' });
    const sameCurrency = rows.filter((r) => r.currency === currency);

    const pausedRows = rows.filter((r) => r.status === 'paused');
    const pausedReceived = pausedRows.filter((r) => r.currency === currency).reduce((t, r) => t + r.received, 0);

    const receivedTotal = sameCurrency.reduce((t, r) => t + r.received, 0);
    const targetTotal = sameCurrency.reduce((t, r) => t + r.target, 0);
    const receivedPct = targetTotal ? Math.round((receivedTotal / targetTotal) * 100) : 0;

    const scheduled = rows.filter((r) => r.status === 'scheduled').sort((a, b) => time(a.launch) - time(b.launch));
    const nextLaunch = scheduled.find((r) => time(r.launch) >= now) ?? scheduled[0];

    const drafts = st?.draft ?? count('draft');
    const submitted = st?.submitted ?? count('submitted');

    const closing = rows.filter((r) => r.status === 'closing').sort((a, b) => time(a.ends) - time(b.ends));
    const nextEnd = closing.find((r) => time(r.ends) >= now) ?? closing[closing.length - 1];
    const closed = st?.closed ?? count('closed');
    const goalReached = rows.filter((r) => r.progress >= 100).length;

    const closingCount = st?.closing ?? closing.length;
    const activeCount = st?.active ?? active.length;
    const pausedCount = st?.paused ?? pausedRows.length;
    const scheduledCount = st?.scheduled ?? scheduled.length;
    const ended = closingCount + closed;
    const endedGoal = rows.filter((r) => (r.status === 'closing' || r.status === 'closed') && r.progress >= 100).length;
    const short = (d?: string) => (d ? d.split(' ').slice(0, 2).join(' ') : '—');

    return [
      {
        key: 'total', side: { value: String(owners), label: 'Owners' }, label: 'Campaigns', value: String(st?.total ?? rows.length), icon: 'case',
        note: `${activeCount} running now · ${scheduledCount} scheduled`
      },
      {
        key: 'active', side: { value: avgProgress + '%', label: 'Avg progress' }, label: 'Active', value: String(activeCount), icon: 'flag',
        note: lead ? `Furthest along: ${lead.name} (${lead.progress}%)` : 'No campaign is running'
      },
      {
        key: 'paused', side: { value: money(pausedReceived), label: 'On hold' }, label: 'Paused', value: String(pausedCount), icon: 'pause',
        note: pausedCount ? `${pausedCount} campaign${pausedCount === 1 ? '' : 's'} paused · ${money(pausedReceived)} held` : 'No campaign is paused'
      },
      {
        key: 'received', side: { value: receivedPct + '%', label: 'Of target' }, label: 'Received', value: money(receivedTotal), icon: 'money',
        note: `${rows.length} campaign${rows.length === 1 ? '' : 's'} · target ${money(targetTotal)}`
      },
      {
        key: 'scheduled', side: { value: short(nextLaunch?.launch), label: 'Next launch' }, label: 'Scheduled to launch', value: String(scheduledCount), icon: 'calendar',
        note: nextLaunch ? `Next: ${nextLaunch.name}` : 'Nothing scheduled'
      },
      {
        key: 'approval', side: { value: String(submitted), label: 'Submitted' }, label: 'Draft & submitted', value: String(drafts + submitted), icon: 'edit',
        note: `${drafts} draft${drafts === 1 ? '' : 's'} not yet submitted for approval`
      },
      {
        key: 'ending', side: { value: (ended ? Math.round((endedGoal / ended) * 100) : 0) + '%', label: 'Reached goal' }, label: 'Closing & closed', value: String(closingCount + closed), icon: 'check',
        note: nextEnd
          ? `${closingCount} closing, ${closed} closed · ${nextEnd.name} ${time(nextEnd.ends) >= now ? 'ends' : 'ended'} ${nextEnd.ends}`
          : `${closed} closed · ${goalReached} reached the goal`
      }
    ];
  });

  /** Rows matching search + owner (before the status tab) - drives the tab counts. */
  private readonly baseRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const owner = this.ownerFilter();
    return this.rows().filter(
      (c) =>
        (owner === 'all' || ownerBase(c.owner) === owner) &&
        (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    );
  });

  /** Count per status tab (and 'all') for the current search + owner. */
  readonly statusCounts = computed(() => {
    const st = !this.query().trim() && this.ownerFilter() === 'all' ? this.stats() : null;
    if (st) return { all: st.total, draft: st.draft, submitted: st.submitted, scheduled: st.scheduled, active: st.active, paused: st.paused, closing: st.closing, closed: st.closed };
    const out: Record<string, number> = { all: this.baseRows().length };
    for (const s of STATUS_ORDER) out[s] = 0;
    for (const r of this.baseRows()) out[r.status]++;
    return out;
  });

  /** Row subset after search + status + owner filters, then sorting. */
  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const rows = this.baseRows().filter((c) => status === 'all' || c.status === status);

    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const rank: Record<CampaignStatus, number> = { draft: 0, submitted: 1, scheduled: 2, active: 3, paused: 4, closing: 5, closed: 6 };
    const time = (d: string): number => Date.parse(d + ' UTC') || 0;
    return rows.slice().sort((a, b) => {
      let cmp: number;
      if (key === 'status') cmp = rank[a.status] - rank[b.status];
      else if (key === 'progress') cmp = a.progress - b.progress;
      else if (key === 'launch' || key === 'ends') cmp = time(a[key]) - time(b[key]);
      else cmp = String(a[key]).localeCompare(String(b[key]));
      return cmp * dir;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  readonly pageRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  /** Page buttons with ellipsis: 1 2 … 10 (numbers, or '…' for gaps).
   *  Page 1 → 1 2 … 10 · Page 5 → 1 … 4 5 6 … 10 · Page 10 → 1 … 9 10 */
   readonly pages = computed<(number | '…')[]>(() => {
    const total = this.totalPages();
    const cur = this.page();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const out: (number | '…')[] = [1];
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    if (start > 2) out.push('…');
    for (let p = start; p <= end; p++) out.push(p);
    if (end < total - 1) out.push('…');
    out.push(total);
    return out;
  });
  readonly from = computed(() => (this.filtered().length === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.filtered().length));

  // ---- small display helpers ----
  /** Two-letter initials for the avatar tiles ("Walkathon for Elders" -> "WE"). */
  initials(text: string): string {
    const words = ownerBase(text).replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 || /[A-Z]/.test(w));
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
  }

  ownerName(owner: string): string {
    return ownerBase(owner);
  }

  /** "+1" collaborators suffix ('' when none). */
  ownerExtra(owner: string): string {
    return owner.match(/\+\d+$/)?.[0] ?? '';
  }


  /** The campaign's real owners, main owner first. */
  ownersOf(r: CampaignRow): string[] {
    if (r.owners?.length) return r.owners;
    const base = ownerBase(r.owner);
    return base && base !== '—' ? [base] : [];
  }

  /** Owner cell click (only when there is more than one owner) → popup with every owner. */
  openOwners(r: CampaignRow, event?: Event): void {
    event?.stopPropagation();
    this.openMenu.set(null);
    this.ownersFor.set(r);
  }

  closeOwners(): void {
    this.ownersFor.set(null);
  }

  /** Filter the register by one owner from the popup. */
  filterByOwner(name: string): void {
    this.closeOwners();
    this.setOwner(name);
  }

  /** Deterministic brand-style photo/gradient background for an owner's avatar. */
  avatarStyle(name: string): string {
    const at = PEOPLE.indexOf(name);
    const hue = at >= 0 ? (at * 72 + 200) % 360 : this.seedOf(name) % 360;
    return `radial-gradient(circle at 30% 25%, hsl(${hue} 70% 72%), transparent 55%), linear-gradient(135deg, hsl(${hue} 52% 48%), hsl(${(hue + 38) % 360} 58% 34%))`;
  }

  /** Logo colour hue: golden-angle step on the logo mark index → every campaign gets a clearly different colour. */
  private logoHue(r: CampaignRow): number {
    const at = LOGO_MARKS.findIndex(([re]) => re.test(r.code));
    return at >= 0 ? (at * 137 + 250) % 360 : this.seedOf(r.code) % 360;
  }

  /** Logo mark gradient stops (0 = light, 1 = deep). */
  logoColor(r: CampaignRow, stop: 0 | 1): string {
    const h = this.logoHue(r);
    return stop === 0 ? `hsl(${h} 72% 56%)` : `hsl(${(h + 28) % 360} 68% 38%)`;
  }

  /** Real profile photo for an owner ('' → initials only). */
  ownerPhoto(name: string): string {
    return OWNER_PHOTOS[name] ?? '';
  }

  /** Image failed to load → hide it so the gradient + icon / initials underneath show instead. */
  imgFail(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  /** Campaign logo mark (icon) picked from the campaign code; falls back to a heart. */
  logoIcon(r: CampaignRow): string {
    return LOGO_MARKS.find(([re]) => re.test(r.code))?.[1] ?? 'heart';
  }

  /** Small stable hash for a string (drives avatar / logo hues). */
  private seedOf(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
  }

  /** Days between launch and end ("33 days"). */
  duration(r: CampaignRow): string {
    const d = Math.round((Date.parse(r.ends + ' UTC') - Date.parse(r.launch + ' UTC')) / 86400000);
    return Number.isFinite(d) ? `${d} day${d === 1 ? '' : 's'}` : '';
  }

  /** Position of the state in the lifecycle (0 = draft … 5 = closed) for the stage track. */
  stageIndex(s: CampaignStatus): number {
    return STATUS_ORDER.indexOf(s);
  }

  /** Caption under the progress ring. */
  progressNote(r: CampaignRow): string {
    return r.progress >= 100 ? 'Goal reached' : r.progress > 0 ? 'In progress' : 'Not started';
  }

  /** Actions shown in the row for this campaign's state. */
  actionsFor(r: CampaignRow): RowAction[] {
    return ACTIONS[r.status];
  }

  ownerLabel(): string {
    return this.ownerFilter() === 'all' ? 'All owners' : this.ownerFilter();
  }

  // ---- filters ----
  setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }
  setStatus(value: string): void {
    this.statusFilter.set(value as 'all' | CampaignStatus);
    this.page.set(1);
  }
  setOwner(value: string): void {
    this.ownerFilter.set(value);
    this.openMenu.set(null);
    this.page.set(1);
  }
  setPageSize(value: string | number): void {
    this.pageSize.set(Number(value) || 10);
    this.openMenu.set(null);
    this.page.set(1);
  }
  resetFilters(): void {
    this.query.set('');
    this.statusFilter.set('all');
    this.ownerFilter.set('all');
    this.page.set(1);
  }
  hasFilters(): boolean {
    return !!this.query().trim() || this.statusFilter() !== 'all' || this.ownerFilter() !== 'all';
  }

  // ---- pagination ----
  goToPage(p: number | '…'): void {
    if (typeof p !== 'number') return;
    this.page.set(Math.min(Math.max(1, p), this.totalPages()));
  }

  prevPage(): void {
    this.goToPage(this.page() - 1);
  }

  nextPage(): void {
    this.goToPage(this.page() + 1);
  }

  toggleMenu(menu: 'owner' | 'rows', event: Event): void {
    event.stopPropagation();
    this.openMenu.set(this.openMenu() === menu ? null : menu);
  }

  /** Toggle sort on a column header; repeated clicks flip the direction. */
  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
    this.page.set(1);
  }

  /** Sort indicator shown next to an active column heading. */
  sortMark(key: SortKey): string {
    return this.sortKey() === key ? (this.sortDir() === 'asc' ? '↑' : '↓') : '';
  }

  ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey() === key ? (this.sortDir() === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // ---- selection ----
  toggleCheck(id: string): void {
    const next = new Set(this.checked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.checked.set(next);
  }

  /** Export: the server writes (and logs) the file under the register's current search and status tab. */
  exportAll(): void {
    const status = this.statusFilter();
    this.api.exportCampaigns({ search: this.query().trim() || undefined, status: status === 'all' ? null : status }).subscribe({
      next: ({ blob, fileName }) => { this.download(blob, fileName || 'campaigns.csv'); this.toast.show('Export ready', 'The campaign list was downloaded.', 'success'); },
      error: (e: unknown) => this.toast.show('Export failed', apiErrorMessage(e), 'error')
    });
  }

  /** Export selected: the ticked rows as they appear in the register (the export endpoint takes no id list). */
  exportChecked(): void {
    const ids = this.checked();
    const rows = this.rows().filter((r) => ids.has(r.id));
    if (!rows.length) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Code', 'Name', 'Status', 'Owner', 'Launch', 'Ends', 'Progress %', 'Received', 'Target'];
    const lines = rows.map((r) => [r.code, r.name, STATUS_META[r.status].label, r.owner, r.launch, r.ends, r.progress, r.received, r.target].map(esc).join(','));
    this.download(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }), 'campaigns-selected.csv');
    this.toast.show('Export ready', `${rows.length} selected campaign${rows.length === 1 ? '' : 's'} downloaded.`, 'success');
  }

  private download(blob: Blob, name: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Header checkbox: checked when every row on the page is ticked. */
  allChecked(): boolean {
    const rows = this.pageRows();
    return rows.length > 0 && rows.every((r) => this.checked().has(r.id));
  }

  toggleCheckAll(): void {
    const rows = this.pageRows();
    const next = new Set(this.checked());
    if (this.allChecked()) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    this.checked.set(next);
  }

  clearChecked(): void {
    this.checked.set(new Set());
  }

  close(): void {
    this.selected.set(null);
  }

  // ------------------------------------------------------------------
  // FULL-PAGE FLOW: list → detail → create (router navigation, no popups)
  // ------------------------------------------------------------------
  /** Row / name click → full detail page for that campaign. */
  openDetail(r: CampaignRow): void {
    this.store.ensureCampaign(this.toInfo(r));
    this.store.select(r.code);
    this.selected.set(null);
    this.router.navigate([CW_PATHS.detailFor(r.code)]);
  }

  /** Header Create → full-page wizard. */
  goCreate(): void {
    this.router.navigate([CW_PATHS.create]);
  }

  /** Toolbar action for a row (view / edit / duplicate / delete / readiness / launch). */
  rowAction(r: CampaignRow, action: RowAction): void {
    if (action === 'view') return this.openDetail(r);
    if (action === 'edit') {
      this.store.ensureCampaign(this.toInfo(r));
      this.store.select(r.code);
      this.router.navigate([CW_PATHS.create], { queryParams: { code: r.code } });
      return;
    }
    if (action === 'duplicate') {
      // The icon on this button is labelled "Readiness checklist" in the screen, so it opens
      // that campaign's checklist (a campaign is no longer duplicated from the list).
      this.store.select(r.code);
      this.router.navigate([CW_PATHS.readiness], { queryParams: { code: r.code } });
      return;
    }
    const finish = (okTitle: string, okText: string, failTitle: string) => (error?: string) => {
      if (error) this.toast.show(failTitle, error, 'error');
      else this.toast.show(okTitle, okText, 'success');
    };
    if (action === 'delete') {
      this.store.removeCampaign(r.code, finish('Campaign deleted', `${r.code} was deleted.`, 'Campaign not deleted'));
      this.checked.update((s) => { const n = new Set(s); n.delete(r.id); return n; });
      return;
    }
    if (action === 'readiness') {
      // Approve, straight from the list (the checklist page is no longer the only way in).
      this.store.approveFromList(r.code, finish('Campaign approved', `${r.code} was approved.`, 'Campaign not approved'));
      return;
    }
    if (action === 'launch') {
      this.store.activateFromList(r.code, finish('Campaign activated', `${r.code} is now Active.`, 'Campaign not activated'));
      return;
    }
  }

  private toInfo(r: CampaignRow): CampaignInfo {
    return {
      code: r.code,
      name: r.name,
      lifecycle: r.status,
      owners: this.ownersOf(r),
      fund: 'General Fund',
      start: this.toIso(r.launch),
      end: this.toIso(r.ends),
      location: '',
      target: 0,
      raised: 0,
      currency: r.currency,
      monthlyRevenue: 0,
      monthlyRevenuePrev: 0,
      donors: 0,
      donations: 0,
      description: r.name,
      updatedAt: new Date().toISOString().slice(0, 16)
    };
  }

  private toIso(display: string): string {
    const m: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    const parts = display.trim().split(/\s+/);
    if (parts.length !== 3) return '';
    const [dd, mon, yyyy] = parts;
    return `${yyyy}-${m[mon] ?? '01'}-${dd.padStart(2, '0')}`;
  }

  /** Clicking anywhere else closes an open dropdown. */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.openMenu()) this.openMenu.set(null);
    else if (this.ownersFor()) this.closeOwners();
    else this.close();
  }
}