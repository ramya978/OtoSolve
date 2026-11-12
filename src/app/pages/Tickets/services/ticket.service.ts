import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map, shareReplay, tap } from 'rxjs';
import { TicketApi } from '../data/ticket-api';
import {
  Agent, BulkOperation, BulkResult, Customer, EMPTY_QUERY, Page, SavedFilter, Team, Ticket, TicketBundle, TicketDraft,
  TicketLookups, TicketPriority, TicketQuery, TransitionRequest,
} from '../models/ticket.model';
import { NewComment, TicketComment } from '../models/comment.model';
import { TicketAttachment } from '../models/attachment.model';
import { TicketNotificationService } from './notification.service';
import { TicketAccessService } from './ticket-access.service';
import { uid } from '../utils/format';

const SAVED_FILTERS_KEY = 'otosolve.tickets.saved-filters';

/**
 * The one place screens go for ticket data and changes.
 *
 * `revision` goes up after every successful change; screens include it in their resource params so
 * every list, board and chart reloads after any change made anywhere in the module.
 */
@Injectable()
export class TicketService {
  private readonly api = inject(TicketApi);
  private readonly notifications = inject(TicketNotificationService);
  private readonly access = inject(TicketAccessService);

  readonly revision = signal(0);

  private readonly lookups$ = this.api.lookups().pipe(shareReplay({ bufferSize: 1, refCount: false }));
  readonly lookups = toSignal<TicketLookups | null>(this.lookups$, { initialValue: null });
  readonly agents = computed<readonly Agent[]>(() => this.lookups()?.agents ?? []);
  readonly customers = computed<readonly Customer[]>(() => this.lookups()?.customers ?? []);
  readonly teams = computed<readonly Team[]>(() => this.lookups()?.teams ?? []);
  private readonly agentMap = computed(() => new Map(this.agents().map((a) => [a.id, a])));
  private readonly customerMap = computed(() => new Map(this.customers().map((c) => [c.id, c])));
  private readonly teamMap = computed(() => new Map(this.teams().map((t) => [t.id, t])));

  readonly savedFilters = signal<readonly SavedFilter[]>(this.readSaved());

  constructor() {
    // A different role (Settings → Preview as) sees different tickets: reload everything.
    effect(() => {
      this.access.role();
      untracked(() => this.bump());
    });
  }

  agent(id: string | null | undefined): Agent | undefined { return id ? this.agentMap().get(id) : undefined; }
  customer(id: string | null | undefined): Customer | undefined { return id ? this.customerMap().get(id) : undefined; }
  team(id: string | null | undefined): Team | undefined { return id ? this.teamMap().get(id) : undefined; }

  private bump(): void { this.revision.update((n) => n + 1); }

  /* ---------- reads ---------- */

  list(query: TicketQuery): Observable<Page<Ticket>> { return this.api.list(query); }

  /** Every ticket matching a query, for exports, the board and AI look-ups. */
  all(query: Partial<TicketQuery> = {}): Observable<readonly Ticket[]> {
    return this.api.list({ ...EMPTY_QUERY, ...query, page: 1, pageSize: 10_000 }).pipe(map((p) => p.items));
  }

  get(id: string): Observable<TicketBundle> { return this.api.get(id); }

  /* ---------- writes ---------- */

  create(draft: TicketDraft): Observable<Ticket> {
    return this.api.create(draft).pipe(tap((t) => {
      this.bump();
      if (t.assigneeId) this.announceAssignment(t);
    }));
  }

  update(id: string, draft: TicketDraft, version: number, previous?: Ticket): Observable<Ticket> {
    return this.api.update(id, draft, version).pipe(tap((t) => {
      this.bump();
      if (previous && previous.assigneeId !== t.assigneeId && t.assigneeId) this.announceAssignment(t);
    }));
  }

