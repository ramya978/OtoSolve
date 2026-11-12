import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { TicketApi } from '../data/ticket-api';
import { Ticket } from '../models/ticket.model';
import { DEFAULT_SLA_POLICIES, SlaPolicy, SlaSnapshot } from '../models/sla.model';
import { computeSla } from '../utils/sla';

/**
 * SLA targets and clocks.
 *
 * `now` ticks every 30 seconds so badges in lists count down without a reload; a clock shown on its
 * own (ticket details, SLA Monitor) runs its own one-second timer in `SlaIndicator`.
 */
@Injectable()
export class SlaService {
  private readonly api = inject(TicketApi);

  readonly policies = signal<readonly SlaPolicy[]>(DEFAULT_SLA_POLICIES);
  readonly loaded = signal(false);
  readonly now = signal(Date.now());

  constructor() {
    this.reload();
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    // The service lives as long as the Tickets route injector.
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  reload(): void {
    this.api.slaPolicies().subscribe({
      next: (p) => { this.policies.set(p); this.loaded.set(true); },
      error: () => this.loaded.set(true),
    });
  }

  save(policies: readonly SlaPolicy[]): Observable<SlaPolicy[]> {
    return this.api.saveSlaPolicies(policies).pipe(tap((p) => this.policies.set(p)));
  }

  snapshot(ticket: Ticket, now = this.now()): SlaSnapshot {
    return computeSla(ticket, this.policies(), now);
  }
}
