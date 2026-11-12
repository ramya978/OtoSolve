import { Observable } from 'rxjs';
import {
  BulkOperation, BulkResult, KbArticle, Page, Ticket, TicketBundle, TicketDraft, TicketLookups, TicketQuery, TransitionRequest,
} from '../models/ticket.model';
import { NewComment, TicketComment } from '../models/comment.model';
import { TicketAttachment } from '../models/attachment.model';
import { SlaPolicy } from '../models/sla.model';
import { TicketStats } from '../models/analytics.model';
import { ActivityItem } from '../models/dashboard.model';

/**
 * The contract between the Tickets screens and whatever serves ticket data.
 *
 * Two implementations exist: `MockTicketApi` (seeded demo data kept in the browser) and
 * `HttpTicketApi` (the OtoSolve WebAPI). `tickets.config.ts` picks one. Screens and services depend
 * on this abstract class only, so switching to the real API changes no screen code.
 */
export abstract class TicketApi {
  abstract lookups(): Observable<TicketLookups>;
  abstract list(query: TicketQuery): Observable<Page<Ticket>>;
  abstract get(id: string): Observable<TicketBundle>;
  abstract create(draft: TicketDraft): Observable<Ticket>;
  /** Replaces the editable fields. Fails with 409 when `version` is not the latest. */
  abstract update(id: string, draft: TicketDraft, version: number): Observable<Ticket>;
  abstract setPriority(id: string, priority: Ticket['priority']): Observable<Ticket>;
  abstract setCategory(id: string, category: Ticket['category']): Observable<Ticket>;
  abstract setWatching(id: string, watching: boolean): Observable<Ticket>;
  abstract transition(id: string, request: TransitionRequest): Observable<Ticket>;
  abstract assign(id: string, assigneeId: string | null, reason?: string): Observable<Ticket>;
  abstract remove(id: string, reason: string): Observable<void>;
  abstract bulk(ids: readonly string[], operation: BulkOperation): Observable<BulkResult>;
  abstract merge(sourceId: string, targetId: string): Observable<Ticket>;
  abstract addComment(id: string, comment: NewComment): Observable<TicketComment>;
  abstract upload(id: string, files: readonly File[]): Observable<TicketAttachment[]>;
  abstract stats(periodDays: number): Observable<TicketStats>;
  abstract activity(limit: number): Observable<ActivityItem[]>;
  abstract slaPolicies(): Observable<SlaPolicy[]>;
  abstract saveSlaPolicies(policies: readonly SlaPolicy[]): Observable<SlaPolicy[]>;
  abstract knowledgeBase(): Observable<KbArticle[]>;
}

/** An error the screens can show as is. */
export class TicketApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'ERROR',
  ) {
    super(message);
    this.name = 'TicketApiError';
  }
}

/** A sentence for any error that reaches a screen. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof TicketApiError) return error.message;
  if (error && typeof error === 'object' && 'error' in error) {
    const body = (error as { error?: { message?: string } }).error;
    if (body?.message) return body.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
