import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PRIORITY_META, TicketPriority } from '../models/ticket.model';

/** Priority as signal bars plus the word: four bars for Critical down to one for Low. */
@Component({
  selector: 'app-priority-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tk-prio" [attr.data-tone]="meta().tone">
      <span class="bars" aria-hidden="true">
        @for (n of bars; track n) { <i [class.on]="n <= meta().rank"></i> }
      </span>
      @if (!iconOnly()) { {{ priority() }} } @else { <span class="tk-sr-only">{{ priority() }} priority</span> }
    </span>`,
})
export class PriorityBadge {
  readonly priority = input.required<TicketPriority>();
  readonly iconOnly = input(false);
  protected readonly bars = [1, 2, 3, 4];
  protected readonly meta = computed(() => PRIORITY_META[this.priority()]);
}
