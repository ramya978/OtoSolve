import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import {
  TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_TYPES, TicketCategory, TicketDraft, TicketLookups, TicketPriority,
} from '../models/ticket.model';
import { AiService, DraftInsights } from '../services/ai.service';
import { StatusBadge } from './status-badge';
import { TkIcon } from './icon';

/** The team that usually owns each category; preselected until someone picks a team themselves. */
const TEAM_FOR: Readonly<Record<TicketCategory, string>> = {
  Technical: 't2', Billing: 't3', Account: 't1', Donation: 't3', 'Feature Request': 't4', General: 't1',
};

/**
 * Create / edit form (reactive). While the subject and description are typed, AI predicts the
 * category and priority (filled in automatically until the person changes them), and lists
 * similar open tickets and knowledge-base articles that may already answer the question.
 */
@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, StatusBadge, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="tk-split" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="tk-card">
        <div class="tk-card-body tk-form-grid">
          <label class="tk-field is-wide">
            <span class="tk-label">Subject <span class="req">*</span></span>
            <input class="tk-input" formControlName="subject" maxlength="160" placeholder="Short summary, e.g. “Donation page blank on mobile”" [class.is-invalid]="bad('subject')" aria-describedby="subj-err" />
            @if (bad('subject')) { <span class="tk-error" id="subj-err">Write a subject of 5–160 characters.</span> }
          </label>
          <label class="tk-field is-wide">
            <span class="tk-label">Description <span class="req">*</span></span>
            <textarea class="tk-textarea" formControlName="description" rows="7" placeholder="What happened, what was expected, and any ids or times that help us trace it." [class.is-invalid]="bad('description')" aria-describedby="desc-err"></textarea>
            @if (bad('description')) { <span class="tk-error" id="desc-err">Describe the problem in at least 10 characters.</span> } @else { <span class="tk-hint">{{ form.controls.description.value.length }} characters</span> }
          </label>

          @if (!isCustomer()) {
            <label class="tk-field">
              <span class="tk-label">Customer <span class="req">*</span></span>
              <select class="tk-select" formControlName="customerId" [class.is-invalid]="bad('customerId')">
                <option value="">Choose a customer</option>
                @for (c of lookups().customers; track c.id) { <option [value]="c.id">{{ c.name }} · {{ c.organisation }}</option> }
              </select>
              @if (bad('customerId')) { <span class="tk-error">Choose who this ticket is for.</span> }
            </label>
            <label class="tk-field">
              <span class="tk-label">Channel</span>
              <select class="tk-select" formControlName="channel">@for (c of channels; track c) { <option [value]="c">{{ c }}</option> }</select>
            </label>
          }
          <label class="tk-field">
            <span class="tk-label">Category @if (aiFilled().category) { <span class="tk-badge is-sm is-ai"><tk-icon name="sparkles" />AI</span> }</span>
            <select class="tk-select" formControlName="category" (change)="touchedByUser.add('category')">@for (c of categories; track c) { <option [value]="c">{{ c }}</option> }</select>
          </label>
          <label class="tk-field">
            <span class="tk-label">Priority @if (aiFilled().priority) { <span class="tk-badge is-sm is-ai"><tk-icon name="sparkles" />AI</span> }</span>
            <select class="tk-select" formControlName="priority" (change)="touchedByUser.add('priority')">@for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }</select>
          </label>
          <label class="tk-field">
            <span class="tk-label">Type</span>
            <select class="tk-select" formControlName="type">@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select>
          </label>
          @if (!isCustomer()) {
            <label class="tk-field">
              <span class="tk-label">Team</span>
              <select class="tk-select" formControlName="teamId" (change)="touchedByUser.add('team')">@for (t of lookups().teams; track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select>
            </label>
            <label class="tk-field">
              <span class="tk-label">Assignee</span>
              <select class="tk-select" formControlName="assigneeId">
                <option value="">Unassigned</option>
                @for (a of lookups().agents; track a.id) {
                  <option [value]="a.id" [disabled]="!a.available || (!canAssignOthers() && a.id !== meId())">{{ a.name }}{{ a.available ? '' : ' (unavailable)' }}</option>
                }
              </select>
              @if (!canAssignOthers()) { <span class="tk-hint">You can assign tickets to yourself.</span> }
            </label>
            <label class="tk-field">
              <span class="tk-label">Tags</span>
              <input class="tk-input" formControlName="tags" placeholder="Comma separated, e.g. receipts, mobile" />
            </label>
          }
        </div>
        <div class="tk-card-foot">
          @if (serverError()) { <span class="tk-error" role="alert">{{ serverError() }}</span> }
          <span class="tk-spacer"></span>
          <button type="button" class="tk-btn is-ghost" (click)="cancel.emit()">Cancel</button>
          <button type="submit" class="tk-btn btn-primary" [class.is-loading]="busy()" [disabled]="busy()">{{ mode() === 'create' ? 'Create ticket' : 'Save changes' }}</button>
        </div>
      </div>

      <aside class="tk-stack">
        <section class="tk-ai" aria-label="AI assistance while you type">
          <header class="tk-ai-head">
            <span class="spark"><tk-icon name="sparkles" /></span>
            <div><h3>AI triage</h3><small>Updates as you type{{ ai.source === 'rules' ? ' · rules preview' : '' }}</small></div>
          </header>
          @if (insight(); as i) {
            <div class="tk-ai-section">
              <div class="tk-ai-rec"><span class="label">Category</span>
                @if (form.controls.category.value !== i.category.value) { <button type="button" class="tk-btn is-soft is-sm" (click)="apply('category', i.category.value)">Use</button> } @else { <span class="tk-faint tk-small">Applied</span> }
                <span class="value"><span class="tk-tag">{{ i.category.value }}</span></span><span class="why">{{ i.category.reasons.join(' · ') }}</span></div>
              <div class="tk-ai-rec"><span class="label">Priority</span>
                @if (form.controls.priority.value !== i.priority.value) { <button type="button" class="tk-btn is-soft is-sm" (click)="apply('priority', i.priority.value)">Use</button> } @else { <span class="tk-faint tk-small">Applied</span> }
                <span class="value">{{ i.priority.value }}</span><span class="why">{{ i.priority.reasons.join(' · ') }}</span></div>
              <div class="tk-ai-rec"><span class="label">Sentiment</span><span></span><span class="value">{{ i.sentiment.value }}</span><span class="why">{{ i.sentiment.reasons.join(' · ') }}</span></div>
            </div>
            @if (i.duplicates.length) {
              <div class="tk-ai-section">
                <h4><tk-icon name="copy" />Similar open tickets</h4>
                @for (d of i.duplicates; track d.ticket.id) {
                  <div style="padding:6px 0">
                    <a [routerLink]="['/app/tickets', d.ticket.id]" target="_blank" style="font-weight:700">{{ d.ticket.number }} · {{ d.ticket.subject }}</a>
                    <div class="tk-row" style="margin-top:3px"><app-status-badge [status]="d.ticket.status" size="sm" /><span class="tk-faint tk-small">{{ round(d.score * 100) }}% similar</span></div>
                  </div>
                }
                <p class="tk-faint tk-small">If one of these is the same problem, add to it instead of creating a duplicate.</p>
              </div>
            }
            @if (i.articles.length) {
              <div class="tk-ai-section">
                <h4><tk-icon name="book" />Articles that may answer this</h4>
                @for (a of i.articles; track a.id) { <div style="padding:5px 0"><strong class="tk-small" style="display:block">{{ a.title }}</strong><span class="tk-muted tk-small">{{ a.summary }}</span></div> }
              </div>
            }
          } @else {
            <div class="tk-ai-section"><p class="tk-muted tk-small">Start typing a subject and description. Category, priority, duplicates and helpful articles appear here.</p></div>
          }
        </section>
      </aside>
    </form>`,
})
export class TicketForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ai = inject(AiService);

  readonly initial = input<TicketDraft | null>(null);
  readonly mode = input<'create' | 'edit'>('create');
  readonly lookups = input.required<TicketLookups>();
  readonly busy = input(false);
  readonly serverError = input('');
  readonly isCustomer = input(false);
  readonly canAssignOthers = input(true);
  readonly meId = input<string | null>(null);
  readonly submitted = output<TicketDraft>();
  readonly cancel = output<void>();

  protected readonly categories = TICKET_CATEGORIES;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly types = TICKET_TYPES;
  protected readonly channels = TICKET_CHANNELS;
  protected readonly touchedByUser = new Set<string>();
  protected readonly insight = signal<DraftInsights | null>(null);
  protected readonly aiFilled = signal<{ category: boolean; priority: boolean }>({ category: false, priority: false });
  private readonly submittedOnce = signal(false);

  readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(160)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    customerId: ['', Validators.required],
    channel: this.fb.nonNullable.control<string>('Email'),
    category: this.fb.nonNullable.control<string>('General'),
    priority: this.fb.nonNullable.control<string>('Medium'),
    type: this.fb.nonNullable.control<string>('Question'),
    teamId: ['t1', Validators.required],
    assigneeId: [''],
    tags: [''],
  });
  private watcherIds: string[] = [];

  constructor() {
    // A customer's own tickets are always for themselves; the server sets the id.
    effect(() => {
      const c = this.form.controls.customerId;
      if (this.isCustomer()) { c.clearValidators(); c.updateValueAndValidity({ emitEvent: false }); }
    });
  }

  ngOnInit(): void {
    const init = this.initial();
    if (init) {
      this.form.patchValue({ ...init, assigneeId: init.assigneeId ?? '', tags: init.tags.join(', ') });
      this.watcherIds = [...init.watcherIds];
      ['category', 'priority', 'team'].forEach((k) => this.touchedByUser.add(k));
    }

    this.form.controls.category.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((cat) => {
      if (!this.touchedByUser.has('team')) this.form.controls.teamId.setValue(TEAM_FOR[cat as TicketCategory] ?? 't1', { emitEvent: false });
    });

    this.form.valueChanges.pipe(
      map((v) => `${v.subject ?? ''}\u0000${v.description ?? ''}\u0000${v.customerId ?? ''}`),
      distinctUntilChanged(),
      debounceTime(450),
      switchMap((key) => {
        const [subject, description, customerId] = key.split('\u0000');
        if (subject.trim().length + description.trim().length < 8) return of(null);
        return this.ai.draftInsights(subject, description, customerId || null, this.lookups()).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((ins) => {
      this.insight.set(ins);
      if (!ins || this.mode() === 'edit') return;
      // Auto-categorise until the person makes their own choice.
      const filled = { ...this.aiFilled() };
      if (!this.touchedByUser.has('category') && ins.category.confidence >= 0.5) { this.form.controls.category.setValue(ins.category.value); filled.category = true; }
      if (!this.touchedByUser.has('priority') && ins.priority.confidence >= 0.5) { this.form.controls.priority.setValue(ins.priority.value); filled.priority = true; }
      this.aiFilled.set(filled);
    });
  }

  protected bad(name: 'subject' | 'description' | 'customerId'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submittedOnce());
  }

  protected apply(field: 'category' | 'priority', value: TicketCategory | TicketPriority): void {
    this.form.controls[field].setValue(value);
    this.touchedByUser.add(field);
    this.aiFilled.update((f) => ({ ...f, [field]: true }));
  }

  protected round(n: number): number { return Math.round(n); }

  protected submit(): void {
    this.submittedOnce.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.submitted.emit({
      subject: v.subject.trim(),
      description: v.description.trim(),
      customerId: v.customerId,
      channel: v.channel as TicketDraft['channel'],
      category: v.category as TicketCategory,
      priority: v.priority as TicketPriority,
      type: v.type as TicketDraft['type'],
      teamId: v.teamId,
      assigneeId: v.assigneeId || null,
      tags: v.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      watcherIds: this.watcherIds,
    });
  }

  /** True when the person has typed something that would be lost. */
  get dirty(): boolean { return this.form.dirty; }
}
