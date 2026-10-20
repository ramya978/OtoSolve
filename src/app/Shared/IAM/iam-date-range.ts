import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { IAM_ICONS } from './iam-icons';

export interface IamRange { start: string; end: string; }

interface DayCell { iso: string; day: number; inMonth: boolean; }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isoOf = (y: number, m: number, d: number): string =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Custom date-range picker (no native date input).
 *  <iam-date-range [start]="from()" [end]="to()" (rangeChange)="setRange($event)" />
 *  First click picks the start date, second click the end date. */
@Component({
  selector: 'iam-date-range',
  templateUrl: './iam-date-range.html',
  styleUrl: './iam-date-range.css'
})
export class IamDateRange {
  private readonly host = inject(ElementRef);

  readonly start = input<string>('');
  readonly end = input<string>('');
  /** month the calendar opens on when nothing is picked (ISO date) */
  readonly today = input<string>('');
  readonly rangeChange = output<IamRange>();

  protected readonly open = signal(false);
  protected readonly view = signal<{ y: number; m: number }>({ y: 2026, m: 9 });
  /** start picked, waiting for the end */
  protected readonly draftStart = signal('');
  protected readonly weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  protected readonly title = computed(() => `${MONTHS[this.view().m]} ${this.view().y}`);

  protected readonly cells = computed<DayCell[]>(() => {
    const { y, m } = this.view();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const out: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(y, m, 1 - lead + i);
      out.push({ iso: isoOf(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === m });
    }
    return out;
  });

  icn(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  label(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${SHORT[m - 1]} ${y}`;
  }

  toggle(): void {
    if (!this.open()) {
      const base = this.start() || this.today() || isoOf(new Date().getFullYear(), new Date().getMonth(), 1);
      const [y, m] = base.split('-').map(Number);
      this.view.set({ y, m: m - 1 });
      this.draftStart.set('');
    }
    this.open.set(!this.open());
  }

  shift(step: number): void {
    const { y, m } = this.view();
    const d = new Date(y, m + step, 1);
    this.view.set({ y: d.getFullYear(), m: d.getMonth() });
  }

  pick(c: DayCell): void {
    const s = this.draftStart();
    if (!s) {
      this.draftStart.set(c.iso);
      return;
    }
    const [a, b] = c.iso < s ? [c.iso, s] : [s, c.iso];
    this.rangeChange.emit({ start: a, end: b });
    this.draftStart.set('');
    this.open.set(false);
  }

  clear(e?: Event): void {
    e?.stopPropagation();
    this.draftStart.set('');
    this.rangeChange.emit({ start: '', end: '' });
  }

  isStart(c: DayCell): boolean {
    return c.iso === (this.draftStart() || this.start());
  }

  isEnd(c: DayCell): boolean {
    return !this.draftStart() && c.iso === this.end();
  }

  inRange(c: DayCell): boolean {
    return !this.draftStart() && !!this.start() && !!this.end() && c.iso > this.start() && c.iso < this.end();
  }

  isToday(c: DayCell): boolean {
    return c.iso === this.today();
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
