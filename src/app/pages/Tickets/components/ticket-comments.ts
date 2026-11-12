import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal, model, output, signal, viewChild } from '@angular/core';
import { switchMap, of } from 'rxjs';
import { Agent, Ticket } from '../models/ticket.model';
import { CommentVisibility, TicketComment } from '../models/comment.model';
import { attachmentProblem } from '../models/attachment.model';
import { TicketService } from '../services/ticket.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { errorMessage } from '../data/ticket-api';
import { TkIcon } from './icon';
import { EmptyState } from './feedback';
import { dateTime, fileSize, initialsOf, relativeTime } from '../utils/format';

/** Replies agents reuse. The TicketFlow theme's "Saved replies" screen, as a composer menu. */
export const SAVED_REPLIES: readonly { title: string; body: string }[] = [
  { title: 'Acknowledge', body: 'Thanks for reporting this. I am looking into it now and will update you shortly.' },
  { title: 'Need more details', body: 'Could you share a screenshot, the time it happened and the donor or transaction id? That will help us trace it quickly.' },
  { title: 'Fix deployed', body: 'We have deployed a fix. Could you check again and let us know if everything works as expected?' },
  { title: 'Refund issued', body: 'The refund has been issued. It usually reaches the original payment method within 5–7 working days.' },
  { title: 'Closing', body: 'I am glad this is sorted. I will close the ticket now; reply any time within 30 days to reopen it.' },
];

interface Segment { text: string; mention: boolean }

/**
 * The ticket conversation and its composer.
 * Public replies go to the customer; internal notes (amber, striped) are visible to staff only.
 * Type @ to mention a colleague: they are notified. Ctrl/⌘ + Enter sends.
 */
