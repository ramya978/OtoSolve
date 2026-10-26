import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CW_PATHS } from '../../Shared/Campaign/cw-paths';
import { Activity, Donation, daysBetween, fmtDate, inr, todayIso } from '../../Shared/Campaign/cw.data';
import { CampaignWorkspaceStore } from '../../Shared/Campaign/cw.store';
import { PageHeader } from '../../Shared/layout/page-header/page-header';

type Tone = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'purple';
type Lifecycle = 'draft' | 'submitted' | 'scheduled' | 'active' | 'paused' | 'closing' | 'closed';

type DcIcon =
  | 'case' | 'flag' | 'money' | 'users' | 'heart' | 'calendar' | 'plus' | 'arrow' | 'search'
  | 'edit' | 'check' | 'pause' | 'play' | 'send' | 'lock' | 'archive' | 'qr' | 'page' | 'clock'
  | 'chevL' | 'chevR' | 'inbox' | 'trend' | 'list' | 'target' | 'alert' | 'gift';

const ICONS: Record<DcIcon, string> = {
  case: 'M4 8h16v12H4z M9 8V5h6v3 M4 13h16',
  flag: 'M5 21V4 M5 4h13l-3 4 3 4H5',
  money: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6.5v11 M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 2s1.1 1.8 2.5 2 2.5.7 2.5 2-1.1 2-2.5 2A2.5 2 0 0 1 9.5 15',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  search: 'M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0 M21 21l-4.35-4.35',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z M14.5 6.5l3 3',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  pause: 'M9 5v14 M15 5v14',
  play: 'M7 4v16l13-8z',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v3 M14 20h3 M20 20h1',
  page: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  clock: 'M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0 M12 6v6l4 2',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  target: 'M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0 M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0 M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  gift: 'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5 M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5'
};

/** Tabs on the active-campaigns card (every row there is an active campaign). */
type ActiveTab = 'all' | 'ending' | 'ahead' | 'behind';
const ACTIVE_TABS: { key: ActiveTab; label: string; icon: DcIcon }[] = [
  { key: 'all', label: 'All active', icon: 'list' },
  { key: 'ending', label: 'Ending in 30 days', icon: 'clock' },
  { key: 'ahead', label: 'On track', icon: 'target' },
  { key: 'behind', label: 'Behind target', icon: 'alert' }
];

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 × a power of ten. */
const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};

const LIFECYCLE: Record<Lifecycle, { label: string; tone: Tone; icon: DcIcon }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: 'edit' },
  submitted: { label: 'Submitted', tone: 'info', icon: 'send' },
  scheduled: { label: 'Scheduled', tone: 'purple', icon: 'calendar' },
  active: { label: 'Active', tone: 'success', icon: 'flag' },
  paused: { label: 'Paused', tone: 'warning', icon: 'pause' },
  closing: { label: 'Closing', tone: 'danger', icon: 'lock' },
  closed: { label: 'Closed', tone: 'primary', icon: 'archive' }
};
const ORDER: Lifecycle[] = ['draft', 'submitted', 'scheduled', 'active', 'paused', 'closing', 'closed'];

const KIND: Record<string, { label: string; icon: DcIcon; tone: Tone }> = {
  change: { label: 'Change', icon: 'edit', tone: 'info' },
  approval: { label: 'Approval', icon: 'check', tone: 'success' },
  create: { label: 'Created', icon: 'plus', tone: 'primary' },
  pause: { label: 'Paused', icon: 'pause', tone: 'warning' },
  resume: { label: 'Resumed', icon: 'play', tone: 'success' }
};

