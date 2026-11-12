import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Agent, TICKET_PRIORITIES, Ticket, TicketPriority } from '../models/ticket.model';
import { PriorityBadge } from './priority-badge';
import { SlaIndicator } from './sla-indicator';
import { AssigneePicker } from './assignee-picker';
import { TkIcon } from './icon';
import { relativeTime } from '../utils/format';

/** A ticket as a card: Kanban board and narrow lists. Priority and assignee can be changed in place. */
@Component({
  selector: 'app-ticket-card',
  standalone: true,
  imports: [PriorityBadge, SlaIndicator, AssigneePicker, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tk-tcard', '[class.is-busy]': 'busy()', tabindex: '0', role: 'article', '[attr.aria-label]': 'ticket().number + ": " + ticket().subject', '(keydown.enter)': 'open.emit()' },
  template: `
    <div class="tk-tcard-top">
      <span class="num">{{ ticket().number }}</span>
      @if (ticket().reopenCount) { <span class="tk-badge is-sm" data-tone="warning" title="Reopened">↺ {{ ticket().reopenCount }}</span> }
      <span class="tk-spacer"></span>
      @if (canEdit()) {
        <label class="tk-sr-only" [for]="'p-' + ticket().id">Priority</label>
        <select [id]="'p-' + ticket().id" class="tk-select is-sm" style="width:auto;min-height:26px;padding:0 26px 0 8px;font-size:12px"
                [value]="ticket().priority" (change)="priority.emit($any($event.target).value)" (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
        </select>
      } @else {
        <app-priority-badge [priority]="ticket().priority" />
      }
    </div>
    <button type="button" class="tk-tcard-title" style="all:unset;cursor:pointer" (click)="open.emit()">{{ ticket().subject }}</button>
    <div class="tk-tcard-meta">
      <span class="tk-truncate">{{ customerName() }}</span>
      <span class="tk-faint">·</span>
      <span class="tk-faint">{{ ago(ticket().updatedAt) }}</span>
      @if (ticket().commentCount > 1) { <span class="tk-faint tk-row" style="gap:3px"><tk-icon name="message" />{{ ticket().commentCount }}</span> }
    </div>
    <div class="tk-tcard-foot">
      <app-sla-indicator [ticket]="ticket()" />
      <span class="tk-spacer"></span>
      <app-assignee-picker [agents]="agents()" [value]="ticket().assigneeId" [meId]="meId()" [loads]="loads()" [compact]="true"
                           [canAssignOthers]="canAssignOthers()" [disabled]="!canEdit()" buttonClass="tk-btn is-ghost is-sm is-icon"
                           (pick)="assign.emit($event)" (mousedown)="$event.stopPropagation()" />
    </div>`,
})
export class TicketCard {
  readonly ticket = input.required<Ticket>();
  readonly customerName = input('');
  readonly agents = input<readonly Agent[]>([]);
  readonly meId = input<string | null>(null);
  readonly loads = input<ReadonlyMap<string, number>>(new Map());
  readonly canEdit = input(false);
  readonly canAssignOthers = input(false);
  readonly busy = input(false);
  readonly open = output<void>();
  readonly assign = output<string | null>();
  readonly priority = output<TicketPriority>();
  protected readonly priorities = TICKET_PRIORITIES;
  protected ago(iso: string): string { return relativeTime(iso); }
}
