import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';

export interface CwOption {
  value: string;
  label: string;
  /** Small grey text on the right of the option (a code, a count). */
  hint?: string;
}

/**
 * Custom dropdown used on the campaign pages instead of a native <select>.
 * Search box from 8 options, keyboard (↑ ↓ Enter Esc), closes on an outside click.
 *   <cw-select [options]="opts" [value]="v()" (valueChange)="v.set($event)" placeholder="Select…" />
 */
@Component({
  selector: 'cw-select',
  templateUrl: './cw-select.html',
  styleUrl: './cw-select.css',
  host: { '[class.is-open]': 'open()', '[class.is-invalid]': 'invalid()', '[class.is-disabled]': 'disabled()' }
})
export class CwSelect {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly value = input<string>('');
  readonly options = input<CwOption[]>([]);
  readonly placeholder = input<string>('Select…');
  readonly disabled = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly inputId = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  protected readonly searchable = computed(() => this.options().length > 7);
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q)) : this.options();
  });

  protected toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.openMenu();
  }

  protected openMenu(): void {
    this.query.set('');
    this.active.set(Math.max(0, this.options().findIndex((o) => o.value === this.value())));
    this.open.set(true);
    if (this.searchable()) setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('.cs-search input')?.focus());
  }

  protected close(): void {
    this.open.set(false);
  }

  protected pick(o: CwOption): void {
    this.valueChange.emit(o.value);
    this.close();
    this.host.nativeElement.querySelector<HTMLButtonElement>('.cs-trigger')?.focus();
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const list = this.shown();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) return this.openMenu();
      const d = event.key === 'ArrowDown' ? 1 : -1;
      this.active.set((this.active() + d + list.length) % Math.max(1, list.length));
      setTimeout(() => this.host.nativeElement.querySelector('.cs-opt.is-active')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!this.open()) return this.openMenu();
      const o = list[this.active()];
      if (o) this.pick(o);
    } else if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
      this.close();
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
