import {
  Component, ElementRef, HostListener, OnDestroy, ViewChild, ViewEncapsulation, computed, input, output, signal
} from '@angular/core';

/* =====================================================================================================
   CW DATE PICKER - custom date field (replaces <input type="date">, whose browser calendar can't be
   themed). Usage:
     <cw-date-picker inputId="af-from" [value]="iso" [min]="iso" [max]="iso" [invalid]="bool"
                     align="end" placeholder="Choose a date" (valueChange)="set($event)" />
   - value / min / max are ISO dates (yyyy-mm-dd); '' = none.
   - The calendar is moved to <body> while open and placed under (or above) the field with fixed
     positioning, so no card with overflow: hidden, container query or layout parent can clip it.
   - align="end" lines the calendar up with the field's right edge (for right-hand columns).
   - Styles are global (prefixed cw-dp-) because the calendar lives outside the component while open.
   ===================================================================================================== */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number): string => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number): string => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const localToday = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

interface DpDay {
  iso: string;
  day: number;
  inMonth: boolean;
  disabled: boolean;
  weekend: boolean;
}

@Component({
  selector: 'cw-date-picker',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="cw-dp" [class.is-open]="open()" [class.is-invalid]="invalid()">
      <button #trigger type="button" class="cw-dp-btn" [attr.id]="inputId() || null" [disabled]="disabled()"
              aria-haspopup="dialog" [attr.aria-expanded]="open()" [attr.aria-invalid]="invalid() || null"
              (click)="toggle()">
        <span class="cw-dp-val" [class.is-ph]="!value()">{{ label() }}</span>
        <svg class="cw-dp-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18" />
        </svg>
      </button>

      @if (open()) {
        <div #pop class="cw-dp-pop" role="dialog" aria-label="Choose a date">
          <div class="cw-dp-head">
            <button type="button" class="cw-dp-nav" aria-label="Previous month" [disabled]="!canPrev()" (click)="shift(-1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <strong class="cw-dp-month" aria-live="polite">{{ monthLabel() }}</strong>
            <button type="button" class="cw-dp-nav" aria-label="Next month" [disabled]="!canNext()" (click)="shift(1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>

          <div class="cw-dp-grid" role="grid" [attr.aria-label]="monthLabel()">
            @for (w of weekdays; track w) { <span class="cw-dp-wd" role="columnheader">{{ w }}</span> }
            @for (d of days(); track d.iso) {
              <button type="button" role="gridcell" class="cw-dp-day"
                      [class.is-out]="!d.inMonth" [class.is-weekend]="d.weekend"
                      [class.is-today]="d.iso === today" [class.is-on]="d.iso === value()"
                      [disabled]="d.disabled" [attr.aria-selected]="d.iso === value()"
                      [attr.aria-label]="fmt(d.iso)" (click)="pick(d.iso)">{{ d.day }}</button>
            }
          </div>

          <div class="cw-dp-foot">
            <button type="button" class="cw-dp-link" [disabled]="!value()" (click)="clear()">Clear</button>
            <button type="button" class="cw-dp-link is-primary" [disabled]="!todayAllowed()" (click)="pick(today)">Today</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    cw-date-picker { display: block; min-width: 0; }

    .cw-dp { position: relative; min-width: 0; }

    /* ---------- field ---------- */
    .cw-dp-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: var(--cw-dp-h, 38px);
      padding: 0 10px 0 12px;
      border: 1px solid var(--w-field, var(--line, #d9d6de));
      border-radius: var(--btn-radius, 8px);
      background: var(--w-card, var(--panel, #fff));
      color: var(--w-ink, var(--ink, #2a2730));
      font: inherit;
      font-size: var(--cw-dp-fs, 13px);
      text-align: left;
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
    }

    .cw-dp-btn:hover:not(:disabled) { border-color: var(--w-primary, var(--primary, #7a2e46)); }

    .cw-dp-btn:focus-visible,
    .cw-dp.is-open .cw-dp-btn {
      outline: none;
      border-color: var(--w-primary-ink, var(--w-primary, var(--primary, #7a2e46)));
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--w-primary, var(--primary, #7a2e46)) 16%, transparent);
    }

    .cw-dp.is-invalid .cw-dp-btn { border-color: var(--status-danger, #b34455); }
    .cw-dp-btn:disabled { background: var(--w-soft, #f6f5f8); cursor: not-allowed; opacity: .7; }

    .cw-dp-val {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cw-dp-val.is-ph { color: var(--w-muted, var(--muted, #8a8592)); }

    .cw-dp-ico {
      flex: none;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: var(--w-muted, var(--muted, #8a8592));
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .cw-dp.is-open .cw-dp-ico { stroke: var(--w-primary-ink, var(--w-primary, var(--primary, #7a2e46))); }

    /* ---------- calendar (lives in <body> while open) ---------- */
    .cw-dp-pop {
      position: fixed;
      z-index: 1100;
      box-sizing: border-box;
      width: min(296px, calc(100vw - 16px));
      padding: 12px;
      border: 1px solid var(--w-line, var(--line, #e4e1e8));
      border-radius: 12px;
      background: var(--w-card, var(--panel, #fff));
      color: var(--w-ink, var(--ink, #2a2730));
      font-family: var(--font-body, Inter, "Segoe UI", Arial, sans-serif);
      font-size: 13px;
      box-shadow: 0 14px 34px #10131c26;
      animation: cw-dp-in .14s ease-out;
    }

    @keyframes cw-dp-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    .cw-dp-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .cw-dp-month {
      color: var(--w-heading, var(--heading-color, #1f1d24));
      font-size: 14px;
      font-weight: 600;
    }

    .cw-dp-nav {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--w-line, var(--line, #e4e1e8));
      border-radius: 8px;
      background: var(--w-card, var(--panel, #fff));
      color: var(--w-ink, var(--ink, #2a2730));
      cursor: pointer;
      transition: border-color .15s, color .15s;
    }

    .cw-dp-nav svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .cw-dp-nav:hover:not(:disabled) {
      border-color: var(--w-primary, var(--primary, #7a2e46));
      color: var(--w-primary-ink, var(--w-primary, var(--primary, #7a2e46)));
    }

    .cw-dp-nav:disabled { opacity: .35; cursor: default; }

    .cw-dp-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 2px;
    }

    .cw-dp-wd {
      padding: 4px 0 6px;
      color: var(--w-muted, var(--muted, #8a8592));
      font-size: 11px;
      font-weight: 500;
      text-align: center;
    }

    .cw-dp-day {
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--w-ink, var(--ink, #2a2730));
      font: inherit;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: background-color .12s, color .12s;
    }

    .cw-dp-day.is-weekend { color: color-mix(in srgb, var(--w-ink, #2a2730) 70%, var(--w-card, #fff)); }
    .cw-dp-day.is-out { color: color-mix(in srgb, var(--w-muted, #8a8592) 55%, var(--w-card, #fff)); }

    .cw-dp-day:hover:not(:disabled):not(.is-on) {
      background: color-mix(in srgb, var(--w-primary, var(--primary, #7a2e46)) 9%, var(--w-card, #fff));
      color: var(--w-primary-ink, var(--w-primary, var(--primary, #7a2e46)));
    }

    .cw-dp-day:focus-visible {
      outline: 2px solid var(--w-primary, var(--primary, #7a2e46));
      outline-offset: -2px;
    }

    .cw-dp-day.is-today:not(.is-on) {
      box-shadow: inset 0 0 0 1.5px var(--w-primary, var(--primary, #7a2e46));
      color: var(--w-primary-ink, var(--w-primary, var(--primary, #7a2e46)));
      font-weight: 600;
    }

    .cw-dp-day.is-on {
      background: var(--w-primary, var(--primary, #7a2e46));
      color: var(--w-primary-on, var(--primary-on, #fff));
      font-weight: 600;
    }

    .cw-dp-day:disabled {
      color: color-mix(in srgb, var(--w-muted, #8a8592) 40%, var(--w-card, #fff));
      text-decoration: line-through;
      cursor: not-allowed;
    }

    .cw-dp-foot {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--w-row, var(--line, #eeecf1));
    }

    .cw-dp-link {
      padding: 6px 8px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--w-muted, var(--muted, #8a8592));
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }

    .cw-dp-link.is-primary { color: var(--w-primary-ink, var(--w-primary, var(--primary, #7a2e46))); font-weight: 600; }
    .cw-dp-link:hover:not(:disabled) { background: var(--w-soft, #f6f5f8); }
    .cw-dp-link:disabled { opacity: .4; cursor: default; }

    @media (prefers-reduced-motion: reduce) { .cw-dp-pop { animation: none; } }
    html[data-motion="reduce"] .cw-dp-pop { animation: none; }
  `]
})
export class CwDatePicker implements OnDestroy {
  readonly value = input<string>('');
  readonly min = input<string>('');
  readonly max = input<string>('');
  readonly inputId = input<string>('');
  readonly placeholder = input<string>('Select a date');
  readonly invalid = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly align = input<'start' | 'end'>('start');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  /** month shown in the calendar, yyyy-mm */
  protected readonly view = signal(localToday().slice(0, 7));
  protected readonly today = localToday();
  protected readonly weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;
  private popNode: HTMLElement | null = null;

  /** the calendar is moved to <body> as soon as it renders, then placed next to the field */
  @ViewChild('pop') private set popRef(ref: ElementRef<HTMLElement> | undefined) {
    this.popNode = ref?.nativeElement ?? null;
    if (this.popNode) {
      document.body.appendChild(this.popNode);
      this.place();
    }
  }

  private readonly onMove = (): void => this.place();

  protected readonly label = computed(() => (this.value() ? this.fmt(this.value()) : this.placeholder()));

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.view().split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  });

  protected readonly days = computed<DpDay[]>(() => {
    const [y, m] = this.view().split('-').map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
    const out: DpDay[] = [];
    for (let i = 0; i < 42; i++) {
      const iso = isoOf(y, m - 1, 1 - lead + i);
      out.push({
        iso,
        day: Number(iso.slice(8)),
        inMonth: iso.slice(0, 7) === this.view(),
        disabled: (!!this.min() && iso < this.min()) || (!!this.max() && iso > this.max()),
        weekend: i % 7 >= 5
      });
    }
    // drop a trailing week that is entirely next month
    return out.slice(35).every((d) => !d.inMonth) ? out.slice(0, 35) : out;
  });

  protected readonly canPrev = computed(() => !this.min() || this.view() > this.min().slice(0, 7));
  protected readonly canNext = computed(() => !this.max() || this.view() < this.max().slice(0, 7));
  protected readonly todayAllowed = computed(
    () => (!this.min() || this.today >= this.min()) && (!this.max() || this.today <= this.max())
  );

  protected fmt(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return `${pad(d)} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  private show(): void {
    if (this.disabled()) return;
    // open on the chosen date, else today (kept inside min / max)
    let start = this.value() || this.today;
    if (this.min() && start < this.min()) start = this.min();
    if (this.max() && start > this.max()) start = this.max();
    this.view.set(start.slice(0, 7));
    this.open.set(true);
    window.addEventListener('resize', this.onMove);
    window.addEventListener('scroll', this.onMove, true);
  }

  private close(focusField = false): void {
    if (!this.open()) return;
    this.open.set(false);
    window.removeEventListener('resize', this.onMove);
    window.removeEventListener('scroll', this.onMove, true);
    this.popNode?.remove();
    this.popNode = null;
    if (focusField) this.trigger.nativeElement.focus();
  }

  protected shift(step: number): void {
    const [y, m] = this.view().split('-').map(Number);
    this.view.set(isoOf(y, m - 1 + step, 1).slice(0, 7));
    // 5 or 6 week rows change the height: re-place once the new month has rendered
    setTimeout(() => this.place());
  }

  protected pick(iso: string): void {
    this.valueChange.emit(iso);
    this.close(true);
  }

  protected clear(): void {
    this.valueChange.emit('');
    this.close(true);
  }

  /** under the field (or above it when there is no room), lined up with its start or end edge,
   *  always kept 8px inside the screen */
  private place(): void {
    const pop = this.popNode;
    if (!pop) return;
    const r = this.trigger.nativeElement.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = this.align() === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom + 6;
    if (top + h > vh - 8 && r.top - h - 6 >= 8) top = r.top - h - 6;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (!this.open()) return;
    const t = e.target as Node;
    if (this.trigger.nativeElement.contains(t) || this.popNode?.contains(t)) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close(true);
  }

  ngOnDestroy(): void {
    this.close();
  }
}