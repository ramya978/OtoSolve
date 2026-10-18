import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { CampaignInfo } from '../../../Shared/Campaign/cw.data';

/** Campaign lifecycle states shown in the Status column. */
export type CampaignStatus = 'draft' | 'submitted' | 'scheduled' | 'active' | 'closing' | 'closed';

export interface CampaignRow {
  id: string;
  name: string;
  /** Uppercase reference code shown under the name. */
  code: string;
  status: CampaignStatus;
  /** Completion percentage (0-100) driving the progress bar. */
  progress: number;
  /** Owner display name; "+n" suffix is baked in where extra collaborators exist. */
  owner: string;
  /** Pre-formatted launch / end dates (dd MMM yyyy). */
  launch: string;
  ends: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a UTC date as "dd MMM yyyy" (e.g. "01 Feb 2027"). */
export const fmtDate = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/** Seed rows matching the Campaign register overview (16 campaigns). */
export const CAMPAIGNS: CampaignRow[] = [
  { id: 'c1', name: 'Walkathon for Elders 2027', code: 'HAI-WALKATHON-2027', status: 'draft', progress: 0, owner: 'Ritu Anil', launch: fmtDate(new Date(utc(2027, 2, 1))), ends: fmtDate(new Date(utc(2027, 2, 3))) },
  { id: 'c2', name: 'Palliative Care at Home', code: 'HAI-PALLIATIVE-2027', status: 'draft', progress: 0, owner: 'Aditya Ganesh', launch: fmtDate(new Date(utc(2027, 3, 13))), ends: fmtDate(new Date(utc(2027, 9, 9))) },
  { id: 'c3', name: 'Elder Self-Help Groups - Livelihood Fund', code: 'HAI-LIVELIHOOD-2027', status: 'submitted', progress: 0, owner: 'Aditya Ganesh +1', launch: fmtDate(new Date(utc(2027, 1, 7))), ends: fmtDate(new Date(utc(2027, 7, 6))) },
  { id: 'c4', name: 'Corporate Champions for Elder Care FY 2026-27', code: 'HAI-CSR-2027', status: 'submitted', progress: 0, owner: 'Priyanka Naveen +1', launch: fmtDate(new Date(utc(2026, 11, 18))), ends: fmtDate(new Date(utc(2027, 4, 6))) },
  { id: 'c5', name: 'Winter Relief - Warmth for Elders', code: 'HAI-WINTER-2026', status: 'scheduled', progress: 0, owner: 'Ritu Anil +1', launch: fmtDate(new Date(utc(2026, 10, 26))), ends: fmtDate(new Date(utc(2027, 1, 17))) },
  { id: 'c6', name: 'Restore Sight - Cataract Surgeries 2026', code: 'HAI-SIGHT-2026', status: 'active', progress: 35, owner: 'Aditya Ganesh +1', launch: fmtDate(new Date(utc(2026, 8, 5))), ends: fmtDate(new Date(utc(2027, 3, 3))) },
  { id: 'c7', name: 'Physiotherapy at Home', code: 'HAI-PHYSIO-2026', status: 'closing', progress: 100, owner: 'Priyanka Naveen +1', launch: fmtDate(new Date(utc(2026, 6, 24))), ends: fmtDate(new Date(utc(2026, 10, 10))) },
  { id: 'c8', name: 'Mobile Healthcare Units - Care at the Doorstep', code: 'HAI-MOBILECARE-2026', status: 'active', progress: 47, owner: 'Priyanka Naveen +1', launch: fmtDate(new Date(utc(2026, 7, 26))), ends: fmtDate(new Date(utc(2027, 1, 22))) },

  { id: 'c9', name: 'Elder Helpline - Keep the Line Open', code: 'HAI-HELPLINE-2026', status: 'scheduled', progress: 3, owner: 'Ritu Anil +1', launch: fmtDate(new Date(utc(2026, 10, 12))), ends: fmtDate(new Date(utc(2027, 5, 2))) },
  { id: 'c10', name: 'Heatwave Relief for Elders 2026', code: 'HAI-HEATWAVE-2026', status: 'closed', progress: 100, owner: 'Priyanka Naveen +1', launch: fmtDate(new Date(utc(2026, 5, 2))), ends: fmtDate(new Date(utc(2026, 10, 7))) },
  { id: 'c11', name: 'Nutrition Kits for Homebound Seniors', code: 'HAI-NUTRITION-2026', status: 'active', progress: 62, owner: 'Aditya Ganesh', launch: fmtDate(new Date(utc(2026, 4, 18))), ends: fmtDate(new Date(utc(2026, 12, 20))) },
  { id: 'c12', name: 'Safe Drinking Water - Rural Elders', code: 'HAI-WATER-2026', status: 'draft', progress: 0, owner: 'Ritu Anil', launch: fmtDate(new Date(utc(2026, 11, 2))), ends: fmtDate(new Date(utc(2027, 3, 28))) },
  { id: 'c13', name: 'Diabetes Screening Camps', code: 'HAI-DIABETES-2026', status: 'submitted', progress: 0, owner: 'Priyanka Naveen +1', launch: fmtDate(new Date(utc(2026, 9, 9))), ends: fmtDate(new Date(utc(2027, 2, 14))) },
  { id: 'c14', name: 'Hearing Aid Support Programme', code: 'HAI-HEARING-2026', status: 'closing', progress: 96, owner: 'Aditya Ganesh +1', launch: fmtDate(new Date(utc(2026, 3, 5))), ends: fmtDate(new Date(utc(2026, 11, 30))) },
  { id: 'c15', name: 'Monthly Pension Top-Up Drive', code: 'HAI-PENSION-2026', status: 'active', progress: 78, owner: 'Ritu Anil +1', launch: fmtDate(new Date(utc(2026, 2, 11))), ends: fmtDate(new Date(utc(2026, 12, 31))) },
  { id: 'c16', name: 'Shelter Upgrade - Monsoon Ready', code: 'HAI-SHELTER-2026', status: 'closed', progress: 100, owner: 'Priyanka Naveen', launch: fmtDate(new Date(utc(2026, 1, 20))), ends: fmtDate(new Date(utc(2026, 8, 15))) }
];

/** Label + theme status tone for each campaign state. */
const STATUS_META: Record<CampaignStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  scheduled: { label: 'Scheduled', tone: 'purple' },
  active: { label: 'Active', tone: 'success' },
  closing: { label: 'Closing', tone: 'warning' },
  closed: { label: 'Closed', tone: 'ink' }
};

