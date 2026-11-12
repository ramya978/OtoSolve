import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { AiService } from '../services/ai.service';
import { SlaService } from '../services/sla.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { STATUS_META, Ticket, TicketCategory, TicketPriority, TicketStatus, TransitionRequest } from '../models/ticket.model';
import { errorMessage } from '../data/ticket-api';
import { REOPEN_WINDOW_DAYS, TRANSITION_LABEL, needsFor } from '../utils/workflow';
import { dateTime, relativeTime } from '../utils/format';
import { downloadCsv } from '../utils/export';
import { StatusBadge } from '../components/status-badge';
import { PriorityBadge } from '../components/priority-badge';
import { SlaIndicator } from '../components/sla-indicator';
import { AssigneePicker } from '../components/assignee-picker';
import { TicketComments } from '../components/ticket-comments';
import { TicketHistory } from '../components/ticket-history';
import { TicketTimeline, TimelineItem } from '../components/ticket-timeline';
import { Attachments } from '../components/attachments';
import { AiInsights } from '../components/ai-insights';
import { TransitionDialog, ConfirmDialog, TkDialog } from '../components/dialogs';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

type DetailTab = 'conversation' | 'internal' | 'attachments' | 'timeline' | 'audit';

/** Statuses offered as buttons; the rest sit in the "More" menu. */
const PRIMARY_NEXT: readonly TicketStatus[] = ['Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened', 'Open'];

