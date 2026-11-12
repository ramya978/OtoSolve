import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { TicketDraft } from '../models/ticket.model';
import { TicketApiError, errorMessage } from '../data/ticket-api';
import { TicketForm } from '../components/ticket-form';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

@Component({
  selector: 'app-ticket-edit',
  standalone: true,
  imports: [PageHeader, RouterLink, TicketForm, Skeleton, EmptyState, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-page">
      @if (bundle.error()) {
        <div class="tk-card"><app-empty-state icon="search" tone="danger" heading="Ticket not found" [message]="loadError()" retryLabel="Try again" (retry)="bundle.reload()">
          <a class="tk-btn is-sm" routerLink="/app/tickets/list">Back to tickets</a></app-empty-state></div>
      } @else if (!bundle.value() || !tickets.lookups()) {
        <div class="tk-card"><app-skeleton variant="detail" [rows]="7" /></div>
      } @else {
        @let t = bundle.value()!.ticket;
        <app-page-header [breadcrumb]="'Tickets / ' + t.number" [breadcrumbRoute]="'/app/tickets/' + t.id" heading="Edit ticket"
          description="Changes are recorded in the audit log with your name." />
        @if (!access.canEdit(t)) {
          <div class="tk-card"><app-empty-state icon="lock" tone="warning" heading="You can't edit this ticket" message="Only its assignee, their team, managers and admins can change it. You can still reply to it.">
            <a class="tk-btn is-sm" [routerLink]="['/app/tickets', t.id]">Open ticket</a></app-empty-state></div>
        } @else {
          @if (conflict()) {
            <div class="tk-alert" data-tone="warning" role="alert"><tk-icon name="alert" /><div class="body"><strong>Someone else changed this ticket</strong>{{ error() }}</div>
              <button type="button" class="tk-btn is-sm" (click)="reload()">Reload</button></div>
          }
          <app-ticket-form mode="edit" [initial]="draft()" [lookups]="tickets.lookups()!" [busy]="busy()" [serverError]="conflict() ? '' : error()"
                           [canAssignOthers]="access.can('assign')" [meId]="access.agentId()" (submitted)="save($event)" (cancel)="back()" />
        }
      }
    </div>`,
})
export class TicketEdit {
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Route parameter (component input binding). */
  readonly id = input.required<string>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  private readonly reloadKey = signal(0);

  protected readonly bundle = rxResource({
    params: () => ({ id: this.id(), k: this.reloadKey() }),
    stream: ({ params }) => this.tickets.get(params.id),
  });
  protected readonly loadError = computed(() => errorMessage(this.bundle.error()));

  protected readonly draft = computed<TicketDraft | null>(() => {
    const t = this.bundle.value()?.ticket;
    return t ? {
      subject: t.subject, description: t.description, type: t.type, category: t.category, priority: t.priority, channel: t.channel,
      customerId: t.customerId, assigneeId: t.assigneeId, teamId: t.teamId, tags: [...t.tags], watcherIds: [...t.watcherIds],
    } : null;
  });

  protected save(draft: TicketDraft): void {
    const t = this.bundle.value()!.ticket;
    this.busy.set(true);
    this.error.set('');
    this.conflict.set(false);
    this.tickets.update(t.id, draft, t.version, t).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.toast.show('Changes saved', saved.number, 'success', 2500);
        this.router.navigate(['/app/tickets', saved.id]);
      },
      error: (err) => {
        this.busy.set(false);
        this.conflict.set(err instanceof TicketApiError && err.status === 409);
        this.error.set(errorMessage(err));
      },
    });
  }

  protected reload(): void { this.conflict.set(false); this.reloadKey.update((n) => n + 1); }
  protected back(): void { this.router.navigate(['/app/tickets', this.id()]); }
}
