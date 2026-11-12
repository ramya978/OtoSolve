import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AnalyticsService } from '../services/analytics.service';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { SlaService } from '../services/sla.service';
import { EMPTY_QUERY, Ticket } from '../models/ticket.model';
import { SLA_LIGHT, SlaClock } from '../models/sla.model';
import { errorMessage } from '../data/ticket-api';
import { computeSla, describeClock, formatCountdown } from '../utils/sla';
import { minutesLabel, percent } from '../utils/format';
import { Widget } from '../components/dashboard-widgets';
import { BarChart } from '../components/charts/bar-chart';
import { DonutChart } from '../components/charts/donut-chart';
import { PriorityBadge } from '../components/priority-badge';
import { StatusBadge } from '../components/status-badge';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

type Lane = 'breached' | 'warning' | 'paused';

/** SLA dashboard: compliance, and every running clock that needs attention, counting down live. */
@Component({
  selector: 'app-sla-monitor',
  standalone: true,
  imports: [PageHeader, RouterLink, Widget, BarChart, DonutChart, PriorityBadge, StatusBadge, Skeleton, EmptyState, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-page">
      <app-page-header breadcrumb="Workspace / Tickets" breadcrumbRoute="/app/tickets" heading="SLA monitor"
        description="Green is on track, amber has used 75% of its time, red is past its target. Clocks pause while a ticket waits on the customer or an approver.">
        <ng-container actions>
          <div class="tk-head-acts">
            @if (access.can('sla.manage')) { <a class="tk-btn btn-secondary" routerLink="/app/tickets/settings" fragment="sla"><tk-icon name="sliders" />Edit targets</a> }
          </div>
        </ng-container>
      </app-page-header>

      @if (stats.error()) {
        <div class="tk-card"><app-empty-state icon="wifi-off" tone="danger" heading="SLA figures couldn't load" [message]="err()" retryLabel="Try again" (retry)="stats.reload()" /></div>
      } @else if (!stats.value()) {
        <app-skeleton variant="kpis" [rows]="4" />
      } @else {
        @let sla = stats.value()!.sla;
        <section class="tk-kpis tk-stagger" aria-label="SLA figures">
          <div class="tk-card tk-stat" [attr.data-tone]="tone(sla.responseCompliance)"><span class="tk-stat-icon"><tk-icon name="message" /></span><span class="tk-stat-label">Response SLA</span><span class="tk-stat-value">{{ pct(sla.responseCompliance) }}</span><span class="tk-stat-cap">First replies on time, last 30 days</span></div>
          <div class="tk-card tk-stat" [attr.data-tone]="tone(sla.resolutionCompliance)"><span class="tk-stat-icon"><tk-icon name="check-circle" /></span><span class="tk-stat-label">Resolution SLA</span><span class="tk-stat-value">{{ pct(sla.resolutionCompliance) }}</span><span class="tk-stat-cap">Resolved on time, last 30 days</span></div>
          <div class="tk-card tk-stat" data-tone="danger"><span class="tk-stat-icon"><tk-icon name="alert" /></span><span class="tk-stat-label">Breached</span><span class="tk-stat-value">{{ sla.breached }}</span><span class="tk-stat-cap">Open and past target</span></div>
          <div class="tk-card tk-stat" data-tone="warning"><span class="tk-stat-icon"><tk-icon name="clock" /></span><span class="tk-stat-label">At risk</span><span class="tk-stat-value">{{ sla.atRisk }}</span><span class="tk-stat-cap">75% or more of the time used</span></div>
          <div class="tk-card tk-stat" data-tone="success"><span class="tk-stat-icon"><tk-icon name="shield" /></span><span class="tk-stat-label">On track</span><span class="tk-stat-value">{{ sla.onTrack }}</span><span class="tk-stat-cap">{{ sla.paused }} paused while waiting</span></div>
        </section>
      }

      <section class="tk-card is-clip">
        <div class="tk-tabs" role="tablist" aria-label="Clocks">
          <button type="button" role="tab" [attr.aria-selected]="lane() === 'breached'" (click)="lane.set('breached')">Breached <span class="tk-count" data-tone="danger">{{ count('breached') }}</span></button>
          <button type="button" role="tab" [attr.aria-selected]="lane() === 'warning'" (click)="lane.set('warning')">At risk <span class="tk-count" data-tone="warning">{{ count('warning') }}</span></button>
          <button type="button" role="tab" [attr.aria-selected]="lane() === 'paused'" (click)="lane.set('paused')">Paused <span class="tk-count">{{ count('paused') }}</span></button>
        </div>
        @if (live.isLoading() && !live.value()) {
          <app-skeleton variant="table" [rows]="5" />
        } @else if (!laneRows().length) {
          <app-empty-state [icon]="lane() === 'paused' ? 'clock' : 'check-circle'" [tone]="lane() === 'paused' ? 'neutral' : 'success'" [compact]="true"
                           [heading]="lane() === 'breached' ? 'Nothing is breached' : lane() === 'warning' ? 'Nothing is at risk' : 'No clocks are paused'" />
        } @else {
          <div class="tk-table-scroll">
            <div class="tk-table" role="table" aria-label="SLA clocks" style="--cols: minmax(260px, 2fr) 110px minmax(140px, 1fr) minmax(220px, 1.4fr) 130px; --table-min: 900px">
              <div class="tk-tr is-head" role="row">
                <div class="tk-th" role="columnheader">Ticket</div><div class="tk-th" role="columnheader">Priority</div>
                <div class="tk-th" role="columnheader">Assignee</div><div class="tk-th" role="columnheader">Clock</div><div class="tk-th" role="columnheader">Countdown</div>
              </div>
              @for (r of laneRows(); track r.t.id) {
                <div class="tk-tr is-row" role="row" (click)="open(r.t)">
                  <div class="tk-td" role="cell"><div class="tk-ticket-cell"><span class="num">{{ r.t.number }}</span> <a class="subj" [routerLink]="['/app/tickets', r.t.id]" (click)="$event.stopPropagation()">{{ r.t.subject }}</a><span class="meta"><app-status-badge [status]="r.t.status" size="sm" /></span></div></div>
                  <div class="tk-td" role="cell"><app-priority-badge [priority]="r.t.priority" /></div>
                  <div class="tk-td tk-small" role="cell">{{ tickets.agent(r.t.assigneeId)?.name ?? 'Unassigned' }}</div>
                  <div class="tk-td" role="cell">
                    <div class="tk-small" style="display:flex;justify-content:space-between;gap:8px"><span class="tk-muted">{{ r.which }}</span><span class="tk-sla" [attr.data-light]="light(r.clock)"><span class="dot"></span>{{ text(r.clock) }}</span></div>
                    <div class="tk-progress is-thin" style="margin-top:6px" [attr.data-tone]="barTone(r.clock)" [style.--pct]="barPct(r.clock)"><i></i></div>
                  </div>
                  <div class="tk-td" role="cell"><span class="tk-mono" style="font-weight:700" [style.color]="r.clock.remainingMs < 0 ? 'var(--danger-color)' : null">{{ r.clock.remainingMs < 0 ? '−' : '' }}{{ countdown(r.clock) }}</span></div>
                </div>
              }
            </div>
          </div>
        }
      </section>

      @if (stats.value(); as st) {
        <div class="tk-grid">
          <app-widget class="span-6" heading="Resolution SLA by priority" sub="Last 30 days, plus open tickets already breached">
            <app-bar-chart [labels]="priorityLabels()" [series]="prioritySeries()" [stacked]="true" />
          </app-widget>
          <app-widget class="span-6" heading="Running clocks">
            <app-donut-chart [data]="lights()" label="Open tickets" />
          </app-widget>
        </div>
      }

      <section class="tk-card is-clip">
        <header class="tk-card-head"><h2 class="tk-card-title">Targets</h2><span class="tk-card-sub">Measured in elapsed hours. Escalation: Critical and High notify a manager at breach.</span></header>
        <div class="tk-table-scroll">
          <div class="tk-table" role="table" aria-label="SLA targets" style="--cols: 1fr 1fr 1fr; --table-min: 420px">
            <div class="tk-tr is-head" role="row"><div class="tk-th" role="columnheader">Priority</div><div class="tk-th" role="columnheader">First response</div><div class="tk-th" role="columnheader">Resolution</div></div>
            @for (p of slaService.policies(); track p.priority) {
              <div class="tk-tr" role="row"><div class="tk-td" role="cell"><app-priority-badge [priority]="p.priority" /></div><div class="tk-td tk-num" role="cell">{{ mins(p.firstResponseMins) }}</div><div class="tk-td tk-num" role="cell">{{ mins(p.resolutionMins) }}</div></div>
            }
          </div>
        </div>
      </section>
    </div>`,
})
export class SlaMonitor {
  private readonly analytics = inject(AnalyticsService);
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);
  protected readonly slaService = inject(SlaService);
  private readonly router = inject(Router);

  protected readonly lane = signal<Lane>('breached');
  /** One-second clock for the countdowns on this page. */
  private readonly now = signal(Date.now());

  protected readonly stats = rxResource({
    params: () => ({ rev: this.tickets.revision() }),
    stream: () => this.analytics.stats(30),
  });
  protected readonly live = rxResource({
    params: () => ({ rev: this.tickets.revision(), role: this.access.role() }),
    stream: () => this.tickets.all({ ...EMPTY_QUERY, slaStates: ['breached', 'warning', 'paused'], sort: [{ field: 'sla', dir: 'asc' }] }),
  });
  protected readonly err = computed(() => errorMessage(this.stats.error()));

  private readonly rows = computed(() => {
    const now = this.now();
    return (this.live.value() ?? []).map((t) => {
      const snap = computeSla(t, this.slaService.policies(), now);
      return { t, lane: snap.headline.state as string, clock: snap.headline, which: snap.headline === snap.firstResponse ? 'First response' : 'Resolution' };
    });
  });
  protected readonly laneRows = computed(() => this.rows().filter((r) => r.lane === this.lane()).sort((a, b) => a.clock.remainingMs - b.clock.remainingMs));
  protected count(l: Lane): number { return this.rows().filter((r) => r.lane === l).length; }

  protected readonly priorityLabels = computed(() => this.stats.value()?.sla.byPriority.map((p) => p.priority) ?? []);
  protected readonly prioritySeries = computed(() => {
    const bp = this.stats.value()?.sla.byPriority ?? [];
    return [
      { name: 'Met', tone: 'success' as const, values: bp.map((p) => p.met) },
      { name: 'Missed', tone: 'danger' as const, values: bp.map((p) => p.missed) },
      { name: 'Breached, open', tone: 'warning' as const, values: bp.map((p) => p.breachedOpen) },
    ];
  });
  protected readonly lights = computed(() => {
    const s = this.stats.value()?.sla;
    return s ? [
      { key: 'on-track', label: 'On track', value: s.onTrack, tone: 'success' as const },
      { key: 'warning', label: 'At risk', value: s.atRisk, tone: 'warning' as const },
      { key: 'breached', label: 'Breached', value: s.breached, tone: 'danger' as const },
      { key: 'paused', label: 'Paused', value: s.paused, tone: 'neutral' as const },
    ] : [];
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected tone(p: number): string { return p >= 90 ? 'success' : p >= 75 ? 'warning' : 'danger'; }
  protected pct(v: number): string { return percent(v); }
  protected mins(m: number): string { return minutesLabel(m); }
  protected light(c: SlaClock): string { return SLA_LIGHT[c.state]; }
  protected text(c: SlaClock): string { return describeClock(c); }
  protected countdown(c: SlaClock): string { return formatCountdown(c.remainingMs); }
  protected barTone(c: SlaClock): string { return { green: 'success', amber: 'warning', red: 'danger', grey: 'neutral' }[SLA_LIGHT[c.state]]; }
  protected barPct(c: SlaClock): string { return `${Math.min(100, Math.max(3, c.ratio * 100))}%`; }
  protected open(t: Ticket): void { this.router.navigate(['/app/tickets', t.id]); }
}
