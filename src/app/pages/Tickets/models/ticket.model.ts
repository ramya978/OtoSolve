/* =====================================================================================================
   TICKETS - core domain model

   Enums are written as `const` objects plus a union type of their values. That keeps them erasable
   (isolatedModules) and lets a value double as its display label ("In Progress").
   ===================================================================================================== */

export const TicketStatus = {
  New: 'New',
  Open: 'Open',
  Assigned: 'Assigned',
  InProgress: 'In Progress',
  PendingCustomer: 'Pending Customer',
  PendingApproval: 'Pending Approval',
  OnHold: 'On Hold',
  Escalated: 'Escalated',
  Resolved: 'Resolved',
  Closed: 'Closed',
  Reopened: 'Reopened',
  Cancelled: 'Cancelled',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
export const TICKET_STATUSES: readonly TicketStatus[] = Object.values(TicketStatus);

export const TicketPriority = { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low' } as const;
export type TicketPriority = (typeof TicketPriority)[keyof typeof TicketPriority];
export const TICKET_PRIORITIES: readonly TicketPriority[] = Object.values(TicketPriority);

export const TicketCategory = {
  Technical: 'Technical',
  Billing: 'Billing',
  Account: 'Account',
  Donation: 'Donation',
  FeatureRequest: 'Feature Request',
  General: 'General',
} as const;
export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];
export const TICKET_CATEGORIES: readonly TicketCategory[] = Object.values(TicketCategory);

export const TicketType = {
  Incident: 'Incident',
  Request: 'Request',
  Question: 'Question',
  Bug: 'Bug',
  ChangeRequest: 'Change Request',
} as const;
export type TicketType = (typeof TicketType)[keyof typeof TicketType];
export const TICKET_TYPES: readonly TicketType[] = Object.values(TicketType);

export const TicketChannel = { Email: 'Email', Phone: 'Phone', Portal: 'Portal', Chat: 'Chat', WhatsApp: 'WhatsApp' } as const;
export type TicketChannel = (typeof TicketChannel)[keyof typeof TicketChannel];
export const TICKET_CHANNELS: readonly TicketChannel[] = Object.values(TicketChannel);

export const Sentiment = { Positive: 'Positive', Neutral: 'Neutral', Negative: 'Negative', Urgent: 'Urgent' } as const;
export type Sentiment = (typeof Sentiment)[keyof typeof Sentiment];

export const TicketRole = { Admin: 'Admin', Manager: 'Manager', Agent: 'Agent', Customer: 'Customer' } as const;
export type TicketRole = (typeof TicketRole)[keyof typeof TicketRole];
export const TICKET_ROLES: readonly TicketRole[] = Object.values(TicketRole);

/** Colour families every badge, chart and indicator draws from (see styles/_tokens.scss). */
export type Tone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet';

/** Coarse buckets used by dashboards and the Kanban board. */
export type StatusGroup = 'new' | 'open' | 'active' | 'waiting' | 'escalated' | 'resolved' | 'closed';

export interface StatusMeta {
  readonly tone: Tone;
  readonly group: StatusGroup;
  readonly hint: string;
}

export const STATUS_META: Readonly<Record<TicketStatus, StatusMeta>> = {
  'New': { tone: 'info', group: 'new', hint: 'Created, not yet triaged' },
  'Open': { tone: 'info', group: 'open', hint: 'Triaged and waiting for an owner' },
  'Assigned': { tone: 'primary', group: 'open', hint: 'Has an owner, work not started' },
  'In Progress': { tone: 'warning', group: 'active', hint: 'The owner is working on it' },
  'Pending Customer': { tone: 'neutral', group: 'waiting', hint: 'Waiting on the requester' },
  'Pending Approval': { tone: 'neutral', group: 'waiting', hint: 'Waiting on an internal approver' },
  'On Hold': { tone: 'neutral', group: 'waiting', hint: 'Parked deliberately' },
  'Escalated': { tone: 'danger', group: 'escalated', hint: 'Raised to L2 or a manager' },
  'Resolved': { tone: 'success', group: 'resolved', hint: 'Fix delivered, awaiting confirmation' },
  'Closed': { tone: 'neutral', group: 'closed', hint: 'Final' },
  'Reopened': { tone: 'warning', group: 'open', hint: 'Came back after Resolved or Closed' },
  'Cancelled': { tone: 'neutral', group: 'closed', hint: 'Withdrawn, duplicate or spam' },
};

export const PRIORITY_META: Readonly<Record<TicketPriority, { tone: Tone; rank: number }>> = {
  Critical: { tone: 'danger', rank: 4 },
  High: { tone: 'warning', rank: 3 },
  Medium: { tone: 'info', rank: 2 },
  Low: { tone: 'neutral', rank: 1 },
};

export const SENTIMENT_META: Readonly<Record<Sentiment, { tone: Tone; icon: string }>> = {
  Positive: { tone: 'success', icon: '☺' },
  Neutral: { tone: 'neutral', icon: '◌' },
  Negative: { tone: 'warning', icon: '☹' },
  Urgent: { tone: 'danger', icon: '!' },
};

/* ---------- people ---------- */

export interface Team {
  readonly id: string;
  readonly name: string;
}

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly email: string;
  readonly teamId: string;
  readonly role: TicketRole;
  readonly skills: readonly TicketCategory[];
  /** Open tickets this agent can comfortably carry. */
  readonly capacity: number;
  readonly available: boolean;
}

