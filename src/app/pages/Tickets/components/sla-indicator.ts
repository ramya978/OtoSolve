import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Ticket } from '../models/ticket.model';
import { SLA_LIGHT, SlaClock } from '../models/sla.model';
import { SlaService } from '../services/sla.service';
import { describeClock, formatCountdown } from '../utils/sla';
import { dateTime } from '../utils/format';

/**
 * SLA status for a ticket.
 *
 * compact: dot + "2h 14m left", for lists and cards (updates every 30 s).
 * full: both clocks with progress bars and a live countdown (updates every second while shown).
 * Green = on track, amber = warning (75% of the target used), red = breached, grey = paused.
 */
@Component({
  selector: 'app-sla-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mode() === 'compact') {
      <span class="tk-sla" [attr.data-light]="snap().light" [attr.title]="title()">
        <span class="dot" aria-hidden="true"></span>{{ text(snap().headline) }}
      </span>
    } @else {
      <div class="tk-sla-clocks">
        @for (c of clocks(); track c.name) {
          <div class="tk-sla-clock">
            <div class="top">
              <span class="name">{{ c.name }}</span>
              <span class="tk-sla" [attr.data-light]="light(c.clock)"><span class="dot" aria-hidden="true"></span>{{ text(c.clock) }}</span>
            </div>
            <div class="tk-progress" [attr.data-tone]="tone(c.clock)" [style.--pct]="pct(c.clock)" role="progressbar"
                 [attr.aria-valuenow]="round(c.clock.ratio * 100)" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="c.name + ' time used'"><i></i></div>
            <div class="top">
              @if (running(c.clock)) {
                <span class="tk-countdown" [attr.aria-label]="c.clock.remainingMs >= 0 ? 'Time left' : 'Time over'">{{ c.clock.remainingMs < 0 ? '−' : '' }}{{ countdown(c.clock) }}</span>
              } @else {
                <span class="tk-faint tk-small">{{ c.clock.state === 'paused' ? 'Clock paused while waiting' : 'Clock stopped' }}</span>
              }
              <span class="due">Due {{ due(c.clock) }}</span>
            </div>
          </div>
        }
      </div>
    }`,
})
export class SlaIndicator {
  private readonly sla = inject(SlaService);
  readonly ticket = input.required<Ticket>();
  readonly mode = input<'compact' | 'full'>('compact');

  /** One-second clock, only while a full indicator is on screen. */
  private readonly secondTick = signal(Date.now());

  protected readonly snap = computed(() => {
    const now = this.mode() === 'full' ? this.secondTick() : this.sla.now();
    return this.sla.snapshot(this.ticket(), Math.max(now, this.sla.now()));
  });

  protected readonly clocks = computed(() => [
    { name: 'First response', clock: this.snap().firstResponse },
    { name: 'Resolution', clock: this.snap().resolution },
  ]);

  protected readonly title = computed(() => {
    const s = this.snap();
    return `First response: ${describeClock(s.firstResponse)} · Resolution: ${describeClock(s.resolution)}`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    let timer: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      if (this.mode() === 'full' && !timer) timer = setInterval(() => this.secondTick.set(Date.now()), 1000);
    });
    destroyRef.onDestroy(() => { if (timer) clearInterval(timer); });
  }

  protected text(c: SlaClock): string { return describeClock(c); }
  protected light(c: SlaClock): string { return SLA_LIGHT[c.state]; }
  protected tone(c: SlaClock): string {
    return { green: 'success', amber: 'warning', red: 'danger', grey: 'neutral' }[SLA_LIGHT[c.state]];
  }
  protected pct(c: SlaClock): string { return `${Math.min(100, Math.max(2, c.ratio * 100))}%`; }
  protected running(c: SlaClock): boolean { return c.state === 'on-track' || c.state === 'warning' || c.state === 'breached'; }
  protected countdown(c: SlaClock): string { return formatCountdown(c.remainingMs); }
  protected due(c: SlaClock): string { return dateTime(c.dueAt); }
  protected round(n: number): number { return Math.round(n); }
}
