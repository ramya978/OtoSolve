import { Injectable, inject } from '@angular/core';
import { Observable, map, timer } from 'rxjs';
import { TicketApi, TicketApiError } from './ticket-api';
import { AGENTS, CUSTOMERS, DEMO_SCHEMA_VERSION, DemoDatabase, KB_ARTICLES, TEAMS, buildDemoDatabase } from './mock-seed';
import {
  BulkOperation, BulkResult, HistoryKind, KbArticle, PRIORITY_META, Page, QuickView, STATUS_META, SortSpec, TICKET_CATEGORIES,
  TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES, Ticket, TicketBundle, TicketDraft, TicketHistoryEntry, TicketLookups,
  TicketPriority, TicketQuery, TicketStatus, Tone, TransitionRequest,
} from '../models/ticket.model';
import { NewComment, TicketComment } from '../models/comment.model';
import { TicketAttachment, attachmentProblem } from '../models/attachment.model';
import { SLA_PAUSED_STATUSES, SLA_STOPPED_STATUSES, SlaPolicy, SlaSnapshot } from '../models/sla.model';
import { AgentPerformance, CountByKey, TicketStats, TrendSeries } from '../models/analytics.model';
import { ActivityItem } from '../models/dashboard.model';
import { computeSla } from '../utils/sla';
import { transitionProblem } from '../utils/workflow';
import { TicketAccessService } from '../services/ticket-access.service';
import { TICKETS_CONFIG } from '../tickets.config';

const STORE_KEY = 'otosolve.tickets.demo';
const DAY = 86_400_000;
const nowIso = () => new Date().toISOString();

/**
 * In-browser implementation of `TicketApi` for development and demos.
 *
 * It behaves like the real service would: it scopes data to the caller's role, applies the
 * workflow map and validation, refuses stale updates with 409, records an audit trail, and
 * computes stats server-side. Data is kept in localStorage so changes survive a reload.
 */
@Injectable()
export class MockTicketApi extends TicketApi {
  private readonly access = inject(TicketAccessService);
  private db: DemoDatabase = this.load();
  /** Object URLs for files uploaded in this session (they cannot survive a reload). */
  private readonly fileUrls = new Map<string, string>();

  /* ---------------- plumbing ---------------- */

  private respond<T>(work: () => T): Observable<T> {
    return timer(TICKETS_CONFIG.mockLatencyMs).pipe(map(() => work()));
  }

