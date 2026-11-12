import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { TicketService } from '../services/ticket.service';
import { TicketAccessService } from '../services/ticket-access.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { PRIORITY_META, TICKET_PRIORITIES, Ticket, TicketPriority, TicketStatus, TransitionRequest } from '../models/ticket.model';
import { errorMessage } from '../data/ticket-api';
import { BOARD_COLUMNS, BoardColumn, TRANSITION_LABEL, needsFor, nextStatuses } from '../utils/workflow';
import { TicketCard } from '../components/ticket-card';
import { TransitionDialog, TkDialog } from '../components/dialogs';
import { Skeleton, EmptyState } from '../components/feedback';
import { TkIcon } from '../components/icon';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

const COLUMN_TONE: Readonly<Record<string, string>> = {
  new: 'info', open: 'info', assigned: 'primary', progress: 'warning', waiting: 'neutral', escalated: 'danger', resolved: 'success', closed: 'neutral',
};
/** Work-in-progress limits: the column header turns amber above these. */
const WIP_LIMIT: Readonly<Record<string, number>> = { progress: 15, escalated: 6, waiting: 12 };
const CLOSED_DAYS = 14;

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [PageHeader, CdkDropListGroup, CdkDropList, CdkDrag, TicketCard, TransitionDialog, TkDialog, Skeleton, EmptyState, TkIcon],
  templateUrl: './kanban-board.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KanbanBoard {
  protected readonly tickets = inject(TicketService);
  protected readonly access = inject(TicketAccessService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly search = signal('');
  protected readonly owner = signal<'all' | 'mine' | 'unassigned'>('all');
  protected readonly priority = signal<TicketPriority | 'all'>('all');
  protected readonly showOldClosed = signal(false);
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly busyId = signal<string | null>(null);
  protected readonly pending = signal<{ ticket: Ticket; to: TicketStatus } | null>(null);
  protected readonly moving = signal<Ticket | null>(null);
  protected readonly priorities = TICKET_PRIORITIES;

  protected readonly data = rxResource({
    params: () => ({ rev: this.tickets.revision(), role: this.access.role() }),
    stream: () => this.tickets.all({ sort: [{ field: 'priority', dir: 'desc' }, { field: 'updatedAt', dir: 'desc' }] }),
  });

  private readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const me = this.access.agentId();
    const cutoff = Date.now() - CLOSED_DAYS * 86_400_000;
    return (this.data.value() ?? []).filter((t) => {
      if (!this.showOldClosed() && (t.status === 'Closed' || t.status === 'Cancelled') && Date.parse(t.updatedAt) < cutoff) return false;
      if (this.owner() === 'mine' && t.assigneeId !== me) return false;
      if (this.owner() === 'unassigned' && t.assigneeId) return false;
      if (this.priority() !== 'all' && t.priority !== this.priority()) return false;
      if (term) {
        const c = this.tickets.customer(t.customerId);
        if (!`${t.number} ${t.subject} ${c?.name ?? ''} ${c?.organisation ?? ''}`.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  });

  protected readonly columns = computed(() => BOARD_COLUMNS.map((col) => {
    const cards = this.filtered().filter((t) => col.statuses.includes(t.status));
    const limit = WIP_LIMIT[col.id];
    return { col, cards, tone: COLUMN_TONE[col.id], limit, over: !!limit && cards.length > limit };
  }));
  protected readonly listIds = BOARD_COLUMNS.map((c) => `col-${c.id}`);
  protected readonly loads = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.data.value() ?? []) if (t.assigneeId && !['Resolved', 'Closed', 'Cancelled'].includes(t.status)) m.set(t.assigneeId, (m.get(t.assigneeId) ?? 0) + 1);
    return m;
  });
  protected readonly loadError = computed(() => (this.data.error() ? errorMessage(this.data.error()) : null));

  protected customerName(t: Ticket): string { return this.tickets.customer(t.customerId)?.name ?? ''; }
  protected trackId(_: number, t: Ticket): string { return t.id; }

  /** The first status in the target column this person may move the ticket to. */
  private targetStatus(t: Ticket, col: BoardColumn): TicketStatus | null {
    const candidates = [col.dropStatus, ...col.statuses.filter((s) => s !== col.dropStatus), ...(col.id === 'open' ? (['Reopened'] as TicketStatus[]) : [])];
    return candidates.find((s) => this.access.canTransition(t, s)) ?? null;
  }

  protected canEnter = (drag: CdkDrag<Ticket>, drop: CdkDropList<BoardColumn>): boolean => {
    const t = drag.data;
    return drop.data.statuses.includes(t.status) || this.targetStatus(t, drop.data) !== null;
  };

  protected dropped(e: CdkDragDrop<BoardColumn, BoardColumn, Ticket>): void {
    if (e.container === e.previousContainer) return;
    this.moveTo(e.item.data, e.container.data);
  }

  private moveTo(t: Ticket, col: BoardColumn): void {
    const to = this.targetStatus(t, col);
    if (!to) {
      const allowed = nextStatuses(t.status);
      this.toast.show(`${t.number} can't move to ${col.title}`, allowed.length ? `From ${t.status} it can go to ${allowed.join(', ')}.` : `${t.status} is final.`, 'warning', 5000);
      return;
    }
    const needs = needsFor(to).filter((n) => !(n === 'assignee' && t.assigneeId));
    if (needs.length) this.pending.set({ ticket: t, to });
    else this.apply(t, { to });
  }

  protected apply(t: Ticket, req: TransitionRequest): void {
    this.busyId.set(t.id);
    this.tickets.transition(t, req).subscribe({
      next: () => { this.busyId.set(null); this.pending.set(null); this.moving.set(null); },
      error: (err) => { this.busyId.set(null); this.toast.show(`Couldn't move ${t.number}`, errorMessage(err), 'error', 6000); },
    });
  }

  protected assign(t: Ticket, agentId: string | null): void {
    this.busyId.set(t.id);
    this.tickets.assign(t, agentId).subscribe({
      next: () => this.busyId.set(null),
      error: (err) => { this.busyId.set(null); this.toast.show('Assignment failed', errorMessage(err), 'error'); },
    });
  }

  protected setPriority(t: Ticket, p: TicketPriority): void {
    this.busyId.set(t.id);
    this.tickets.setPriority(t.id, p).subscribe({
      next: () => { this.busyId.set(null); this.toast.show('Priority updated', `${t.number} is now ${p}.`, 'success', 2000); },
      error: (err) => { this.busyId.set(null); this.toast.show('Priority not changed', errorMessage(err), 'error'); },
    });
  }

  /** Keyboard alternative to dragging: M on a focused card. */
  protected moveOptions(t: Ticket): { col: BoardColumn; to: TicketStatus }[] {
    return BOARD_COLUMNS
      .filter((c) => !c.statuses.includes(t.status))
      .map((col) => ({ col, to: this.targetStatus(t, col) }))
      .filter((x): x is { col: BoardColumn; to: TicketStatus } => x.to !== null);
  }
  protected label(s: TicketStatus): string { return TRANSITION_LABEL[s]; }
  protected chooseMove(t: Ticket, col: BoardColumn): void { this.moving.set(null); this.moveTo(t, col); }

  protected toggleCollapse(id: string): void {
    this.collapsed.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  protected jumpTo(id: string): void {
    this.host.nativeElement.querySelector(`#col-${id}`)?.closest('.tk-col')?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  protected open(t: Ticket): void { this.router.navigate(['/app/tickets', t.id]); }
  protected goList(): void { this.router.navigate(['/app/tickets/list']); }
  protected goNew(): void { this.router.navigate(['/app/tickets/new']); }
  protected rank(p: TicketPriority): number { return PRIORITY_META[p].rank; }
}
