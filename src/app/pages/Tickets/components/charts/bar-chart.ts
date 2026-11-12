import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CountByKey } from '../../models/analytics.model';
import { Tone } from '../../models/ticket.model';
import { formatTick, labelStep, niceScale, observeWidth, toneColor } from './chart-utils';

export interface BarSeries {
  readonly name: string;
  readonly tone: Tone;
  readonly values: readonly number[];
}

const V = { left: 30, right: 6, top: 10, bottom: 24 };
const ROW = 26;

/**
 * Compact bars, vertical or horizontal; one series, grouped or stacked.
 * Pass `items` for one series where each bar has its own tone, or `labels` + `series`.
 * Bars grow in on first render and show a tooltip on hover; thin horizontal tracks keep it light.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block;min-width:0' },
  template: `
    @if (seriesList().length > 1 && showLegend()) {
      <div class="tk-legend is-compact" style="margin-bottom:6px">
        @for (s of seriesList(); track s.name) { <span class="item" [style.--tone]="color(s.tone, $index)"><i class="sw"></i>{{ s.name }}</span> }
      </div>
    }
    <div class="tk-chart" role="img" [attr.aria-label]="ariaLabel()" (pointerleave)="tip.set(null)">
      @if (horizontal()) {
        <svg [attr.width]="w()" [attr.height]="hHeight()" [attr.viewBox]="'0 0 ' + w() + ' ' + hHeight()">
          @for (row of hRows(); track row.key) {
            <text class="axis is-label" x="0" [attr.y]="row.y + ROW / 2" dominant-baseline="central">{{ row.label }}</text>
            <rect class="track" [attr.x]="labelW()" [attr.y]="row.y + (ROW - barT) / 2" [attr.width]="trackW()" [attr.height]="barT" [attr.rx]="barT / 2" />
            @for (b of row.bars; track $index) {
              <rect class="bar grow-x" [attr.x]="labelW() + b.x" [attr.y]="row.y + (ROW - barT) / 2" [attr.width]="b.w" [attr.height]="barT" [attr.rx]="barT / 2"
                    [style.fill]="b.fill" (pointerenter)="tip.set({ x: labelW() + b.x + b.w / 2, y: row.y, text: b.tip })" (click)="pick.emit(row.key)" />
            }
            <text class="value-label" [attr.x]="w() - 2" [attr.y]="row.y + ROW / 2" text-anchor="end" dominant-baseline="central">{{ row.total }}{{ unit() }}</text>
          }
        </svg>
      } @else {
        <svg [attr.width]="w()" [attr.height]="height()" [attr.viewBox]="'0 0 ' + w() + ' ' + height()">
          @for (t of ticks(); track t.v) {
            <line class="grid" [class.is-base]="t.v === 0" [attr.x1]="V.left" [attr.x2]="w() - V.right" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="axis" [attr.x]="V.left - 7" [attr.y]="t.y" text-anchor="end" dominant-baseline="central">{{ t.label }}</text>
          }
          @for (g of vGroups(); track $index) {
            @for (b of g.bars; track $index) {
              <rect class="bar grow-y" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" [style.fill]="b.fill"
                    (pointerenter)="tip.set({ x: b.x + b.w / 2, y: b.y, text: b.tip })" (click)="pick.emit(g.key)" />
            }
            @if (g.showLabel) { <text class="axis" [attr.x]="g.cx" [attr.y]="height() - 7" text-anchor="middle">{{ g.label }}</text> }
          }
        </svg>
      }
      @if (tip(); as t) {
        <div class="tk-chart-tip" [style.left.px]="clampX(t.x)" [style.top.px]="t.y">{{ t.text }}</div>
      }
    </div>`,
})
export class BarChart {
  readonly items = input<readonly CountByKey[] | null>(null);
  readonly labels = input<readonly string[]>([]);
  readonly series = input<readonly BarSeries[]>([]);
  readonly horizontal = input(false);
  readonly stacked = input(false);
  readonly unit = input('');
  readonly showLegend = input(true);
  /** Height of a vertical chart in px. */
  readonly height = input(180);
  readonly pick = output<string>();

  protected readonly V = V;
  protected readonly ROW = ROW;
  protected readonly barT = 8;
  protected readonly tip = signal<{ x: number; y: number; text: string } | null>(null);
  protected readonly w = observeWidth(360);

  private readonly keys = computed(() => this.items()?.map((i) => i.key) ?? this.labels());
  private readonly labelList = computed(() => this.items()?.map((i) => i.label) ?? this.labels());
  protected readonly seriesList = computed<readonly BarSeries[]>(() => {
    const items = this.items();
    return items ? [{ name: 'Count', tone: 'primary', values: items.map((i) => i.value) }] : this.series();
  });

  private readonly scale = computed(() => {
    const s = this.seriesList();
    let max = 0;
    for (let i = 0; i < this.labelList().length; i++) {
      const vals = s.map((x) => x.values[i] ?? 0);
      max = Math.max(max, this.stacked() ? vals.reduce((a, b) => a + b, 0) : Math.max(0, ...vals));
    }
    return niceScale(max, this.horizontal() ? 1 : 3);
  });

  protected color(tone: Tone, index: number): string { return toneColor(tone, index); }
  protected clampX(x: number): number { return Math.min(this.w() - 60, Math.max(60, x)); }

  private fill(seriesIndex: number, itemIndex: number): string {
    const items = this.items();
    return items ? toneColor(items[itemIndex]?.tone, itemIndex) : toneColor(this.seriesList()[seriesIndex]?.tone, seriesIndex);
  }

  private readonly plotW = computed(() => Math.max(10, this.w() - V.left - V.right));
  private readonly plotH = computed(() => Math.max(10, this.height() - V.top - V.bottom));

  protected readonly ticks = computed(() => {
    const { max, step } = this.scale();
    const out: { v: number; y: number; label: string }[] = [];
    for (let v = 0; v <= max + 1e-9; v += step) out.push({ v, y: V.top + this.plotH() - (v / max) * this.plotH(), label: formatTick(v) });
    return out;
  });

  protected readonly vGroups = computed(() => {
    const labels = this.labelList();
    const keys = this.keys();
    const s = this.seriesList();
    const { max } = this.scale();
    const n = Math.max(1, labels.length);
    const groupW = this.plotW() / n;
    const inner = Math.min(groupW * 0.62, s.length > 1 && !this.stacked() ? 16 * s.length : 30);
    const every = labelStep(n, this.plotW(), 48);
    const base = V.top + this.plotH();
    return labels.map((label, i) => {
      const x0 = V.left + i * groupW + (groupW - inner) / 2;
      let stackY = base;
      const bars = s.map((ser, si) => {
        const v = ser.values[i] ?? 0;
        const h = (v / max) * this.plotH();
        const tip = `${label}${s.length > 1 ? ` · ${ser.name}` : ''}: ${v}${this.unit()}`;
        if (this.stacked()) {
          stackY -= h;
          return { x: x0, y: stackY, w: inner, h: Math.max(0, h), fill: this.fill(si, i), tip };
        }
        const w = inner / s.length;
        return { x: x0 + si * w, y: base - h, w: Math.max(2, w - 2), h: Math.max(0, h), fill: this.fill(si, i), tip };
      });
      return { key: keys[i], label, cx: V.left + i * groupW + groupW / 2, bars, showLabel: i % every === 0 };
    });
  });

  /** Label column: as wide as the longest label needs, but never more than 38% of the chart. */
  protected readonly labelW = computed(() => {
    const longest = Math.max(4, ...this.labelList().map((l) => l.length));
    return Math.round(Math.min(this.w() * 0.38, longest * 6.6 + 10));
  });
  protected readonly trackW = computed(() => Math.max(10, this.w() - this.labelW() - 40));
  protected readonly hHeight = computed(() => Math.max(1, this.labelList().length) * ROW);

  protected readonly hRows = computed(() => {
    const labels = this.labelList();
    const keys = this.keys();
    const s = this.seriesList();
    const { max } = this.scale();
    const maxChars = Math.max(6, Math.floor((this.labelW() - 10) / 6.6));
    return labels.map((label, i) => {
      let x = 0;
      const bars = s.map((ser, si) => {
        const v = ser.values[i] ?? 0;
        const w = (v / max) * this.trackW();
        const bar = { x, w: Math.max(v > 0 ? this.barT : 0, w), fill: this.fill(si, i), tip: `${label}${s.length > 1 ? ` · ${ser.name}` : ''}: ${v}${this.unit()}` };
        x += w;
        return bar;
      });
      const total = s.reduce((n, ser) => n + (ser.values[i] ?? 0), 0);
      return { key: keys[i], label: label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label, y: i * ROW, bars, total: Math.round(total * 10) / 10 };
    });
  });

  protected readonly ariaLabel = computed(() => {
    const labels = this.labelList();
    return this.seriesList().map((s) => `${s.name}: ${labels.map((l, i) => `${l} ${s.values[i] ?? 0}`).join(', ')}`).join('. ');
  });
}
