import { TicketPriority, TicketStatus } from './ticket.model';

/** Targets for one priority, in minutes of elapsed (wall-clock) time. */
export interface SlaPolicy {
  readonly priority: TicketPriority;
  readonly firstResponseMins: number;
  readonly resolutionMins: number;
}

export const DEFAULT_SLA_POLICIES: readonly SlaPolicy[] = [
  { priority: 'Critical', firstResponseMins: 60, resolutionMins: 4 * 60 },
  { priority: 'High', firstResponseMins: 4 * 60, resolutionMins: 24 * 60 },
  { priority: 'Medium', firstResponseMins: 8 * 60, resolutionMins: 3 * 24 * 60 },
  { priority: 'Low', firstResponseMins: 24 * 60, resolutionMins: 5 * 24 * 60 },
];

/**
 * on-track / warning / breached: the clock is running.
 * paused: the ticket is waiting (Pending Customer, Pending Approval, On Hold).
 * met / missed: the clock has stopped.
 */
export type SlaState = 'on-track' | 'warning' | 'breached' | 'paused' | 'met' | 'missed';

/** Traffic-light colour for a state: green on track, amber warning, red breached, grey paused. */
export type SlaLight = 'green' | 'amber' | 'red' | 'grey';

export const SLA_LIGHT: Readonly<Record<SlaState, SlaLight>> = {
  'on-track': 'green',
  met: 'green',
  warning: 'amber',
  breached: 'red',
  missed: 'red',
  paused: 'grey',
};

/** A ticket turns amber once this share of its target has elapsed. */
export const SLA_WARNING_RATIO = 0.75;

export const SLA_PAUSED_STATUSES: readonly TicketStatus[] = ['Pending Customer', 'Pending Approval', 'On Hold'];
export const SLA_STOPPED_STATUSES: readonly TicketStatus[] = ['Resolved', 'Closed', 'Cancelled'];

export interface SlaClock {
  readonly state: SlaState;
  readonly targetMs: number;
  readonly elapsedMs: number;
  /** Negative once breached. */
  readonly remainingMs: number;
  /** elapsed / target, not capped. */
  readonly ratio: number;
  readonly dueAt: string;
}

export interface SlaSnapshot {
  readonly firstResponse: SlaClock;
  readonly resolution: SlaClock;
  /** The more urgent of the two clocks: what a single badge shows. */
  readonly headline: SlaClock;
  readonly light: SlaLight;
}

export interface SlaSummary {
  readonly responseCompliance: number;
  readonly resolutionCompliance: number;
  readonly breached: number;
  readonly atRisk: number;
  readonly paused: number;
  readonly onTrack: number;
  readonly byPriority: readonly { priority: TicketPriority; met: number; missed: number; breachedOpen: number }[];
}
