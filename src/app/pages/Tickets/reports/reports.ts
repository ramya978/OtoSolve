import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TicketService } from '../services/ticket.service';
import { SlaService } from '../services/sla.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { PERIODS, PeriodKey } from '../models/analytics.model';
import { TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES, Ticket } from '../models/ticket.model';
import { errorMessage } from '../data/ticket-api';
import { downloadCsv, downloadXlsx } from '../utils/export';
import { describeClock } from '../utils/sla';
import { minutesLabel } from '../utils/format';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

interface Breakdown {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly { label: string; count: number; share: number; open: number; avgResolutionMins: number | null }[];
}

/** Breakdowns by status, priority, category, channel and person, each exportable, plus the full register. */
@Component({
  selector: 'app-ticket-reports',
  standalone: true,
  imports: [PageHeader, Skeleton, EmptyState, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-page">
      <app-page-header breadcrumb="Workspace / Tickets" breadcrumbRoute="/app/tickets" heading="Ticket reports"
        description="Counts for tickets created in the chosen period. Export any table, or the full register with one row per ticket.">
        <ng-container actions>
          <div class="tk-head-acts">
            <div class="tk-seg" role="group" aria-label="Period">
          @for (p of periods; track p.key) { <button type="button" [attr.aria-pressed]="period() === p.key" (click)="period.set(p.key)">{{ p.label }}</button> }
        </div>
            <button type="button" class="tk-btn btn-secondary" [disabled]="!list().length" (click)="exportRegister('csv')"><tk-icon name="download" />CSV</button>
            <button type="button" class="tk-btn btn-primary" [disabled]="!list().length" (click)="exportRegister('xlsx')"><tk-icon name="download" />Register (Excel)</button>
          </div>
        </ng-container>
      </app-page-header>

      @if (data.error()) {
        <div class="tk-card"><app-empty-state icon="wifi-off" tone="danger" heading="Reports couldn't load" [message]="err()" retryLabel="Try again" (retry)="data.reload()" /></div>
      } @else if (!data.value()) {
        <div class="tk-grid">@for (i of [1, 2, 3, 4]; track i) { <div class="tk-card span-6"><app-skeleton variant="table" [rows]="4" /></div> }</div>
      } @else if (!list().length) {
        <div class="tk-card"><app-empty-state icon="file-text" tone="neutral" heading="No tickets in this period" message="Choose a longer period to see a report." /></div>
      } @else {
        <div class="tk-grid">
          @for (b of breakdowns(); track b.key) {
            <section class="tk-card is-clip" [class.span-6]="b.key !== 'agent'" [class.span-12]="b.key === 'agent'">
              <header class="tk-card-head">
                <h2 class="tk-card-title" style="flex:1">{{ b.title }}</h2>
                <button type="button" class="tk-btn is-ghost is-sm" (click)="exportBreakdown(b, 'csv')" [attr.aria-label]="'Export ' + b.title + ' as CSV'">CSV</button>
                <button type="button" class="tk-btn is-ghost is-sm" (click)="exportBreakdown(b, 'xlsx')" [attr.aria-label]="'Export ' + b.title + ' as Excel'">Excel</button>
              </header>
              <div class="tk-table-scroll">
                <div class="tk-table" role="table" [attr.aria-label]="b.title" style="--cols: minmax(150px, 1.6fr) 80px minmax(140px, 1.2fr) 80px 110px; --table-min: 560px">
                  <div class="tk-tr is-head" role="row">
                    <div class="tk-th" role="columnheader">{{ b.title.replace('By ', '') }}</div><div class="tk-th" role="columnheader">Tickets</div>
                    <div class="tk-th" role="columnheader">Share</div><div class="tk-th" role="columnheader">Open</div><div class="tk-th" role="columnheader">Avg. resolution</div>
                  </div>
                  @for (r of b.rows; track r.label) {
                    <div class="tk-tr" role="row">
                      <div class="tk-td" role="cell"><strong>{{ r.label }}</strong></div>
                      <div class="tk-td tk-num" role="cell">{{ r.count }}</div>
                      <div class="tk-td" role="cell"><div class="tk-row" style="flex-wrap:nowrap"><div class="tk-progress is-thin" style="flex:1" data-tone="primary" [style.--pct]="r.share + '%'"><i></i></div><span class="tk-num tk-small" style="width:38px;text-align:right">{{ r.share }}%</span></div></div>
                      <div class="tk-td tk-num" role="cell">{{ r.open }}</div>
                      <div class="tk-td tk-num" role="cell">{{ mins(r.avgResolutionMins) }}</div>
                    </div>
                  }
                </div>
              </div>
            </section>
          }
        </div>
      }
    </div>`,
})
export class TicketReports {
  private readonly tickets = inject(TicketService);
  private readonly sla = inject(SlaService);
  private readonly toast = inject(ToastService);

  protected readonly periods = PERIODS;
  protected readonly period = signal<PeriodKey>('90d');
  private readonly from = computed(() => new Date(Date.now() - PERIODS.find((p) => p.key === this.period())!.days * 86_400_000).toISOString().slice(0, 10));

  protected readonly data = rxResource({
    params: () => ({ from: this.from(), rev: this.tickets.revision() }),
    stream: ({ params }) => this.tickets.all({ createdFrom: params.from, sort: [{ field: 'createdAt', dir: 'desc' }] }),
  });
  protected readonly list = computed<readonly Ticket[]>(() => this.data.value() ?? []);
  protected readonly err = computed(() => errorMessage(this.data.error()));

  protected readonly breakdowns = computed<Breakdown[]>(() => {
    const all = this.list();
    const total = all.length || 1;
    const build = (key: string, title: string, labels: readonly string[], of: (t: Ticket) => string): Breakdown => ({
      key, title,
      rows: labels.map((label) => {
        const set = all.filter((t) => of(t) === label);
        const resolved = set.filter((t) => t.resolvedAt);
        const avg = resolved.length ? resolved.reduce((n, t) => n + (Date.parse(t.resolvedAt!) - Date.parse(t.createdAt) - t.slaPausedMs) / 60_000, 0) / resolved.length : null;
        return { label, count: set.length, share: Math.round((set.length / total) * 100), open: set.filter((t) => !['Resolved', 'Closed', 'Cancelled'].includes(t.status)).length, avgResolutionMins: avg };
      }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
    });
    const agentName = (t: Ticket) => this.tickets.agent(t.assigneeId)?.name ?? 'Unassigned';
    return [
      build('status', 'By status', TICKET_STATUSES, (t) => t.status),
      build('priority', 'By priority', TICKET_PRIORITIES, (t) => t.priority),
      build('category', 'By category', TICKET_CATEGORIES, (t) => t.category),
      build('channel', 'By channel', TICKET_CHANNELS, (t) => t.channel),
      build('agent', 'By person', Array.from(new Set(all.map(agentName))), agentName),
    ];
  });

  protected mins(m: number | null): string { return minutesLabel(m); }

  protected exportBreakdown(b: Breakdown, format: 'csv' | 'xlsx'): void {
    const headers = [b.title.replace('By ', ''), 'Tickets', 'Share %', 'Open', 'Avg. resolution (hours)'];
    const rows = b.rows.map((r) => [r.label, r.count, r.share, r.open, r.avgResolutionMins === null ? '' : Math.round((r.avgResolutionMins / 60) * 10) / 10]);
    const name = `tickets-${b.key}-${this.period()}`;
    format === 'csv' ? downloadCsv(name, headers, rows) : downloadXlsx(name, b.title, headers, rows);
  }

  protected exportRegister(format: 'csv' | 'xlsx'): void {
    const headers = ['Ticket ID', 'Subject', 'Customer', 'Status', 'Priority', 'Category', 'Type', 'Channel', 'Assignee', 'Team', 'SLA', 'Created', 'First reply', 'Resolved', 'Reopened', 'CSAT'];
    const rows = this.list().map((t) => [
      t.number, t.subject, this.tickets.customer(t.customerId)?.name ?? '', t.status, t.priority, t.category, t.type, t.channel,
      this.tickets.agent(t.assigneeId)?.name ?? 'Unassigned', this.tickets.team(t.teamId)?.name ?? '', describeClock(this.sla.snapshot(t).headline),
      t.createdAt.slice(0, 16).replace('T', ' '), t.firstResponseAt?.slice(0, 16).replace('T', ' ') ?? '', t.resolvedAt?.slice(0, 16).replace('T', ' ') ?? '',
      t.reopenCount, t.csat ?? '',
    ]);
    const name = `ticket-register-${this.period()}`;
    format === 'csv' ? downloadCsv(name, headers, rows) : downloadXlsx(name, 'Register', headers, rows);
    this.toast.show('Export ready', `${rows.length} tickets`, 'success', 2500);
  }
}
