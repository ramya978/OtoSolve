import { DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { Tone } from '../../models/ticket.model';

/** Series colours in a fixed order, so a category keeps its colour across charts. */
export const SERIES_TONES: readonly Tone[] = ['primary', 'info', 'success', 'warning', 'violet', 'danger', 'neutral'];

/** Theme colour for a tone (tokens in styles/_tokens.scss, all mapped onto the app theme). */
export function toneColor(tone: Tone | undefined, index = 0): string {
  return `var(--${tone ?? SERIES_TONES[index % SERIES_TONES.length]}-color)`;
}

/** A round axis maximum and the step between gridlines. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: ticks, step: 1 };
  const raw = max / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const clean = step < 1 ? Math.max(step, 0.5) : Math.ceil(step);
  return { max: clean * ticks, step: clean };
}

export function formatTick(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

let seq = 0;
export function chartId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/**
 * The host element's width in CSS pixels, kept current with a ResizeObserver.
 *
 * Charts draw their SVG at this real width and a fixed height, instead of scaling a fixed viewBox
 * to 100% width. That is what keeps a chart compact in a wide card: its height stays where it was
 * set, and text and strokes stay at their true size at any width.
 * Must be called in an injection context (a field initialiser).
 */
export function observeWidth(fallback = 560) {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const width = signal(fallback);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const el = host.nativeElement;
    const set = (w: number) => { if (w > 0 && Math.abs(w - width()) >= 1) width.set(Math.round(w)); };
    set(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => set(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    destroyRef.onDestroy(() => ro.disconnect());
  });
  return width.asReadonly();
}

/** Show every n-th category label so labels keep at least `minGap` px between them. */
export function labelStep(count: number, plotWidth: number, minGap = 56): number {
  if (count <= 1) return 1;
  return Math.max(1, Math.ceil((count * minGap) / Math.max(1, plotWidth)));
}