@Component({
  selector: 'app-ticket-comments',
  standalone: true,
  imports: [TkIcon, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-thread" aria-live="polite">
      @for (c of shown(); track c.id) {
        <article class="tk-msg" [class.is-staff]="c.fromStaff" [class.is-internal]="c.visibility === 'internal'">
          <span class="tk-avatar" [attr.data-tone]="c.fromStaff ? 'primary' : 'info'">{{ initials(c.authorName) }}</span>
          <div class="tk-msg-card">
            <header class="tk-msg-head">
              <strong>{{ c.authorName }}</strong>
              @if (c.visibility === 'internal') { <span class="tk-badge is-sm" data-tone="warning"><tk-icon name="lock" />Internal note</span> }
              @else if (!c.fromStaff) { <span class="tk-badge is-sm" data-tone="info">Customer</span> }
              <time [attr.datetime]="c.createdAt" [title]="full(c.createdAt)">{{ ago(c.createdAt) }}</time>
            </header>
            <p class="tk-msg-body">@for (s of segments(c.body); track $index) {<span [class.mention]="s.mention">{{ s.text }}</span>}</p>
          </div>
        </article>
      } @empty {
        <app-empty-state icon="message" tone="neutral" [compact]="true" [heading]="filter() === 'internal' ? 'No internal notes yet' : 'No messages yet'"
                         [message]="filter() === 'internal' ? 'Notes are visible to staff only. Use them to share findings with colleagues.' : 'Start the conversation below.'" />
      }
    </div>

    @if (canComment()) {
      <div class="tk-composer" [class.is-internal]="visibility() === 'internal'" style="margin-top:16px">
        <div class="tk-composer-top">
          <div class="tk-seg" role="group" aria-label="Message type">
            <button type="button" [attr.aria-pressed]="visibility() === 'public'" (click)="visibility.set('public')"><tk-icon name="send" />Reply to customer</button>
            @if (canInternal()) { <button type="button" [attr.aria-pressed]="visibility() === 'internal'" (click)="visibility.set('internal')"><tk-icon name="lock" />Internal note</button> }
          </div>
          <span class="tk-spacer"></span>
          @if (visibility() === 'public' && aiAvailable()) {
            <button type="button" class="tk-btn is-soft is-sm" [class.is-loading]="aiBusy()" (click)="aiDraft.emit()"><tk-icon name="sparkles" />Draft with AI</button>
          }
          <div class="tk-popover">
            <button type="button" class="tk-btn is-ghost is-sm" (click)="repliesOpen.set(!repliesOpen())" [attr.aria-expanded]="repliesOpen()"><tk-icon name="file-text" />Saved replies</button>
            @if (repliesOpen()) {
              <div class="tk-menu" role="menu">
                @for (r of savedReplies; track r.title) { <button type="button" role="menuitem" (click)="insert(r.body)">{{ r.title }}</button> }
              </div>
            }
          </div>
        </div>
        <div class="tk-mentions">
          <label class="tk-sr-only" for="tk-composer-text">{{ visibility() === 'internal' ? 'Internal note' : 'Reply' }}</label>
          <textarea #box id="tk-composer-text" class="tk-textarea" [value]="draft()" (input)="onInput($event)" (keydown)="onKey($event)"
                    [placeholder]="visibility() === 'internal' ? 'Only staff can see this. Type @ to mention someone.' : 'Write a reply to the customer…'"></textarea>
          @if (mentionOpen() && mentionMatches().length) {
            <div class="tk-menu tk-mention-list is-left" role="listbox" aria-label="Mention a colleague">
              @for (a of mentionMatches(); track a.id; let i = $index) {
                <button type="button" role="option" [attr.aria-selected]="i === mentionIndex()" [style.background]="i === mentionIndex() ? 'var(--surface-3)' : null" (mousedown)="$event.preventDefault(); pickMention(a)">
                  <span class="tk-avatar is-sm" data-tone="primary">{{ a.initials }}</span>{{ a.name }}
                </button>
              }
            </div>
          }
        </div>
        @if (files().length) {
          <div class="tk-files">
            @for (f of files(); track f.name) {
              <span class="tk-tag"><tk-icon name="paperclip" />{{ f.name }} · {{ size(f.size) }}<button type="button" class="tk-link-btn" style="margin-left:6px" (click)="removeFile(f)" [attr.aria-label]="'Remove ' + f.name">×</button></span>
            }
          </div>
        }
        <div class="tk-composer-foot">
          <label class="tk-btn is-ghost is-sm" style="cursor:pointer"><tk-icon name="paperclip" />Attach<input type="file" multiple hidden (change)="onFiles($event)" /></label>
          @if (error()) { <span class="tk-error" role="alert">{{ error() }}</span> }
          <span class="tk-spacer"></span>
          <span class="tk-faint tk-small">Ctrl + Enter to send</span>
          <button type="button" class="tk-btn btn-primary is-sm" [class.is-loading]="sending()" [disabled]="sending() || !draft().trim()" (click)="send()">
            <tk-icon name="send" />{{ visibility() === 'internal' ? 'Add note' : 'Send reply' }}
          </button>
        </div>
      </div>
    }`,
})
export class TicketComments {
  private readonly tickets = inject(TicketService);
  private readonly toast = inject(ToastService);
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  readonly ticket = input.required<Ticket>();
  readonly comments = input.required<readonly TicketComment[]>();
  readonly agents = input<readonly Agent[]>([]);
  readonly filter = input<'all' | 'public' | 'internal'>('all');
  readonly canComment = input(true);
  readonly canInternal = input(false);
  readonly aiAvailable = input(false);
  readonly aiBusy = input(false);
  /** Two-way: the parent can put an AI draft here. */
  readonly draft = model('');
  readonly posted = output<TicketComment>();
  readonly aiDraft = output<void>();

  /** Which kind of message the composer starts on (the Internal discussion tab starts on notes). */
  readonly startAs = input<CommentVisibility>('public');
  protected readonly visibility = linkedSignal(() => this.startAs());
  protected readonly files = signal<File[]>([]);
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected readonly repliesOpen = signal(false);
  protected readonly savedReplies = SAVED_REPLIES;
  private readonly mentions = signal<string[]>([]);

  protected readonly mentionOpen = signal(false);
  protected readonly mentionTerm = signal('');
  protected readonly mentionIndex = signal(0);
  protected readonly mentionMatches = computed(() => {
    const t = this.mentionTerm().toLowerCase();
    return this.agents().filter((a) => a.name.toLowerCase().includes(t)).slice(0, 6);
  });

  protected readonly shown = computed(() => {
    const f = this.filter();
    return this.comments().filter((c) => f === 'all' || c.visibility === f);
  });

  protected initials(n: string): string { return initialsOf(n); }
  protected ago(iso: string): string { return relativeTime(iso); }
  protected full(iso: string): string { return dateTime(iso); }
  protected size(b: number): string { return fileSize(b); }

  protected segments(body: string): Segment[] {
    const names = this.agents().map((a) => a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!names.length || !body.includes('@')) return [{ text: body, mention: false }];
    // With one capture group, split() alternates plain text (even) and the captured mention (odd).
    const re = new RegExp(`(@(?:${names.join('|')}))`);
    return body.split(re).map((text, i) => ({ text, mention: i % 2 === 1 })).filter((s) => s.text.length > 0);
  }

  protected insert(text: string): void {
    this.repliesOpen.set(false);
    const cur = this.draft();
    this.draft.set(cur ? `${cur.trimEnd()}\n\n${text}` : text);
    queueMicrotask(() => this.box()?.nativeElement.focus());
  }

  protected onInput(e: Event): void {
    const el = e.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(?:^|\s)@([\w]*)$/.exec(before);
    this.mentionOpen.set(!!m);
    this.mentionTerm.set(m?.[1] ?? '');
    this.mentionIndex.set(0);
  }

  protected onKey(e: KeyboardEvent): void {
    if (this.mentionOpen() && this.mentionMatches().length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.mentionIndex.update((i) => (i + 1) % this.mentionMatches().length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.mentionIndex.update((i) => (i - 1 + this.mentionMatches().length) % this.mentionMatches().length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickMention(this.mentionMatches()[this.mentionIndex()]); return; }
      if (e.key === 'Escape') { this.mentionOpen.set(false); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.send(); }
  }

  protected pickMention(a: Agent): void {
    const el = this.box()?.nativeElement;
    const value = this.draft();
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([\w]*)$/, `@${a.name} `);
    this.draft.set(before + value.slice(caret));
    this.mentions.update((m) => (m.includes(a.id) ? m : [...m, a.id]));
    this.mentionOpen.set(false);
    queueMicrotask(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }

  protected onFiles(e: Event): void {
    const input = e.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    const problems = picked.map((f) => attachmentProblem(f)).filter(Boolean);
    this.error.set(problems.join(' '));
    this.files.update((list) => [...list, ...picked.filter((f) => !attachmentProblem(f))]);
  }

  protected removeFile(f: File): void { this.files.update((list) => list.filter((x) => x !== f)); }

  protected send(): void {
    const body = this.draft().trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    const t = this.ticket();
    const mentionIds = this.mentions().filter((id) => body.includes(`@${this.agents().find((a) => a.id === id)?.name}`));
    const files = this.files();
    (files.length ? this.tickets.upload(t.id, files) : of([]))
      .pipe(switchMap((atts) => this.tickets.addComment(t, { body, visibility: this.visibility(), mentions: mentionIds, attachmentIds: atts.map((a) => a.id) })))
      .subscribe({
        next: (c) => {
          this.sending.set(false);
          this.draft.set('');
          this.files.set([]);
          this.mentions.set([]);
          this.toast.show(c.visibility === 'internal' ? 'Note added' : 'Reply sent', `${t.number}`, 'success', 2500);
          this.posted.emit(c);
        },
        error: (err) => { this.sending.set(false); this.error.set(errorMessage(err)); },
      });
  }
}