  setPriority(id: string, priority: TicketPriority): Observable<Ticket> { return this.api.setPriority(id, priority).pipe(tap(() => this.bump())); }
  setCategory(id: string, category: Ticket['category']): Observable<Ticket> { return this.api.setCategory(id, category).pipe(tap(() => this.bump())); }
  setWatching(id: string, watching: boolean): Observable<Ticket> { return this.api.setWatching(id, watching).pipe(tap(() => this.bump())); }

  transition(ticket: Ticket, request: TransitionRequest): Observable<Ticket> {
    return this.api.transition(ticket.id, request).pipe(tap((t) => {
      this.bump();
      const customer = this.customer(t.customerId);
      if (t.status === 'Resolved') {
        this.notifications.emit('resolved', `${t.number} resolved`, request.resolution ?? 'Marked as resolved.', t, customer?.email);
      } else {
        this.notifications.emit('status', `${t.number} is now ${t.status}`, `Moved from ${ticket.status} to ${t.status}${request.reason ? `: ${request.reason}` : ''}.`, t, this.agent(t.assigneeId)?.email);
      }
      if (request.assigneeId && request.assigneeId !== ticket.assigneeId) this.announceAssignment(t);
    }));
  }

  assign(ticket: Ticket, assigneeId: string | null, reason?: string): Observable<Ticket> {
    return this.api.assign(ticket.id, assigneeId, reason).pipe(tap((t) => {
      this.bump();
      if (t.assigneeId) this.announceAssignment(t);
    }));
  }

  bulk(ids: readonly string[], op: BulkOperation): Observable<BulkResult> {
    return this.api.bulk(ids, op).pipe(tap(() => this.bump()));
  }

  remove(id: string, reason: string): Observable<void> { return this.api.remove(id, reason).pipe(tap(() => this.bump())); }
  merge(sourceId: string, targetId: string): Observable<Ticket> { return this.api.merge(sourceId, targetId).pipe(tap(() => this.bump())); }

  addComment(ticket: Ticket, comment: NewComment): Observable<TicketComment> {
    return this.api.addComment(ticket.id, comment).pipe(tap((c) => {
      this.bump();
      const kind = c.visibility === 'internal' ? 'Internal note' : 'Reply';
      this.notifications.emit('comment', `${kind} on ${ticket.number}`, `${c.authorName}: ${c.body.slice(0, 120)}`, ticket,
        c.fromStaff ? this.customer(ticket.customerId)?.email : this.agent(ticket.assigneeId)?.email);
      for (const m of comment.mentions) {
        const who = this.agent(m);
        if (who) this.notifications.emit('comment', `${c.authorName} mentioned ${who.name}`, `On ${ticket.number}: ${c.body.slice(0, 120)}`, ticket, who.email);
      }
    }));
  }

  upload(ticketId: string, files: readonly File[]): Observable<TicketAttachment[]> {
    return this.api.upload(ticketId, files).pipe(tap(() => this.bump()));
  }

  private announceAssignment(t: Ticket): void {
    const agent = this.agent(t.assigneeId);
    if (!agent) return;
    const you = agent.id === this.access.agentId();
    this.notifications.emit('assigned', you ? `${t.number} assigned to you` : `${t.number} assigned to ${agent.name}`, `${t.priority} · ${t.subject}`, t, agent.email);
  }

  /* ---------- saved filters (per browser until the API stores them per user) ---------- */

  saveFilter(name: string, query: Partial<TicketQuery>): SavedFilter {
    const { page: _p, pageSize: _s, ...rest } = query;
    const filter: SavedFilter = { id: uid('sf'), name: name.trim(), query: rest, createdAt: new Date().toISOString() };
    this.savedFilters.update((list) => [...list, filter]);
    this.writeSaved();
    return filter;
  }

  deleteFilter(id: string): void {
    this.savedFilters.update((list) => list.filter((f) => f.id !== id));
    this.writeSaved();
  }

  private readSaved(): SavedFilter[] {
    try {
      const raw = localStorage.getItem(SAVED_FILTERS_KEY);
      return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
    } catch {
      return [];
    }
  }

  private writeSaved(): void {
    try { localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(this.savedFilters())); } catch { /* storage blocked */ }
  }
}
