import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { ApiResponse } from '../../../Shared/models/api-response.model';
import { TicketApi, TicketApiError } from './ticket-api';
import {
  BulkOperation, BulkResult, KbArticle, Page, Ticket, TicketBundle, TicketDraft, TicketLookups, TicketQuery, TransitionRequest,
} from '../models/ticket.model';
import { NewComment, TicketComment } from '../models/comment.model';
import { TicketAttachment } from '../models/attachment.model';
import { SlaPolicy } from '../models/sla.model';
import { TicketStats } from '../models/analytics.model';
import { ActivityItem } from '../models/dashboard.model';
import { TICKETS_CONFIG } from '../tickets.config';

/**
 * `TicketApi` over the OtoSolve WebAPI.
 *
 * Every endpoint returns the standard `ApiResponse<T>` envelope; `unwrap` turns a failed envelope or
 * HTTP error into a `TicketApiError` whose message the screens can show. The endpoint list matches
 * section 14.3 of the Tickets change request.
 */
@Injectable()
export class HttpTicketApi extends TicketApi {
  private readonly http = inject(HttpClient);
  private readonly base = TICKETS_CONFIG.ticketsBaseUrl;

  private unwrap<T>(source: Observable<ApiResponse<T>>): Observable<T> {
    return source.pipe(
      map((res) => {
        if (!res.success) throw new TicketApiError(422, res.message ?? 'The request was refused.', res.errorCode ?? 'ERROR');
        return res.data as T;
      }),
      catchError((err: unknown) => {
        if (err instanceof TicketApiError) return throwError(() => err);
        if (err instanceof HttpErrorResponse) {
          const body = err.error as Partial<ApiResponse> | null;
          const message = body?.message
            ?? (err.status === 0 ? 'Can\'t reach the server. Check your connection and try again.'
              : err.status === 403 ? 'You don\'t have permission to do that.'
                : err.status === 404 ? 'That ticket no longer exists.'
                  : 'The server could not complete the request.');
          return throwError(() => new TicketApiError(err.status, message, body?.errorCode ?? `HTTP_${err.status}`));
        }
        return throwError(() => err);
      }),
    );
  }

  private toParams(q: TicketQuery): HttpParams {
    let p = new HttpParams().set('page', q.page).set('pageSize', q.pageSize).set('view', q.view);
    if (q.search) p = p.set('q', q.search);
    q.statuses.forEach((s) => (p = p.append('status', s)));
    q.priorities.forEach((s) => (p = p.append('priority', s)));
    q.categories.forEach((s) => (p = p.append('category', s)));
    q.assigneeIds.forEach((s) => (p = p.append('assigneeId', s)));
    q.slaStates.forEach((s) => (p = p.append('slaState', s)));
    if (q.customerId) p = p.set('customerId', q.customerId);
    if (q.createdFrom) p = p.set('createdFrom', q.createdFrom);
    if (q.createdTo) p = p.set('createdTo', q.createdTo);
    q.sort.forEach((s) => (p = p.append('sort', `${s.field}:${s.dir}`)));
    return p;
  }

  lookups(): Observable<TicketLookups> { return this.unwrap(this.http.get<ApiResponse<TicketLookups>>(`${this.base}/lookups`)); }
  list(query: TicketQuery): Observable<Page<Ticket>> { return this.unwrap(this.http.get<ApiResponse<Page<Ticket>>>(this.base, { params: this.toParams(query) })); }
  get(id: string): Observable<TicketBundle> { return this.unwrap(this.http.get<ApiResponse<TicketBundle>>(`${this.base}/${encodeURIComponent(id)}`)); }
  create(draft: TicketDraft): Observable<Ticket> { return this.unwrap(this.http.post<ApiResponse<Ticket>>(this.base, draft)); }
  update(id: string, draft: TicketDraft, version: number): Observable<Ticket> {
    return this.unwrap(this.http.put<ApiResponse<Ticket>>(`${this.base}/${encodeURIComponent(id)}`, { ...draft, version }));
  }
  setPriority(id: string, priority: Ticket['priority']): Observable<Ticket> { return this.unwrap(this.http.patch<ApiResponse<Ticket>>(`${this.base}/${encodeURIComponent(id)}`, { priority })); }
  setCategory(id: string, category: Ticket['category']): Observable<Ticket> { return this.unwrap(this.http.patch<ApiResponse<Ticket>>(`${this.base}/${encodeURIComponent(id)}`, { category })); }
  setWatching(id: string, watching: boolean): Observable<Ticket> {
    const url = `${this.base}/${encodeURIComponent(id)}/watchers/me`;
    return this.unwrap(watching ? this.http.put<ApiResponse<Ticket>>(url, {}) : this.http.delete<ApiResponse<Ticket>>(url));
  }
  transition(id: string, request: TransitionRequest): Observable<Ticket> { return this.unwrap(this.http.post<ApiResponse<Ticket>>(`${this.base}/${encodeURIComponent(id)}/transitions`, request)); }
  assign(id: string, assigneeId: string | null, reason?: string): Observable<Ticket> { return this.unwrap(this.http.post<ApiResponse<Ticket>>(`${this.base}/${encodeURIComponent(id)}/assign`, { assigneeId, reason })); }
  remove(id: string, reason: string): Observable<void> { return this.unwrap(this.http.delete<ApiResponse<void>>(`${this.base}/${encodeURIComponent(id)}`, { body: { reason } })); }
  bulk(ids: readonly string[], operation: BulkOperation): Observable<BulkResult> { return this.unwrap(this.http.post<ApiResponse<BulkResult>>(`${this.base}/bulk`, { ids, operation })); }
  merge(sourceId: string, targetId: string): Observable<Ticket> { return this.unwrap(this.http.post<ApiResponse<Ticket>>(`${this.base}/${encodeURIComponent(sourceId)}/merge`, { targetId })); }
  addComment(id: string, comment: NewComment): Observable<TicketComment> { return this.unwrap(this.http.post<ApiResponse<TicketComment>>(`${this.base}/${encodeURIComponent(id)}/comments`, comment)); }
  upload(id: string, files: readonly File[]): Observable<TicketAttachment[]> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    return this.unwrap(this.http.post<ApiResponse<TicketAttachment[]>>(`${this.base}/${encodeURIComponent(id)}/attachments`, form));
  }
  stats(periodDays: number): Observable<TicketStats> { return this.unwrap(this.http.get<ApiResponse<TicketStats>>(`${this.base}/stats`, { params: { days: periodDays } })); }
  activity(limit: number): Observable<ActivityItem[]> { return this.unwrap(this.http.get<ApiResponse<ActivityItem[]>>(`${this.base}/activity`, { params: { limit } })); }
  slaPolicies(): Observable<SlaPolicy[]> { return this.unwrap(this.http.get<ApiResponse<SlaPolicy[]>>(`${this.base}/sla-policies`)); }
  saveSlaPolicies(policies: readonly SlaPolicy[]): Observable<SlaPolicy[]> { return this.unwrap(this.http.put<ApiResponse<SlaPolicy[]>>(`${this.base}/sla-policies`, policies)); }
  knowledgeBase(): Observable<KbArticle[]> { return this.unwrap(this.http.get<ApiResponse<KbArticle[]>>(`${this.base}/knowledge-base`)); }
}