export type CustomerTier = 'Standard' | 'Premium' | 'VIP';

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly email: string;
  readonly phone: string;
  readonly organisation: string;
  readonly tier: CustomerTier;
  readonly since: string;
}

export interface TicketLookups {
  readonly agents: readonly Agent[];
  readonly teams: readonly Team[];
  readonly customers: readonly Customer[];
}

/* ---------- ticket ---------- */

export interface Ticket {
  readonly id: string;
  /** Human reference shown everywhere, e.g. TK-1042. */
  readonly number: string;
  readonly subject: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly category: TicketCategory;
  readonly type: TicketType;
  readonly channel: TicketChannel;
  readonly customerId: string;
  readonly assigneeId: string | null;
  readonly teamId: string;
  readonly watcherIds: readonly string[];
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly firstResponseAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  /** Total time spent in a paused status, excluding a pause still running. */
  readonly slaPausedMs: number;
  /** When the current pause started, or null when the clock is running. */
  readonly pausedAt: string | null;
  readonly reopenCount: number;
  /** 0 = none, 1 = L2, 2 = manager. */
  readonly escalationLevel: number;
  readonly sentiment: Sentiment;
  readonly csat: number | null;
  readonly mergedInto: string | null;
  readonly commentCount: number;
  readonly attachmentCount: number;
  /** Optimistic-concurrency token: an update must send the version it read. */
  readonly version: number;
}

/** Fields a person fills in on the create and edit forms. */
export interface TicketDraft {
  subject: string;
  description: string;
  type: TicketType;
  category: TicketCategory;
  priority: TicketPriority;
  channel: TicketChannel;
  customerId: string;
  assigneeId: string | null;
  teamId: string;
  tags: string[];
  watcherIds: string[];
}

export interface TransitionRequest {
  readonly to: TicketStatus;
  readonly reason?: string;
  readonly resolution?: string;
  readonly assigneeId?: string;
  readonly approverId?: string;
}

export type BulkOperation =
  | { readonly kind: 'assign'; readonly assigneeId: string | null }
  | { readonly kind: 'status'; readonly to: TicketStatus; readonly reason?: string; readonly resolution?: string }
  | { readonly kind: 'priority'; readonly priority: TicketPriority }
  | { readonly kind: 'delete' };

export interface BulkResult {
  readonly succeeded: readonly string[];
  readonly failed: readonly { readonly id: string; readonly number: string; readonly reason: string }[];
}

/* ---------- history (audit trail) ---------- */

export type HistoryKind =
  | 'created' | 'status' | 'assignment' | 'priority' | 'field' | 'comment' | 'note'
  | 'attachment' | 'sla' | 'escalation' | 'merge' | 'watcher';

export interface TicketHistoryEntry {
  readonly id: string;
  readonly ticketId: string;
  readonly at: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly kind: HistoryKind;
  readonly field?: string;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly note?: string;
}

/* ---------- list queries ---------- */

export type QuickView = 'all' | 'mine' | 'unassigned' | 'due-today' | 'breached' | 'escalated' | 'waiting';

export type SortField = 'number' | 'subject' | 'customer' | 'priority' | 'status' | 'assignee' | 'category' | 'sla' | 'createdAt' | 'updatedAt';

export interface SortSpec {
  readonly field: SortField;
  readonly dir: 'asc' | 'desc';
}

export interface TicketQuery {
  readonly search: string;
  readonly view: QuickView;
  readonly statuses: readonly TicketStatus[];
  readonly priorities: readonly TicketPriority[];
  readonly categories: readonly TicketCategory[];
  /** Agent ids; the special value 'unassigned' matches tickets without an owner. */
  readonly assigneeIds: readonly string[];
  readonly slaStates: readonly ('on-track' | 'warning' | 'breached' | 'paused')[];
  readonly customerId: string | null;
  readonly createdFrom: string | null;
  readonly createdTo: string | null;
  readonly sort: readonly SortSpec[];
  readonly page: number;
  readonly pageSize: number;
}

export const EMPTY_QUERY: TicketQuery = {
  search: '',
  view: 'all',
  statuses: [],
  priorities: [],
  categories: [],
  assigneeIds: [],
  slaStates: [],
  customerId: null,
  createdFrom: null,
  createdTo: null,
  sort: [{ field: 'updatedAt', dir: 'desc' }],
  page: 1,
  pageSize: 25,
};

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface SavedFilter {
  readonly id: string;
  readonly name: string;
  readonly query: Partial<TicketQuery>;
  readonly createdAt: string;
}

/** Everything the details page shows, fetched in one call. */
export interface TicketBundle {
  readonly ticket: Ticket;
  readonly comments: readonly import('./comment.model').TicketComment[];
  readonly attachments: readonly import('./attachment.model').TicketAttachment[];
  readonly history: readonly TicketHistoryEntry[];
}

/** A knowledge-base article (used by suggestions and customer self-service). */
export interface KbArticle {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly category: TicketCategory;
  readonly keywords: readonly string[];
  readonly views: number;
}