/** Icon path data for the actions + header controls (24x24 viewBox). */
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
  x: 'M18 6 6 18 M6 6l12 12'
};

/** Columns that support sorting. */
export type SortKey = 'name' | 'status' | 'progress' | 'owner' | 'launch' | 'ends';

/** Row actions offered for each campaign state (in display order). */
export type RowAction = 'view' | 'edit' | 'duplicate' | 'readiness' | 'launch' | 'delete';

const ACTIONS: Record<CampaignStatus, RowAction[]> = {
  draft: ['view', 'edit', 'duplicate', 'delete'],
  submitted: ['view', 'duplicate', 'readiness'],
  scheduled: ['view', 'edit', 'duplicate', 'launch'],
  active: ['view', 'edit', 'duplicate'],
  closing: ['view', 'duplicate'],
  closed: ['view', 'duplicate']
};

/** Status tabs above the table, in lifecycle order. */
const STATUS_ORDER: CampaignStatus[] = ['draft', 'submitted', 'scheduled', 'active', 'closing', 'closed'];

const ownerBase = (o: string): string => o.replace(/\s\+\d+$/, '');

@Component({
  selector: 'app-campaign-register',
  templateUrl: './campaign-register.html',
  styleUrl: './campaign-register.css'
})
export class CampaignRegister {
  private readonly router = inject(Router);
  private readonly store = inject(CampaignWorkspaceStore);
  protected readonly paths = CW_PATHS;

  protected readonly campaigns = CAMPAIGNS;
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
  /** Which custom dropdown is open ('owner' | 'rows' | null). */
  readonly openMenu = signal<'owner' | 'rows' | null>(null);

  readonly total = CAMPAIGNS.length;
  readonly pageSizes = [10, 25, 50];

  /** Distinct owners (base name before "+n") for the owner dropdown. */
  readonly owners = Array.from(new Set(CAMPAIGNS.map((c) => ownerBase(c.owner)))).sort();

  readonly statusLabel = (s: CampaignStatus): string => STATUS_META[s].label;
  readonly statusTone = (s: CampaignStatus): string => STATUS_META[s].tone;
  readonly iconPath = (name: string): string => ICON_PATHS[name] ?? '';

  /** Rows matching search + owner (before the status tab) - drives the tab counts. */
  private readonly baseRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const owner = this.ownerFilter();
    return CAMPAIGNS.filter(
      (c) =>
        (owner === 'all' || ownerBase(c.owner) === owner) &&
        (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    );
  });

  /** Count per status tab (and 'all') for the current search + owner. */
  readonly statusCounts = computed(() => {
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
    const rank: Record<CampaignStatus, number> = { draft: 0, submitted: 1, scheduled: 2, active: 3, closing: 4, closed: 5 };
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
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
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
      this.store.ensureCampaign(this.toInfo(r));
      const next = this.store.duplicateCampaign(r.code);
      this.router.navigate([CW_PATHS.detailFor(next)]);
      return;
    }
    if (action === 'delete') {
      this.store.removeCampaign(r.code);
      this.checked.update((s) => { const n = new Set(s); n.delete(r.id); return n; });
      return;
    }
    if (action === 'readiness') {
      this.store.ensureCampaign(this.toInfo(r));
      this.store.select(r.code);
      this.router.navigate([CW_PATHS.readiness]);
      return;
    }
    if (action === 'launch') {
      this.store.ensureCampaign(this.toInfo(r));
      this.store.select(r.code);
      this.store.approveLaunch(r.code);
      return;
    }
  }

  /** Register row → workspace CampaignInfo (so the detail page can render it). */
  private toInfo(r: CampaignRow): CampaignInfo {
    return {
      code: r.code,
      name: r.name,
      lifecycle: r.status,
      owners: [r.owner.replace(/\s\+\d+$/, '')],
      fund: 'General Fund',
      start: this.toIso(r.launch),
      end: this.toIso(r.ends),
      location: '',
      target: 0,
      raised: 0,
      monthlyRevenue: 0,
      monthlyRevenuePrev: 0,
      donors: 0,
      donations: 0,
      description: r.name,
      updatedAt: new Date().toISOString().slice(0, 16)
    };
  }

  /** "01 Feb 2027" → "2027-02-01". */
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
    else this.close();
  }
}