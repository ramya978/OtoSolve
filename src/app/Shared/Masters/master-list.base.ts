import { DestroyRef, Directive, HostListener, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ColumnDef, FilterDef, IconName, MasterConfig, MasterCounts, MasterRow, MasterStatus, NO_COUNTS, Option, STATUS_LABEL } from './masters.types';
import { MASTER_ICONS, TRASH_LID } from './masters-icons';
import { MasterQuery, MastersStore } from './masters.store';

const PAGE_SIZES: Option[] = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' }
];

/**
 * Shared behaviour of the five master LIST pages (Countries · States · Cities · Currencies ·
 * Time zones), in the Workspace Kit "payment register" pattern: search, filters, sorting, paging,
 * row actions (view · edit · activate · delete), the view drawer, CSV export and toasts.
 * Each page is its own component (countries.ts …) with its own template and styles; it only says
 * which master it shows:   protected override readonly cfg = COUNTRY;
 */
@Directive()
export abstract class MasterListBase implements OnInit {
  private readonly router = inject(Router);
  protected readonly store = inject(MastersStore);

  /** The master this page shows (set by each page). */
  protected abstract readonly cfg: MasterConfig;

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly trashLid = TRASH_LID;

  // ---- list state ----
  protected readonly query = signal('');
  protected readonly filters = signal<Record<string, string>>({});
  /** Empty key = the master's default sort. */
  private readonly sortState = signal<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' });
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  /** Row open in the view drawer / waiting for delete confirmation. */
  protected readonly viewing = signal<MasterRow | null>(null);
  protected readonly deleting = signal<MasterRow | null>(null);

  protected readonly toast = signal<string | null>(null);
  private toastTimer = 0;

