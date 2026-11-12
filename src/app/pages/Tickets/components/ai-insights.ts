import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { TicketBundle, TicketCategory, TicketLookups, TicketPriority } from '../models/ticket.model';
import { AiService } from '../services/ai.service';
import { errorMessage } from '../data/ticket-api';
import { AiSummaryCard } from './ai-summary-card';
import { AiRecommendations } from './ai-recommendations';
import { EmptyState } from './feedback';
import { TkIcon } from './icon';

type AiTab = 'summary' | 'suggest' | 'resolve' | 'reply';

/**
 * <app-ai-insights>: every AI feature for one ticket in a single panel.
 * Summary · Suggestions (priority, category, sentiment, assignee, duplicates) · Resolution (from
 * similar solved tickets and the knowledge base) · Smart reply (drafts the agent edits before sending).
 */
@Component({
  selector: 'app-ai-insights',
  standalone: true,
  imports: [RouterLink, AiSummaryCard, AiRecommendations, EmptyState, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tk-ai" aria-labelledby="ai-title">
      <header class="tk-ai-head">
        <span class="spark"><tk-icon name="sparkles" /></span>
        <div style="flex:1;min-width:0">
          <h3 id="ai-title">AI assistant</h3>
          <small>{{ source === 'rules' ? 'Rules preview · connect the AI gateway for model output' : 'Suggestions to review before you act' }}</small>
        </div>
        <button type="button" class="tk-btn is-ghost is-icon is-sm" (click)="insights.reload()" aria-label="Refresh suggestions" [disabled]="insights.isLoading()"><tk-icon name="refresh" /></button>
      </header>
      <div class="tk-tabs" role="tablist" aria-label="AI features">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
        }
      </div>

      @if (insights.error()) {
        <app-empty-state icon="wifi-off" tone="danger" [compact]="true" heading="AI suggestions unavailable" [message]="err()" retryLabel="Try again" (retry)="insights.reload()" />
      } @else {
        @switch (tab()) {
          @case ('summary') {
            <div class="tk-ai-section"><h4>Summary</h4><app-ai-summary-card [summary]="data()?.summary ?? null" /></div>
          }
          @case ('suggest') {
            <div class="tk-ai-section">
              @if (data(); as d) {
                <app-ai-recommendations [ticket]="bundle().ticket" [priority]="d.priority" [category]="d.category" [sentiment]="d.sentiment"
                  [assignees]="d.assignees" [duplicates]="d.duplicates" [canEdit]="canEdit()" [canAssign]="canAssign()" [canMerge]="canMerge()"
                  (applyPriority)="applyPriority.emit($event)" (applyCategory)="applyCategory.emit($event)" (assign)="assign.emit($event)" (merge)="merge.emit($event)" />
              } @else { <span class="tk-skel is-text" style="width:80%"></span> }
            </div>
          }
          @case ('resolve') {
            <div class="tk-ai-section">
              <h4>Suggested resolution</h4>
              @if (data(); as d) {
                @if (d.resolution.steps.length) {
                  <ol style="margin:0;padding-left:18px;display:grid;gap:8px;font-size:13px">
                    @for (s of d.resolution.steps; track $index) { <li>{{ s }}</li> }
                  </ol>
                  @if (d.resolution.fromTickets.length) {
                    <p class="tk-faint tk-small" style="margin-top:10px">Based on
                      @for (f of d.resolution.fromTickets; track f.id) { <a [routerLink]="['/app/tickets', f.id]">{{ f.number }}</a>{{ $last ? '' : ', ' }} }
                    </p>
                  }
                  <button type="button" class="tk-btn is-soft is-sm" style="margin-top:10px" (click)="insertReply.emit(stepsAsReply())"><tk-icon name="send" />Use in reply</button>
                } @else {
                  <app-empty-state icon="book" tone="neutral" [compact]="true" heading="No similar solved tickets" message="Nothing close enough was resolved before. Investigate, then add a knowledge article for next time." />
                }
              } @else { <span class="tk-skel is-text" style="width:80%"></span> }
            </div>
            <div class="tk-ai-section">
              <h4><tk-icon name="book" />Knowledge base</h4>
              @for (a of data()?.articles ?? []; track a.id) {
                <div style="padding:6px 0">
                  <strong style="display:block;font-size:13px">{{ a.title }}</strong>
                  <span class="tk-muted tk-small">{{ a.summary }}</span>
                  <div><button type="button" class="tk-link-btn" (click)="insertReply.emit('This guide explains the steps: “' + a.title + '”.')">Link in reply</button></div>
                </div>
              } @empty { <p class="tk-faint tk-small">No matching articles.</p> }
            </div>
          }
          @case ('reply') {
            <div class="tk-ai-section">
              <h4>Smart reply</h4>
              <div class="tk-seg" role="group" aria-label="Tone" style="margin-bottom:10px">
                @for (t of tones; track t) { <button type="button" [attr.aria-pressed]="tone() === t" (click)="tone.set(t); reply.set('')">{{ t }}</button> }
              </div>
              @if (reply()) {
                <div class="tk-ai-reply">{{ reply() }}</div>
                <div class="tk-row" style="margin-top:10px">
                  <button type="button" class="tk-btn btn-primary is-sm" (click)="insertReply.emit(reply())"><tk-icon name="edit" />Edit in composer</button>
                  <button type="button" class="tk-btn is-ghost is-sm" (click)="draftReply()"><tk-icon name="refresh" />Regenerate</button>
                </div>
                <p class="tk-faint tk-small" style="margin-top:8px">Drafts are never sent automatically.</p>
              } @else {
                <button type="button" class="tk-btn is-soft" [class.is-loading]="replyBusy()" (click)="draftReply()"><tk-icon name="sparkles" />Draft a {{ tone() }} reply</button>
                @if (replyError()) { <p class="tk-error" style="margin-top:8px">{{ replyError() }}</p> }
              }
            </div>
          }
        }
      }
    </section>`,
})
export class AiInsights {
  private readonly ai = inject(AiService);
  readonly bundle = input.required<TicketBundle>();
  readonly lookups = input.required<TicketLookups>();
  readonly agentName = input('Support team');
  readonly canEdit = input(false);
  readonly canAssign = input(false);
  readonly canMerge = input(false);
  readonly applyPriority = output<TicketPriority>();
  readonly applyCategory = output<TicketCategory>();
  readonly assign = output<string>();
  readonly merge = output<string>();
  readonly insertReply = output<string>();

  protected readonly source = this.ai.source;
  protected readonly tabs: readonly { key: AiTab; label: string }[] = [
    { key: 'summary', label: 'Summary' }, { key: 'suggest', label: 'Suggestions' }, { key: 'resolve', label: 'Resolution' }, { key: 'reply', label: 'Smart reply' },
  ];
  protected readonly tones = ['friendly', 'formal', 'brief'] as const;
  protected readonly tab = signal<AiTab>('summary');
  protected readonly tone = signal<'friendly' | 'formal' | 'brief'>('friendly');
  protected readonly reply = signal('');
  protected readonly replyBusy = signal(false);
  protected readonly replyError = signal('');

  protected readonly insights = rxResource({
    params: () => ({ bundle: this.bundle(), lookups: this.lookups() }),
    stream: ({ params }) => (params.lookups ? this.ai.insights(params.bundle, params.lookups) : of(null)),
  });
  protected readonly data = computed(() => this.insights.value() ?? null);
  protected readonly err = computed(() => errorMessage(this.insights.error()));

  protected stepsAsReply(): string {
    const d = this.data();
    if (!d) return '';
    return `Here is what we suggest:\n${d.resolution.steps.slice(0, 2).map((s, i) => `${i + 1}. ${s.replace(/^As on TK-\d+: /, '')}`).join('\n')}`;
  }

  protected draftReply(): void {
    this.replyBusy.set(true);
    this.replyError.set('');
    this.ai.smartReply(this.bundle(), this.lookups(), this.agentName(), this.tone()).subscribe({
      next: (text) => { this.reply.set(text); this.replyBusy.set(false); },
      error: (e) => { this.replyError.set(errorMessage(e)); this.replyBusy.set(false); },
    });
  }
}
