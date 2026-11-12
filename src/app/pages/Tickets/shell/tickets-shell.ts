import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TicketAccessService } from '../services/ticket-access.service';
import { TicketNotificationService } from '../services/notification.service';
import { SlaService } from '../services/sla.service';

/**
 * Content wrapper for every Tickets page.
 *
 * It adds NO chrome: the OtoSolve header, sidebar, page container and each page's
 * <app-page-header> stay exactly as in the rest of the application. Its jobs are to load the
 * Tickets content stylesheet once (ViewEncapsulation.None, every rule scoped under .tkx and built
 * on the application's own theme variables) and to run the SLA warning watch.
 */
@Component({
  selector: 'app-tickets-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styleUrl: '../styles/tickets.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tkx', '(document:keydown)': 'onKey($event)' },
})
export class TicketsShell {
  private readonly access = inject(TicketAccessService);
  private readonly router = inject(Router);

  constructor() {
    const sla = inject(SlaService);
    inject(TicketNotificationService).startSlaWatch(() => sla.policies(), inject(DestroyRef));
  }

  /** "N" opens a new ticket from anywhere in the module, unless the person is typing. */
  protected onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    if (!el || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
    if (e.key === 'n' && this.access.can('create')) { e.preventDefault(); this.router.navigate(['/app/tickets/new']); }
  }
}
