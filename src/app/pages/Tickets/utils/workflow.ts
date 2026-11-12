import { Ticket, TicketStatus, TransitionRequest } from '../models/ticket.model';

/* =====================================================================================================
   TICKET WORKFLOW

   Main path:  New → Open → Assigned → In Progress → Pending Customer → Pending Approval → Resolved → Closed
   Side states: Reopened, Escalated, Cancelled, On Hold

   The map below is the single source of truth for the screens. The API must enforce the same map
   (the demo API imports it), so a status the UI offers is one the server will accept.
   ===================================================================================================== */

export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  'New': ['Open', 'Assigned', 'Escalated', 'Cancelled'],
  'Open': ['Assigned', 'Escalated', 'On Hold', 'Cancelled'],
  'Assigned': ['In Progress', 'Open', 'Escalated', 'On Hold', 'Cancelled'],
  'In Progress': ['Pending Customer', 'Pending Approval', 'On Hold', 'Escalated', 'Resolved'],
  'Pending Customer': ['In Progress', 'Pending Approval', 'Resolved', 'On Hold'],
  'Pending Approval': ['In Progress', 'Resolved', 'Escalated', 'Cancelled'],
  'On Hold': ['In Progress', 'Assigned', 'Cancelled'],
  'Escalated': ['In Progress', 'Assigned', 'Resolved'],
  'Resolved': ['Closed', 'Reopened'],
  'Closed': ['Reopened'],
  'Reopened': ['Assigned', 'In Progress', 'Escalated'],
  'Cancelled': [],
};

export type TransitionNeed = 'reason' | 'resolution' | 'assignee' | 'approver';

/** What a person must provide to move a ticket into a status. */
export const TRANSITION_NEEDS: Readonly<Partial<Record<TicketStatus, readonly TransitionNeed[]>>> = {
  'Assigned': ['assignee'],
  'Pending Approval': ['approver', 'reason'],
  'On Hold': ['reason'],
  'Escalated': ['reason'],
  'Resolved': ['resolution'],
  'Reopened': ['reason'],
  'Cancelled': ['reason'],
};

/** A Closed ticket can be reopened for this long; after that a new, linked ticket is the way. */
export const REOPEN_WINDOW_DAYS = 30;

/** A verb for the action that moves a ticket into a status, used on buttons. */
export const TRANSITION_LABEL: Readonly<Record<TicketStatus, string>> = {
  'New': 'Mark as new',
  'Open': 'Triage',
  'Assigned': 'Assign',
  'In Progress': 'Start work',
  'Pending Customer': 'Wait for customer',
  'Pending Approval': 'Request approval',
  'On Hold': 'Put on hold',
  'Escalated': 'Escalate',
  'Resolved': 'Resolve',
  'Closed': 'Close',
  'Reopened': 'Reopen',
  'Cancelled': 'Cancel ticket',
};

export function nextStatuses(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function needsFor(to: TicketStatus): readonly TransitionNeed[] {
  return TRANSITION_NEEDS[to] ?? [];
}

/**
 * Why a transition is not allowed, or null when it is.
 * Messages are written for the person, since the screens show them unchanged.
 */
export function transitionProblem(ticket: Ticket, request: TransitionRequest, now = Date.now()): string | null {
  const { to } = request;
  if (ticket.status === to) return `${ticket.number} is already ${to}.`;
  if (!nextStatuses(ticket.status).includes(to)) {
    const allowed = nextStatuses(ticket.status);
    return allowed.length
      ? `A ${ticket.status} ticket can't move to ${to}. It can move to ${allowed.join(', ')}.`
      : `${ticket.status} is final. Create a new ticket instead.`;
  }
  const needs = needsFor(to);
  if (needs.includes('reason') && (request.reason ?? '').trim().length < 5) {
    return `Add a reason of at least 5 characters to move ${ticket.number} to ${to}.`;
  }
  if (needs.includes('resolution') && (request.resolution ?? '').trim().length < 10) {
    return 'Describe the resolution in at least 10 characters so the customer and reports can use it.';
  }
  if (needs.includes('assignee') && !(request.assigneeId ?? ticket.assigneeId)) {
    return 'Choose who the ticket is assigned to.';
  }
  if (needs.includes('approver') && !request.approverId) {
    return 'Choose an approver.';
  }
  if (to === 'In Progress' && !ticket.assigneeId && !request.assigneeId) {
    return 'Assign the ticket before starting work on it.';
  }
  if (to === 'Reopened' && ticket.status === 'Closed' && ticket.closedAt) {
    const days = (now - Date.parse(ticket.closedAt)) / 86_400_000;
    if (days > REOPEN_WINDOW_DAYS) {
      return `${ticket.number} was closed ${Math.floor(days)} days ago. Tickets can be reopened for ${REOPEN_WINDOW_DAYS} days; create a new ticket and link it.`;
    }
  }
  return null;
}

/* ---------- Kanban columns ---------- */

export interface BoardColumn {
  readonly id: string;
  readonly title: string;
  readonly statuses: readonly TicketStatus[];
  /** The status a card dropped into this column moves to. */
  readonly dropStatus: TicketStatus;
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { id: 'new', title: 'New', statuses: ['New'], dropStatus: 'Open' },
  { id: 'open', title: 'Open', statuses: ['Open', 'Reopened'], dropStatus: 'Open' },
  { id: 'assigned', title: 'Assigned', statuses: ['Assigned'], dropStatus: 'Assigned' },
  { id: 'progress', title: 'In Progress', statuses: ['In Progress'], dropStatus: 'In Progress' },
  { id: 'waiting', title: 'Waiting', statuses: ['Pending Customer', 'Pending Approval', 'On Hold'], dropStatus: 'Pending Customer' },
  { id: 'escalated', title: 'Escalated', statuses: ['Escalated'], dropStatus: 'Escalated' },
  { id: 'resolved', title: 'Resolved', statuses: ['Resolved'], dropStatus: 'Resolved' },
  { id: 'closed', title: 'Closed', statuses: ['Closed', 'Cancelled'], dropStatus: 'Closed' },
];

export function columnFor(status: TicketStatus): BoardColumn {
  return BOARD_COLUMNS.find((c) => c.statuses.includes(status)) ?? BOARD_COLUMNS[0];
}
