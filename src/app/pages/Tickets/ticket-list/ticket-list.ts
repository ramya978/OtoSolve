import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BulkOperation, EMPTY_QUERY, QuickView, SavedFilter, SortSpec, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES,
  Ticket, TicketCategory, TicketPriority, TicketQuery, TicketStatus,
} from '../models/ticket.model';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { SlaService } from '../services/sla.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { errorMessage } from '../data/ticket-api';
import { needsFor } from '../utils/workflow';
import { describeClock } from '../utils/sla';
import { downloadCsv, downloadXlsx } from '../utils/export';
import { COLUMNS, ColumnKey, DEFAULT_COLUMNS, TicketTable } from '../components/ticket-table';
import { TicketFilter } from '../components/ticket-filter';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkDialog, ConfirmDialog } from '../components/dialogs';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

const COLUMNS_KEY = 'otosolve.tickets.columns';
const MODE_KEY = 'otosolve.tickets.list-mode';
const VIEWS: readonly QuickView[] = ['all', 'mine', 'unassigned', 'due-today', 'breached', 'escalated', 'waiting'];

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [PageHeader, FormsModule, TicketTable, TicketFilter, Skeleton, EmptyState, TkDialog, ConfirmDialog, TkIcon],
  templateUrl: './ticket-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class TicketList {
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);
  private readonly sla = inject(SlaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** From route data: 'mine' on /app/tickets/mine. */
  readonly view = input<QuickView | undefined>(undefined);

  protected readonly query = signal<TicketQuery>(EMPTY_QUERY);
  protected readonly columns = signal<readonly ColumnKey[]>(readJson(COLUMNS_KEY, DEFAULT_COLUMNS));
  protected readonly mode = signal<'paged' | 'infinite'>(readJson(MODE_KEY, 'paged'));
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly columnsOpen = signal(false);
  protected readonly exporting = signal(false);
  protected readonly bulkBusy = signal(false);
  protected readonly bulkStatus = signal<TicketStatus | null>(null);
  protected readonly confirmDelete = signal(false);
  protected bulkReason = '';
  protected readonly pageSizes = [25, 50, 100];
  protected readonly allColumns = COLUMNS;
  protected readonly statuses = TICKET_STATUSES;
  protected readonly priorities = TICKET_PRIORITIES;

  private readonly queryParams = toSignal(this.route.queryParamMap);
  /** Infinite mode keeps every page loaded so far. */
  private readonly accumulated = signal<readonly Ticket[]>([]);

  protected readonly result = rxResource({
    params: () => ({ query: this.query(), rev: this.tickets.revision(), role: this.access.role() }),
    stream: ({ params }) => this.tickets.list(params.query),
  });

  protected readonly rows = computed<readonly Ticket[]>(() =>
    this.mode() === 'infinite' ? this.accumulated() : (this.result.value()?.items ?? []));
  protected readonly total = computed(() => this.result.value()?.total ?? 0);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.query().pageSize)));
  protected readonly firstLoad = computed(() => this.result.isLoading() && !this.result.value());
  protected readonly loadError = computed(() => (this.result.error() ? errorMessage(this.result.error()) : null));
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly hasFilters = computed(() => {
    const q = this.query();
    return !!(q.search || q.statuses.length || q.priorities.length || q.categories.length || q.assigneeIds.length || q.slaStates.length || q.createdFrom || q.createdTo || q.view !== 'all');
  });
  protected readonly range = computed(() => {
    const q = this.query();
    if (!this.total()) return '0';
    if (this.mode() === 'infinite') return `1–${this.rows().length}`;
    return `${(q.page - 1) * q.pageSize + 1}–${Math.min(q.page * q.pageSize, this.total())}`;
  });
  protected readonly pages = computed(() => {
    const n = this.pageCount();
    const cur = this.query().page;
    const set = new Set([1, n, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= n));
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | null)[] = [];
    sorted.forEach((p, i) => { if (i && p - sorted[i - 1] > 1) out.push(null); out.push(p); });
    return out;
  });
  protected readonly heading = computed(() => (this.query().view === 'mine' ? (this.access.isStaff() ? 'My tickets' : 'Your tickets') : 'All tickets'));
  protected readonly bulkNeeds = computed(() => (this.bulkStatus() ? needsFor(this.bulkStatus()!) : []));

  constructor() {
    // URL → query, so links from the dashboard and shared links open the right filter.
    effect(() => {
      const p = this.queryParams();
      const routeView = this.view();
      if (!p) return;
      const list = <T extends string>(key: string, allowed: readonly T[]) =>
        (p.get(key)?.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v)) ?? []);
      const v = p.get('view') as QuickView | null;
      const fromUrl = {
        view: routeView ?? (v && VIEWS.includes(v) ? v : 'all'),
        search: p.get('q') ?? '',
        statuses: list<TicketStatus>('status', TICKET_STATUSES),
        priorities: list<TicketPriority>('priority', TICKET_PRIORITIES),
        categories: list<TicketCategory>('category', TICKET_CATEGORIES),
      };
      // Only the fields kept in the URL are taken from it; the rest of the query stays as it is.
      untracked(() => {
        const q = this.query();
        const same = JSON.stringify(fromUrl) === JSON.stringify({ view: q.view, search: q.search, statuses: q.statuses, priorities: q.priorities, categories: q.categories });
        if (!same) this.query.set({ ...q, ...fromUrl, page: 1 });
      });
    });

    // Infinite mode: page 1 replaces, later pages append.
    effect(() => {
      const value = this.result.value();
      if (!value || this.mode() !== 'infinite') return;
      untracked(() => this.accumulated.update((list) => (value.page === 1 ? value.items : [...list, ...value.items.filter((t) => !list.some((x) => x.id === t.id))])));
    });

    // Drop selections that are no longer in the result.
    effect(() => {
      const ids = new Set(this.rows().map((r) => r.id));
      untracked(() => {
        const sel = this.selected();
        if ([...sel].some((id) => !ids.has(id))) this.selected.set(new Set([...sel].filter((id) => ids.has(id))));
      });
    });
  }

  /* ---------- query changes ---------- */

  protected patch(change: Partial<TicketQuery>): void {
    this.query.update((q) => ({ ...q, ...change }));
    if (change.page === 1 || change.page === undefined) this.syncUrl();
  }

  private syncUrl(): void {
    const q = this.query();
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        view: !this.view() && q.view !== 'all' ? q.view : null,
        q: q.search || null,
        status: q.statuses.join(',') || null,
        priority: q.priorities.join(',') || null,
        category: q.categories.join(',') || null,
      },
    });
  }

  protected setSort(sort: SortSpec[]): void { this.patch({ sort, page: 1 }); }
  protected goTo(page: number): void { this.query.update((q) => ({ ...q, page })); }
  protected setPageSize(size: number): void { this.patch({ pageSize: size, page: 1 }); }

  protected setMode(mode: 'paged' | 'infinite'): void {
    this.mode.set(mode);
    writeJson(MODE_KEY, mode);
    this.accumulated.set([]);
    this.query.update((q) => ({ ...q, page: 1, pageSize: mode === 'infinite' ? 50 : 25 }));
  }

  protected loadMore(): void {
    if (this.result.isLoading() || this.rows().length >= this.total()) return;
    this.query.update((q) => ({ ...q, page: q.page + 1 }));
  }

  protected toggleColumn(key: ColumnKey): void {
    const cur = this.columns();
    const next = cur.includes(key) ? cur.filter((c) => c !== key) : COLUMNS.map((c) => c.key).filter((k) => k === key || cur.includes(k));
    if (!next.includes('subject')) return; // the subject column always stays
    this.columns.set(next);
    writeJson(COLUMNS_KEY, next);
  }

  protected resetColumns(): void { this.columns.set(DEFAULT_COLUMNS); writeJson(COLUMNS_KEY, DEFAULT_COLUMNS); }

  protected clearFilters(): void {
    this.query.update((q) => ({ ...EMPTY_QUERY, view: this.view() ?? 'all', pageSize: q.pageSize, sort: q.sort }));
    this.syncUrl();
  }

  /* ---------- saved views ---------- */

  protected saveView(name: string): void {
    const f = this.tickets.saveFilter(name, this.query());
    this.toast.show('View saved', `“${f.name}” is in Saved views.`, 'success', 2500);
  }

  protected applySaved(f: SavedFilter): void {
    this.query.update((q) => ({ ...EMPTY_QUERY, ...f.query, page: 1, pageSize: q.pageSize }));
    this.syncUrl();
  }

  /* ---------- selection & bulk ---------- */

  protected toggle(id: string): void {
    this.selected.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  protected toggleAll(): void {
    const ids = this.rows().map((r) => r.id);
    const all = ids.every((id) => this.selected().has(id));
    this.selected.set(all ? new Set() : new Set(ids));
  }

  protected runBulk(op: BulkOperation, label: string): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.bulkBusy.set(true);
    this.tickets.bulk(ids, op).subscribe({
      next: (res) => {
        this.bulkBusy.set(false);
        this.bulkStatus.set(null);
        this.confirmDelete.set(false);
        this.bulkReason = '';
        if (res.failed.length) {
          const first = res.failed.slice(0, 3).map((f) => `${f.number}: ${f.reason}`).join('; ');
          this.toast.show(`${label}: ${res.succeeded.length} updated, ${res.failed.length} skipped`, first, 'warning', 7000);
          this.selected.set(new Set(res.failed.map((f) => f.id)));
        } else {
          this.toast.show(label, `${res.succeeded.length} ticket${res.succeeded.length === 1 ? '' : 's'} updated`, 'success');
          this.selected.set(new Set());
        }
      },
      error: (err) => { this.bulkBusy.set(false); this.toast.show(`${label} failed`, errorMessage(err), 'error'); },
    });
  }

  protected bulkAssign(value: string): void {
    if (!value) return;
    const id = value === 'me' ? this.access.agentId() : value === 'none' ? null : value;
    this.runBulk({ kind: 'assign', assigneeId: id }, 'Bulk assignment');
  }

  protected bulkPriority(value: string): void {
    if (value) this.runBulk({ kind: 'priority', priority: value as TicketPriority }, 'Priority update');
  }

  protected chooseBulkStatus(value: string): void {
    if (!value) return;
    const to = value as TicketStatus;
    const needs = needsFor(to).filter((n) => n === 'reason' || n === 'resolution');
    if (needs.length) { this.bulkReason = ''; this.bulkStatus.set(to); }
    else this.runBulk({ kind: 'status', to }, 'Status update');
  }

  protected confirmBulkStatus(): void {
    const to = this.bulkStatus();
    if (!to) return;
    const text = this.bulkReason.trim();
    const needsResolution = this.bulkNeeds().includes('resolution');
    if (text.length < (needsResolution ? 10 : 5)) {
      this.toast.show('Add more detail', needsResolution ? 'Describe the resolution in at least 10 characters.' : 'Add a reason of at least 5 characters.', 'warning');
      return;
    }
    this.runBulk({ kind: 'status', to, ...(needsResolution ? { resolution: text } : { reason: text }) }, 'Status update');
  }

  /* ---------- export ---------- */

  protected export(format: 'csv' | 'xlsx', onlySelected = false): void {
    this.exporting.set(true);
    this.tickets.all({ ...this.query(), page: 1 }).subscribe({
      next: (all) => {
        this.exporting.set(false);
        const list = onlySelected ? all.filter((t) => this.selected().has(t.id)) : all;
        const headers = ['Ticket ID', 'Subject', 'Customer', 'Organisation', 'Priority', 'Status', 'Assignee', 'Team', 'Category', 'Type', 'Channel', 'SLA', 'Created', 'Updated', 'Resolved'];
        const rows = list.map((t) => {
          const c = this.tickets.customer(t.customerId);
          return [
            t.number, t.subject, c?.name ?? '', c?.organisation ?? '', t.priority, t.status, this.tickets.agent(t.assigneeId)?.name ?? 'Unassigned',
            this.tickets.team(t.teamId)?.name ?? '', t.category, t.type, t.channel, describeClock(this.sla.snapshot(t).headline),
            t.createdAt.slice(0, 16).replace('T', ' '), t.updatedAt.slice(0, 16).replace('T', ' '), t.resolvedAt?.slice(0, 16).replace('T', ' ') ?? '',
          ];
        });
        const name = `tickets-${new Date().toISOString().slice(0, 10)}`;
        if (format === 'csv') downloadCsv(name, headers, rows);
        else downloadXlsx(name, 'Tickets', headers, rows);
        this.toast.show('Export ready', `${rows.length} ticket${rows.length === 1 ? '' : 's'} exported as ${format.toUpperCase()}`, 'success', 3000);
      },
      error: (err) => { this.exporting.set(false); this.toast.show('Export failed', errorMessage(err), 'error'); },
    });
  }

  protected open(t: Ticket): void { this.router.navigate(['/app/tickets', t.id]); }
  protected goNew(): void { this.router.navigate(['/app/tickets/new']); }
  protected goBoard(): void { this.router.navigate(['/app/tickets/board']); }
  protected clearSelection(): void { this.selected.set(new Set()); }

  /** "/" focuses search. */
  protected onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    if (e.key !== '/' || !el || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    e.preventDefault();
    this.host.nativeElement.querySelector<HTMLInputElement>('input[type=search]')?.focus();
  }
}
