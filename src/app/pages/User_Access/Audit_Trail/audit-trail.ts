import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IamDateRange, IamRange } from '../../../Shared/IAM/iam-date-range';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  AuditEvent, AuditOutcome, IAM_NOW, IamOption, dayLabel, fmtDate, fmtDateTime, fmtTime, initialsOf
} from '../../../Shared/IAM/iam-data';
import { IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { fetchPages } from '../../../Shared/services/paging';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { AuditEventResponse } from '../../../Shared/models/iam-contract.model';

const TYPE_ICON: Record<string, string> = { User: 'personPlus', Role: 'role', Menu: 'layout', Tenant: 'fingerprint', Organisation: 'building', 'Business unit': 'unit' };

const OUTCOME_LABEL: Record<AuditOutcome, string> = { succeeded: 'Succeeded', denied: 'Denied', failed: 'Failed' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = ['12 AM', '6 AM', '12 PM', '6 PM'];
const SLOT_RANGE = ['12 AM – 6 AM', '6 AM – 12 PM', '12 PM – 6 PM', '6 PM – 12 AM'];

/** Audit trail — Workspace Kit "Activity journal": summary, filters, events grouped by date in time order,
 *  outcome overview and a time-of-day heatmap. */
@Component({
  selector: 'app-iam-audit-trail',
  imports: [IamSelect, IamDateRange],
  templateUrl: './audit-trail.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './audit-trail.css']
})
export class AuditTrail implements OnInit {
  private readonly api = inject(IamAdminApiService);
  private readonly all = signal<AuditEvent[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');
  get events(): AuditEvent[] { return this.all(); }

  ngOnInit(): void {
    this.loading.set(true);
    fetchPages((page, pageSize) => this.api.searchAuditEvents({ page, pageSize }), 100, 1000).subscribe({
      next: ({ items }) => {
        this.all.set(items.map((e) => this.toEvent(e)).sort((a, b) => b.at.localeCompare(a.at)));
        this.loading.set(false);
      },
      error: (e) => {
        this.loadError.set(apiErrorMessage(e, 'The audit trail could not be loaded.'));
        this.loading.set(false);
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
  readonly shown = signal(5);
  readonly openId = signal('');

  readonly today = IAM_NOW.toISOString().slice(0, 10);
  readonly days = DAYS;
  readonly slots = SLOTS;
  readonly outcomeLabel = (o: AuditOutcome): string => OUTCOME_LABEL[o];
  readonly dayLabel = (iso: string): string => dayLabel(iso);
  readonly fmtTime = fmtTime;
  readonly fmtDateTime = fmtDateTime;
  readonly initials = initialsOf;

  private readonly typeOptionsC = computed<IamOption[]>(() => [
    { value: '', label: 'All records' },
    ...Array.from(new Set(this.all().map((e) => e.onType).filter(Boolean))).sort().map((t) => ({ value: t, label: t }))
  ]);
  get typeOptions(): IamOption[] { return this.typeOptionsC(); }
  readonly outcomeOptions: IamOption[] = [
    { value: '', label: 'All outcomes' },
    { value: 'succeeded', label: 'Succeeded', icon: 'checkCircle' },
    { value: 'denied', label: 'Denied', icon: 'ban' },
    { value: 'failed', label: 'Failed', icon: 'xCircle' }
  ];

  // ---------------------------------------------------------------- all-time summary
  get total(): number { return this.all().length; }
  get succeeded(): number { return this.all().filter((e) => e.outcome === 'succeeded').length; }
  get deniedFailed(): number { return this.total - this.succeeded; }
  readonly pct = (n: number): number => (this.total ? Math.round((n / this.total) * 100) : 0);
  get actors(): string[] { return Array.from(new Set(this.all().map((e) => e.by))); }
  get top(): { name: string; count: number } {
    const by = new Map<string, number>();
    for (const e of this.all()) by.set(e.by, (by.get(e.by) ?? 0) + 1);
    let name = '';
    let n = 0;
    by.forEach((v, k) => { if (v > n) { name = k; n = v; } });
    return { name, count: n };
  }

  // ---------------------------------------------------------------- filtered
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const { start, end } = this.range();
    return this.all().filter((e) => {
      const day = e.at.slice(0, 10);
      return (!this.recordType() || e.onType === this.recordType()) &&
        (!this.outcome() || e.outcome === this.outcome()) &&
        (!start || day >= start) && (!end || day <= end) &&
        (!q || (e.action + ' ' + e.code + ' ' + e.by + ' ' + e.on).toLowerCase().includes(q));
    });
  });
  readonly visible = computed(() => this.filtered().slice(0, this.shown()));

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

  /** donut + legend for the current filter */
  readonly outcomes = computed(() => {
    const list = this.filtered();
    const n = list.length;
    return (['succeeded', 'denied', 'failed'] as AuditOutcome[]).map((o) => {
      const c = list.filter((e) => e.outcome === o).length;
      return { key: o, label: OUTCOME_LABEL[o], count: c, pct: n ? Math.round((c / n) * 100) : 0 };
    });
  });

  /** donut arcs (stroke-dasharray on a pathLength=100 circle) */
  readonly arcs = computed(() => {
    let offset = 0;
    return this.outcomes().filter((o) => o.count).map((o) => {
      const share = this.filtered().length ? (o.count / this.filtered().length) * 100 : 0;
      const arc = { key: o.key, dash: `${share} ${100 - share}`, offset: -offset };
      offset += share;
      return arc;
    });
  });

  /** heatmap: [slot][weekday] counts */
  readonly heat = computed(() => {
    const grid = SLOTS.map(() => DAYS.map(() => 0));
    for (const e of this.filtered()) {
      const d = new Date(e.at);
      grid[Math.floor(d.getHours() / 6)][(d.getDay() + 6) % 7]++;
    }
    return grid;
  });
  readonly heatMax = computed(() => Math.max(1, ...this.heat().flat()));

  readonly busiest = computed(() => {
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
    return `${DAYS[day]} ${SLOT_RANGE[slot]}: ${n} event${n === 1 ? '' : 's'}`;
  }

  // ---------------------------------------------------------------- actions
  setRange(r: IamRange): void {
    this.range.set(r);
    this.shown.set(5);
  }

  reset(): void {
    this.query.set('');
    this.recordType.set('');
    this.outcome.set('');
    this.range.set({ start: '', end: '' });
    this.shown.set(5);
  }

  loadMore(): void {
    this.shown.set(this.shown() + 5);
  }

  toggle(e: AuditEvent): void {
    this.openId.set(this.openId() === e.id ? '' : e.id);
  }
}
