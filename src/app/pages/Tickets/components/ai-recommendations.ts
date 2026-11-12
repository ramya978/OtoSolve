import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { SENTIMENT_META, Ticket, TicketCategory, TicketPriority } from '../models/ticket.model';
import { AssigneeSuggestion, Recommendation, SentimentResult, SimilarTicket } from '../services/ai.service';
import { PriorityBadge } from './priority-badge';
import { StatusBadge } from './status-badge';
import { TkIcon } from './icon';

/**
 * AI recommendations with one-click apply: priority, category, sentiment, best assignee and
 * similar tickets. Applying is always the agent's decision.
 */
@Component({
  selector: 'app-ai-recommendations',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, PriorityBadge, StatusBadge, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-ai-rec">
      <span class="label">Priority</span>
      @if (priority().value !== ticket().priority && canEdit()) {
        <button type="button" class="tk-btn is-soft is-sm" (click)="applyPriority.emit(priority().value)">Apply</button>
      } @else { <span class="tk-faint tk-small">{{ priority().value === ticket().priority ? 'Matches' : '' }}</span> }
      <span class="value"><app-priority-badge [priority]="priority().value" /><ng-container *ngTemplateOutlet="conf; context: { $implicit: priority().confidence }" /></span>
      <span class="why">{{ priority().reasons.join(' · ') }}</span>
    </div>
    <div class="tk-ai-rec">
      <span class="label">Category</span>
      @if (category().value !== ticket().category && canEdit()) {
        <button type="button" class="tk-btn is-soft is-sm" (click)="applyCategory.emit(category().value)">Apply</button>
      } @else { <span class="tk-faint tk-small">{{ category().value === ticket().category ? 'Matches' : '' }}</span> }
      <span class="value"><span class="tk-tag">{{ category().value }}</span><ng-container *ngTemplateOutlet="conf; context: { $implicit: category().confidence }" /></span>
      <span class="why">{{ category().reasons.join(' · ') }}</span>
    </div>
    <div class="tk-ai-rec">
      <span class="label">Customer sentiment</span><span></span>
      <span class="value"><span class="tk-badge" [attr.data-tone]="sentimentTone()">{{ sentimentIcon() }} {{ sentiment().value }}</span><ng-container *ngTemplateOutlet="conf; context: { $implicit: sentiment().confidence }" /></span>
      <span class="why">{{ sentiment().reasons.join(' · ') }}</span>
    </div>

    @if (assignees().length) {
      <h4 style="margin-top:14px"><tk-icon name="users" />Best assignee</h4>
      @for (s of assignees(); track s.agent.id; let first = $first) {
        <div class="tk-ai-rec">
          <div class="tk-person"><span class="tk-avatar is-sm" data-tone="primary">{{ s.agent.initials }}</span><div class="who"><strong>{{ s.agent.name }}@if (first) { <span class="tk-badge is-sm is-ai" style="margin-left:4px">Top match</span> }</strong><small>{{ s.reasons.join(' · ') }}</small></div></div>
          @if (canAssign() && s.agent.id !== ticket().assigneeId) {
            <button type="button" class="tk-btn is-sm" [class.is-soft]="first" (click)="assign.emit(s.agent.id)">Assign</button>
          } @else if (s.agent.id === ticket().assigneeId) { <span class="tk-faint tk-small">Current</span> } @else { <span></span> }
        </div>
      }
    }

    @if (duplicates().length) {
      <h4 style="margin-top:14px"><tk-icon name="copy" />Possible duplicates</h4>
      @for (d of duplicates(); track d.ticket.id) {
        <div class="tk-ai-rec">
          <div style="min-width:0">
            <a [routerLink]="['/app/tickets', d.ticket.id]" class="tk-truncate" style="display:block;font-weight:700">{{ d.ticket.number }} · {{ d.ticket.subject }}</a>
            <span class="tk-row" style="gap:6px;margin-top:2px"><app-status-badge [status]="d.ticket.status" size="sm" /><span class="tk-faint tk-small">{{ pct(d.score) }}% similar</span></span>
          </div>
          @if (canMerge()) { <button type="button" class="tk-btn is-sm" (click)="merge.emit(d.ticket.id)" [attr.aria-label]="'Merge into ' + d.ticket.number"><tk-icon name="merge" />Merge</button> } @else { <span></span> }
        </div>
      }
    }

    <ng-template #conf let-c>
      <span class="tk-confidence" [attr.title]="'Confidence ' + pct(c) + '%'"><span class="meter"><i [style.width.%]="pct(c)"></i></span>{{ pct(c) }}%</span>
    </ng-template>`,
})
export class AiRecommendations {
  readonly ticket = input.required<Ticket>();
  readonly priority = input.required<Recommendation<TicketPriority>>();
  readonly category = input.required<Recommendation<TicketCategory>>();
  readonly sentiment = input.required<SentimentResult>();
  readonly assignees = input<readonly AssigneeSuggestion[]>([]);
  readonly duplicates = input<readonly SimilarTicket[]>([]);
  readonly canEdit = input(false);
  readonly canAssign = input(false);
  readonly canMerge = input(false);
  readonly applyPriority = output<TicketPriority>();
  readonly applyCategory = output<TicketCategory>();
  readonly assign = output<string>();
  readonly merge = output<string>();

  protected pct(n: number): number { return Math.round(n * 100); }
  protected sentimentTone(): string { return SENTIMENT_META[this.sentiment().value].tone; }
  protected sentimentIcon(): string { return SENTIMENT_META[this.sentiment().value].icon; }
}
