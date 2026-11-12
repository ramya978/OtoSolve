import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TrendSeries } from '../../models/analytics.model';
import { chartId, formatTick, labelStep, niceScale, observeWidth, toneColor } from './chart-utils';

const PAD = { left: 34, right: 12, top: 14, bottom: 26 };

/**
 * Compact trend chart: smooth lines with a subtle area fill, light dashed gridlines, a crosshair
 * tooltip and a draw-in animation. Height adapts to the card width between `minHeight` and
 * `maxHeight` (desktop sits at the maximum, tablets and phones shrink).
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block;min-width:0' },
  template: `
    @if (data().series.length > 1 && showLegend()) {
      <div class="tk-legend is-compact" style="margin-bottom:6px">
        @for (s of data().series; track s.name) {
          <span class="item" [style.--tone]="color(s.tone, $index)"><i class="sw"></i>{{ s.name }} <b>{{ sum(s.values) }}</b></span>
        }
      </div>
    }
    <div class="tk-chart" role="img" [attr.aria-label]="ariaLabel()" (pointerleave)="hover.set(null)">
      <svg [attr.width]="w()" [attr.height]="h()" [attr.viewBox]="'0 0 ' + w() + ' ' + h()">
        <defs>
          @for (s of data().series; track s.name) {
            <linearGradient [attr.id]="gid + '-' + $index" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" [style.stop-color]="color(s.tone, $index)" stop-opacity="0.16" />
              <stop offset="1" [style.stop-color]="color(s.tone, $index)" stop-opacity="0" />
            </linearGradient>
          }
        </defs>
        @for (t of ticks(); track t.v) {
          <line class="grid" [class.is-base]="t.v === 0" [attr.x1]="pad.left" [attr.x2]="w() - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="axis" [attr.x]="pad.left - 8" [attr.y]="t.y" text-anchor="end" dominant-baseline="central">{{ t.label }}</text>
        }
        @for (l of xLabels(); track l.i) {
          <text class="axis" [attr.x]="l.x" [attr.y]="h() - 7" [attr.text-anchor]="l.anchor">{{ l.label }}</text>
        }
        @for (s of paths(); track s.name) {
          @if (area()) { <path class="area" [attr.d]="s.area" [style.fill]="'url(#' + gid + '-' + $index + ')'" /> }
          <path class="line draw" [attr.d]="s.line" pathLength="1" fill="none" [style.stroke]="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        }
        @if (hover() !== null) {
          <line class="guide" [attr.x1]="x(hover()!)" [attr.x2]="x(hover()!)" [attr.y1]="pad.top" [attr.y2]="h() - pad.bottom" />
          @for (s of paths(); track s.name) {
            <circle class="line-dot" [attr.cx]="x(hover()!)" [attr.cy]="s.points[hover()!].y" r="4" [style.fill]="'var(--surface-color)'" [style.stroke]="s.color" stroke-width="2" />
          }
        } @else {
          @for (s of paths(); track s.name) {
            @if (s.points.length) { <circle class="end-dot" [attr.cx]="s.points[s.points.length - 1].x" [attr.cy]="s.points[s.points.length - 1].y" r="3.5" [style.fill]="s.color" /> }
          }
        }
        <rect [attr.x]="pad.left" [attr.y]="pad.top" [attr.width]="plotW()" [attr.height]="plotH()" fill="transparent" (pointermove)="onMove($event)" />
      </svg>
      @if (hover() !== null) {
        <div class="tk-chart-tip" [style.left.px]="tipX()" [style.top.px]="minY(hover()!)">
          <span class="tip-title">{{ data().labels[hover()!] }}</span>
          @for (s of data().series; track s.name) {
            <span class="tip-row"><i [style.background]="color(s.tone, $index)"></i>{{ s.name }}<b>{{ s.values[hover()!] }}{{ unit() }}</b></span>
          }
        </div>
      }
    </div>`,
})
export class LineChart {
  readonly data = input.required<TrendSeries>();
  readonly unit = input('');
  readonly area = input(true);
  readonly showLegend = input(true);
  /** Fixed axis maximum (e.g. 5 for ratings). */
  readonly max = input<number | null>(null);
  readonly maxHeight = input(300);
  readonly minHeight = input(200);

  protected readonly pad = PAD;
  protected readonly gid = chartId('line');
  protected readonly hover = signal<number | null>(null);
  protected readonly w = observeWidth();
  protected readonly h = computed(() => Math.round(Math.min(this.maxHeight(), Math.max(this.minHeight(), this.w() * 0.42))));
  protected readonly plotW = computed(() => Math.max(10, this.w() - PAD.left - PAD.right));
  protected readonly plotH = computed(() => Math.max(10, this.h() - PAD.top - PAD.bottom));

  private readonly scale = computed(() => {
    const fixed = this.max();
    if (fixed) return { max: fixed, step: fixed / 5 };
    return niceScale(Math.max(0, ...this.data().series.flatMap((s) => s.values)));
  });

  protected color(tone: TrendSeries['series'][number]['tone'], i: number): string { return toneColor(tone, i); }
  protected sum(values: readonly number[]): number { return Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10; }
  protected x(i: number): number {
    const n = this.data().labels.length;
    return n <= 1 ? PAD.left + this.plotW() / 2 : PAD.left + (i / (n - 1)) * this.plotW();
  }
  private y(v: number): number { return PAD.top + this.plotH() - (v / this.scale().max) * this.plotH(); }
  protected minY(i: number): number { return Math.min(...this.data().series.map((s) => this.y(s.values[i] ?? 0))); }
  /** Keeps the tooltip inside the card near the edges. */
  protected tipX(): number { return Math.min(this.w() - 70, Math.max(70, this.x(this.hover() ?? 0))); }

  protected onMove(e: PointerEvent): void {
    const n = this.data().labels.length;
    if (!n) return;
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGElement);
    const left = svg.getBoundingClientRect().left;
    const rel = (e.clientX - left - PAD.left) / this.plotW();
    this.hover.set(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  protected readonly ticks = computed(() => {
    const { max, step } = this.scale();
    const out: { v: number; y: number; label: string }[] = [];
    for (let v = 0; v <= max + 1e-9; v += step) out.push({ v, y: this.y(v), label: formatTick(v) });
    return out;
  });

  protected readonly xLabels = computed(() => {
    const labels = this.data().labels;
    const every = labelStep(labels.length, this.plotW());
    return labels
      .map((label, i) => ({ i, label, x: this.x(i), anchor: i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }))
      .filter((l) => l.i % every === 0 || l.i === labels.length - 1)
      // drop a label that would collide with the always-shown last one
      .filter((l, idx, arr) => l.i === labels.length - 1 || idx === arr.length - 1 || arr[arr.length - 1].x - l.x >= 40);
  });

  protected readonly paths = computed(() =>
    this.data().series.map((s, si) => {
      const points = this.data().labels.map((_, i) => ({ x: this.x(i), y: this.y(s.values[i] ?? 0) }));
      const line = points.map((p, i) => {
        if (i === 0) return `M${p.x},${p.y}`;
        const p0 = points[i - 1];
        const cx = (p0.x + p.x) / 2;
        return `C${cx},${p0.y} ${cx},${p.y} ${p.x},${p.y}`;
      }).join(' ');
      const base = PAD.top + this.plotH();
      const area = points.length ? `${line} L${points[points.length - 1].x},${base} L${points[0].x},${base} Z` : '';
      return { name: s.name, color: toneColor(s.tone, si), points, line, area };
    }),
  );

  protected readonly ariaLabel = computed(() =>
    this.data().series.map((s) => `${s.name}: ${this.data().labels.map((l, i) => `${l} ${s.values[i]}`).join(', ')}`).join('. '));
}
