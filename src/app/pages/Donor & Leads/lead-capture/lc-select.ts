import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { LC_ICONS, LcOpt } from './lc-shared';

/** Custom dropdown used across lead capture (no native <select>). Search box appears for long lists. */
@Component({
  selector: 'lc-select',
  templateUrl: './lc-select.html',
  styleUrl: './lc-select.css',
})
export class LcSelect {
  private readonly host = inject(ElementRef);

  readonly options = input<LcOpt[]>([]);
  readonly value = input<string>('');
  readonly placeholder = input<string>('Select');
  readonly disabled = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly ariaLabel = input<string>('');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()));
  protected readonly searchable = computed(() => this.options().length > 7);
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q)) : this.options();
  });

  icon(n: string): string { return LC_ICONS[n] ?? ''; }

  toggle(): void {
    if (this.disabled()) return;
    this.query.set('');
    this.open.set(!this.open());
  }

  pick(o: LcOpt): void {
    this.valueChange.emit(o.value);
    this.open.set(false);
  }

  setQuery(v: string): void { this.query.set(v); }

  @HostListener('document:click', ['$event'])
  onDoc(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target)) this.open.set(false);
  }

  @HostListener('keydown.escape')
  onEsc(): void { this.open.set(false); }
}