  /** Rows whose full record (notes, patterns ...) has been read for the view drawer. */
  private readonly detailed = new Set<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.toastTimer);
      clearTimeout(this.searchTimer);
      this.listSub?.unsubscribe();
    });

    // Search, filters, sort and page all go to the server; a typed search waits a moment first.
    effect(() => {
      const q = this.request();
      untracked(() => {
        clearTimeout(this.searchTimer);
        if (q.search !== this.lastSearch) {
          this.lastSearch = q.search;
          this.searchTimer = window.setTimeout(() => this.load(q), 300);
        } else {
          this.load(q);
        }
      });
    });

    // A failed read of the masters is told once, as a toast.
    effect(() => {
      const error = this.store.loadError();
      if (error) untracked(() => this.showToast(error));
    });

    // The list carries the headline fields only; opening the drawer reads the full record.
    effect(() => {
      const row = this.viewing();
      if (!row || this.detailed.has(row.id)) return;
      this.detailed.add(row.id);
      untracked(() =>
        this.store.loadDetail(this.cfg.key, row.id).subscribe({
          next: (full) => {
            if (full && this.viewing()?.id === row.id) this.viewing.set(full);
          },
          error: () => undefined
        })
      );
    });
  }

  ngOnInit(): void {
    this.store.ensureLoaded();
    this.loadCounts();

    // a notice left by the form (created / saved) shows once as a toast
    const n = this.store.notice();
    if (n && n.key === this.cfg.key) {
      this.store.notice.set(null);
      this.showToast(n.text);
    }
  }

  // ---- data (one page at a time, from the server) ----
  /** The rows of the page on screen. */
  protected readonly pageRows = signal<MasterRow[]>([]);
  /** How many rows match the search and filters (all pages). */
  protected readonly total = signal(0);
  /** Server totals for the overview cards. */
  private readonly counts = signal<MasterCounts>(NO_COUNTS);
  /** How many rows the master holds in all. */
  protected readonly overall = computed(() => this.counts().total);
  protected readonly metrics = computed(() => this.cfg.metrics(this.counts()));
  protected readonly sort = computed(() => (this.sortState().key ? this.sortState() : this.cfg.defaultSort));

  private readonly request = computed<MasterQuery>(() => ({
    search: this.query().trim(),
    filters: this.filters(),
    sort: this.sort(),
    page: this.page(),
    pageSize: this.pageSize()
  }));
  private listSub: Subscription | null = null;
  private searchTimer = 0;
  private lastSearch = '';

  private load(q: MasterQuery): void {
    this.listSub?.unsubscribe();
    this.listSub = this.store.search(this.cfg.key, q).subscribe({
      next: ({ rows, total }) => {
        this.total.set(total);
        const last = Math.max(1, Math.ceil(total / q.pageSize));
        // e.g. the last row of the last page was deleted
        if (!rows.length && total > 0 && q.page > last) {
          this.page.set(last);
          return;
        }
        this.pageRows.set(rows);
      },
      error: (error: unknown) => this.showToast(this.store.describeError(this.cfg.key, error).message)
    });
  }

  private reload(): void {
    this.load(this.request());
    this.loadCounts();
  }

  private loadCounts(): void {
    this.store.counts(this.cfg.key).subscribe({ next: (c) => this.counts.set(c), error: () => undefined });
  }

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pages = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const maxVisible = 5;

    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1) as (number | string)[];
    }

    const result: (number | string)[] = [];
    const half = Math.floor(maxVisible / 2);

    let start = Math.max(2, current - half);
    let end = Math.min(total - 1, current + half);

    if (end - start < maxVisible - 2) {
      if (start === 2) end = Math.min(total - 1, start + maxVisible - 3);
      else start = Math.max(2, end - maxVisible + 3);
    }

    result.push(1);
    if (start > 2) result.push('…');
    for (let i = start; i <= end; i++) result.push(i);
    if (end < total - 1) result.push('…');
    result.push(total);

    return result;
  });
  protected readonly from = computed(() => (this.total() ? (this.page() - 1) * this.pageSize() + 1 : 0));

  protected readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.total()));
  protected readonly hasFilters = computed(() => !!this.query().trim() || Object.values(this.filters()).some((v) => !!v));

  // ---- template helpers ----
  protected icon(name: IconName): string {
    return MASTER_ICONS[name];
  }

  protected col(key: string): ColumnDef | undefined {
    return this.cfg.columns.find((c) => c.key === key);
  }

  /** Display text of one cell (column key + row). */
  protected cell(key: string, r: MasterRow): string {
    const c = this.col(key);
    if (c?.value) return c.value(r, this.store.lookup);
    const v = r[key];
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }

  protected code(key: string, r: MasterRow): string {
    return this.col(key)?.code?.(r) ?? '';
  }

  protected sub(key: string, r: MasterRow): string {
    return this.col(key)?.sub?.(r) ?? '';
  }

  protected statusLabel(r: MasterRow): string {
    return STATUS_LABEL[(r['status'] as MasterStatus) ?? 'active'] ?? String(r['status']);
  }

  protected title(r: MasterRow): string {
    return String(r[this.cfg.nameKey] ?? '');
  }

  protected filterOptions(key: string): Option[] {
    const f: FilterDef | undefined = this.cfg.filters.find((x) => x.key === key);
    if (!f) return [];
    if (f.options) return f.options;
    if (!f.optionsFrom) return [];
    const parent = f.dependsOn ? this.filters()[f.dependsOn] : undefined;
    return this.store.options(f.optionsFrom, parent || undefined);
  }

  protected filterValue(key: string): string {
    return this.filters()[key] || '';
  }

  protected isSorted(key: string): boolean {
    return this.sort().key === key;
  }

  protected isDesc(key: string): boolean {
    return this.sort().key === key && this.sort().dir === 'desc';
  }

  protected ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    const s = this.sort();
    return s.key === key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // ---- actions ----
  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected setFilter(key: string, value: string): void {
    const next = { ...this.filters(), [key]: value };
    // a dependent filter (state) is cleared when its parent (country) changes
    for (const f of this.cfg.filters) {
      if (f.dependsOn === key) {
        next[f.key] = '';
        if (f.optionsFrom === 'states') this.store.loadStates(value);
      }
    }
    this.filters.set(next);
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.query.set('');
    this.filters.set({});
    this.page.set(1);
  }

  protected sortBy(key: string): void {
    if (!this.col(key)?.sort) return;
    const s = this.sort();
    this.sortState.set({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' });
  }

  protected setPageSize(v: string): void {
    this.pageSize.set(Number(v) || 10);
    this.page.set(1);
  }

  protected goPage(p: number | string): void {
    if (typeof p !== 'number') return; // ignore ellipsis markers
    this.page.set(Math.min(this.totalPages(), Math.max(1, p)));
  }

  protected create(): void {
    this.router.navigate([this.cfg.route, 'new']);
  }

  protected edit(r: MasterRow): void {
    this.viewing.set(null);
    this.router.navigate([this.cfg.route, r.id, 'edit']);
  }

  protected togglePower(r: MasterRow): void {
    this.store.toggleStatus(this.cfg.key, r).subscribe({
      next: (next) => {
        this.showToast(`${this.title(r)} is now ${STATUS_LABEL[next].toLowerCase()}.`);
        const v = this.viewing();
        if (v && v.id === r.id) this.viewing.set(this.store.find(this.cfg.key, r.id));
        this.reload();
      },
      error: (error: unknown) => this.showToast(this.store.describeError(this.cfg.key, error).message)
    });
  }

  protected confirmDelete(): void {
    const r = this.deleting();
    if (!r) return;
    this.store.remove(this.cfg.key, r).subscribe({
      next: () => {
        this.deleting.set(null);
        this.viewing.set(null);
        this.showToast(`${this.title(r)} was deleted.`);
        this.reload();
      },
      error: (error: unknown) => {
        // The server refuses (and says why) when the record is still in use.
        this.deleting.set(null);
        this.showToast(this.store.describeError(this.cfg.key, error).message);
      }
    });
  }

  /** The server's export of what is on screen: same search and filters, every page. */
  protected exportCsv(): void {
    this.store.exportFile(this.cfg.key, this.request()).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.cfg.plural.toLowerCase().replace(/\s+/g, '-')}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      error: (error: unknown) => this.showToast(this.store.describeError(this.cfg.key, error).message)
    });
  }

  protected showToast(text: string): void {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 3600);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.deleting()) this.deleting.set(null);
    else if (this.viewing()) this.viewing.set(null);
  }
}
