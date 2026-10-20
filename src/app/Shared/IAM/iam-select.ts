import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { IamOption } from './iam-data';
import { IAM_ICONS } from './iam-icons';

/** Custom dropdown for the IAM screens (no native <select>).
 *  Single:   <iam-select [options]="opts" [value]="v()" (valueChange)="v.set($event)" />
 *  Multiple: <iam-select [multiple]="true" [options]="opts" [values]="list()" (valuesChange)="list.set($event)" />
 *  A search box appears automatically for lists longer than 7 (or with [searchable]="true"). */
@Component({
  selector: 'iam-select',
  templateUrl: './iam-select.html',
  styleUrl: './iam-select.css'
})
export class IamSelect {
  private readonly host = inject(ElementRef);

  readonly options = input<IamOption[]>([]);
  readonly value = input<string>('');
  readonly values = input<string[]>([]);
  readonly multiple = input<boolean>(false);
  readonly placeholder = input<string>('Select');
  /** icon shown inside the trigger, before the text */
  readonly icon = input<string>('');
  readonly searchable = input<boolean | null>(null);
  readonly searchPlaceholder = input<string>('Search');
  readonly disabled = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  /** 'md' (default) or 'lg' for the bigger picker in dialogs */
  readonly size = input<'md' | 'lg'>('md');
  /** how many chips to show before "+n" (multiple) */
  readonly maxChips = input<number>(3);
  readonly ariaLabel = input<string>('');

  readonly valueChange = output<string>();
  readonly valuesChange = output<string[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()));
  protected readonly picked = computed(() => this.options().filter((o) => this.values().includes(o.value)));
  protected readonly chips = computed(() => this.picked().slice(0, this.maxChips()));
  protected readonly more = computed(() => Math.max(0, this.picked().length - this.maxChips()));
  protected readonly hasSearch = computed(() => this.searchable() ?? this.options().length > 7);
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q)) : this.options();
  });

  icn(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  isOn(o: IamOption): boolean {
    return this.multiple() ? this.values().includes(o.value) : o.value === this.value();
  }

  toggle(): void {
    if (this.disabled()) return;
    this.query.set('');
    this.open.set(!this.open());
  }

  pick(o: IamOption): void {
    if (o.disabled) return;
    if (this.multiple()) {
      const has = this.values().includes(o.value);
      this.valuesChange.emit(has ? this.values().filter((v) => v !== o.value) : [...this.values(), o.value]);
      return;
    }
    this.valueChange.emit(o.value);
    this.open.set(false);
  }

  remove(value: string, e: Event): void {
    e.stopPropagation();
    this.valuesChange.emit(this.values().filter((v) => v !== value));
  }

  setQuery(v: string): void {
    this.query.set(v);
  }

  @HostListener('document:click', ['$event'])
  onDoc(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target)) this.open.set(false);
  }

  @HostListener('keydown.escape')
  onEsc(): void {
    this.open.set(false);
  }
}
