import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KpiCard } from '../models/dashboard.model';
import { TkIcon } from './icon';
import { EmptyState, Skeleton } from './feedback';

/**
 * One dashboard tile in the OtoSolve KPI style (as on All Donors): icon tile + label,
 * value + chip, a thin bar and a note. Opens the ticket list filtered to what it counts.
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [RouterLink, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block;min-width:0' },
  template: `
    <a class="tk-card tk-kpi" [attr.data-tone]="kpi().tone" [routerLink]="kpi().link ? listLink : null" [queryParams]="params()"
       [attr.aria-label]="kpi().label + ': ' + kpi().value + (kpi().link ? '. Open the matching tickets.' : '')">
      <span class="tk-kpi-top">
        <span class="tk-kpi-ico"><tk-icon [name]="kpi().icon" /></span>
        <span class="tk-kpi-label">{{ kpi().label }}</span>
      </span>
      <span class="tk-kpi-mid">
        <strong class="tk-kpi-value">{{ kpi().value }}</strong>
        @if (kpi().chip) { <span class="tk-kpi-chip">{{ kpi().chip }}</span> }
      </span>
      <span class="tk-kpi-bar" aria-hidden="true"><i [style.width.%]="kpi().barPct"></i></span>
      <span class="tk-kpi-note">{{ kpi().note }}</span>
    </a>`,
})
export class StatCard {
  readonly kpi = input.required<KpiCard>();
  protected readonly listLink = '/app/tickets/list';
  protected readonly params = computed(() => {
    const l = this.kpi().link;
    if (!l) return {};
    return {
      ...(l.view && l.view !== 'all' ? { view: l.view } : {}),
      ...(l.statuses?.length ? { status: l.statuses.join(',') } : {}),
      ...(l.priorities?.length ? { priority: l.priorities.join(',') } : {}),
    };
  });
}

/**
 * A titled dashboard panel (the Platform Dashboard card) that owns its loading, error and empty
 * states, so every chart on a page behaves the same way when its data is late, missing or failed.
 */
@Component({
  selector: 'app-widget',
  standalone: true,
  imports: [Skeleton, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tk-card is-clip tk-widget' },
  template: `
    <header class="tk-card-head is-plain">
      <div style="min-width:0;flex:1">
        <h2 class="tk-card-title">{{ heading() }}</h2>
        @if (sub()) { <p class="tk-card-sub">{{ sub() }}</p> }
      </div>
      <ng-content select="[widget-actions]" />
    </header>
    <div class="tk-card-body">
      @if (error()) {
        <app-empty-state icon="wifi-off" tone="danger" [compact]="true" heading="Couldn't load this panel" [message]="error()!" retryLabel="Try again" (retry)="retry.emit()" />
      } @else if (loading()) {
        <app-skeleton [variant]="skeleton()" [rows]="4" />
      } @else if (empty()) {
        <app-empty-state icon="bar-chart" tone="neutral" [compact]="true" [heading]="emptyText()" message="Try a longer period or come back when there is more activity." />
      } @else {
        <ng-content />
      }
    </div>`,
})
export class Widget {
  readonly heading = input.required<string>();
  readonly sub = input('');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly empty = input(false);
  readonly emptyText = input('Nothing to show for this period');
  readonly skeleton = input<'chart' | 'table' | 'cards'>('chart');
  readonly retry = output<void>();
}
