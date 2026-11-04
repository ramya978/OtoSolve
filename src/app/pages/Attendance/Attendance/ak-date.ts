import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';

/* Custom date picker used by the attendance pages (no native date input).
   <ak-date [value]="date" [min]="min" [max]="max" (valueChange)="date = $event" />
   Shows ‹ date › with a month calendar on click; weekends are tinted, today is outlined. */
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s: string) => new Date(s + 'T12:00:00');

@Component({
  selector: 'ak-date',
  standalone: true,
  template: `<div class="akd-step" role="group" aria-label="Choose date">
  @if (stepper) {<button type="button" class="akd-arrow" aria-label="Previous day" [disabled]="!can(-1)" (click)="step(-1)"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>}
  <button type="button" class="akd-pick" [class.is-open]="open()" aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="toggle()">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></svg>
    <span>{{ label() }}</span>
  </button>
  @if (stepper) {<button type="button" class="akd-arrow" aria-label="Next day" [disabled]="!can(1)" (click)="step(1)"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>}
</div>
@if (open()) {
<div class="akd-pop" [class.is-right]="align === 'right'" role="dialog" aria-label="Calendar">
  <div class="akd-head">
    <button type="button" aria-label="Previous month" (click)="month(-1)"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
    <strong>{{ title() }}</strong>
    <button type="button" aria-label="Next month" (click)="month(1)"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
  </div>
  <div class="akd-grid">
    @for (w of week; track $index) {<span class="akd-wd" [class.is-off]="$index > 4">{{ w }}</span>}
    @for (d of days(); track d.iso) {
    <button type="button" class="akd-day" [class.is-out]="d.out" [class.is-off]="d.off" [class.is-sel]="d.iso === value" [class.is-today]="d.today"
      [disabled]="!d.ok" [attr.aria-label]="d.iso" (click)="pick(d.iso)">{{ d.day }}</button>
    }
  </div>
  <div class="akd-foot"><button type="button" [disabled]="!okDate(todayIso)" (click)="pick(todayIso)">Today</button></div>
</div>
}`,
  styles: [`
:host { position: relative; display: inline-block; font-size: 13px; }
svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.akd-step { display: flex; align-items: stretch; height: 36px; border: 1px solid var(--line, #dde1e8); border-radius: 9px; background: var(--panel, #fff); overflow: hidden; }
.akd-arrow { width: 34px; border: 0; background: none; color: var(--muted, #667085); cursor: pointer; display: grid; place-items: center; }
.akd-arrow:hover:not(:disabled) { background: #eceff3; color: var(--ink, #11151c); }
.akd-arrow:disabled { opacity: .35; cursor: not-allowed; }
.akd-pick { display: flex; align-items: center; gap: 7px; padding: 0 12px; border: 0; border-inline: 1px solid var(--line, #dde1e8); background: none;
  color: var(--ink, #11151c); font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer; }
.akd-step > .akd-pick:only-child { border-inline: 0; }
.akd-pick svg { color: var(--primary, #2645d8); }
.akd-pick.is-open, .akd-pick:hover { background: color-mix(in srgb, var(--primary, #2645d8) 7%, #fff); }
.akd-pop { position: absolute; z-index: 40; top: calc(100% + 4px); left: 0; width: 272px; padding: 10px; border: 1px solid var(--line, #dde1e8);
  border-radius: 12px; background: var(--panel, #fff); box-shadow: 0 12px 32px rgb(23 43 70 / 14%); }
.akd-pop.is-right { left: auto; right: 0; }
.akd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.akd-head strong { font-size: 13px; }
.akd-head button { width: 30px; height: 30px; border: 0; border-radius: 7px; background: none; color: var(--muted, #667085); cursor: pointer; display: grid; place-items: center; }
.akd-head button:hover { background: #eceff3; }
.akd-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.akd-wd { padding: 4px 0; color: var(--muted, #667085); font-size: 11px; font-weight: 600; text-align: center; }
.akd-wd.is-off { color: #a3afbf; }
.akd-day { height: 32px; border: 0; border-radius: 7px; background: none; color: var(--ink, #11151c); font: inherit; font-size: 12.5px; cursor: pointer; }
.akd-day:hover:not(:disabled) { background: #f1f5fc; }
.akd-day.is-off { color: #8a97a8; background: #fafbfd; }
.akd-day.is-out { color: #c2cad6; }
.akd-day.is-today { box-shadow: inset 0 0 0 1px var(--primary, #2645d8); }
.akd-day.is-sel { background: var(--primary, #2645d8); color: #fff; font-weight: 600; }
.akd-day:disabled { color: #d3d9e2; cursor: not-allowed; background: none; }
.akd-foot { display: flex; justify-content: flex-end; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line, #dde1e8); }
.akd-foot button { padding: 5px 10px; border: 1px solid var(--line, #dde1e8); border-radius: 7px; background: none; color: var(--primary, #2645d8); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.akd-foot button:disabled { opacity: .4; cursor: not-allowed; }
`],
})
export class AkDate {
  @Input() value = iso(new Date());
  @Input() min = '';
  @Input() max = '';
  @Input() stepper = true;
  @Input() align: 'left' | 'right' = 'left';
  @Output() valueChange = new EventEmitter<string>();

  readonly week = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  readonly todayIso = iso(new Date());
  readonly open = signal(false);
  readonly view = signal(this.todayIso.slice(0, 7));
  private readonly host = inject(ElementRef);

  okDate(d: string) { return (!this.min || d >= this.min) && (!this.max || d <= this.max); }
  label() { return parse(this.value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  title() { return parse(this.view() + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  days() {
    const first = parse(this.view() + '-01'); first.setDate(1 - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first); d.setDate(first.getDate() + i); const s = iso(d);
      return { iso: s, day: d.getDate(), out: s.slice(0, 7) !== this.view(), off: d.getDay() === 0 || d.getDay() === 6, today: s === this.todayIso, ok: this.okDate(s) };
    });
  }
  private shifted(n: number) { const d = parse(this.value); d.setDate(d.getDate() + n); return iso(d); }
  can(n: number) { return this.okDate(this.shifted(n)); }
  step(n: number) { if (this.can(n)) this.valueChange.emit(this.shifted(n)); }
  toggle() { if (!this.open()) this.view.set(this.value.slice(0, 7)); this.open.update(v => !v); }
  month(n: number) { const d = parse(this.view() + '-01'); d.setMonth(d.getMonth() + n); this.view.set(iso(d).slice(0, 7)); }
  pick(d: string) { if (!this.okDate(d)) return; this.open.set(false); if (d !== this.value) this.valueChange.emit(d); }

  @HostListener('document:click', ['$event'])
  onDoc(e: MouseEvent) { if (this.open() && !(this.host.nativeElement as HTMLElement).contains(e.target as Node)) this.open.set(false); }
  @HostListener('document:keydown.escape')
  onEsc() { this.open.set(false); }
}
