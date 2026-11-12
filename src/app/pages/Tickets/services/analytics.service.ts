import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { TicketApi } from '../data/ticket-api';
import { TicketStats } from '../models/analytics.model';
import { ActivityItem } from '../models/dashboard.model';
import { TicketService } from './ticket.service';

/**
 * Aggregates for dashboards, analytics and reports.
 *
 * The server computes them (GET /tickets/stats); the browser never counts raw rows. Results are cached
 * per period until any ticket changes, so moving between Dashboard, Analytics and SLA Monitor is instant.
 */
@Injectable()
export class AnalyticsService {
  private readonly api = inject(TicketApi);
  private readonly tickets = inject(TicketService);
  private readonly cache = new Map<string, Observable<TicketStats>>();

  stats(periodDays: number): Observable<TicketStats> {
    const key = `${periodDays}:${this.tickets.revision()}`;
    let hit = this.cache.get(key);
    if (!hit) {
      if (this.cache.size > 12) this.cache.clear();
      hit = this.api.stats(periodDays).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.cache.set(key, hit);
    }
    return hit;
  }

  activity(limit = 12): Observable<ActivityItem[]> {
    return this.api.activity(limit);
  }
}
