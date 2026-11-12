import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { TicketDraft } from '../models/ticket.model';
import { errorMessage } from '../data/ticket-api';
import { TicketForm } from '../components/ticket-form';
import { Skeleton } from '../components/feedback';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [PageHeader, TicketForm, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-page">
      <app-page-header breadcrumb="Workspace / Tickets" breadcrumbRoute="/app/tickets" [heading]="access.isStaff() ? 'New ticket' : 'Ask for help'"
        [description]="access.isStaff() ? 'Record a request for a customer. Assign it now or leave it in the queue.' : 'Tell us what is wrong and we will reply here and by e-mail.'" />
      @if (tickets.lookups(); as lookups) {
        <app-ticket-form mode="create" [lookups]="lookups" [busy]="busy()" [serverError]="error()" [isCustomer]="!access.isStaff()"
                         [canAssignOthers]="access.can('assign')" [meId]="access.agentId()" (submitted)="create($event)" (cancel)="back()" />
      } @else {
        <div class="tk-card"><app-skeleton variant="detail" [rows]="6" /></div>
      }
    </div>`,
})
export class TicketCreate {
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected create(draft: TicketDraft): void {
    this.busy.set(true);
    this.error.set('');
    this.tickets.create(draft).subscribe({
      next: (t) => {
        this.busy.set(false);
        this.toast.show(`${t.number} created`, t.assigneeId ? 'Assigned and ready to work on.' : 'Added to the queue.', 'success');
        this.router.navigate(['/app/tickets', t.id]);
      },
      error: (err) => { this.busy.set(false); this.error.set(errorMessage(err)); },
    });
  }

  protected back(): void { this.router.navigate(['/app/tickets/list']); }
}
