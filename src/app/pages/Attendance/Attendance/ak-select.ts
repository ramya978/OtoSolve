import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';

/* Custom dropdown used by the attendance pages (no native <select>).
   <ak-select [options]="list" [value]="v" (valueChange)="v = $event" placeholder="All departments" [searchable]="true" /> */
export interface AkOption { value: string; label: string; hint?: string; }

@Component({
  selector: 'ak-select',
  standalone: true,
  template: `<button type="button" class="aks-btn" [class.is-open]="open()" [class.is-sm]="size === 'sm'" [disabled]="disabled"
  aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-label]="ariaLabel || null" (click)="toggle()">
  @if (icon) {<svg class="aks-ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="iconPath()" /></svg>}
  <span class="aks-val" [class.is-ph]="!current()">{{ current()?.label || placeholder }}</span>
  <svg class="aks-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
</button>
@if (open()) {
<div class="aks-panel" [class.is-right]="align === 'right'" role="listbox" [attr.aria-label]="ariaLabel || placeholder">
  @if (searchable) {<input class="aks-search" type="search" placeholder="Search" [value]="q()" (input)="q.set($any($event.target).value)" (click)="$event.stopPropagation()" />}
  <div class="aks-list">
    @for (o of shown(); track o.value) {
    <button type="button" role="option" class="aks-opt" [class.is-on]="o.value === value" [attr.aria-selected]="o.value === value" (click)="pick(o.value)">
      <span>{{ o.label }}</span>@if (o.hint) {<small>{{ o.hint }}</small>}
    </button>
    } @empty {<p class="aks-empty">No matches</p>}
  </div>
</div>
}`,
  styles: [`
:host { position: relative; display: inline-block; min-width: 0; font-size: 13px; }
:host(.is-block) { display: block; }
.aks-btn { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 7px 10px; border: 1px solid var(--line, #dde1e8);
  border-radius: 8px; background: var(--panel, #fff); color: var(--ink, #11151c); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s; }
.aks-btn.is-sm { min-height: 34px; padding: 5px 9px; font-size: 12.5px; }
.aks-btn:hover:not(:disabled), .aks-btn.is-open { border-color: var(--primary, #2645d8); }
.aks-btn:disabled { background: #f6f8fb; color: var(--muted, #667085); cursor: not-allowed; }
.aks-btn svg { flex: none; width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.aks-ico { color: var(--primary, #2645d8); }
.aks-chev { color: var(--muted, #667085); transition: transform .15s; }
.aks-btn.is-open .aks-chev { transform: rotate(180deg); }
.aks-val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aks-val.is-ph { color: var(--muted, #667085); }
.aks-panel { position: absolute; z-index: 40; top: calc(100% + 4px); left: 0; min-width: 100%; width: max-content; max-width: min(340px, 88vw); padding: 4px;
  border: 1px solid var(--line, #dde1e8); border-radius: 10px; background: var(--panel, #fff); box-shadow: 0 10px 30px rgb(23 43 70 / 12%); }
.aks-panel.is-right { left: auto; right: 0; }
.aks-search { width: 100%; margin-bottom: 4px; padding: 7px 9px; border: 1px solid var(--line, #dde1e8); border-radius: 7px; font: inherit; font-size: 12.5px; }
.aks-list { max-height: 260px; overflow-y: auto; }
.aks-opt { display: grid; gap: 2px; width: 100%; padding: 8px 10px; border: 0; border-radius: 7px; background: none; color: var(--ink, #11151c);
  font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.aks-opt:hover { background: #eceff3; }
.aks-opt.is-on { background: color-mix(in srgb, var(--primary, #2645d8) 9%, #fff); color: var(--primary, #2645d8); font-weight: 600; }
.aks-opt small { color: var(--muted, #667085); font-size: 11px; font-weight: 400; }
.aks-empty { margin: 8px 10px; color: var(--muted, #667085); font-size: 12px; }
`],
})
export class AkSelect {
  @Input() options: (string | AkOption)[] = [];
  @Input() value = '';
  @Input() placeholder = 'Select';
  @Input() disabled = false;
  @Input() searchable = false;
  @Input() size: 'sm' | 'md' = 'md';
  @Input() align: 'left' | 'right' = 'left';
  @Input() icon: '' | 'pin' | 'building' | 'user' | 'clock' = '';
  @Input() ariaLabel = '';
  @Output() valueChange = new EventEmitter<string>();

  readonly open = signal(false);
  readonly q = signal('');
  private readonly host = inject(ElementRef);

  opts(): AkOption[] { return (this.options ?? []).map(o => typeof o === 'string' ? { value: o, label: o } : o); }
  current() { return this.opts().find(o => o.value === this.value) ?? null; }
  shown() { const q = this.q().trim().toLowerCase(); return this.opts().filter(o => !q || (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q)); }
  iconPath() {
    return ({
      pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
      building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM10 6h4M10 10h4M10 14h4M10 18h4',
      user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    } as Record<string, string>)[this.icon] ?? '';
  }
  toggle() { if (this.disabled) return; this.q.set(''); this.open.update(v => !v); }
  pick(v: string) { this.open.set(false); if (v !== this.value) this.valueChange.emit(v); }

  @HostListener('document:click', ['$event'])
  onDoc(e: MouseEvent) { if (this.open() && !(this.host.nativeElement as HTMLElement).contains(e.target as Node)) this.open.set(false); }
  @HostListener('document:keydown.escape')
  onEsc() { this.open.set(false); }
}
