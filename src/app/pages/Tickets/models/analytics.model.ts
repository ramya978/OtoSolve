import { Tone } from './ticket.model';
import { SlaSummary } from './sla.model';

export type PeriodKey = '7d' | '30d' | '90d' | '180d' | '365d';

export const PERIODS: readonly { key: PeriodKey; label: string; days: number }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: 'Quarter', days: 90 },
  { key: '180d', label: '6 months', days: 180 },
  { key: '365d', label: 'Year', days: 365 },
];

export interface CountByKey {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
}

export interface TrendSeries {
  readonly labels: readonly string[];
  readonly series: readonly { readonly name: string; readonly tone: Tone; readonly values: readonly number[] }[];
}

export interface AgentPerformance {
  readonly agentId: string;
  readonly name: string;
  readonly initials: string;
  readonly team: string;
  readonly open: number;
  readonly capacity: number;
  readonly assigned: number;
  readonly resolved: number;
  readonly avgFirstResponseMins: number | null;
  readonly avgResolutionMins: number | null;
  readonly slaMetPct: number | null;
  readonly csat: number | null;
}

/** Everything the dashboard and analytics screens draw, for one period. */
export interface TicketStats {
  readonly periodDays: number;
  readonly generatedAt: string;
  readonly totals: {
    readonly total: number;
    /** New, Open or Reopened: nobody is working on it yet. */
    readonly open: number;
    readonly assigned: number;
    readonly inProgress: number;
    readonly resolved: number;
    readonly closed: number;
    readonly escalated: number;
    readonly overdue: number;
    readonly slaBreaches: number;
    readonly avgResolutionMins: number | null;
    readonly csat: number | null;
  };
  /** The same totals for the previous period of equal length, for change indicators. */
  readonly previous: { readonly total: number; readonly resolved: number; readonly avgResolutionMins: number | null; readonly csat: number | null };
  readonly byStatus: readonly CountByKey[];
  readonly byPriority: readonly CountByKey[];
  readonly byCategory: readonly CountByKey[];
  readonly byChannel: readonly CountByKey[];
  readonly monthlyTrend: TrendSeries;
  readonly dailyTrend: TrendSeries;
  readonly resolutionBuckets: readonly CountByKey[];
  readonly avgResolutionByCategory: readonly CountByKey[];
  readonly csatTrend: TrendSeries;
  readonly agents: readonly AgentPerformance[];
  readonly sla: SlaSummary;
}
