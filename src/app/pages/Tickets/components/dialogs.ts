import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { Agent, Ticket, TicketStatus, TransitionRequest } from '../models/ticket.model';
import { TRANSITION_LABEL, needsFor, transitionProblem } from '../utils/workflow';
import { SLA_PAUSED_STATUSES } from '../models/sla.model';
import { StatusBadge } from './status-badge';
import { TkIcon } from './icon';

/** Modal frame: backdrop, focus trap, Escape and backdrop click to close. */
@Component({
  selector: 'app-tk-dialog',
  standalone: true,
  imports: [A11yModule, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-backdrop" [class.is-drawer]="drawer()" (click)="onBackdrop($event)" (keydown.escape)="close.emit()">
      <section [class]="drawer() ? 'tk-drawer' : 'tk-dialog'" [class.is-wide]="wide()" role="dialog" aria-modal="true"
               [attr.aria-labelledby]="id + '-t'" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
        <header class="tk-dialog-head">
          <div style="flex:1;min-width:0">
            <h2 [id]="id + '-t'">{{ heading() }}</h2>
            @if (sub()) { <p>{{ sub() }}</p> }
          </div>
          <button type="button" class="tk-btn is-ghost is-icon is-sm" (click)="close.emit()" aria-label="Close"><tk-icon name="x" /></button>
        </header>
        <div class="tk-dialog-body" [style.flex]="drawer() ? '1 1 auto' : null"><ng-content /></div>
        <footer class="tk-dialog-foot"><ng-content select="[dialog-actions]" /></footer>
      </section>
    </div>`,
})
export class TkDialog {
  private static seq = 0;
  protected readonly id = `tkd-${++TkDialog.seq}`;
  readonly heading = input.required<string>();
  readonly sub = input('');
  readonly wide = input(false);
  readonly drawer = input(false);
  readonly close = output<void>();
  protected onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.close.emit(); }
}

/**
 * Collects what a status change needs (reason, resolution, assignee, approver), checks it against the
 * workflow rules as the person types, and emits the request. The server re-validates.
 */
@Component({
  selector: 'app-transition-dialog',
  standalone: true,
  imports: [TkDialog, FormsModule, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-tk-dialog [heading]="label() + ' · ' + ticket().number" [sub]="ticket().subject" (close)="cancel.emit()">
      <div class="tk-row"><app-status-badge [status]="ticket().status" /> <span class="tk-faint">→</span> <app-status-badge [status]="to()" /></div>
      @if (pauses()) { <div class="tk-alert" data-tone="info"><div class="body">The resolution SLA clock pauses while the ticket is in {{ to() }}.</div></div> }
      @if (to() === 'Escalated') { <div class="tk-alert" data-tone="warning"><div class="body">Escalation notifies the next level and raises Low or Medium priority to High.</div></div> }

      @if (needs().includes('assignee')) {
        <label class="tk-field"><span class="tk-label">Assign to <span class="req">*</span></span>
          <select class="tk-select" [(ngModel)]="assigneeId" name="assignee">
            <option value="">Choose a person</option>
            @for (a of agents(); track a.id) { <option [value]="a.id" [disabled]="!a.available">{{ a.name }}{{ a.available ? '' : ' (unavailable)' }}</option> }
          </select>
        </label>
      }
      @if (needs().includes('approver')) {
        <label class="tk-field"><span class="tk-label">Approver <span class="req">*</span></span>
          <select class="tk-select" [(ngModel)]="approverId" name="approver">
            <option value="">Choose an approver</option>
            @for (a of approvers(); track a.id) { <option [value]="a.id">{{ a.name }} · {{ a.role }}</option> }
          </select>
        </label>
      }
      @if (needs().includes('resolution')) {
        <label class="tk-field"><span class="tk-label">Resolution <span class="req">*</span></span>
          <textarea class="tk-textarea" [(ngModel)]="resolution" name="resolution" rows="4" placeholder="What fixed it? The customer sees this as a reply."></textarea>
          <span class="tk-hint">At least 10 characters. Shown to the customer and used in reports.</span>
        </label>
      }
      @if (needs().includes('reason')) {
        <label class="tk-field"><span class="tk-label">Reason <span class="req">*</span></span>
          <textarea class="tk-textarea" [(ngModel)]="reason" name="reason" rows="3" [placeholder]="reasonHint()"></textarea>
        </label>
      }
      @if (!needs().length) { <p class="tk-muted">Move {{ ticket().number }} from {{ ticket().status }} to {{ to() }}?</p> }
      @if (touched() && problem()) { <p class="tk-error" role="alert">{{ problem() }}</p> }

      <ng-container dialog-actions>
        <button type="button" class="tk-btn is-ghost" (click)="cancel.emit()">Cancel</button>
        <button type="button" class="tk-btn btn-primary" [class.is-loading]="busy()" [disabled]="busy()" (click)="submit()">{{ label() }}</button>
      </ng-container>
    </app-tk-dialog>`,
})
export class TransitionDialog {
  readonly ticket = input.required<Ticket>();
  readonly to = input.required<TicketStatus>();
  readonly agents = input<readonly Agent[]>([]);
  readonly busy = input(false);
  readonly confirm = output<TransitionRequest>();
  readonly cancel = output<void>();

  protected assigneeId = '';
  protected approverId = '';
  protected reason = '';
  protected resolution = '';
  protected readonly touched = signal(false);
  private readonly tick = signal(0);

  protected readonly label = computed(() => TRANSITION_LABEL[this.to()]);
  protected readonly needs = computed(() => needsFor(this.to()));
  protected readonly pauses = computed(() => SLA_PAUSED_STATUSES.includes(this.to()) && !SLA_PAUSED_STATUSES.includes(this.ticket().status));
  protected readonly approvers = computed(() => this.agents().filter((a) => a.role !== 'Agent'));
  protected readonly reasonHint = computed(() => ({
    'Escalated': 'Why does this need L2 or a manager?',
    'On Hold': 'What is it waiting for, and until when?',
    'Cancelled': 'Duplicate, spam, withdrawn by the customer…',
    'Reopened': 'What came back, or what was missed?',
    'Pending Approval': 'What needs approving?',
  } as Partial<Record<TicketStatus, string>>)[this.to()] ?? 'Add a short reason');

  protected problem(): string | null {
    this.tick();
    return transitionProblem(this.ticket(), this.request());
  }

  private request(): TransitionRequest {
    return {
      to: this.to(),
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
      ...(this.resolution.trim() ? { resolution: this.resolution.trim() } : {}),
      ...(this.assigneeId ? { assigneeId: this.assigneeId } : {}),
      ...(this.approverId ? { approverId: this.approverId } : {}),
    };
  }

  protected submit(): void {
    this.touched.set(true);
    this.tick.update((n) => n + 1);
    if (this.problem()) return;
    this.confirm.emit(this.request());
  }
}

/** "Are you sure?" with an optional required reason, for destructive actions. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TkDialog, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-tk-dialog [heading]="heading()" (close)="cancel.emit()">
      <p class="tk-muted">{{ message() }}</p>
      @if (reasonLabel()) {
        <label class="tk-field"><span class="tk-label">{{ reasonLabel() }} <span class="req">*</span></span>
          <textarea class="tk-textarea" rows="3" [(ngModel)]="reason" name="reason"></textarea>
        </label>
        @if (touched() && reason.trim().length < 5) { <p class="tk-error" role="alert">Add a reason of at least 5 characters.</p> }
      }
      <ng-container dialog-actions>
        <button type="button" class="tk-btn is-ghost" (click)="cancel.emit()">Cancel</button>
        <button type="button" class="tk-btn" [class.is-danger]="danger()" [class.btn-primary]="!danger()" [class.is-loading]="busy()" [disabled]="busy()" (click)="submit()">{{ confirmLabel() }}</button>
      </ng-container>
    </app-tk-dialog>`,
})
export class ConfirmDialog {
  readonly heading = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly danger = input(true);
  readonly reasonLabel = input('');
  readonly busy = input(false);
  readonly confirm = output<string>();
  readonly cancel = output<void>();
  protected reason = '';
  protected readonly touched = signal(false);

  protected submit(): void {
    this.touched.set(true);
    if (this.reasonLabel() && this.reason.trim().length < 5) return;
    this.confirm.emit(this.reason.trim());
  }
}
