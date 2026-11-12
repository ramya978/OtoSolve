import { QuickView, TicketPriority, TicketStatus, Tone } from './ticket.model';

export type KpiKey = 'total' | 'open' | 'assigned' | 'inProgress' | 'resolved' | 'closed' | 'sla';

/**
 * One dashboard tile, laid out like the KPI strip on the other OtoSolve pages:
 * icon + label, value + chip, a thin bar, and a one-line note.
 * `link` opens the ticket list already filtered to what the tile counts.
 */
export interface KpiCard {
  readonly key: KpiKey;
  readonly label: string;
  readonly value: string;
  /** Short qualifier beside the value, e.g. "32% of open" or "+12%". */
  readonly chip: string | null;
  readonly note: string;
  readonly tone: Tone;
  readonly icon: string;
  /** 0–100: how full the bar under the value is. */
  readonly barPct: number;
  readonly link: { readonly view?: QuickView; readonly statuses?: readonly TicketStatus[]; readonly priorities?: readonly TicketPriority[] } | null;
}

export interface ActivityItem {
  readonly id: string;
  readonly at: string;
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly actorName: string;
  readonly text: string;
  readonly tone: Tone;
}