  private load(): DemoDatabase {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDatabase;
        if (parsed?.version === DEMO_SCHEMA_VERSION && Array.isArray(parsed.tickets)) {
          return { ...parsed, deleted: parsed.deleted ?? [] };
        }
      }
    } catch { /* corrupt or blocked storage: start from the seed */ }
    return buildDemoDatabase();
  }

  private persist(): void {
    try {
      const snapshot: DemoDatabase = { ...this.db, attachments: this.db.attachments.map((a) => ({ ...a, url: null })) };
      localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
    } catch { /* storage full or blocked: changes last until reload */ }
  }

  /** Puts the demo back to its seeded state. */
  resetDemoData(): void {
    this.db = buildDemoDatabase();
    this.fileUrls.forEach((url) => URL.revokeObjectURL(url));
    this.fileUrls.clear();
    this.persist();
  }

  private actor(): { id: string; name: string } {
    const agentId = this.access.agentId();
    if (agentId) return { id: agentId, name: AGENTS.find((a) => a.id === agentId)?.name ?? this.access.displayName() };
    const customerId = this.access.customerId();
    return { id: customerId ?? 'customer', name: CUSTOMERS.find((c) => c.id === customerId)?.name ?? this.access.displayName() };
  }

  private forbid(what: string): never {
    throw new TicketApiError(403, `Your role (${this.access.role()}) can't ${what}.`, 'PERMISSION_DENIED');
  }

  private visibleTickets(): Ticket[] {
    const role = this.access.role();
    const me = this.access.agentId();
    const customer = this.access.customerId();
    const teams = this.access.teamIds();
    const deleted = new Set(this.db.deleted);
    return this.db.tickets.filter((t) => {
      if (deleted.has(t.id)) return false;
      if (role === 'Admin') return true;
      if (role === 'Customer') return t.customerId === customer;
      return teams.includes(t.teamId) || t.assigneeId === me || (me !== null && t.watcherIds.includes(me));
    });
  }

  private find(id: string): Ticket {
    const t = this.visibleTickets().find((x) => x.id === id || x.number === id);
    if (!t) throw new TicketApiError(404, `Ticket ${id} doesn't exist or you don't have access to it.`, 'NOT_FOUND');
    return t;
  }

  private save(ticket: Ticket): Ticket {
    this.db.tickets = this.db.tickets.map((t) => (t.id === ticket.id ? ticket : t));
    return ticket;
  }

  private log(ticketId: string, kind: HistoryKind, extra: Partial<TicketHistoryEntry> = {}, at = nowIso()): void {
    const a = this.actor();
    this.db.history.push({ id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ticketId, at, actorId: a.id, actorName: a.name, kind, ...extra });
  }

  private agentName(id: string | null): string | null {
    return id ? AGENTS.find((a) => a.id === id)?.name ?? id : null;
  }

  /* ---------------- reads ---------------- */

  lookups(): Observable<TicketLookups> {
    return this.respond(() => ({ agents: AGENTS, teams: TEAMS, customers: CUSTOMERS }));
  }

  list(query: TicketQuery): Observable<Page<Ticket>> {
    return this.respond(() => {
      const now = Date.now();
      const snaps = new Map<string, SlaSnapshot>();
      const sla = (t: Ticket) => {
        let s = snaps.get(t.id);
        if (!s) { s = computeSla(t, this.db.policies, now); snaps.set(t.id, s); }
        return s;
      };
      const rows = this.visibleTickets().filter((t) => this.matches(t, query, sla, now));
      rows.sort(this.comparator(query.sort, sla));
      const pageSize = Math.max(1, Math.min(10_000, query.pageSize));
      const page = Math.max(1, query.page);
      return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
    });
  }

  private matchesView(t: Ticket, view: QuickView, sla: (t: Ticket) => SlaSnapshot, now: number): boolean {
    const group = STATUS_META[t.status].group;
    const live = group !== 'resolved' && group !== 'closed';
    switch (view) {
      case 'mine': return this.access.role() === 'Customer' ? t.customerId === this.access.customerId() : t.assigneeId === this.access.agentId();
      case 'unassigned': return t.assigneeId === null && live;
      case 'due-today': {
        const end = new Date(now); end.setHours(23, 59, 59, 999);
        return live && Date.parse(sla(t).resolution.dueAt) <= end.getTime();
      }
      case 'breached': return sla(t).light === 'red' && live;
      case 'escalated': return t.status === 'Escalated';
      case 'waiting': return SLA_PAUSED_STATUSES.includes(t.status);
      default: return true;
    }
  }

  private matches(t: Ticket, q: TicketQuery, sla: (t: Ticket) => SlaSnapshot, now: number): boolean {
    if (!this.matchesView(t, q.view, sla, now)) return false;
    if (q.statuses.length && !q.statuses.includes(t.status)) return false;
    if (q.priorities.length && !q.priorities.includes(t.priority)) return false;
    if (q.categories.length && !q.categories.includes(t.category)) return false;
    if (q.assigneeIds.length && !q.assigneeIds.includes(t.assigneeId ?? 'unassigned')) return false;
    if (q.customerId && t.customerId !== q.customerId) return false;
    if (q.createdFrom && t.createdAt < q.createdFrom) return false;
    if (q.createdTo && t.createdAt > q.createdTo + 'T23:59:59.999Z') return false;
    if (q.slaStates.length) {
      const state = sla(t).headline.state;
      if (!q.slaStates.some((s) => s === state)) return false;
    }
    const term = q.search.trim().toLowerCase();
    if (term) {
      const customer = CUSTOMERS.find((c) => c.id === t.customerId);
      const hay = [t.number, t.subject, t.description, customer?.name, customer?.email, customer?.organisation, this.agentName(t.assigneeId), ...t.tags]
        .join(' ').toLowerCase();
      if (!term.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  private comparator(sort: readonly SortSpec[], sla: (t: Ticket) => SlaSnapshot): (a: Ticket, b: Ticket) => number {
    const key = (t: Ticket, f: SortSpec['field']): string | number => {
      switch (f) {
        case 'number': return Number(t.number.replace(/\D/g, ''));
        case 'customer': return CUSTOMERS.find((c) => c.id === t.customerId)?.name ?? '';
        case 'assignee': return this.agentName(t.assigneeId) ?? '￿';
        case 'priority': return PRIORITY_META[t.priority].rank;
        case 'status': return TICKET_STATUSES.indexOf(t.status);
        case 'sla': return SLA_STOPPED_STATUSES.includes(t.status) ? Number.MAX_SAFE_INTEGER : sla(t).headline.remainingMs;
        case 'createdAt': return Date.parse(t.createdAt);
        case 'updatedAt': return Date.parse(t.updatedAt);
        default: return String(t[f] ?? '').toLowerCase();
      }
    };
    return (a, b) => {
      for (const s of sort.length ? sort : [{ field: 'updatedAt', dir: 'desc' } as SortSpec]) {
        const ka = key(a, s.field);
        const kb = key(b, s.field);
        if (ka < kb) return s.dir === 'asc' ? -1 : 1;
        if (ka > kb) return s.dir === 'asc' ? 1 : -1;
      }
      return 0;
    };
  }

  get(id: string): Observable<TicketBundle> {
    return this.respond(() => {
      const ticket = this.find(id);
      const staff = this.access.isStaff();
      const comments = this.db.comments
        .filter((c) => c.ticketId === ticket.id && (staff || c.visibility === 'public'))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const attachments = this.db.attachments
        .filter((a) => a.ticketId === ticket.id)
        .map((a) => ({ ...a, url: this.fileUrls.get(a.id) ?? null }));
      const history = staff
        ? this.db.history.filter((h) => h.ticketId === ticket.id).sort((a, b) => b.at.localeCompare(a.at))
        : [];
      return { ticket, comments, attachments, history };
    });
  }

  knowledgeBase(): Observable<KbArticle[]> {
    return this.respond(() => [...KB_ARTICLES]);
  }

  slaPolicies(): Observable<SlaPolicy[]> {
    return this.respond(() => this.db.policies.map((p) => ({ ...p })));
  }

  /* ---------------- writes ---------------- */

  private validateDraft(d: TicketDraft): void {
    if (d.subject.trim().length < 5) throw new TicketApiError(422, 'The subject needs at least 5 characters.', 'VALIDATION_FAILED');
    if (d.subject.trim().length > 160) throw new TicketApiError(422, 'Keep the subject under 160 characters.', 'VALIDATION_FAILED');
    if (d.description.trim().length < 10) throw new TicketApiError(422, 'Describe the problem in at least 10 characters.', 'VALIDATION_FAILED');
    if (!CUSTOMERS.some((c) => c.id === d.customerId)) throw new TicketApiError(422, 'Choose the customer this ticket is for.', 'VALIDATION_FAILED');
    if (d.assigneeId && !AGENTS.some((a) => a.id === d.assigneeId)) throw new TicketApiError(422, 'The chosen assignee no longer exists.', 'VALIDATION_FAILED');
  }

  create(draft: TicketDraft): Observable<Ticket> {
    return this.respond(() => {
      if (!this.access.can('create')) this.forbid('create tickets');
      const d: TicketDraft = this.access.role() === 'Customer'
        ? { ...draft, customerId: this.access.customerId() ?? draft.customerId, assigneeId: null }
        : draft;
      this.validateDraft(d);
      if (d.assigneeId && !this.access.can('assign') && d.assigneeId !== this.access.agentId()) this.forbid('assign tickets to other people');
      const n = this.db.counter++;
      const now = nowIso();
      const customer = CUSTOMERS.find((c) => c.id === d.customerId)!;
      const ticket: Ticket = {
        id: `tk${n}`, number: `TK-${n}`, subject: d.subject.trim(), description: d.description.trim(),
        status: d.assigneeId ? 'Assigned' : 'New', priority: d.priority, category: d.category, type: d.type, channel: d.channel,
        customerId: d.customerId, assigneeId: d.assigneeId, teamId: d.teamId, watcherIds: [...d.watcherIds], tags: [...d.tags],
        createdAt: now, updatedAt: now, firstResponseAt: null, resolvedAt: null, closedAt: null, slaPausedMs: 0, pausedAt: null,
        reopenCount: 0, escalationLevel: 0, sentiment: 'Neutral', csat: null, mergedInto: null, commentCount: 1, attachmentCount: 0, version: 1,
      };
      this.db.tickets.push(ticket);
      this.db.comments.push({
        id: `cm-${n}`, ticketId: ticket.id, authorId: customer.id, authorName: customer.name, fromStaff: false,
        body: ticket.description, visibility: 'public', mentions: [], attachmentIds: [], createdAt: now,
      });
      this.log(ticket.id, 'created', { note: `Created via ${d.channel}` });
      if (d.assigneeId) this.log(ticket.id, 'assignment', { field: 'assignee', from: null, to: this.agentName(d.assigneeId) });
      this.persist();
      return ticket;
    });
  }

  update(id: string, draft: TicketDraft, version: number): Observable<Ticket> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.canEdit(t)) this.forbid(`edit ${t.number}`);
      if (t.version !== version) {
        throw new TicketApiError(409, `${t.number} was changed by someone else while you were editing. Reload to see their changes, then apply yours again.`, 'CONFLICT');
      }
      this.validateDraft(draft);
      const changes: [string, string | null, string | null][] = [];
      const cmp = (field: string, a: unknown, b: unknown, fmt = (v: unknown) => (v === null || v === undefined ? null : String(v))) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) changes.push([field, fmt(a), fmt(b)]);
      };
      cmp('subject', t.subject, draft.subject.trim());
      cmp('description', t.description, draft.description.trim(), () => '(edited)');
      cmp('type', t.type, draft.type);
      cmp('category', t.category, draft.category);
      cmp('priority', t.priority, draft.priority);
      cmp('channel', t.channel, draft.channel);
      cmp('customer', t.customerId, draft.customerId, (v) => CUSTOMERS.find((c) => c.id === v)?.name ?? null);
      cmp('team', t.teamId, draft.teamId, (v) => TEAMS.find((x) => x.id === v)?.name ?? null);
      cmp('tags', t.tags, draft.tags, (v) => (v as string[]).join(', ') || null);
      const assigneeChanged = t.assigneeId !== draft.assigneeId;
      if (assigneeChanged && !this.access.canAssign(t, draft.assigneeId)) this.forbid('assign tickets to other people');

      let status = t.status;
      if (assigneeChanged && draft.assigneeId && ['New', 'Open', 'Reopened'].includes(t.status)) status = 'Assigned';
      if (assigneeChanged && !draft.assigneeId && t.status === 'Assigned') status = 'Open';
      const next: Ticket = {
        ...t, subject: draft.subject.trim(), description: draft.description.trim(), type: draft.type, category: draft.category,
        priority: draft.priority, channel: draft.channel, customerId: draft.customerId, teamId: draft.teamId, tags: [...draft.tags],
        watcherIds: [...draft.watcherIds], assigneeId: draft.assigneeId, status, updatedAt: nowIso(), version: t.version + 1,
      };
      for (const [field, from, to] of changes) this.log(t.id, field === 'priority' ? 'priority' : 'field', { field, from, to });
      if (assigneeChanged) this.log(t.id, 'assignment', { field: 'assignee', from: this.agentName(t.assigneeId), to: this.agentName(draft.assigneeId) });
      if (status !== t.status) this.log(t.id, 'status', { field: 'status', from: t.status, to: status });
      this.save(next);
      this.persist();
      return next;
    });
  }

  setPriority(id: string, priority: TicketPriority): Observable<Ticket> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.canEdit(t)) this.forbid(`change the priority of ${t.number}`);
      if (t.priority === priority) return t;
      this.log(t.id, 'priority', { field: 'priority', from: t.priority, to: priority });
      const next = this.save({ ...t, priority, updatedAt: nowIso(), version: t.version + 1 });
      this.persist();
      return next;
    });
  }

  setCategory(id: string, category: Ticket['category']): Observable<Ticket> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.canEdit(t)) this.forbid(`change the category of ${t.number}`);
      if (t.category === category) return t;
      this.log(t.id, 'field', { field: 'category', from: t.category, to: category });
      const next = this.save({ ...t, category, updatedAt: nowIso(), version: t.version + 1 });
      this.persist();
      return next;
    });
  }

  setWatching(id: string, watching: boolean): Observable<Ticket> {
    return this.respond(() => {
      const t = this.find(id);
      const me = this.access.agentId();
      if (!me) this.forbid('watch tickets');
      const has = t.watcherIds.includes(me);
      if (has === watching) return t;
      const watcherIds = watching ? [...t.watcherIds, me] : t.watcherIds.filter((w) => w !== me);
      this.log(t.id, 'watcher', { note: watching ? 'Started watching' : 'Stopped watching' });
      const next = this.save({ ...t, watcherIds, version: t.version + 1 });
      this.persist();
      return next;
    });
  }

  /** Moves a ticket to a new status, keeping SLA pause bookkeeping and timestamps right. */
  private applyTransition(t: Ticket, req: TransitionRequest): Ticket {
    const now = Date.now();
    const at = new Date(now).toISOString();
    const wasPaused = SLA_PAUSED_STATUSES.includes(t.status);
    const willPause = SLA_PAUSED_STATUSES.includes(req.to);
    let slaPausedMs = t.slaPausedMs;
    let pausedAt = t.pausedAt;
    if (wasPaused && !willPause && pausedAt) { slaPausedMs += Math.max(0, now - Date.parse(pausedAt)); pausedAt = null; }
    if (!wasPaused && willPause) pausedAt = at;

    let next: Ticket = { ...t, status: req.to, slaPausedMs, pausedAt, updatedAt: at, version: t.version + 1 };
    if (req.assigneeId && req.assigneeId !== t.assigneeId) {
      next = { ...next, assigneeId: req.assigneeId };
      this.log(t.id, 'assignment', { field: 'assignee', from: this.agentName(t.assigneeId), to: this.agentName(req.assigneeId) });
    }
    switch (req.to) {
      case 'Resolved': next = { ...next, resolvedAt: at, firstResponseAt: t.firstResponseAt ?? at }; break;
      case 'Closed': next = { ...next, closedAt: at, resolvedAt: t.resolvedAt ?? at }; break;
      case 'Cancelled': next = { ...next, closedAt: at }; break;
      case 'Reopened': next = { ...next, reopenCount: t.reopenCount + 1, resolvedAt: null, closedAt: null }; break;
      case 'Escalated': {
        const bump: TicketPriority = PRIORITY_META[t.priority].rank < PRIORITY_META.High.rank ? 'High' : t.priority;
        next = { ...next, escalationLevel: Math.min(2, t.escalationLevel + 1), priority: bump };
        if (bump !== t.priority) this.log(t.id, 'priority', { field: 'priority', from: t.priority, to: bump, note: 'Raised on escalation' });
        break;
      }
    }
    const note = req.resolution ?? req.reason
      ?? (req.approverId ? `Approver: ${this.agentName(req.approverId)}` : undefined);
    this.log(t.id, req.to === 'Escalated' ? 'escalation' : 'status', {
      field: 'status', from: t.status, to: req.to,
      note: [note, req.approverId && req.reason ? `Approver: ${this.agentName(req.approverId)}` : null, willPause && !wasPaused ? 'SLA clock paused' : null, wasPaused && !willPause ? 'SLA clock resumed' : null]
        .filter(Boolean).join(' · ') || undefined,
    }, at);
    if (req.to === 'Resolved' && req.resolution) {
      const a = this.actor();
      this.db.comments.push({ id: `cm-${now.toString(36)}`, ticketId: t.id, authorId: a.id, authorName: a.name, fromStaff: true, body: `Resolved: ${req.resolution.trim()}`, visibility: 'public', mentions: [], attachmentIds: [], createdAt: at });
      next = { ...next, commentCount: next.commentCount + 1 };
    }
    return this.save(next);
  }

  transition(id: string, request: TransitionRequest): Observable<Ticket> {
    return this.respond(() => {
      const t = this.find(id);
      // Workflow first: "a New ticket can't be closed" tells the person more than "your role can't".
      const problem = transitionProblem(t, request);
      if (problem) throw new TicketApiError(422, problem, 'INVALID_TRANSITION');
      if (!this.access.canTransition(t, request.to)) this.forbid(`move ${t.number} from ${t.status} to ${request.to}`);
      if (request.assigneeId) {
        const agent = AGENTS.find((a) => a.id === request.assigneeId);
        if (!agent) throw new TicketApiError(422, 'The chosen assignee no longer exists.', 'VALIDATION_FAILED');
        if (!this.access.canAssign(t, request.assigneeId)) this.forbid('assign tickets to other people');
      }
      const next = this.applyTransition(t, request);
      this.persist();
      return next;
    });
  }

  assign(id: string, assigneeId: string | null, reason?: string): Observable<Ticket> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.canAssign(t, assigneeId)) this.forbid(assigneeId === this.access.agentId() ? `take ${t.number}` : 'assign tickets to other people');
      if (SLA_STOPPED_STATUSES.includes(t.status)) throw new TicketApiError(422, `${t.number} is ${t.status}. Reopen it before assigning.`, 'INVALID_STATE');
      const agent = assigneeId ? AGENTS.find((a) => a.id === assigneeId) : null;
      if (assigneeId && !agent) throw new TicketApiError(422, 'The chosen assignee no longer exists.', 'VALIDATION_FAILED');
      if (agent && !agent.available) throw new TicketApiError(422, `${agent.name} is marked unavailable. Choose someone else or ask them to update their availability.`, 'AGENT_UNAVAILABLE');
      if (t.assigneeId === assigneeId) return t;
      let status = t.status;
      if (assigneeId && ['New', 'Open', 'Reopened'].includes(t.status)) status = 'Assigned';
      if (!assigneeId && t.status === 'Assigned') status = 'Open';
      this.log(t.id, 'assignment', { field: 'assignee', from: this.agentName(t.assigneeId), to: this.agentName(assigneeId), note: reason });
      if (status !== t.status) this.log(t.id, 'status', { field: 'status', from: t.status, to: status });
      const next = this.save({ ...t, assigneeId, status, updatedAt: nowIso(), version: t.version + 1 });
      this.persist();
      return next;
    });
  }

  remove(id: string, reason: string): Observable<void> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.can('delete')) this.forbid('delete tickets');
      this.db.deleted.push(t.id);
      this.log(t.id, 'field', { field: 'deleted', note: reason || 'Deleted' });
      this.persist();
    });
  }

  bulk(ids: readonly string[], op: BulkOperation): Observable<BulkResult> {
    return this.respond(() => {
      if (!this.access.can('bulk')) this.forbid('use bulk actions');
      const succeeded: string[] = [];
      const failed: { id: string; number: string; reason: string }[] = [];
      for (const id of ids) {
        const t = this.db.tickets.find((x) => x.id === id);
        try {
          const ticket = this.find(id);
          switch (op.kind) {
            case 'assign': {
              const agent = op.assigneeId ? AGENTS.find((a) => a.id === op.assigneeId) : null;
              if (SLA_STOPPED_STATUSES.includes(ticket.status)) throw new TicketApiError(422, `${ticket.status} tickets can't be reassigned`);
              if (agent && !agent.available) throw new TicketApiError(422, `${agent.name} is unavailable`);
              let status = ticket.status;
              if (op.assigneeId && ['New', 'Open', 'Reopened'].includes(status)) status = 'Assigned';
              if (!op.assigneeId && status === 'Assigned') status = 'Open';
              this.log(ticket.id, 'assignment', { field: 'assignee', from: this.agentName(ticket.assigneeId), to: this.agentName(op.assigneeId), note: 'Bulk update' });
              this.save({ ...ticket, assigneeId: op.assigneeId, status, updatedAt: nowIso(), version: ticket.version + 1 });
              break;
            }
            case 'status': {
              const req: TransitionRequest = { to: op.to, reason: op.reason, resolution: op.resolution };
              if (!this.access.canTransition(ticket, op.to)) throw new TicketApiError(403, `not allowed from ${ticket.status}`);
              const problem = transitionProblem(ticket, req);
              if (problem) throw new TicketApiError(422, problem);
              this.applyTransition(ticket, req);
              break;
            }
            case 'priority':
              if (ticket.priority !== op.priority) {
                this.log(ticket.id, 'priority', { field: 'priority', from: ticket.priority, to: op.priority, note: 'Bulk update' });
                this.save({ ...ticket, priority: op.priority, updatedAt: nowIso(), version: ticket.version + 1 });
              }
              break;
            case 'delete':
              if (!this.access.can('delete')) throw new TicketApiError(403, 'deleting needs the Admin role');
              this.db.deleted.push(ticket.id);
              this.log(ticket.id, 'field', { field: 'deleted', note: 'Bulk delete' });
              break;
          }
          succeeded.push(id);
        } catch (e) {
          failed.push({ id, number: t?.number ?? id, reason: e instanceof Error ? e.message : 'failed' });
        }
      }
      this.persist();
      return { succeeded, failed };
    });
  }

  merge(sourceId: string, targetId: string): Observable<Ticket> {
    return this.respond(() => {
      if (!this.access.can('merge')) this.forbid('merge tickets');
      const source = this.find(sourceId);
      const target = this.find(targetId);
      if (source.id === target.id) throw new TicketApiError(422, 'Choose a different ticket to merge into.', 'VALIDATION_FAILED');
      for (const t of [source, target]) {
        if (['Closed', 'Cancelled'].includes(t.status)) throw new TicketApiError(422, `${t.number} is ${t.status} and can't be merged.`, 'INVALID_STATE');
      }
      const at = nowIso();
      const moved = this.db.comments.filter((c) => c.ticketId === source.id).length;
      this.db.comments = this.db.comments.map((c) => (c.ticketId === source.id ? { ...c, ticketId: target.id } : c));
      this.db.attachments = this.db.attachments.map((a) => (a.ticketId === source.id ? { ...a, ticketId: target.id } : a));
      const watchers = Array.from(new Set([...target.watcherIds, ...source.watcherIds]));
      this.save({ ...source, status: 'Cancelled', mergedInto: target.number, closedAt: at, updatedAt: at, commentCount: 0, attachmentCount: 0, version: source.version + 1 });
      const next = this.save({
        ...target, watcherIds: watchers, commentCount: target.commentCount + moved, attachmentCount: target.attachmentCount + source.attachmentCount,
        updatedAt: at, version: target.version + 1,
      });
      this.log(source.id, 'merge', { field: 'status', from: source.status, to: 'Cancelled', note: `Merged into ${target.number}` }, at);
      this.log(target.id, 'merge', { note: `${source.number} merged in (${moved} messages moved)` }, at);
      this.persist();
      return next;
    });
  }

  addComment(id: string, comment: NewComment): Observable<TicketComment> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.can('comment')) this.forbid('comment');
      if (comment.visibility === 'internal' && !this.access.can('note.internal')) this.forbid('add internal notes');
      const body = comment.body.trim();
      if (!body) throw new TicketApiError(422, 'Write a message before sending.', 'VALIDATION_FAILED');
      if (body.length > 10_000) throw new TicketApiError(422, 'Messages are limited to 10,000 characters.', 'VALIDATION_FAILED');
      const a = this.actor();
      const staff = this.access.isStaff();
      const at = nowIso();
      const created: TicketComment = {
        id: `cm-${Date.now().toString(36)}`, ticketId: t.id, authorId: a.id, authorName: a.name, fromStaff: staff, body,
        visibility: staff ? comment.visibility : 'public', mentions: [...comment.mentions], attachmentIds: [...comment.attachmentIds], createdAt: at,
      };
      this.db.comments.push(created);
      let next: Ticket = { ...t, commentCount: t.commentCount + 1, updatedAt: at, version: t.version + 1 };
      if (staff && created.visibility === 'public' && !t.firstResponseAt) next = { ...next, firstResponseAt: at };
      this.save(next);
      this.log(t.id, created.visibility === 'internal' ? 'note' : 'comment', {
        note: comment.mentions.length ? `Mentioned ${comment.mentions.map((m) => this.agentName(m)).join(', ')}` : undefined,
      }, at);
      // A reply from the customer while we wait on them puts the ticket back to work.
      if (!staff && t.status === 'Pending Customer') this.applyTransition(next, { to: 'In Progress', reason: 'Customer replied' });
      this.persist();
      return created;
    });
  }

  upload(id: string, files: readonly File[]): Observable<TicketAttachment[]> {
    return this.respond(() => {
      const t = this.find(id);
      if (!this.access.can('comment')) this.forbid('attach files');
      const problems = files.map((f) => attachmentProblem(f)).filter((p): p is string => !!p);
      if (problems.length) throw new TicketApiError(422, problems.join(' '), 'VALIDATION_FAILED');
      const a = this.actor();
      const at = nowIso();
      const added = files.map((f, i): TicketAttachment => {
        const attId = `at-${Date.now().toString(36)}-${i}`;
        const url = URL.createObjectURL(f);
        this.fileUrls.set(attId, url);
        return { id: attId, ticketId: t.id, name: f.name, size: f.size, mime: f.type || 'application/octet-stream', uploadedBy: a.name, uploadedAt: at, url };
      });
      this.db.attachments.push(...added);
      this.save({ ...t, attachmentCount: t.attachmentCount + added.length, updatedAt: at, version: t.version + 1 });
      this.log(t.id, 'attachment', { note: added.map((x) => x.name).join(', ') }, at);
      this.persist();
      return added;
    });
  }

  saveSlaPolicies(policies: readonly SlaPolicy[]): Observable<SlaPolicy[]> {
    return this.respond(() => {
      if (!this.access.can('sla.manage')) this.forbid('change SLA targets');
      for (const p of policies) {
        if (!(p.firstResponseMins > 0 && p.resolutionMins > 0)) throw new TicketApiError(422, `${p.priority}: targets must be greater than zero.`, 'VALIDATION_FAILED');
        if (p.firstResponseMins > p.resolutionMins) throw new TicketApiError(422, `${p.priority}: the first-response target can't be longer than the resolution target.`, 'VALIDATION_FAILED');
      }
      this.db.policies = policies.map((p) => ({ ...p }));
      this.persist();
      return this.db.policies.map((p) => ({ ...p }));
    });
  }

  /* ---------------- aggregates (what the server's stats endpoint computes) ---------------- */

  activity(limit: number): Observable<ActivityItem[]> {
    return this.respond(() => {
      const visible = new Map(this.visibleTickets().map((t) => [t.id, t]));
      const toneFor: Record<HistoryKind, Tone> = {
        created: 'info', status: 'primary', assignment: 'violet', priority: 'warning', field: 'neutral', comment: 'info',
        note: 'neutral', attachment: 'neutral', sla: 'danger', escalation: 'danger', merge: 'violet', watcher: 'neutral',
      };
      return this.db.history
        .filter((h) => visible.has(h.ticketId) && (this.access.isStaff() || h.kind !== 'note'))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map((h): ActivityItem => {
          const t = visible.get(h.ticketId)!;
          const text = (() => {
            switch (h.kind) {
              case 'created': return `opened ${t.number}`;
              case 'status': return h.to === 'Resolved' ? `resolved ${t.number}` : `moved ${t.number} to ${h.to}`;
              case 'assignment': return h.to ? `assigned ${t.number} to ${h.to}` : `unassigned ${t.number}`;
              case 'priority': return `changed ${t.number} priority to ${h.to}`;
              case 'comment': return `replied on ${t.number}`;
              case 'note': return `added an internal note to ${t.number}`;
              case 'attachment': return `attached files to ${t.number}`;
              case 'escalation': return `escalated ${t.number}`;
              case 'merge': return `merged ${t.number}`;
              case 'watcher': return `${h.note?.toLowerCase() ?? 'watched'} ${t.number}`;
              default: return `updated ${t.number}`;
            }
          })();
          return { id: h.id, at: h.at, ticketId: t.id, ticketNumber: t.number, actorName: h.actorName, text, tone: toneFor[h.kind] };
        });
    });
  }

  stats(periodDays: number): Observable<TicketStats> {
    return this.respond(() => this.computeStats(periodDays));
  }

  private computeStats(periodDays: number): TicketStats {
    const now = Date.now();
    const from = now - periodDays * DAY;
    const prevFrom = now - 2 * periodDays * DAY;
    const all = this.visibleTickets();
    const policies = this.db.policies;
    const snap = new Map(all.map((t) => [t.id, computeSla(t, policies, now)]));
    const created = (t: Ticket) => Date.parse(t.createdAt);
    const inPeriod = all.filter((t) => created(t) >= from);
    const prev = all.filter((t) => created(t) >= prevFrom && created(t) < from);
    const resolvedBetween = (a: number, b: number) => all.filter((t) => t.resolvedAt && Date.parse(t.resolvedAt) >= a && Date.parse(t.resolvedAt) < b);
    const resolvedIn = resolvedBetween(from, now + 1);
    const resolvedPrev = resolvedBetween(prevFrom, from);
    const resMins = (t: Ticket) => (Date.parse(t.resolvedAt!) - created(t) - t.slaPausedMs) / 60_000;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);
    const group = (t: Ticket) => STATUS_META[t.status].group;
    const running = (t: Ticket) => !SLA_STOPPED_STATUSES.includes(t.status);
    const csatOf = (xs: Ticket[]) => avg(xs.filter((t) => t.csat !== null).map((t) => t.csat!));
    const count = <K extends string>(keys: readonly K[], fn: (t: Ticket) => K, list: Ticket[], tone?: (k: K) => Tone): CountByKey[] =>
      keys.map((k) => ({ key: k, label: k, value: list.filter((t) => fn(t) === k).length, tone: tone?.(k) }));

    const months = periodDays >= 365 ? 12 : 6;
    const monthStarts = Array.from({ length: months + 1 }, (_, i) => {
      const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - (months - 1) + i);
      return d.getTime();
    });
    const monthLabels = monthStarts.slice(0, months).map((ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short' }));
    const inRange = (iso: string | null, a: number, b: number) => !!iso && Date.parse(iso) >= a && Date.parse(iso) < b;
    const monthlyTrend: TrendSeries = {
      labels: monthLabels,
      series: [
        { name: 'Created', tone: 'primary', values: monthLabels.map((_, i) => all.filter((t) => inRange(t.createdAt, monthStarts[i], monthStarts[i + 1])).length) },
        { name: 'Resolved', tone: 'success', values: monthLabels.map((_, i) => all.filter((t) => inRange(t.resolvedAt, monthStarts[i], monthStarts[i + 1])).length) },
      ],
    };
    const days = Math.min(periodDays, 30);
    const dayStarts = Array.from({ length: days + 1 }, (_, i) => {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1) + i);
      return d.getTime();
    });
    const dayLabels = dayStarts.slice(0, days).map((ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    const dailyTrend: TrendSeries = {
      labels: dayLabels,
      series: [
        { name: 'Created', tone: 'primary', values: dayLabels.map((_, i) => all.filter((t) => inRange(t.createdAt, dayStarts[i], dayStarts[i + 1])).length) },
        { name: 'Resolved', tone: 'success', values: dayLabels.map((_, i) => all.filter((t) => inRange(t.resolvedAt, dayStarts[i], dayStarts[i + 1])).length) },
      ],
    };
    const csatTrend: TrendSeries = {
      labels: monthLabels,
      series: [{
        name: 'CSAT', tone: 'violet',
        values: monthLabels.map((_, i) => {
          const v = csatOf(all.filter((t) => inRange(t.resolvedAt, monthStarts[i], monthStarts[i + 1])));
          return v === null ? 0 : Math.round(v * 10) / 10;
        }),
      }],
    };

    const buckets: [string, number][] = [['Under 4h', 240], ['4–24h', 1440], ['1–3 days', 4320], ['3–7 days', 10080], ['Over 7 days', Infinity]];
    const resolutionBuckets: CountByKey[] = buckets.map(([label, max], i) => {
      const min = i === 0 ? -Infinity : buckets[i - 1][1];
      return { key: label, label, value: resolvedIn.filter((t) => resMins(t) >= min && resMins(t) < max).length, tone: (['success', 'success', 'info', 'warning', 'danger'] as Tone[])[i] };
    });
    const avgResolutionByCategory: CountByKey[] = TICKET_CATEGORIES.map((c) => {
      const v = avg(resolvedIn.filter((t) => t.category === c).map(resMins));
      return { key: c, label: c, value: v === null ? 0 : Math.round((v / 60) * 10) / 10 };
    });

    const agents: AgentPerformance[] = AGENTS.map((a) => {
      const mineIn = inPeriod.filter((t) => t.assigneeId === a.id);
      const resolvedMine = resolvedIn.filter((t) => t.assigneeId === a.id);
      const fr = mineIn.filter((t) => t.firstResponseAt).map((t) => (Date.parse(t.firstResponseAt!) - created(t)) / 60_000);
      const met = resolvedMine.filter((t) => snap.get(t.id)!.resolution.state === 'met').length;
      return {
        agentId: a.id, name: a.name, initials: a.initials, team: TEAMS.find((x) => x.id === a.teamId)?.name ?? '',
        open: all.filter((t) => t.assigneeId === a.id && running(t)).length, capacity: a.capacity,
        assigned: mineIn.length, resolved: resolvedMine.length, avgFirstResponseMins: avg(fr), avgResolutionMins: avg(resolvedMine.map(resMins)),
        slaMetPct: resolvedMine.length ? (met / resolvedMine.length) * 100 : null, csat: csatOf(resolvedMine),
      };
    }).filter((a) => a.open + a.assigned + a.resolved > 0);

    const frDone = inPeriod.filter((t) => ['met', 'missed'].includes(snap.get(t.id)!.firstResponse.state));
    const resDone = inPeriod.filter((t) => ['met', 'missed'].includes(snap.get(t.id)!.resolution.state));
    const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 100);
    const live = all.filter(running);
    const lightCount = (state: string) => live.filter((t) => snap.get(t.id)!.headline.state === state).length;

    return {
      periodDays,
      generatedAt: new Date(now).toISOString(),
      totals: {
        total: inPeriod.length,
        open: all.filter((t) => ['New', 'Open', 'Reopened'].includes(t.status)).length,
        assigned: all.filter((t) => t.status === 'Assigned').length,
        inProgress: all.filter((t) => ['active', 'waiting'].includes(group(t))).length,
        resolved: resolvedIn.length,
        closed: all.filter((t) => t.status === 'Closed' && inRange(t.closedAt, from, now + 1)).length,
        escalated: all.filter((t) => t.status === 'Escalated').length,
        overdue: live.filter((t) => snap.get(t.id)!.resolution.state === 'breached').length,
        slaBreaches: inPeriod.filter((t) => {
          const s = snap.get(t.id)!;
          return ['breached', 'missed'].includes(s.firstResponse.state) || ['breached', 'missed'].includes(s.resolution.state);
        }).length,
        avgResolutionMins: avg(resolvedIn.map(resMins)),
        csat: csatOf(resolvedIn),
      },
      previous: { total: prev.length, resolved: resolvedPrev.length, avgResolutionMins: avg(resolvedPrev.map(resMins)), csat: csatOf(resolvedPrev) },
      byStatus: count(TICKET_STATUSES, (t) => t.status, inPeriod, (s) => STATUS_META[s].tone).filter((x) => x.value > 0),
      byPriority: count(TICKET_PRIORITIES, (t) => t.priority, inPeriod, (p) => PRIORITY_META[p].tone),
      byCategory: count(TICKET_CATEGORIES, (t) => t.category, inPeriod),
      byChannel: count(TICKET_CHANNELS, (t) => t.channel, inPeriod),
      monthlyTrend,
      dailyTrend,
      resolutionBuckets,
      avgResolutionByCategory,
      csatTrend,
      agents,
      sla: {
        responseCompliance: pct(frDone.filter((t) => snap.get(t.id)!.firstResponse.state === 'met').length, frDone.length),
        resolutionCompliance: pct(resDone.filter((t) => snap.get(t.id)!.resolution.state === 'met').length, resDone.length),
        breached: lightCount('breached'),
        atRisk: lightCount('warning'),
        paused: lightCount('paused'),
        onTrack: lightCount('on-track'),
        byPriority: TICKET_PRIORITIES.map((p) => ({
          priority: p,
          met: resDone.filter((t) => t.priority === p && snap.get(t.id)!.resolution.state === 'met').length,
          missed: resDone.filter((t) => t.priority === p && snap.get(t.id)!.resolution.state === 'missed').length,
          breachedOpen: live.filter((t) => t.priority === p && snap.get(t.id)!.resolution.state === 'breached').length,
        })),
      },
    };
  }
}
