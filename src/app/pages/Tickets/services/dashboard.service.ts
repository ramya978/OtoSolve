import { Injectable } from '@angular/core';
import { TicketStats } from '../models/analytics.model';
import { KpiCard } from '../models/dashboard.model';
import { Tone } from '../models/ticket.model';
import { changePct } from '../utils/format';

/** One line in the dashboard's AI insights card. */
export interface DashboardInsight {
  readonly tone: Tone;
  readonly icon: string;
  readonly title: string;
  readonly text: string;
  readonly link: { readonly path: string; readonly query?: Record<string, string> } | null;
}

const SEVERITY: Readonly<Record<Tone, number>> = { danger: 0, warning: 1, info: 2, primary: 3, violet: 3, success: 4, neutral: 5 };

/** Turns stats into the dashboard tiles and insights. Pure presentation logic, no I/O. */
@Injectable()
export class DashboardService {
  /**
   * Plain-language observations from the period's numbers, most urgent first.
   * Rules for now (labelled "Rules preview" in the UI); the AI gateway can return the same shape.
   */
  insights(s: TicketStats, limit = 4): DashboardInsight[] {
    const out: DashboardInsight[] = [];
    const t = s.totals;

    // SLA breaches still open, and how many are urgent
    const urgentBreached = s.sla.byPriority.filter((p) => p.priority === 'Critical' || p.priority === 'High').reduce((n, p) => n + p.breachedOpen, 0);
    if (s.sla.breached) {
      out.push({ tone: 'danger', icon: 'alert', title: `${s.sla.breached} ticket${s.sla.breached === 1 ? ' has' : 's have'} breached SLA`,
        text: urgentBreached ? `${urgentBreached} of them are Critical or High priority. Reply or escalate these first.` : 'All are Medium or Low priority.',
        link: { path: '/app/tickets/list', query: { view: 'breached' } } });
    } else {
      out.push({ tone: 'success', icon: 'check-circle', title: 'Every running SLA clock is on track', text: `${s.sla.atRisk} ticket${s.sla.atRisk === 1 ? ' is' : 's are'} close to the target.`, link: { path: '/app/tickets/sla' } });
    }

    // someone carrying more than they can
    const over = [...s.agents].filter((a) => a.capacity > 0).sort((a, b) => b.open / b.capacity - a.open / a.capacity)[0];
    if (over && over.open / over.capacity >= 0.9) {
      const pct = Math.round((over.open / over.capacity) * 100);
      out.push({ tone: pct > 100 ? 'danger' : 'warning', icon: 'users', title: `${over.name} is at ${pct}% of capacity`,
        text: `${over.open} open tickets against a capacity of ${over.capacity}. Consider reassigning some from the board.`, link: { path: '/app/tickets/board' } });
    }

    // a category that resolves much slower than the rest
    const withData = s.avgResolutionByCategory.filter((c) => c.value > 0);
    const overall = t.avgResolutionMins ? t.avgResolutionMins / 60 : null;
    const slowest = [...withData].sort((a, b) => b.value - a.value)[0];
    if (slowest && overall && slowest.value / overall >= 1.3) {
      out.push({ tone: 'warning', icon: 'timer', title: `${slowest.label} tickets take ${(slowest.value / overall).toFixed(1)}× longer`,
        text: `${slowest.value}h on average against ${overall.toFixed(1)}h overall. A saved reply or KB article could help.`,
        link: { path: '/app/tickets/list', query: { category: slowest.key } } });
    }

    // volume moving
    const change = changePct(t.total, s.previous.total);
    if (change !== null && Math.abs(change) >= 10) {
      out.push({ tone: change > 0 ? 'info' : 'success', icon: 'trending', title: `Ticket volume ${change > 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}%`,
        text: `${t.total} created in the last ${s.periodDays} days, against ${s.previous.total} in the ${s.periodDays} days before.`, link: null });
    }

    // satisfaction dipping
    if (t.csat !== null && s.previous.csat !== null && s.previous.csat - t.csat >= 0.3) {
      out.push({ tone: 'warning', icon: 'star', title: `Satisfaction fell to ${t.csat.toFixed(1)} / 5`, text: `From ${s.previous.csat.toFixed(1)} in the previous period.`, link: { path: '/app/tickets/analytics' } });
    }

    // what most tickets are about
    const top = [...s.byCategory].sort((a, b) => b.value - a.value)[0];
    if (top && t.total) {
      out.push({ tone: 'primary', icon: 'pie', title: `Most tickets are ${top.label}`, text: `${Math.round((top.value / t.total) * 100)}% of this period's tickets.`,
        link: { path: '/app/tickets/list', query: { category: top.key } } });
    }

    return out.sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]).slice(0, limit);
  }

  kpis(s: TicketStats): KpiCard[] {
    const t = s.totals;
    const live = t.open + t.assigned + t.inProgress + t.escalated;
    const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
    const change = changePct(t.total, s.previous.total);
    const sla = Math.round(s.sla.resolutionCompliance);
    return [
      {
        key: 'total', label: 'Total tickets', value: String(t.total), tone: 'primary', icon: 'inbox',
        chip: change === null ? null : `${change > 0 ? '+' : ''}${Math.round(change)}%`,
        note: `Created in the last ${s.periodDays} days · ${s.previous.total} before`, barPct: share(t.total, Math.max(t.total, s.previous.total)), link: { view: 'all' },
      },
      {
        key: 'open', label: 'Open', value: String(t.open), tone: 'info', icon: 'circle', chip: `${share(t.open, live)}% of active`,
        note: 'New, open or reopened · nobody on it yet', barPct: share(t.open, live), link: { statuses: ['New', 'Open', 'Reopened'] },
      },
      {
        key: 'assigned', label: 'Assigned', value: String(t.assigned), tone: 'violet', icon: 'user', chip: `${share(t.assigned, live)}% of active`,
        note: 'Has an owner, work not started', barPct: share(t.assigned, live), link: { statuses: ['Assigned'] },
      },
      {
        key: 'inProgress', label: 'In progress', value: String(t.inProgress), tone: 'warning', icon: 'activity', chip: `${share(t.inProgress, live)}% of active`,
        note: 'Being worked on, or waiting on someone', barPct: share(t.inProgress, live),
        link: { statuses: ['In Progress', 'Pending Customer', 'Pending Approval', 'On Hold'] },
      },
      {
        key: 'resolved', label: 'Resolved', value: String(t.resolved), tone: 'success', icon: 'check-circle',
        chip: s.previous.resolved ? `${t.resolved >= s.previous.resolved ? '+' : ''}${Math.round(changePct(t.resolved, s.previous.resolved) ?? 0)}%` : null,
        note: `In the last ${s.periodDays} days`, barPct: share(t.resolved, Math.max(t.total, t.resolved)), link: { statuses: ['Resolved'] },
      },
      {
        key: 'closed', label: 'Closed', value: String(t.closed), tone: 'neutral', icon: 'archive', chip: null,
        note: `Confirmed and closed in the last ${s.periodDays} days`, barPct: share(t.closed, Math.max(t.total, t.closed)), link: { statuses: ['Closed'] },
      },
      {
        key: 'sla', label: 'SLA status', value: `${sla}%`, tone: sla >= 90 ? 'success' : sla >= 75 ? 'warning' : 'danger', icon: 'clock',
        chip: s.sla.breached ? `${s.sla.breached} breached` : 'None breached',
        note: `Resolved on time · ${s.sla.atRisk} at risk now`, barPct: sla, link: { view: 'breached' },
      },
    ];
  }
}
