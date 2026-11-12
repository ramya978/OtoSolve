import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AnalyticsService } from '../services/analytics.service';
import { DashboardService } from '../services/dashboard.service';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { EMPTY_QUERY } from '../models/ticket.model';
import { PERIODS, PeriodKey } from '../models/analytics.model';
import { errorMessage } from '../data/ticket-api';
import { StatCard, Widget } from '../components/dashboard-widgets';
import { DonutChart } from '../components/charts/donut-chart';
import { BarChart } from '../components/charts/bar-chart';
import { LineChart } from '../components/charts/line-chart';
import { WorkloadChart } from '../components/workload-chart';
import { Skeleton, EmptyState } from '../components/feedback';
import { SlaIndicator } from '../components/sla-indicator';
import { PriorityBadge } from '../components/priority-badge';
import { TicketTimeline, TimelineItem } from '../components/ticket-timeline';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

const PERIOD_KEY = 'otosolve.tickets.dashboard-period';

@Component({
  selector: 'app-tickets-dashboard',
  standalone: true,
  imports: [PageHeader, RouterLink, StatCard, Widget, DonutChart, BarChart, LineChart, WorkloadChart, Skeleton, EmptyState, SlaIndicator, PriorityBadge, TicketTimeline, TkIcon],
  templateUrl:'./dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsDashboard {
  private readonly analytics = inject(AnalyticsService);
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);

  protected readonly periods = PERIODS;
  protected readonly period = signal<PeriodKey>(this.readPeriod());
  private readonly days = computed(() => PERIODS.find((p) => p.key === this.period())!.days);

  protected readonly stats = rxResource({
    params: () => ({ days: this.days(), rev: this.tickets.revision() }),
    stream: ({ params }) => this.analytics.stats(params.days),
  });
  protected readonly attention = rxResource({
    params: () => ({ rev: this.tickets.revision() }),
    stream: () => this.tickets.list({ ...EMPTY_QUERY, slaStates: ['breached', 'warning'], sort: [{ field: 'sla', dir: 'asc' }], pageSize: 8 }),
  });
  protected readonly activity = rxResource({
    params: () => ({ rev: this.tickets.revision() }),
    stream: () => this.analytics.activity(10),
  });

  protected readonly s = computed(() => this.stats.value() ?? null);
  protected readonly statsError = computed(() => (this.stats.error() ? errorMessage(this.stats.error()) : null));
  protected readonly kpis = computed(() => (this.s() ? this.dashboard.kpis(this.s()!) : []));
  protected readonly insights = computed(() => (this.s() ? this.dashboard.insights(this.s()!) : []));
  /** The fourth-row chart card switches between the priority mix and time to resolve. */
  protected readonly mixView = signal<'priority' | 'resolution'>('priority');

  protected readonly activityItems = computed<TimelineItem[]>(() =>
    (this.activity.value() ?? []).map((a) => ({ id: a.id, at: a.at, title: `${a.actorName} ${a.text}`, tone: a.tone, ticketId: a.ticketId })));

  protected tone(pct: number): string { return pct >= 90 ? 'success' : pct >= 75 ? 'warning' : 'danger'; }
  protected round(n: number): number { return Math.round(n); }

  protected setPeriod(p: PeriodKey): void {
    this.period.set(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* storage blocked */ }
  }

  protected openStatus(status: string): void { this.router.navigate(['/app/tickets/list'], { queryParams: { status } }); }
  protected openPriority(priority: string): void { this.router.navigate(['/app/tickets/list'], { queryParams: { priority } }); }
  protected openCategory(category: string): void { this.router.navigate(['/app/tickets/list'], { queryParams: { category } }); }

  protected refresh(): void {
    this.tickets.revision.update((n) => n + 1);
  }

  private readPeriod(): PeriodKey {
    try {
      const v = localStorage.getItem(PERIOD_KEY) as PeriodKey | null;
      return v && PERIODS.some((p) => p.key === v) ? v : '30d';
    } catch {
      return '30d';
    }
  }
}