@Component({
  selector: 'app-ticket-details',
  standalone: true,
  imports: [PageHeader, 
    FormsModule, RouterLink, StatusBadge, PriorityBadge, SlaIndicator, AssigneePicker, TicketComments, TicketHistory, TicketTimeline,
    Attachments, AiInsights, TransitionDialog, ConfirmDialog, TkDialog, Skeleton, EmptyState, TkIcon,
  ],
  templateUrl: './ticket-details.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class TicketDetails {
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);
  private readonly ai = inject(AiService);
  private readonly sla = inject(SlaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Route parameter (component input binding). */
  readonly id = input.required<string>();

  protected readonly tab = signal<DetailTab>('conversation');
  protected readonly draft = signal('');
  protected readonly transitionTo = signal<TicketStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly mergeTarget = signal<string | null>(null);
  protected readonly mergeAsk = signal(false);
  protected readonly aiBusy = signal(false);
  protected mergeNumber = '';

  protected readonly bundle = rxResource({
    params: () => ({ id: this.id(), rev: this.tickets.revision(), role: this.access.role() }),
    stream: ({ params }) => this.tickets.get(params.id),
  });

  protected readonly b = computed(() => this.bundle.value() ?? null);
  protected readonly t = computed(() => this.b()?.ticket ?? null);
  protected readonly loadError = computed(() => (this.bundle.error() ? errorMessage(this.bundle.error()) : null));
  protected readonly customer = computed(() => this.tickets.customer(this.t()?.customerId));
  protected readonly assignee = computed(() => this.tickets.agent(this.t()?.assigneeId));
  protected readonly team = computed(() => this.tickets.team(this.t()?.teamId));
  protected readonly watching = computed(() => !!this.t() && !!this.access.agentId() && this.t()!.watcherIds.includes(this.access.agentId()!));
  protected readonly canEdit = computed(() => !!this.t() && this.access.canEdit(this.t()!));
  protected readonly internalCount = computed(() => this.b()?.comments.filter((c) => c.visibility === 'internal').length ?? 0);
  protected readonly publicCount = computed(() => this.b()?.comments.filter((c) => c.visibility === 'public').length ?? 0);
  protected readonly isBreached = computed(() => {
    const t = this.t();
    return !!t && this.sla.snapshot(t).light === 'red' && !['resolved', 'closed'].includes(STATUS_META[t.status].group);
  });
  protected readonly reopenDaysLeft = computed(() => {
    const t = this.t();
    if (!t || t.status !== 'Closed' || !t.closedAt) return null;
    return Math.max(0, REOPEN_WINDOW_DAYS - Math.floor((Date.now() - Date.parse(t.closedAt)) / 86_400_000));
  });

  protected readonly allowed = computed(() => (this.t() ? this.access.allowedTransitions(this.t()!) : []));
  protected readonly primaryActions = computed(() => this.allowed().filter((s) => PRIMARY_NEXT.includes(s)).slice(0, 2));
  protected readonly otherActions = computed(() => this.allowed().filter((s) => !this.primaryActions().includes(s)));

  /** Open-ticket count per agent, for the assignee picker. */
  private readonly openAll = rxResource({
    params: () => ({ rev: this.tickets.revision(), staff: this.access.isStaff() }),
    stream: ({ params }) => (params.staff ? this.tickets.all({ statuses: ['New', 'Open', 'Assigned', 'In Progress', 'Pending Customer', 'Pending Approval', 'On Hold', 'Escalated', 'Reopened'] }) : of([] as Ticket[])),
  });
  protected readonly loads = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.openAll.value() ?? []) if (t.assigneeId) m.set(t.assigneeId, (m.get(t.assigneeId) ?? 0) + 1);
    return m;
  });

  /** All of this customer's tickets: history, related and previous issues. */
  private readonly customerTickets = rxResource({
    params: () => ({ customerId: this.t()?.customerId ?? null, rev: this.tickets.revision() }),
    stream: ({ params }) => (params.customerId ? this.tickets.all({ customerId: params.customerId, sort: [{ field: 'createdAt', dir: 'desc' }] }) : of([] as Ticket[])),
  });
  protected readonly related = computed(() => (this.customerTickets.value() ?? []).filter((x) => x.id !== this.t()?.id && !['resolved', 'closed'].includes(STATUS_META[x.status].group)));
  protected readonly previous = computed(() => (this.customerTickets.value() ?? []).filter((x) => x.id !== this.t()?.id && ['resolved', 'closed'].includes(STATUS_META[x.status].group)).slice(0, 5));
  protected readonly customerTimeline = computed<TimelineItem[]>(() =>
    (this.customerTickets.value() ?? []).slice(0, 8).flatMap((x): TimelineItem[] => [
      ...(x.resolvedAt ? [{ id: `${x.id}-r`, at: x.resolvedAt, title: `${x.number} resolved`, text: x.subject, tone: 'success' as const, ticketId: x.id }] : []),
      { id: `${x.id}-c`, at: x.createdAt, title: `${x.number} opened via ${x.channel}`, text: x.subject, tone: x.id === this.t()?.id ? 'primary' as const : 'info' as const, ticketId: x.id },
    ]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10));

  /** Shares the cached AI analysis with the AI panel, for the "Suggested articles" card. */
  private readonly insights = rxResource({
    params: () => ({ b: this.b(), l: this.tickets.lookups(), staff: this.access.isStaff() }),
    stream: ({ params }) => (params.b && params.l && params.staff ? this.ai.insights(params.b, params.l) : of(null)),
  });
  protected readonly articles = computed(() => this.insights.value()?.articles ?? []);

  /** Messages and changes, newest first. */
  protected readonly activity = computed<TimelineItem[]>(() => {
    const b = this.b();
    if (!b) return [];
    const comments: TimelineItem[] = b.comments.map((c) => ({
      id: c.id, at: c.createdAt, actor: c.authorName, tone: c.visibility === 'internal' ? 'warning' : c.fromStaff ? 'primary' : 'info',
      title: c.visibility === 'internal' ? 'Internal note' : c.fromStaff ? 'Reply to customer' : 'Customer message',
      text: c.body.length > 160 ? `${c.body.slice(0, 160)}…` : c.body,
    }));
    const events: TimelineItem[] = b.history.filter((h) => h.kind !== 'comment' && h.kind !== 'note').map((h) => ({
      id: h.id, at: h.at, actor: h.actorName,
      tone: h.kind === 'escalation' ? 'danger' : h.kind === 'status' ? (h.to === 'Resolved' ? 'success' : 'primary') : h.kind === 'assignment' ? 'violet' : 'neutral',
      title: h.kind === 'created' ? 'Ticket created' : h.kind === 'status' || h.kind === 'escalation' ? `Status: ${h.from ?? '—'} → ${h.to ?? '—'}`
        : h.kind === 'assignment' ? (h.to ? `Assigned to ${h.to}` : 'Unassigned') : h.field ? `${h.field[0].toUpperCase()}${h.field.slice(1)} changed` : h.kind,
      text: h.note ?? (h.kind === 'priority' || h.kind === 'field' ? `${h.from ?? '—'} → ${h.to ?? '—'}` : undefined),
    }));
    return [...comments, ...events].sort((a, b2) => b2.at.localeCompare(a.at));
  });

  protected label(s: TicketStatus): string { return TRANSITION_LABEL[s]; }
  protected ago(iso: string | null): string { return relativeTime(iso); }
  protected when(iso: string | null): string { return dateTime(iso); }

  /* ---------- actions ---------- */

  protected startTransition(to: TicketStatus): void {
    this.moreOpen.set(false);
    const t = this.t();
    if (!t) return;
    const needs = needsFor(to);
    // Assigning to yourself needs no dialog when you are the only sensible choice.
    if (!needs.length || (needs.length === 1 && needs[0] === 'assignee' && t.assigneeId)) this.doTransition({ to });
    else this.transitionTo.set(to);
  }

  protected doTransition(req: TransitionRequest): void {
    const t = this.t();
    if (!t) return;
    this.busy.set(true);
    this.tickets.transition(t, req).subscribe({
      next: () => { this.busy.set(false); this.transitionTo.set(null); },
      error: (err) => { this.busy.set(false); this.toast.show(`Couldn't move ${t.number}`, errorMessage(err), 'error', 6000); },
    });
  }

  protected assign(agentId: string | null): void {
    const t = this.t();
    if (!t) return;
    this.tickets.assign(t, agentId).subscribe({
      next: (x) => { if (!x.assigneeId) this.toast.show('Unassigned', `${x.number} is back in the queue.`, 'info', 2500); },
      error: (err) => this.toast.show('Assignment failed', errorMessage(err), 'error', 6000),
    });
  }

  protected setPriority(p: TicketPriority): void {
    const t = this.t();
    if (t) this.tickets.setPriority(t.id, p).subscribe({
      next: () => this.toast.show('Priority updated', `${t.number} is now ${p}.`, 'success', 2500),
      error: (err) => this.toast.show('Priority not changed', errorMessage(err), 'error'),
    });
  }

  protected setCategory(c: TicketCategory): void {
    const t = this.t();
    if (t) this.tickets.setCategory(t.id, c).subscribe({
      next: () => this.toast.show('Category updated', `${t.number} is now ${c}.`, 'success', 2500),
      error: (err) => this.toast.show('Category not changed', errorMessage(err), 'error'),
    });
  }

  protected toggleWatch(): void {
    const t = this.t();
    if (t) this.tickets.setWatching(t.id, !this.watching()).subscribe({
      next: () => this.toast.show(this.watching() ? 'Watching' : 'Stopped watching', this.watching() ? 'You will be notified about every change.' : 'You will only hear about it if it is assigned to you.', 'info', 2500),
      error: (err) => this.toast.show('Not changed', errorMessage(err), 'error'),
    });
  }

  protected askMerge(targetId: string | null): void {
    this.moreOpen.set(false);
    if (targetId) this.mergeTarget.set(targetId);
    else { this.mergeNumber = ''; this.mergeAsk.set(true); }
  }

  protected resolveMergeNumber(): void {
    const n = this.mergeNumber.trim().toUpperCase();
    if (!/^TK-\d+$/.test(n)) { this.toast.show('Enter a ticket number', 'Use the form TK-1042.', 'warning'); return; }
    this.mergeAsk.set(false);
    this.mergeTarget.set(n);
  }

  protected merge(): void {
    const t = this.t();
    const target = this.mergeTarget();
    if (!t || !target) return;
    this.busy.set(true);
    this.tickets.merge(t.id, target).subscribe({
      next: (into) => {
        this.busy.set(false);
        this.mergeTarget.set(null);
        this.toast.show(`${t.number} merged`, `Its messages and files are now on ${into.number}.`, 'success');
        this.router.navigate(['/app/tickets', into.id]);
      },
      error: (err) => { this.busy.set(false); this.toast.show('Merge failed', errorMessage(err), 'error', 6000); },
    });
  }

  protected remove(reason: string): void {
    const t = this.t();
    if (!t) return;
    this.busy.set(true);
    this.tickets.remove(t.id, reason).subscribe({
      next: () => { this.busy.set(false); this.toast.show(`${t.number} deleted`, 'Recorded in the audit log.', 'success'); this.router.navigate(['/app/tickets/list']); },
      error: (err) => { this.busy.set(false); this.toast.show('Delete failed', errorMessage(err), 'error'); },
    });
  }

  protected copyLink(): void {
    this.moreOpen.set(false);
    const url = `${location.origin}/app/tickets/${this.t()?.id}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast.show('Link copied', url, 'success', 2500),
      () => this.toast.show('Copy this link', url, 'info', 8000),
    );
  }

  protected exportTicket(): void {
    this.moreOpen.set(false);
    const b = this.b();
    if (!b) return;
    const t = b.ticket;
    downloadCsv(`${t.number}-conversation`, ['When', 'Author', 'Visibility', 'Message'],
      b.comments.map((c) => [c.createdAt.replace('T', ' ').slice(0, 16), c.authorName, c.visibility, c.body]));
  }

  protected useReply(text: string): void {
    this.draft.set(text);
    this.tab.set('conversation');
    setTimeout(() => this.host.nativeElement.querySelector<HTMLTextAreaElement>('#tk-composer-text')?.focus(), 50);
  }

  protected aiDraft(): void {
    const b = this.b();
    const l = this.tickets.lookups();
    if (!b || !l) return;
    this.aiBusy.set(true);
    this.ai.smartReply(b, l, this.tickets.agent(this.access.agentId())?.name ?? this.access.displayName()).subscribe({
      next: (text) => { this.aiBusy.set(false); this.draft.set(text); },
      error: (err) => { this.aiBusy.set(false); this.toast.show('No draft', errorMessage(err), 'error'); },
    });
  }

  /** E edits, R jumps to the reply box. */
  protected onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    if (!el || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !this.t()) return;
    if (e.key === 'e' && this.canEdit()) { e.preventDefault(); this.router.navigate(['/app/tickets', this.t()!.id, 'edit']); }
    if (e.key === 'r') { e.preventDefault(); this.useReply(this.draft()); }
  }
}