const CHANNEL_TONES: Tone[] = ['primary', 'info', 'warning', 'success', 'purple', 'danger'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 5;

/** ₹2.4Cr / ₹3.5L / ₹12K - short money for chart axes and tight spots. */
const inrShort = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${+(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
};

/**
 * Fundraising section of the dashboard: everything the campaign workspace knows
 * (campaigns, donations, tracking assets, activity), read live from CampaignWorkspaceStore.
 *
 * Dates in the campaign workspace are ISO strings ('2026-10-26'), so fmtDate / inr come from
 * cw.data (string in) - not from the payments page, whose fmtDate takes a Date.
 */
@Component({
  selector: 'app-dashboard-campaigns',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard-campaigns.html',
  styleUrls: ['./dashboard-campaigns.css']
})
export class DashboardCampaigns {
  private readonly store = inject(CampaignWorkspaceStore);
  private readonly router = inject(Router);

  protected readonly paths = CW_PATHS;
  protected readonly inr = inr;
  protected readonly inrShort = inrShort;
  protected readonly fmtDate = fmtDate;
  private readonly today = todayIso();

  /* ---------------------------------------------------------------- source data */
  protected readonly campaigns = computed(() => this.store.campaigns());

  /** Donations (re-read whenever the campaign list changes). */
  private readonly donations = computed<Donation[]>(() => {
    this.store.campaigns();
    return this.store.donations;
  });

  private readonly nameOf = computed(() => new Map(this.campaigns().map((c) => [c.code, c.name])));

  protected progress(raised: number, target: number): number {
    return target ? Math.min(100, Math.round((raised / target) * 100)) : 0;
  }

  /** "26 Oct" from an ISO date ('' / missing → '—'). */
  private shortDate(iso: string | undefined): string {
    return iso ? fmtDate(iso).split(' ').slice(0, 2).join(' ') : '—';
  }

  /* ---------------------------------------------------------------- KPI strip */
  protected readonly kpis = computed(() => {
    const list = this.campaigns();
    const active = list.filter((c) => c.lifecycle === 'active');
    const avg = active.length
      ? Math.round(active.reduce((t, c) => t + this.progress(c.raised, c.target), 0) / active.length)
      : 0;
    const raised = list.reduce((t, c) => t + c.raised, 0);
    const target = list.reduce((t, c) => t + c.target, 0);
    const owners = new Set(list.flatMap((c) => c.owners)).size;
    const donors = list.reduce((t, c) => t + c.donors, 0);
    const donationCount = list.reduce((t, c) => t + c.donations, 0);
    const scheduled = list.filter((c) => c.lifecycle === 'scheduled').sort((a, b) => a.start.localeCompare(b.start));
    const next = scheduled.find((c) => c.start >= this.today) ?? scheduled[0];
    const recentGifts = this.months().reduce((t, m) => t + m.gifts, 0);

    return [
      { key: 'total', label: 'Campaigns', icon: 'case' as DcIcon, tone: 'primary' as Tone, value: String(list.length),
        side: { value: String(owners), label: 'Owners' }, note: `${active.length} running · ${scheduled.length} scheduled` },
      { key: 'active', label: 'Active', icon: 'flag' as DcIcon, tone: 'success' as Tone, value: String(active.length),
        side: { value: `${avg}%`, label: 'Avg progress' }, note: active.length ? 'Taking donations now' : 'No campaign is running' },
      { key: 'raised', label: 'Received', icon: 'money' as DcIcon, tone: 'warning' as Tone, value: inrShort(raised),
        side: { value: `${this.progress(raised, target)}%`, label: 'Of target' }, note: `Target ${inr(target)}` },
      { key: 'donors', label: 'Donors', icon: 'users' as DcIcon, tone: 'info' as Tone, value: String(donors),
        side: { value: String(donationCount), label: 'Gifts' }, note: 'People who gave across campaigns' },
      { key: 'gifts', label: 'Donations', icon: 'heart' as DcIcon, tone: 'danger' as Tone, value: String(recentGifts),
        side: { value: inrShort(this.monthsTotal()), label: `${this.range()} months` }, note: `Gifts recorded in the last ${this.range()} months` },
      { key: 'scheduled', label: 'Scheduled', icon: 'calendar' as DcIcon, tone: 'purple' as Tone, value: String(scheduled.length),
        side: { value: this.shortDate(next?.start), label: 'Next launch' },
        note: next ? `Next: ${next.name}` : 'Nothing scheduled' }
    ];
  });

  /* ---------------------------------------------------------------- donation statistics (bars + line) */
  /** Months shown on the donation chart. */
  protected readonly ranges = [6, 12] as const;
  protected readonly range = signal<6 | 12>(6);
  protected readonly hoverMonth = signal<number | null>(null);

  protected setRange(r: 6 | 12): void {
    this.range.set(r);
    this.hoverMonth.set(null);
  }

  protected readonly months = computed(() => {
    const n = this.range();
    const [y, m] = this.today.split('-').map(Number);
    const keys = Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - n + i, 1)).toISOString().slice(0, 7));
    const list = this.donations();
    return keys.map((key, i) => {
      const inMonth = list.filter((d) => d.date.slice(0, 7) === key);
      return {
        key,
        i,
        label: MONTHS[Number(key.slice(5)) - 1],
        year: key.slice(0, 4),
        amount: inMonth.reduce((s, d) => s + d.amount, 0),
        gifts: inMonth.length,
        donors: new Set(inMonth.map((d) => d.donor)).size,
        now: i === keys.length - 1
      };
    });
  });

  protected readonly monthsTotal = computed(() => this.months().reduce((t, m) => t + m.amount, 0));
  private readonly monthsGifts = computed(() => this.months().reduce((t, m) => t + m.gifts, 0));

  /**
   * Bars = amount received (left axis), line = number of gifts (right axis).
   * Every value is a percentage of the plot so the HTML bars, the SVG line and the points line up.
   */
  protected readonly chart = computed(() => {
    const rows = this.months();
    const n = rows.length || 1;
    const maxAmt = niceMax(Math.max(0, ...rows.map((r) => r.amount)));
    const maxGifts = niceMax(Math.max(0, ...rows.map((r) => r.gifts)));
    const cols = rows.map((r) => ({
      ...r,
      x: ((r.i + 0.5) / n) * 100,
      h: r.amount ? Math.max(3, (r.amount / maxAmt) * 100) : 0,
      y: 100 - (r.gifts / maxGifts) * 100
    }));

    let line = '';
    cols.forEach((c, i) => {
      if (!i) { line = `M ${c.x} ${c.y}`; return; }
      const a = cols[i - 1];
      const mx = (a.x + c.x) / 2;
      line += ` C ${mx} ${a.y}, ${mx} ${c.y}, ${c.x} ${c.y}`;
    });
    const area = cols.length ? `${line} L ${cols[cols.length - 1].x} 100 L ${cols[0].x} 100 Z` : '';

    const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    const fractions = [1, 0.75, 0.5, 0.25, 0];
    return {
      cols,
      line,
      area,
      amtTicks: fractions.map((f) => ({ y: 100 - f * 100, label: inrShort(maxAmt * f) })),
      giftTicks: fractions.map((f) => ({ y: 100 - f * 100, label: fmt(maxGifts * f) }))
    };
  });

  protected readonly hovered = computed(() => {
    const i = this.hoverMonth();
    return i === null ? null : this.chart().cols[i] ?? null;
  });

  /** This month against last month. */
  protected readonly monthDelta = computed(() => {
    const rows = this.months();
    const now = rows[rows.length - 1]?.amount ?? 0;
    const prev = rows[rows.length - 2]?.amount ?? 0;
    if (!prev) return { pct: now ? 100 : 0, dir: now ? 'up' : 'flat', now };
    const pct = Math.round(((now - prev) / prev) * 100);
    return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', now };
  });

  /** Three figures under the chart, each with a thin meter. */
  protected readonly donationStats = computed(() => {
    const total = this.monthsTotal();
    const gifts = this.monthsGifts();
    const allRaised = this.campaigns().reduce((t, c) => t + c.raised, 0);
    const allGifts = this.donations().length;
    const inPeriod = this.donations().filter((d) => d.date.slice(0, 7) >= (this.months()[0]?.key ?? ''));
    const largest = Math.max(0, ...inPeriod.map((d) => d.amount));
    const avg = gifts ? total / gifts : 0;
    const share = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
    return [
      { label: 'Received', value: inr(total), pct: share(total, allRaised), note: `${share(total, allRaised)}% of all money raised`, tone: 'primary' as Tone, icon: 'money' as DcIcon },
      { label: 'Gifts', value: String(gifts), pct: share(gifts, allGifts), note: `${share(gifts, allGifts)}% of all gifts`, tone: 'warning' as Tone, icon: 'gift' as DcIcon },
      { label: 'Average gift', value: inr(Math.round(avg)), pct: share(avg, largest), note: largest ? `Largest gift ${inrShort(largest)}` : 'No gifts yet', tone: 'info' as Tone, icon: 'heart' as DcIcon }
    ];
  });

  /* ---------------------------------------------------------------- donations by channel */
  protected readonly channels = computed(() => {
    const list = this.donations();
    const groups = new Map<string, { count: number; amount: number }>();
    for (const d of list) {
      const g = groups.get(d.channel) ?? { count: 0, amount: 0 };
      g.count++;
      g.amount += d.amount;
      groups.set(d.channel, g);
    }
    const total = list.length;
    const gap = groups.size > 1 ? 1.2 : 0;
    let acc = 0;
    const rows = [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, g], i) => {
        const pct = total ? (g.count / total) * 100 : 0;
        const len = Math.max(pct - gap, 0);
        const row = {
          name, count: g.count, amount: g.amount, pct: Math.round(pct),
          tone: CHANNEL_TONES[i % CHANNEL_TONES.length],
          dash: `${len} ${100 - len}`, offset: String(25 - acc)
        };
        acc += pct;
        return row;
      });
    return { rows, total, amount: list.reduce((s, d) => s + d.amount, 0) };
  });

  /* ---------------------------------------------------------------- top campaigns */
  protected readonly topCampaigns = computed(() =>
    this.campaigns()
      .map((c) => ({ code: c.code, name: c.name, raised: c.raised, target: c.target, lifecycle: c.lifecycle as Lifecycle, pct: this.progress(c.raised, c.target) }))
      .sort((a, b) => b.pct - a.pct || b.raised - a.raised)
      .slice(0, 5)
  );

  /* ---------------------------------------------------------------- lifecycle breakdown */
  protected readonly lifecycle = computed(() => {
    const list = this.campaigns();
    const total = list.length;
    return ORDER.map((s) => {
      const value = list.filter((c) => c.lifecycle === s).length;
      return { key: s, ...LIFECYCLE[s], value, pct: total ? Math.round((value / total) * 100) : 0 };
    });
  });

  /* ---------------------------------------------------------------- recent activity */
  protected readonly recent = computed(() =>
    this.campaigns()
      .flatMap((c) => this.store.activityFor(c.code).map((a: Activity) => ({ ...a, campaign: c.name, code: c.code })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)
      .map((a) => ({ ...a, meta: KIND[a.kind] ?? KIND['change'] }))
  );

  protected when(at: string): string {
    const day = at.slice(0, 10);
    const time = at.slice(11, 16);
    return `${day === this.today ? 'Today' : fmtDate(day)}${time ? ' · ' + time : ''}`;
  }

  /* ---------------------------------------------------------------- ending soon */
  protected readonly endingSoon = computed(() =>
    this.campaigns()
      .filter((c) => (c.lifecycle === 'active' || c.lifecycle === 'closing') && c.end >= this.today)
      .map((c) => ({ code: c.code, name: c.name, end: c.end, left: daysBetween(this.today, c.end), pct: this.progress(c.raised, c.target) }))
      .filter((c) => c.left <= 30)
      .sort((a, b) => a.left - b.left)
      .slice(0, 4)
  );

  /* ---------------------------------------------------------------- top tracking assets */
  protected readonly topAssets = computed(() => {
    const list = [...this.store.assets()].sort((a, b) => b.received - a.received).slice(0, 4);
    const max = Math.max(1, ...list.map((a) => a.received));
    return list.map((a) => ({
      ref: a.ref, type: a.type, live: a.status === 'active', received: a.received,
      campaign: this.nameOf().get(a.campaign) ?? a.campaign, pct: Math.round((a.received / max) * 100)
    }));
  });

  /* ---------------------------------------------------------------- active campaigns card */
  protected readonly activeTabs = ACTIVE_TABS;
  protected readonly query = signal('');
  protected readonly activeTab = signal<ActiveTab>('all');
  protected readonly page = signal(1);

  /** Active campaigns only, with time left and pace (raised % against time elapsed). */
  private readonly activeRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.campaigns()
      .filter((c) => c.lifecycle === 'active')
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .map((c, i) => {
        const pct = this.progress(c.raised, c.target);
        const span = c.start && c.end ? Math.max(1, daysBetween(c.start, c.end)) : 0;
        const elapsed = span ? Math.min(100, Math.max(0, Math.round((daysBetween(c.start, this.today) / span) * 100))) : 0;
        const left = c.end ? daysBetween(this.today, c.end) : null;
        return {
          code: c.code,
          name: c.name,
          owner: c.owners[0] ?? '—',
          coOwners: Math.max(0, c.owners.length - 1),
          end: c.end,
          left,
          raised: c.raised,
          target: c.target,
          donors: c.donors,
          gifts: c.donations,
          pct,
          elapsed,
          ahead: pct >= elapsed,
          tone: CHANNEL_TONES[i % CHANNEL_TONES.length]
        };
      })
      .sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999));
  });

  private matches(tab: ActiveTab, r: { left: number | null; ahead: boolean }): boolean {
    if (tab === 'ending') return r.left !== null && r.left >= 0 && r.left <= 30;
    if (tab === 'ahead') return r.ahead;
    if (tab === 'behind') return !r.ahead;
    return true;
  }

  protected readonly tabCounts = computed(() => {
    const rows = this.activeRows();
    const out = {} as Record<ActiveTab, number>;
    for (const t of ACTIVE_TABS) out[t.key] = rows.filter((r) => this.matches(t.key, r)).length;
    return out;
  });

  protected readonly activeCount = computed(() => this.campaigns().filter((c) => c.lifecycle === 'active').length);

  protected readonly filtered = computed(() => this.activeRows().filter((r) => this.matches(this.activeTab(), r)));

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  protected readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i + 1));
  protected readonly pageRows = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });
  protected readonly rangeFrom = computed(() => (this.filtered().length ? (this.page() - 1) * PAGE_SIZE + 1 : 0));
  protected readonly rangeTo = computed(() => Math.min(this.page() * PAGE_SIZE, this.filtered().length));

  /** Tone of the time-left chip. */
  protected leftTone(left: number | null): Tone {
    if (left === null) return 'neutral';
    if (left < 0 || left <= 7) return 'danger';
    return left <= 30 ? 'warning' : 'success';
  }

  protected leftLabel(left: number | null): string {
    if (left === null) return 'No end date';
    if (left < 0) return 'Ended';
    return left === 0 ? 'Ends today' : `${left} day${left === 1 ? '' : 's'}`;
  }

  /* ---------------------------------------------------------------- actions */
  protected icon(name: DcIcon): string {
    return ICONS[name];
  }

  protected meta(s: Lifecycle) {
    return LIFECYCLE[s];
  }

  protected initials(text: string): string {
    const w = text.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
    return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '·';
  }

  protected setQuery(v: string): void {
    this.query.set(v);
    this.page.set(1);
  }

  protected setTab(t: ActiveTab): void {
    this.activeTab.set(t);
    this.page.set(1);
  }

  protected goPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  /** Row / name click → the campaign's full detail page. */
  protected openCampaign(code: string): void {
    this.store.select(code);
    void this.router.navigate([CW_PATHS.detailFor(code)]);
  }
}