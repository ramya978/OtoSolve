import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CountByKey } from '../../models/analytics.model';
import { toneColor } from './chart-utils';

/**
 * Compact donut with a compact legend. The ring is a fixed size (default 148px, smaller on phones)
 * and sits centred; the legend goes beside it when the card is wide enough and below it when not.
 * Hovering a segment or legend row highlights it and shows its value in the centre.
 */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tk-donut', '[style.--donut-size.px]': 'size()' },
  template: `
    <div class="tk-donut-wrap" [class.is-below]="legend() === 'below'">
      <div class="tk-chart tk-donut-ring" [class.is-focus]="active() !== null" role="img" [attr.aria-label]="ariaLabel()">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" [attr.r]="radius" fill="none" [attr.stroke-width]="thickness()" class="ring-track" />
          @for (s of segments(); track s.key) {
            <circle class="seg" [class.is-on]="active() === $index" cx="100" cy="100" [attr.r]="radius" fill="none"
                    [attr.stroke-width]="active() === $index ? thickness() + 5 : thickness()"
                    [style.stroke]="s.color" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.offset"
                    transform="rotate(-90 100 100)" (pointerenter)="active.set($index)" (pointerleave)="active.set(null)" (click)="pick.emit(s.key)" />
          }
          <text class="center-value" x="100" y="100" text-anchor="middle" dominant-baseline="central" dy="-7">{{ centerValue() }}</text>
          <text class="center-label" x="100" y="100" text-anchor="middle" dy="20">{{ centerText() }}</text>
        </svg>
      </div>
      @if (legend() !== 'none') {
        <ul class="tk-legend is-list is-compact" role="list">
          @for (s of segments(); track s.key) {
            <li class="item" [class.is-on]="active() === $index" [style.--tone]="s.color"
                (pointerenter)="active.set($index)" (pointerleave)="active.set(null)" (click)="pick.emit(s.key)">
              <span><i class="sw"></i>{{ s.label }}</span><span><b>{{ s.value }}</b><em>{{ s.pct }}%</em></span>
            </li>
          }
        </ul>
      }
    </div>`,
})
export class DonutChart {
  readonly data = input.required<readonly CountByKey[]>();
  readonly label = input('Total');
  /** 'auto' puts the legend beside the ring when there is room, below it otherwise. */
  readonly legend = input<'auto' | 'below' | 'none'>('auto');
  /** Ring diameter in px. */
  readonly size = input(148);
  readonly thickness = input(24);
  /** At most this many legend rows; the rest are summed into "Other". */
  readonly maxItems = input(6);
  readonly pick = output<string>();

  protected readonly radius = 76;
  protected readonly active = signal<number | null>(null);
  private readonly total = computed(() => this.data().reduce((n, d) => n + d.value, 0));

  private readonly shown = computed<readonly CountByKey[]>(() => {
    const rows = [...this.data()].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const max = this.maxItems();
    if (rows.length <= max) return rows;
    const rest = rows.slice(max - 1).reduce((n, d) => n + d.value, 0);
    return [...rows.slice(0, max - 1), { key: '__other', label: 'Other', value: rest, tone: 'neutral' }];
  });

  protected readonly segments = computed(() => {
    const total = this.total() || 1;
    const c = 2 * Math.PI * this.radius;
    const gap = this.shown().length > 1 ? 2.5 : 0;
    let acc = 0;
    return this.shown().map((d, i) => {
      const len = (d.value / total) * c;
      const seg = {
        key: d.key, label: d.label, value: d.value, pct: Math.round((d.value / total) * 100),
        color: toneColor(d.tone, i), dash: `${Math.max(0, len - gap)} ${c}`, offset: -acc,
      };
      acc += len;
      return seg;
    });
  });

  protected readonly centerValue = computed(() => {
    const a = this.active();
    return a === null ? String(this.total()) : `${this.segments()[a]?.pct ?? ''}%`;
  });
  protected readonly centerText = computed(() => {
    const a = this.active();
    const text = a === null ? this.label() : this.segments()[a]?.label ?? '';
    return text.length > 14 ? `${text.slice(0, 13)}…` : text;
  });
  protected readonly ariaLabel = computed(() => `${this.label()}: ${this.segments().map((s) => `${s.label} ${s.value}`).join(', ')}`);
}
