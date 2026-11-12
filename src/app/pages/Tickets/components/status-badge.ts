import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_META, TicketStatus } from '../models/ticket.model';

/** A ticket status as a coloured pill with a dot, so the state never depends on colour alone. */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tk-badge" [class.is-sm]="size() === 'sm'" [attr.data-tone]="meta().tone" [attr.title]="meta().hint"><span class="dot"></span>{{ status() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<TicketStatus>();
  readonly size = input<'sm' | 'md'>('md');
  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
