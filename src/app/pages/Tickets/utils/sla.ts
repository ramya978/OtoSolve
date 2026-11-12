import { Ticket } from '../models/ticket.model';
import {
  DEFAULT_SLA_POLICIES, SLA_LIGHT, SLA_PAUSED_STATUSES, SLA_STOPPED_STATUSES, SLA_WARNING_RATIO,
  SlaClock, SlaPolicy, SlaSnapshot, SlaState,
} from '../models/sla.model';

const MIN = 60_000;

/** The urgency order a single badge uses when it has to pick one clock to show. */
const URGENCY: Readonly<Record<SlaState, number>> = { breached: 5, warning: 4, 'on-track': 3, paused: 2, missed: 1, met: 0 };

function runningState(ratio: number): SlaState {
  if (ratio > 1) return 'breached';
  if (ratio >= SLA_WARNING_RATIO) return 'warning';
  return 'on-track';
}

function clock(state: SlaState, targetMs: number, elapsedMs: number, dueMs: number): SlaClock {
  return {
    state,
    targetMs,
    elapsedMs: Math.max(0, elapsedMs),
    remainingMs: targetMs - elapsedMs,
    ratio: targetMs > 0 ? elapsedMs / targetMs : 0,
    dueAt: new Date(dueMs).toISOString(),
  };
}

export function policyFor(ticket: Ticket, policies: readonly SlaPolicy[]): SlaPolicy {
  return policies.find((p) => p.priority === ticket.priority)
    ?? DEFAULT_SLA_POLICIES.find((p) => p.priority === ticket.priority)
    ?? DEFAULT_SLA_POLICIES[2];
}

/**
 * Both SLA clocks for a ticket at a moment in time.
 *
 * FIRST RESPONSE runs from creation to the first public staff reply and is never paused.
 * RESOLUTION runs from creation, pauses while the ticket waits (Pending Customer, Pending Approval,
 * On Hold), stops at Resolved / Closed / Cancelled and resumes on Reopen.
 *
 * In production the server owns these numbers and the screens only display them; this function is
 * what the demo API computes with, and what the screens use to count down between refreshes.
 */
export function computeSla(ticket: Ticket, policies: readonly SlaPolicy[], now = Date.now()): SlaSnapshot {
  const policy = policyFor(ticket, policies);
  const created = Date.parse(ticket.createdAt);

  // First response
  const frTarget = policy.firstResponseMins * MIN;
  let firstResponse: SlaClock;
  if (ticket.firstResponseAt) {
    const elapsed = Date.parse(ticket.firstResponseAt) - created;
    firstResponse = clock(elapsed <= frTarget ? 'met' : 'missed', frTarget, elapsed, created + frTarget);
  } else if (SLA_STOPPED_STATUSES.includes(ticket.status)) {
    const end = Date.parse(ticket.resolvedAt ?? ticket.closedAt ?? ticket.updatedAt);
    const elapsed = end - created;
    firstResponse = clock(elapsed <= frTarget ? 'met' : 'missed', frTarget, elapsed, created + frTarget);
  } else {
    const elapsed = now - created;
    firstResponse = clock(runningState(elapsed / frTarget), frTarget, elapsed, created + frTarget);
  }

  // Resolution
  const resTarget = policy.resolutionMins * MIN;
  const runningPause = ticket.pausedAt ? Math.max(0, now - Date.parse(ticket.pausedAt)) : 0;
  const paused = ticket.slaPausedMs + runningPause;
  let resolution: SlaClock;
  if (SLA_STOPPED_STATUSES.includes(ticket.status)) {
    const end = Date.parse(ticket.resolvedAt ?? ticket.closedAt ?? ticket.updatedAt);
    const elapsed = end - created - ticket.slaPausedMs;
    resolution = clock(elapsed <= resTarget ? 'met' : 'missed', resTarget, elapsed, created + resTarget + ticket.slaPausedMs);
  } else {
    const elapsed = now - created - paused;
    const isPaused = SLA_PAUSED_STATUSES.includes(ticket.status);
    const running = runningState(elapsed / resTarget);
    // A ticket that breached before it was paused stays breached: pausing does not hide a miss.
    const state: SlaState = isPaused && running !== 'breached' ? 'paused' : running;
    resolution = clock(state, resTarget, elapsed, created + resTarget + paused);
  }

  // The headline is the clock that needs attention first. A met first response gives way to resolution.
  const headline = URGENCY[firstResponse.state] > URGENCY[resolution.state] ? firstResponse : resolution;
  return { firstResponse, resolution, headline, light: SLA_LIGHT[headline.state] };
}

/** "2h 14m", "3d 4h", "45m", "under 1m". Sign is dropped; callers say "left" or "over". */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / MIN);
  if (mins < 1) return 'under 1m';
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Live countdown text with seconds, for a clock shown on its own. */
export function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const total = Math.floor(abs / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** The sentence a badge shows for a clock. */
export function describeClock(c: SlaClock): string {
  switch (c.state) {
    case 'met': return 'Met';
    case 'missed': return `Missed by ${formatDuration(-c.remainingMs)}`;
    case 'paused': return `Paused · ${formatDuration(c.remainingMs)} left`;
    case 'breached': return `Breached ${formatDuration(c.remainingMs)} ago`;
    default: return `${formatDuration(c.remainingMs)} left`;
  }
}
