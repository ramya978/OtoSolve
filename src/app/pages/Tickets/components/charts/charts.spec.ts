import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LineChart } from './line-chart';
import { DonutChart } from './donut-chart';
import { BarChart } from './bar-chart';
import { TrendSeries } from '../../models/analytics.model';

const trend: TrendSeries = {
  labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
  series: [
    { name: 'Created', tone: 'primary', values: [12, 18, 9, 22, 15, 19] },
    { name: 'Resolved', tone: 'success', values: [10, 16, 11, 20, 14, 12] },
  ],
};

@Component({
  standalone: true,
  imports: [LineChart, DonutChart, BarChart],
  template: `
    <app-line-chart [data]="trend" [maxHeight]="280" [minHeight]="190" />
    <app-donut-chart [data]="status" [size]="148" />
    <app-bar-chart [items]="status" [horizontal]="true" />`,
})
class Host {
  trend = trend;
  status = [
    { key: 'Open', label: 'Open', value: 6, tone: 'info' as const },
    { key: 'Resolved', label: 'Resolved', value: 9, tone: 'success' as const },
    { key: 'Closed', label: 'Closed', value: 4, tone: 'neutral' as const },
  ];
}

async function render(width: number) {
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  spy.mockRestore();
  return fixture.nativeElement as HTMLElement;
}

describe('Tickets dashboard charts (sizing)', () => {
  it('caps the trend chart at its maximum height on a wide card', async () => {
    const el = await render(1400);
    const svg = el.querySelector('app-line-chart svg')!;
    expect(Number(svg.getAttribute('height'))).toBe(280);
    expect(Number(svg.getAttribute('width'))).toBe(1400);
  });

  it('shrinks the trend chart on a narrow card, but not below its minimum', async () => {
    const el = await render(360);
    expect(Number(el.querySelector('app-line-chart svg')!.getAttribute('height'))).toBe(190);
  });

  it('thins the axis labels so they never crowd', async () => {
    const el = await render(260);
    const labels = el.querySelectorAll('app-line-chart text.axis[text-anchor]');
    // six months on a narrow card: not every month is labelled, the last one always is
    const months = [...labels].map((l) => l.textContent?.trim()).filter((t) => /^[A-Z][a-z]{2}$/.test(t ?? ''));
    expect(months.length).toBeLessThan(6);
    expect(months).toContain('Nov');
  });

  it('draws the donut ring at its fixed size, with a compact legend', async () => {
    const el = await render(900);
    const host = el.querySelector('app-donut-chart') as HTMLElement;
    expect(host.style.getPropertyValue('--donut-size')).toBe('148px');
    expect(el.querySelectorAll('app-donut-chart .tk-legend .item').length).toBe(3);
  });

  it('keeps horizontal bars to one 26px row per item', async () => {
    const el = await render(400);
    expect(Number(el.querySelector('app-bar-chart svg')!.getAttribute('height'))).toBe(3 * 26);
  });
});
