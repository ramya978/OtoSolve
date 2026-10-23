import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DonorApiService } from '../../../Service/donor-api.service';
import { LeadListItem } from '../../../Shared/models/donor-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { fetchAllPages } from '../../../Shared/services/paging';
import { map } from 'rxjs';
export type LeadStage = 'New' | 'Assigned' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost';
export type LeadTemp = 'Cold' | 'Warm' | 'Hot';
export type LeadPotential = 'Low' | 'Medium' | 'High';
export type StatTab = 'all' | 'unassigned' | 'assigned' | 'hot' | 'high' | 'recent' | 'converted';

export interface LeadRow {
  id: string; ref: string; name: string; phone: string; email: string;
  campaign: string; source: string; owner: string | null; stage: LeadStage;
  temp: LeadTemp; potential: LeadPotential; due: string; dueNote: string; dueTs: number; overdue: number; recent: boolean;
}

const DAY = 86_400_000;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function stageOf(status: string): LeadStage {
  const n = (status ?? '').toLowerCase();
  if (n.includes('convert')) return 'Converted';
  if (n.includes('qualif') && !n.includes('disqual')) return 'Qualified';
  if (n.includes('contact')) return 'Contacted';
  if (n.includes('assign')) return 'Assigned';
  if (n.includes('lost') || n.includes('closed') || n.includes('disqual') || n.includes('reject')) return 'Lost';
  return 'New';
}

function titleCase<T extends string>(v: string, fallback: T, allowed: readonly T[]): T {
  const t = (v ?? '').charAt(0).toUpperCase() + (v ?? '').slice(1).toLowerCase();
  return (allowed as readonly string[]).includes(t) ? (t as T) : fallback;
}

/** Whole calendar days from today to the given day (negative = already past), in the browser's day. */
function daysFromToday(d: Date): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const t = new Date();
  const b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((a - b) / DAY);
}

function toRow(l: LeadListItem): LeadRow {
  const due = l.nextActionDueUtc ? new Date(l.nextActionDueUtc) : null;
  const valid = !!due && !Number.isNaN(due.getTime());
  const diff = valid ? daysFromToday(due as Date) : 0;
  const converted = !!l.isConverted;
  // A converted lead has nothing left to chase, so it never reads as overdue.
  const overdueDays = valid && !converted && diff < 0 ? -diff : 0;
  const dueNote = !valid ? 'No follow-up planned'
    : converted ? 'Converted'
    : diff < 0 ? ''
    : diff === 0 ? 'Due today'
    : diff === 1 ? 'Due tomorrow'
    : `Due in ${diff} days`;
  return {
    id: l.id, ref: l.leadReference, name: l.name, phone: l.mobileNumber ?? '', email: l.emailAddress ?? '',
    campaign: l.campaignName ?? '', source: l.source ?? '', owner: l.ownerName,
    stage: converted ? 'Converted' : stageOf(l.status),
    temp: titleCase(l.temperature, 'Cold', ['Cold', 'Warm', 'Hot'] as const),
    potential: titleCase(l.donationPotential, 'Low', ['Low', 'Medium', 'High'] as const),
    due: valid ? `${(due as Date).getDate()} ${MONTH_ABBR[(due as Date).getMonth()]} ${(due as Date).getFullYear()}` : '—',
    dueNote,
    dueTs: valid ? (due as Date).getTime() : Number.MAX_SAFE_INTEGER,
    overdue: overdueDays,
    recent: !!l.createdAtUtc && Date.now() - new Date(l.createdAtUtc).getTime() < 7 * DAY,
  };
}

const ICONS: Record<string, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sort: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  plus: 'M12 5v14M5 12h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  flame: 'M12 22c4 0 7-2.7 7-6.5 0-4-3.5-5.5-3.5-9.5-3 1-4.5 3.5-4.5 6-1-.5-1.8-1.4-2.2-2.8C6.4 10.5 5 12.4 5 15.5 5 19.3 8 22 12 22z',
  diamond: 'M6 3h12l4 6-10 12L2 9z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  heart: 'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 1 10 8 16 7-6 13-11 8-16z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  chev: 'M6 9l6 6 6-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  thermo: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
  check: 'M20 6L9 17l-5-5',
  userPlus: 'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  x: 'M18 6 6 18M6 6l12 12',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  source: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
};

