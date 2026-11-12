import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AgentPerformance } from '../models/analytics.model';

/**
 * Team workload: each agent's open tickets against their capacity, plus what they resolved in the
 * period. The bar turns amber above 80% of capacity and red above 100%.
 */
@Component({
  selector: 'app-workload-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="tk-list" role="list">
      @for (a of rows(); track a.agentId) {
        <li style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center">
          <div class="tk-person">
            <span class="tk-avatar is-sm" data-tone="primary">{{ a.initials }}</span>
            <div class="who"><strong>{{ a.name }}</strong><small>{{ a.team }}</small></div>
          </div>
          <div class="tk-small tk-num" style="text-align:right">
            <b>{{ a.open }}</b><span class="tk-faint"> / {{ a.capacity }} open</span>
            <span class="tk-faint"> · </span><b>{{ a.resolved }}</b><span class="tk-faint"> resolved</span>
          </div>
          <div class="tk-progress" style="grid-column:1/-1" [attr.data-tone]="a.tone" [style.--pct]="a.pct + '%'" role="progressbar"
               [attr.aria-valuenow]="a.load" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="a.name + ' workload ' + a.load + '% of capacity'"><i></i></div>
        </li>
      }
    </ul>`,
})
export class WorkloadChart {
  readonly agents = input.required<readonly AgentPerformance[]>();
  /** Show only the busiest N people (0 = everyone). */
  readonly limit = input(0);
  protected readonly rows = computed(() =>
    [...this.agents()]
      .sort((a, b) => b.open / b.capacity - a.open / a.capacity)
      .map((a) => {
        const load = Math.round((a.open / Math.max(1, a.capacity)) * 100);
        return { ...a, load, pct: Math.min(100, Math.max(3, load)), tone: load > 100 ? 'danger' : load > 80 ? 'warning' : 'success' };
      })
      .slice(0, this.limit() || undefined));
}
