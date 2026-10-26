import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IamDateRange, IamRange } from '../../../Shared/IAM/iam-date-range';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  AuditEvent, AuditOutcome, IamOption, dayLabel, fmtDate, fmtDateTime, fmtTime, initialsOf
} from '../../../Shared/IAM/iam-data';
import { AuditSearchFilter, IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { AuditEventResponse, AuditSummaryResponse } from '../../../Shared/models/iam-contract.model';

const TYPE_ICON: Record<string, string> = { User: 'personPlus', Role: 'role', Menu: 'layout', Tenant: 'fingerprint', Organisation: 'building', 'Business unit': 'unit' };

const OUTCOME_LABEL: Record<AuditOutcome, string> = { succeeded: 'Succeeded', denied: 'Denied', failed: 'Failed' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = ['12 AM', '6 AM', '12 PM', '6 PM'];
const SLOT_RANGE = ['12 AM – 6 AM', '6 AM – 12 PM', '12 PM – 6 PM', '6 PM – 12 AM'];

/** Rows per request: the server's ceiling. The figures do NOT come from these rows, they are counted by the server. */
const PAGE_SIZE = 100;
const STEP = 5;

/** A local calendar day as yyyy-mm-dd. */
const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Audit trail — Workspace Kit "Activity journal": summary, filters, events grouped by date in time order,
 *  outcome overview and a time-of-day heatmap. Events, figures and record types all come from the server. */
@Component({
  selector: 'app-iam-audit-trail',
  imports: [IamSelect, IamDateRange],
  templateUrl: './audit-trail.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './audit-trail.css']
})
export class AuditTrail implements OnInit, OnDestroy {
  private readonly api = inject(IamAdminApiService);
  private readonly toast = inject(ToastService);

  /** The events fetched so far for the current filter (grows with "Load more"). */
  private readonly all = signal<AuditEvent[]>([]);
  /** GET /audit-events/summary: every figure, the donut and the heatmap, counted over ALL matching events. */
  private readonly summary = signal<AuditSummaryResponse | null>(null);
  /** GET /audit-events/target-types: the record types that actually occur. */
  private readonly targetTypes = signal<string[]>([]);
  private readonly page = signal(1);
  private readonly hasNext = signal(false);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly exporting = signal(false);
  readonly loadError = signal('');
  get events(): AuditEvent[] { return this.all(); }

  private readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Any filter change (typing is debounced) asks the server again; the first run is the initial load.
    effect(() => {
      this.query(); this.recordType(); this.outcome(); this.range();
      untracked(() => this.schedule());
    });
  }

  ngOnInit(): void {
    this.api.getAuditTargetTypes().subscribe({ next: (t) => this.targetTypes.set(t), error: () => this.targetTypes.set([]) });
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 300);
  }

  private filter(page: number): AuditSearchFilter {
    const { start, end } = this.range();
    return {
      search: this.query().trim() || undefined,
      targetType: this.recordType() || undefined,
      result: this.outcome() || undefined,
      // a calendar day to an instant: the start of the first day to the end of the last, so one day returns that day
      fromUtc: start ? new Date(start + 'T00:00:00').toISOString() : undefined,
      toUtc: end ? new Date(end + 'T23:59:59.999').toISOString() : undefined,
      page, pageSize: PAGE_SIZE, timeZone: this.timeZone
    };
  }

  /** A fresh load for the current filter: page 1 of the list, and the server's figures. */
  private load(): void {
    this.page.set(1);
    this.shown.set(STEP);
    this.fetch(true);
    this.api.getAuditSummary(this.filter(1)).subscribe({ next: (s) => this.summary.set(s), error: () => this.summary.set(null) });
  }

  private fetch(reset: boolean): void {
    this.loading.set(reset);
    this.loadingMore.set(!reset);
    this.loadError.set('');
    this.api.searchAuditEvents(this.filter(this.page())).subscribe({
      next: (r) => {
        const rows = (r.items ?? []).map((e) => this.toEvent(e));
        this.all.update((cur) => (reset ? rows : [...cur, ...rows]).sort((a, b) => b.at.localeCompare(a.at)));
        this.totalCount.set(r.totalCount ?? 0);
        this.hasNext.set(r.hasNextPage ?? false);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: (e) => {
        this.loadError.set(apiErrorMessage(e, 'The audit trail could not be loaded.'));
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private toEvent(e: AuditEventResponse): AuditEvent {
    const type = e.targetType ?? '';
    return {
      id: e.id ?? '', at: e.occurredAtUtc ?? '', action: e.actionDisplay ?? e.actionCode ?? '', code: e.actionCode ?? '',
      by: e.actorDisplayName ?? 'System', byRole: e.actorScopeDisplay ?? '', on: e.targetDisplayName ?? '', onType: type,
      outcome: (e.result ?? 'succeeded') as AuditOutcome, icon: TYPE_ICON[type] ?? 'doc'
    };
  }

  readonly query = signal('');
  readonly recordType = signal('');
  readonly outcome = signal<'' | AuditOutcome>('');
  readonly range = signal<IamRange>({ start: '', end: '' });
  readonly shown = signal(STEP);
  readonly openId = signal('');

  /** The real current day, not a frozen sample date. */
  readonly today = isoDay(new Date());
  readonly outcomeLabel = (o: AuditOutcome): string => OUTCOME_LABEL[o];
  readonly dayLabel = (iso: string): string => dayLabel(iso, new Date());
  readonly fmtTime = fmtTime;
  readonly fmtDateTime = fmtDateTime;
  readonly initials = initialsOf;

  get days(): string[] { return this.summary()?.heatmap?.dayLabels?.length ? this.summary()!.heatmap!.dayLabels! : DAYS; }
  get slots(): string[] {
    const b = this.summary()?.heatmap?.bands;
    return b?.length ? b.map((x) => x.label ?? '') : SLOTS;
  }
  private slotRange(i: number): string { return this.summary()?.heatmap?.bands?.[i]?.rangeLabel ?? SLOT_RANGE[i] ?? ''; }

  private readonly typeOptionsC = computed<IamOption[]>(() => [
    { value: '', label: 'All records' },
    ...this.targetTypes().map((t) => ({ value: t, label: t }))
  ]);
  get typeOptions(): IamOption[] { return this.typeOptionsC(); }
  readonly outcomeOptions: IamOption[] = [
    { value: '', label: 'All outcomes' },
    { value: 'succeeded', label: 'Succeeded', icon: 'checkCircle' },
    { value: 'denied', label: 'Denied', icon: 'ban' },
    { value: 'failed', label: 'Failed', icon: 'xCircle' }
  ];

  // ---------------------------------------------------------------- summary (the server's figures for the current filter)
  get total(): number { return this.summary()?.totalCount ?? this.totalCount(); }
  get succeeded(): number { return this.summary()?.outcomes?.find((o) => o.result === 'succeeded')?.count ?? this.all().filter((e) => e.outcome === 'succeeded').length; }
  get deniedFailed(): number { return this.summary()?.unsuccessfulCount ?? Math.max(0, this.total - this.succeeded); }
  readonly pct = (n: number): number => (this.total ? Math.round((n / this.total) * 100) : 0);
  get actorCount(): number { return this.summary()?.distinctActorCount ?? new Set(this.all().map((e) => e.by)).size; }
  get top(): { name: string; count: number } {
    const a = this.summary()?.mostActiveActor;
    return a ? { name: a.displayName || 'System', count: a.eventCount ?? 0 } : { name: '', count: 0 };
  }

  // ---------------------------------------------------------------- list
  /** The loaded events: the server has already applied every filter. */
  readonly filtered = computed(() => this.all());
  readonly visible = computed(() => this.filtered().slice(0, this.shown()));
  readonly canLoadMore = computed(() => this.shown() < this.filtered().length || this.hasNext());

  /** visible events grouped by calendar day (journal sections) */
  readonly journal = computed(() => {
    const out: { key: string; label: string; total: number; events: AuditEvent[] }[] = [];
    for (const e of this.visible()) {
      const key = e.at.slice(0, 10);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: fmtDate(e.at), total: this.filtered().filter((x) => x.at.startsWith(key)).length, events: [] };
        out.push(g);
      }
      g.events.push(e);
    }
    return out;
  });
  readonly hasFilters = computed(() => !!(this.query() || this.recordType() || this.outcome() || this.range().start || this.range().end));

  /** legend for the current filter, from the server's outcome counts */
  readonly outcomes = computed(() => {
    const s = this.summary();
    if (s?.outcomes?.length) {
      return s.outcomes.map((o) => ({ key: (o.result ?? 'succeeded') as AuditOutcome, label: o.label || OUTCOME_LABEL[(o.result ?? 'succeeded') as AuditOutcome] || '', count: o.count ?? 0, pct: Math.round(o.percent ?? 0) }));
    }
    const list = this.all();
    const n = list.length;
    return (['succeeded', 'denied', 'failed'] as AuditOutcome[]).map((o) => {
      const c = list.filter((e) => e.outcome === o).length;
      return { key: o, label: OUTCOME_LABEL[o], count: c, pct: n ? Math.round((c / n) * 100) : 0 };
    });
  });

  /** heatmap: [slot][weekday] counts, counted by the server on the viewer's clock */
  readonly heat = computed(() => {
    const bands = this.summary()?.heatmap?.bands;
    if (bands?.length) return bands.map((b) => this.days.map((_, i) => b.counts?.[i] ?? 0));
    const grid = SLOTS.map(() => DAYS.map(() => 0));
    for (const e of this.all()) {
      const d = new Date(e.at);
      grid[Math.floor(d.getHours() / 6)][(d.getDay() + 6) % 7]++;
    }
    return grid;
  });
  readonly heatMax = computed(() => Math.max(1, this.summary()?.heatmap?.maxCount ?? 0, ...this.heat().flat()));

  readonly busiest = computed(() => {
    const s = this.summary()?.busiestTimeRange;
    if (s) return s;
    const totals = this.heat().map((row) => row.reduce((t, n) => t + n, 0));
    const max = Math.max(...totals);
    return max ? SLOT_RANGE[totals.indexOf(max)] : '';
  });

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  /** 0 = empty … 4 = busiest */
  level(n: number): number {
    return n === 0 ? 0 : Math.max(1, Math.ceil((n / this.heatMax()) * 4));
  }

  cellLabel(slot: number, day: number, n: number): string {
    return `${this.days[day] ?? DAYS[day]} ${this.slotRange(slot)}: ${n} event${n === 1 ? '' : 's'}`;
  }

  // ---------------------------------------------------------------- actions
  setRange(r: IamRange): void {
    this.range.set(r);
    this.shown.set(STEP);
  }

  reset(): void {
    this.query.set('');
    this.recordType.set('');
    this.outcome.set('');
    this.range.set({ start: '', end: '' });
    this.shown.set(STEP);
  }

  loadMore(): void {
    const next = this.shown() + STEP;
    this.shown.set(next);
    // the next rows are not here yet: ask the server for the following page
    if (next > this.all().length && this.hasNext() && !this.loadingMore()) {
      this.page.update((p) => p + 1);
      this.fetch(false);
    }
  }

  toggle(e: AuditEvent): void {
    this.openId.set(this.openId() === e.id ? '' : e.id);
  }

  /** Export to CSV: the server builds the file for the current filter (the export is itself audited). */
  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.api.exportAuditEvents(this.filter(1)).subscribe({
      next: ({ blob, fileName, reference }) => {
        this.exporting.set(false);
        this.api.saveBlob(blob, fileName);
        this.toast.show('Export ready', reference
          ? `${fileName} has been downloaded. This export is recorded in the trail as ${reference}.`
          : `${fileName} has been downloaded. This export has been recorded in the trail.`, 'success');
      },
      error: (e: unknown) => {
        this.exporting.set(false);
        this.toast.show('Export failed', apiErrorMessage(e, 'The audit trail could not be exported.'), 'error');
      }
    });
  }
}