export type SortKey = 'due' | 'name' | 'newest';
type Dd = 's' | 't' | 'p' | 'r' | 'o' | 'sort' | 'rows';

/** One option of a custom dropdown. */
interface Opt { value: string; label: string; }

@Component({
  selector: 'app-lead-work-queue',
  imports: [],
  templateUrl: './lead-work-queue.html',
  styleUrl: './lead-work-queue.css',
})
export class LeadWorkQueue implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(DonorApiService);
  private readonly route = inject(ActivatedRoute);
  /** My Leads is this same screen, told by the route to show only the leads assigned to the signed-in user. */
  protected readonly mine = !!this.route.snapshot.data['mine'];
  protected get heading(): string { return this.mine ? 'My Leads' : 'Lead Work Queue'; }
  /** Active (not converted) leads: what "All leads" and every other tab count. */
  private readonly rows = signal<LeadRow[]>([]);
  /** Converted leads, fetched only once the Converted tab is opened. */
  private readonly convertedRows = signal<LeadRow[]>([]);
  private readonly convertedTotal = signal(0);
  private convertedLoaded = false;
  protected readonly loading = signal(false);
  /** The rows the current tab works over. */
  private readonly current = computed(() => (this.tab() === 'converted' ? this.convertedRows() : this.rows()));
  protected get all(): LeadRow[] { return this.rows(); }
  protected readonly query = signal('');
  protected readonly tab = signal<StatTab>('all');
  protected readonly page = signal(1);
  protected readonly checked = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);
  private toastTimer = 0;

  protected readonly fStage = signal('all');
  protected readonly fTemp = signal('all');
  protected readonly fPot = signal('all');
  protected readonly fSrc = signal('all');
  protected readonly fOwner = signal('all');
  protected readonly pageSize = signal(10);
  protected readonly pageSizes = [10, 25, 50];
  protected readonly sort = signal<SortKey>('due');
  protected readonly openDd = signal<Dd | null>(null);

  // ---- dropdown options ----
  protected readonly stageOpts: Opt[] = [{ value: 'all', label: 'All' }, ...['New', 'Assigned', 'Contacted', 'Qualified', 'Converted', 'Lost'].map((v) => ({ value: v, label: v }))];
  protected readonly tempOpts: Opt[] = [{ value: 'all', label: 'All' }, ...['Cold', 'Warm', 'Hot'].map((v) => ({ value: v, label: v }))];
  protected readonly potOpts: Opt[] = [{ value: 'all', label: 'All' }, ...['Low', 'Medium', 'High'].map((v) => ({ value: v, label: v }))];
  protected readonly sortOpts: Opt[] = [
    { value: 'due', label: 'Next contact due' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'newest', label: 'Newest first' },
  ];

  protected readonly sources = computed(() => [...new Set(this.rows().map((r) => r.source).filter(Boolean))].sort());
  protected readonly owners = computed(() => [...new Set(this.rows().map((r) => r.owner).filter((o): o is string => !!o))].sort());
  protected readonly srcOpts = computed<Opt[]>(() => [{ value: 'all', label: 'All' }, ...this.sources().map((v) => ({ value: v, label: v }))]);
  protected readonly ownerOpts = computed<Opt[]>(() => [{ value: 'all', label: 'All' }, { value: 'none', label: 'Unassigned' }, ...this.owners().map((v) => ({ value: v, label: v }))]);
  /** The five filter dropdowns, rendered with one @for. */
  protected readonly filterDefs = computed<{ key: Dd; label: string; icon: string; opts: Opt[]; value: string }[]>(() => [
    { key: 's', label: 'Stage', icon: 'flag', opts: this.stageOpts, value: this.fStage() },
    { key: 't', label: 'Temperature', icon: 'thermo', opts: this.tempOpts, value: this.fTemp() },
    { key: 'p', label: 'Potential', icon: 'diamond', opts: this.potOpts, value: this.fPot() },
    { key: 'r', label: 'Source', icon: 'source', opts: this.srcOpts(), value: this.fSrc() },
    { key: 'o', label: 'Owner', icon: 'user', opts: this.ownerOpts(), value: this.fOwner() },
  ]);
  /** Number of filters that are not "All" - shown on the Filters button. */
  protected readonly activeFilters = computed(() => [this.fStage(), this.fTemp(), this.fPot(), this.fSrc(), this.fOwner()].filter((v) => v !== 'all').length);
  protected readonly counts = computed(() => ({
    all: this.rows().length,
    unassigned: this.rows().filter((r) => !r.owner).length,
    assigned: this.rows().filter((r) => !!r.owner).length,
    hot: this.rows().filter((r) => r.temp === 'Hot').length,
    high: this.rows().filter((r) => r.potential === 'High').length,
    recent: this.rows().filter((r) => r.recent).length,
    converted: this.convertedTotal(),
  }));
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const t = this.tab();
    return this.current().filter((r) =>
      (t === 'all' || (t === 'unassigned' && !r.owner) || (t === 'assigned' && !!r.owner) ||
        (t === 'hot' && r.temp === 'Hot') || (t === 'high' && r.potential === 'High') ||
        (t === 'recent' && r.recent) || t === 'converted') &&
      (this.fStage() === 'all' || r.stage === this.fStage()) &&
      (this.fTemp() === 'all' || r.temp === this.fTemp()) &&
      (this.fPot() === 'all' || r.potential === this.fPot()) &&
      (this.fSrc() === 'all' || r.source === this.fSrc()) &&
      (this.fOwner() === 'all' || (this.fOwner() === 'none' ? !r.owner : r.owner === this.fOwner())) &&
      (!q || (r.name + ' ' + r.ref + ' ' + r.phone + ' ' + r.email).toLowerCase().includes(q)))
      .sort((a, b) => {
        const k = this.sort();
        if (k === 'name') return a.name.localeCompare(b.name);
        if (k === 'newest') return b.ref.localeCompare(a.ref);
        return b.overdue - a.overdue || a.dueTs - b.dueTs;
      });
  });
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly pageSafe = computed(() => Math.min(this.page(), this.totalPages()));
  protected readonly pageRows = computed(() => {
    const s = (this.pageSafe() - 1) * this.pageSize();
    return this.filtered().slice(s, s + this.pageSize());
  });
  /** Page buttons with gaps: 1 … 4 5 6 … 9 (0 = gap). */
  protected readonly pages = computed<number[]>(() => {
    const n = this.totalPages(), p = this.pageSafe();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const out: number[] = [1];
    const from = Math.max(2, p - 1), to = Math.min(n - 1, p + 1);
    if (from > 2) out.push(0);
    for (let i = from; i <= to; i++) out.push(i);
    if (to < n - 1) out.push(0);
    out.push(n);
    return out;
  });
  protected readonly rangeFrom = computed(() => (this.filtered().length ? (this.pageSafe() - 1) * this.pageSize() + 1 : 0));
  protected readonly rangeTo = computed(() => Math.min(this.pageSafe() * this.pageSize(), this.filtered().length));
  protected readonly allChecked = computed(() => this.pageRows().length > 0 && this.pageRows().every((r) => this.checked().has(r.id)));

  setQuery(v: string): void { this.query.set(v); this.page.set(1); }
  setTab(t: StatTab): void {
    this.tab.set(t); this.page.set(1);
    if (t === 'converted') this.loadConverted();
  }
  setF(which: Dd, v: string): void {
    if (which === 's') this.fStage.set(v);
    if (which === 't') this.fTemp.set(v);
    if (which === 'p') this.fPot.set(v);
    if (which === 'r') this.fSrc.set(v);
    if (which === 'o') this.fOwner.set(v);
    this.page.set(1);
  }
  reset(): void {
    this.query.set(''); this.tab.set('all'); this.fStage.set('all'); this.fTemp.set('all');
    this.fPot.set('all'); this.fSrc.set('all'); this.fOwner.set('all'); this.page.set(1); this.sort.set('due');
    this.checked.set(new Set());
  }
  toggleRow(id: string): void {
    this.checked.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  toggleAll(): void {
    const rows = this.pageRows();
    this.checked.update((s) => {
      const n = new Set(s);
      if (rows.every((r) => n.has(r.id))) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.add(r.id));
      return n;
    });
  }
  /** Clear one filter from its pill (x button) without opening the dropdown. */
  clearF(which: Dd, e: Event): void { e.stopPropagation(); this.setF(which, 'all'); this.openDd.set(null); }
  /** Clear only the five filters (keeps search, tab and sort). */
  clearFilters(): void { (['s', 't', 'p', 'r', 'o'] as Dd[]).forEach((k) => this.setF(k, 'all')); }
  clearChecked(): void { this.checked.set(new Set()); }

  // ---- custom dropdowns ----
  toggleDd(d: Dd, e: Event): void { e.stopPropagation(); this.openDd.set(this.openDd() === d ? null : d); }
  pick(d: Dd, v: string): void {
    if (d === 'sort') { this.sort.set(v as SortKey); this.page.set(1); }
    else if (d === 'rows') { this.pageSize.set(+v); this.page.set(1); }
    else this.setF(d, v);
    this.openDd.set(null);
  }
  labelOf(opts: Opt[], v: string | number): string { return opts.find((o) => o.value === String(v))?.label ?? String(v); }
  readonly rowOpts: Opt[] = [10, 25, 50].map((n) => ({ value: String(n), label: String(n) }));
  exportSelected(): void { this.doExport(); }
  assignSelected(): void { this.router.navigate(['/app/fundraising/relationships/assignment-board']); }
  isChecked(id: string): boolean { return this.checked().has(id); }
  goCapture(): void { this.router.navigate(['/app/fundraising/relationships/lead-capture']); }
  openLead(r: LeadRow): void { this.router.navigate(['/app/fundraising/Lead/Lead-view'], { queryParams: { ref: r.ref } }); }
  act(r: LeadRow, kind: 'view' | 'note' | 'assign'): void {
    if (kind === 'view') return this.openLead(r);
    // The conversation icon opens this lead's communication timeline; the assign icon opens the board.
    if (kind === 'note') { this.router.navigate(['/app/fundraising/relationships/communication-timeline'], { queryParams: { ref: r.ref } }); return; }
    this.router.navigate(['/app/fundraising/relationships/assignment-board'], { queryParams: { ref: r.ref } });
  }
  doExport(): void {
    this.api.exportLeads({ search: this.query().trim() || undefined, leadIds: this.checked().size ? [...this.checked()].join(',') : undefined }).subscribe({
      next: ({ blob, fileName }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        this.flash('Lead export downloaded.');
      },
      error: (e: unknown) => this.flash(apiErrorMessage(e)),
    });
  }

  ngOnInit(): void { this.load(); }

  private fetch(isConverted: boolean | null) {
    return fetchAllPages((p, size) => this.api.getLeadWorkQueue({
      page: p, pageSize: size, isConverted, onlyMine: this.mine ? true : null,
    }).pipe(map((r) => r.leads)));
  }

  /** Active leads only. The server leaves converted leads out of the queue unless asked for them. */
  load(): void {
    this.loading.set(true);
    this.convertedLoaded = false;
    this.convertedRows.set([]);
    this.fetch(null).subscribe({
      next: (active) => {
        const seen = new Set<string>();
        const unique = active.filter((l) => !l.isConverted && (seen.has(l.id) ? false : (seen.add(l.id), true)));
        this.rows.set(unique.map(toRow));
        this.loading.set(false);
      },
      error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); },
    });
    // Only the number for the Converted card; the rows wait until somebody opens that tab.
    this.api.getLeadWorkQueue({ page: 1, pageSize: 1, isConverted: true, onlyMine: this.mine ? true : null }).subscribe({
      next: (r) => this.convertedTotal.set(r.leads.totalCount ?? 0),
      error: () => this.convertedTotal.set(0),
    });
  }

  private loadConverted(): void {
    if (this.convertedLoaded) return;
    this.convertedLoaded = true;
    this.loading.set(true);
    this.fetch(true).subscribe({
      next: (list) => {
        this.convertedRows.set(list.map(toRow));
        this.convertedTotal.set(list.length);
        this.loading.set(false);
      },
      error: (e: unknown) => { this.convertedLoaded = false; this.loading.set(false); this.flash(apiErrorMessage(e)); },
    });
  }
  icon(n: string): string { return ICONS[n] ?? ''; }
  bars(p: LeadPotential): number { return p === 'Low' ? 1 : p === 'Medium' ? 2 : 3; }
  private flash(t: string): void {
    clearTimeout(this.toastTimer); this.toast.set(t);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 2800);
  }
  @HostListener('document:click') onDocClick(): void { this.openDd.set(null); }
  @HostListener('document:keydown.escape') onEscape(): void {
    if (this.openDd()) this.openDd.set(null); else this.clearChecked();
  }
}