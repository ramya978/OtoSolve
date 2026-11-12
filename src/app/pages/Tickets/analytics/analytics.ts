import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AnalyticsService } from '../services/analytics.service';
import { TicketService } from '../services/ticket.service';
import { AgentPerformance, PERIODS, PeriodKey } from '../models/analytics.model';
import { errorMessage } from '../data/ticket-api';
import { minutesLabel, percent } from '../utils/format';
import { Widget } from '../components/dashboard-widgets';
import { DonutChart } from '../components/charts/donut-chart';
import { BarChart } from '../components/charts/bar-chart';
import { LineChart } from '../components/charts/line-chart';
import { WorkloadChart } from '../components/workload-chart';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

type AgentSort = 'name' | 'assigned' | 'resolved' | 'avgFirstResponseMins' | 'avgResolutionMins' | 'slaMetPct' | 'csat';

@Component({
  selector: 'app-ticket-analytics',
  standalone: true,
  imports: [PageHeader, Widget, DonutChart, BarChart, LineChart, WorkloadChart, Skeleton, EmptyState, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-page">
      <app-page-header breadcrumb="Workspace / Tickets" breadcrumbRoute="/app/tickets" heading="Ticket analytics"
        description="Volumes, speed, satisfaction and team performance for the period you choose.">
        <ng-container actions>
          <div class="tk-head-acts">
            <div class="tk-seg" role="group" aria-label="Period">
          @for (p of periods; track p.key) { <button type="button" [attr.aria-pressed]="period() === p.key" (click)="period.set(p.key)">{{ p.label }}</button> }
        </div>
          </div>
        </ng-container>
      </app-page-header>

      @if (error()) {
        <div class="tk-card"><app-empty-state icon="wifi-off" tone="danger" heading="Analytics couldn't load" [message]="error()!" retryLabel="Try again" (retry)="stats.reload()" /></div>
      } @else if (!s()) {
        <app-skeleton variant="kpis" [rows]="4" />
      } @else {
        @let st = s()!;
        <section class="tk-kpis tk-stagger" aria-label="Highlights">
          <div class="tk-card tk-stat" data-tone="primary"><span class="tk-stat-icon"><tk-icon name="inbox" /></span><span class="tk-stat-label">Created</span><span class="tk-stat-value">{{ st.totals.total }}</span><span class="tk-stat-cap">{{ st.previous.total }} in the previous period</span></div>
          <div class="tk-card tk-stat" data-tone="success"><span class="tk-stat-icon"><tk-icon name="check-circle" /></span><span class="tk-stat-label">Resolved</span><span class="tk-stat-value">{{ st.totals.resolved }}</span><span class="tk-stat-cap">{{ st.previous.resolved }} in the previous period</span></div>
          <div class="tk-card tk-stat" data-tone="violet"><span class="tk-stat-icon"><tk-icon name="timer" /></span><span class="tk-stat-label">Avg. resolution</span><span class="tk-stat-value">{{ mins(st.totals.avgResolutionMins) }}</span><span class="tk-stat-cap">Previously {{ mins(st.previous.avgResolutionMins) }}</span></div>
          <div class="tk-card tk-stat" data-tone="info"><span class="tk-stat-icon"><tk-icon name="shield" /></span><span class="tk-stat-label">SLA met</span><span class="tk-stat-value">{{ pct(st.sla.resolutionCompliance) }}</span><span class="tk-stat-cap">Response {{ pct(st.sla.responseCompliance) }}</span></div>
          <div class="tk-card tk-stat" data-tone="warning"><span class="tk-stat-icon"><tk-icon name="star" /></span><span class="tk-stat-label">Satisfaction</span><span class="tk-stat-value">{{ st.totals.csat === null ? '—' : st.totals.csat.toFixed(1) }}</span><span class="tk-stat-cap">Out of 5</span></div>
          <div class="tk-card tk-stat" data-tone="neutral"><span class="tk-stat-icon"><tk-icon name="trending" /></span><span class="tk-stat-label">Busiest category</span><span class="tk-stat-value" style="font-size:20px">{{ busiest() }}</span><span class="tk-stat-cap">Most tickets this period</span></div>
        </section>

        <div class="tk-grid">
          <app-widget class="span-8" heading="Daily volume" sub="Created and resolved per day, up to the last 30 days"><app-line-chart [data]="st.dailyTrend" /></app-widget>
          <app-widget class="span-4" heading="By category" [empty]="!st.totals.total"><app-donut-chart [data]="st.byCategory" label="Tickets" legend="below" /></app-widget>
          <app-widget class="span-4" heading="By channel" [empty]="!st.totals.total"><app-bar-chart [items]="st.byChannel" [horizontal]="true" /></app-widget>
          <app-widget class="span-4" heading="Customer satisfaction" sub="Average rating per month"><app-line-chart [data]="st.csatTrend" [max]="5" /></app-widget>
          <app-widget class="span-4" heading="Time to resolve" [empty]="!st.totals.resolved" emptyText="Nothing was resolved in this period"><app-bar-chart [items]="st.resolutionBuckets" /></app-widget>
          <app-widget class="span-6" heading="Workload" sub="Open tickets against each person's capacity" skeleton="cards" [empty]="!st.agents.length"><app-workload-chart [agents]="st.agents" /></app-widget>
          <app-widget class="span-6" heading="Resolved per person" [empty]="!st.agents.length">
            <app-bar-chart [labels]="agentLabels()" [series]="agentSeries()" [horizontal]="true" />
          </app-widget>
        </div>

        <section class="tk-card is-clip">
          <header class="tk-card-head"><div style="flex:1"><h2 class="tk-card-title">Team performance</h2><p class="tk-card-sub">Select a heading to sort</p></div></header>
          @if (agents().length) {
            <div class="tk-table-scroll">
              <div class="tk-table" role="table" aria-label="Team performance" style="--cols: minmax(200px, 1.6fr) repeat(6, minmax(100px, 1fr)); --table-min: 820px">
                <div class="tk-tr is-head" role="row">
                  @for (c of agentCols; track c.key) {
                    <div class="tk-th" role="columnheader"><button type="button" class="tk-sort" (click)="sortAgents(c.key)" [attr.aria-sort]="agentSort().key === c.key ? (agentSort().dir === 'asc' ? 'ascending' : 'descending') : 'none'">{{ c.label }}<span class="arrow">{{ agentSort().key === c.key ? (agentSort().dir === 'asc' ? '▲' : '▼') : '↕' }}</span></button></div>
                  }
                </div>
                @for (a of agents(); track a.agentId) {
                  <div class="tk-tr" role="row">
                    <div class="tk-td" role="cell"><div class="tk-person"><span class="tk-avatar is-sm" data-tone="primary">{{ a.initials }}</span><div class="who"><strong>{{ a.name }}</strong><small>{{ a.team }}</small></div></div></div>
                    <div class="tk-td tk-num" role="cell">{{ a.assigned }}</div>
                    <div class="tk-td tk-num" role="cell">{{ a.resolved }}</div>
                    <div class="tk-td tk-num" role="cell">{{ mins(a.avgFirstResponseMins) }}</div>
                    <div class="tk-td tk-num" role="cell">{{ mins(a.avgResolutionMins) }}</div>
                    <div class="tk-td tk-num" role="cell"><span class="tk-badge is-sm" [attr.data-tone]="a.slaMetPct === null ? 'neutral' : a.slaMetPct >= 90 ? 'success' : a.slaMetPct >= 75 ? 'warning' : 'danger'">{{ pct(a.slaMetPct) }}</span></div>
                    <div class="tk-td tk-num" role="cell">{{ a.csat === null ? '—' : a.csat.toFixed(1) }}</div>
                  </div>
                }
              </div>
            </div>
          } @else {
            <app-empty-state icon="users" tone="neutral" [compact]="true" heading="No assigned tickets in this period" />
          }
        </section>
      }
    </div>`,
})
export class TicketAnalytics {
  private readonly analytics = inject(AnalyticsService);
  private readonly tickets = inject(TicketService);

  protected readonly periods = PERIODS;
  protected readonly period = signal<PeriodKey>('90d');
  protected readonly agentSort = signal<{ key: AgentSort; dir: 'asc' | 'desc' }>({ key: 'resolved', dir: 'desc' });
  protected readonly agentCols: readonly { key: AgentSort; label: string }[] = [
    { key: 'name', label: 'Person' }, { key: 'assigned', label: 'Assigned' }, { key: 'resolved', label: 'Resolved' },
    { key: 'avgFirstResponseMins', label: 'First reply' }, { key: 'avgResolutionMins', label: 'Resolution' }, { key: 'slaMetPct', label: 'SLA met' }, { key: 'csat', label: 'CSAT' },
  ];

  protected readonly stats = rxResource({
    params: () => ({ days: PERIODS.find((p) => p.key === this.period())!.days, rev: this.tickets.revision() }),
    stream: ({ params }) => this.analytics.stats(params.days),
  });
  protected readonly s = computed(() => this.stats.value() ?? null);
  protected readonly error = computed(() => (this.stats.error() ? errorMessage(this.stats.error()) : null));
  protected readonly busiest = computed(() => [...(this.s()?.byCategory ?? [])].sort((a, b) => b.value - a.value)[0]?.label ?? '—');

  protected readonly agents = computed<AgentPerformance[]>(() => {
    const { key, dir } = this.agentSort();
    const sign = dir === 'asc' ? 1 : -1;
    return [...(this.s()?.agents ?? [])].sort((a, b) => {
      const va = a[key] ?? -1;
      const vb = b[key] ?? -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
    });
  });
  protected readonly agentLabels = computed(() => this.agents().map((a) => a.name));
  protected readonly agentSeries = computed(() => [
    { name: 'Resolved', tone: 'success' as const, values: this.agents().map((a) => a.resolved) },
    { name: 'Still open', tone: 'warning' as const, values: this.agents().map((a) => a.open) },
  ]);

  protected sortAgents(key: AgentSort): void {
    this.agentSort.update((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }
  protected mins(m: number | null): string { return minutesLabel(m); }
  protected pct(v: number | null): string { return percent(v); }
}
