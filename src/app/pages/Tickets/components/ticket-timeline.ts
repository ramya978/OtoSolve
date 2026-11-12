import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tone } from '../models/ticket.model';
import { dateTime, relativeTime } from '../utils/format';
import { EmptyState } from './feedback';

export interface TimelineItem {
  readonly id: string;
  readonly at: string;
  readonly title: string;
  readonly text?: string;
  readonly actor?: string;
  readonly tone: Tone;
  /** Opens a ticket when set. */
  readonly ticketId?: string;
}

/** A vertical, newest-first timeline: ticket activity, or a customer's history across tickets. */
@Component({
  selector: 'app-ticket-timeline',
  standalone: true,
  imports: [RouterLink, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <ol class="tk-timeline" style="list-style:none;margin:0">
        @for (i of items(); track i.id) {
          <li class="tk-tl-item" [attr.data-tone]="i.tone">
            <span class="tk-tl-dot" aria-hidden="true"></span>
            <div class="tk-tl-body">
              <div class="tk-tl-title">
                @if (i.ticketId) { <a [routerLink]="['/app/tickets', i.ticketId]">{{ i.title }}</a> } @else { {{ i.title }} }
              </div>
              @if (i.text) { <div class="tk-tl-text">{{ i.text }}</div> }
              <div class="tk-tl-meta"><time [attr.datetime]="i.at" [title]="full(i.at)">{{ ago(i.at) }}</time>@if (i.actor) { · {{ i.actor }} }</div>
            </div>
          </li>
        }
      </ol>
    } @else {
      <app-empty-state icon="clock" tone="neutral" [compact]="true" [heading]="emptyText()" />
    }`,
})
export class TicketTimeline {
  readonly items = input.required<readonly TimelineItem[]>();
  readonly emptyText = input('No activity yet');
  protected ago(iso: string): string { return relativeTime(iso); }
  protected full(iso: string): string { return dateTime(iso); }
}
