import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardCampaigns } from './dashboard-campaigns';

type Tone = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

type DashIcon =
  | 'building' | 'review' | 'users' | 'login' | 'check' | 'flag' | 'pause' | 'archive' | 'shield'
  | 'calendar' | 'refresh' | 'plus' | 'arrow' | 'trophy' | 'activity' | 'heart' | 'search' | 'inbox'
  | 'chevL' | 'chevR' | 'alert' | 'x';

interface Kpi { label: string; value: string; sub: string; icon: DashIcon; tone: Tone; pct: number; }
interface Tile { label: string; value: number | string; icon: DashIcon; tone: Tone; }
interface Share { label: string; value: number; tone: Tone; icon: DashIcon; }
interface Ring { label: string; sub: string; pct: number; tone: Tone; }
interface Fact { label: string; value: string; tone: Tone; icon: DashIcon; }
interface Activity { title: string; source: string; area: string; actor: string; time: string; tone: Tone; icon: DashIcon; }
interface Attention { title: string; detail: string; tone: Tone; icon: DashIcon; route: string; }
type OrgStatus = 'Active' | 'Invited' | 'Onboarding' | 'In review' | 'Suspended';
interface OrgRow { code: string; name: string; subdomain: string; status: OrgStatus; people: number; joined: string; latest?: boolean; }
interface LargeOrg { code: string; name: string; subdomain: string; people: number; }

/** One day on the sign-ins chart (x / y are percentages of the plot). */
interface ChartPoint {
  i: number; x: number; y: number; tipTop: number;
  total: number; ok: number; failed: number;
  dateLabel: string; week: string; day: string; today: boolean; aria: string;
}

/** Line icons (24×24, stroke). */
const ICONS: Record<DashIcon, string> = {
  building: 'M4 21V5l8-3 8 3v16 M2 21h20 M8 8h1 M15 8h1 M8 12h1 M15 12h1 M10 21v-5h4v5',
  review: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  flag: 'M4 22V4 M4 4h13l-2 4 2 4H4',
  pause: 'M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0 M10 9v6 M14 9v6',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  search: 'M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0 M21 21l-4.35-4.35',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  x: 'M18 6 6 18 M6 6l12 12'
};

const STATUS_TONE: Record<OrgStatus, Tone> = {
  Active: 'success',
  Invited: 'info',
  Onboarding: 'primary',
  'In review': 'warning',
  Suspended: 'danger'
};

const PAGE_SIZE = 5;

/** Chart plot: the baseline (0) and top (max) as a percentage of the plot height. */
const PLOT_BASE = 92;
const PLOT_SPAN = 78;

/**
 * Platform dashboard - YDot content in a Vuexy-style layout, with the campaign workspace
 * (DashboardCampaigns) shown as a Fundraising section.
 *
 * The figures below are the values from the current platform screen. Replace the signals marked
 * "DATA" with your dashboard API (or set them from a service) - every card, chart and percentage
 * is computed from them, so nothing else needs to change.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DashboardCampaigns],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  /** Where the dashboard links go - adjust to your routes. */
  protected readonly routes = {
    create: '/app/platform/organisations/new',
    directory: '/app/platform/organisations',
    approvals: '/app/platform/approvals',
    audit: '/app/platform/audit'
  };

  /* ---------------------------------------------------------------- DATA */
  protected readonly userFirstName = signal('Vikram');

  /** Organisations by status. */
  protected readonly counts = signal({ onboarding: 2, inReview: 0, approved: 0, active: 2, suspended: 0, archived: 0 });

  /** People on the platform. */
  protected readonly people = signal({ total: 42, invited: 2, suspended: 0, twoStepPct: 0 });

  /** Sign-in attempts in the last 14 days. */
  protected readonly signIns = signal({ succeeded: 1, failed: 0, people: 1 });

  /** Successful sign-ins per day, oldest first (the last value is today). */
  private readonly signInSeries = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

  /** Failed sign-ins per day, same days as signInSeries. */
  private readonly failedSeries = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  protected readonly attention = signal<Attention[]>([]);

  protected readonly activity = signal<Activity[]>([
    { title: 'Sign-in succeeded', source: 'System', area: 'Security', actor: 'Vikram Anand', time: 'just now', tone: 'success', icon: 'login' }
  ]);

  private readonly largestRows = signal<LargeOrg[]>([
    { code: 'TEN002', name: 'HelpAge India', subdomain: 'helpageindia', people: 21 },
    { code: 'TEN001', name: 'Smile Foundation', subdomain: 'smilefoundation', people: 21 }
  ]);

  protected readonly mostActive = signal<{ name: string; signIns: number }[]>([]);

  protected readonly newest = signal<OrgRow[]>([
    { code: 'TEN004', name: 'Unity for Change', subdomain: 'unityforchange', status: 'Invited', people: 1, joined: '26 Oct, 1:14 PM', latest: true },
    { code: 'TEN003', name: 'Global Relief Foundation', subdomain: 'globalrelief', status: 'Invited', people: 1, joined: '26 Oct, 1:14 PM' },
    { code: 'TEN002', name: 'HelpAge India', subdomain: 'helpageindia', status: 'Active', people: 21, joined: '26 Oct, 1:14 PM' },
    { code: 'TEN001', name: 'Smile Foundation', subdomain: 'smilefoundation', status: 'Active', people: 21, joined: '26 Oct, 1:14 PM' }
  ]);

  /* ---------------------------------------------------------------- clock */
  protected readonly now = signal(new Date());
  protected readonly updatedAt = signal(new Date());

  protected readonly greeting = computed(() => {
    const h = this.now().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });

  /** "MONDAY, 26 OCTOBER 2026" */
  protected readonly dateLabel = computed(() => {
    const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .formatToParts(this.now());
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`.toUpperCase();
  });

  protected readonly timeLabel = computed(() => this.formatTime(this.now()));
  protected readonly updatedLabel = computed(() => this.formatTime(this.updatedAt()));

  /* ---------------------------------------------------------------- figures */
  protected readonly totalOrgs = computed(() => {
    const c = this.counts();
    return c.onboarding + c.inReview + c.approved + c.active + c.suspended + c.archived;
  });

  protected readonly awaitingReview = computed(() => this.counts().inReview);
  protected readonly livePct = computed(() => this.share(this.counts().active, this.totalOrgs()));

  protected readonly signinTotal = computed(() => this.signIns().succeeded + this.signIns().failed);
  protected readonly successPct = computed(() => this.share(this.signIns().succeeded, this.signinTotal()));

  /** Four figures across the welcome card. */
  protected readonly welcomeFacts = computed<Fact[]>(() => [
    { label: 'Onboarding', value: String(this.counts().onboarding), tone: 'primary', icon: 'flag' },
    { label: 'Suspended', value: String(this.counts().suspended), tone: 'danger', icon: 'pause' },
    { label: 'Two-step sign-in', value: `${this.people().twoStepPct}%`, tone: 'info', icon: 'shield' },
    { label: 'Sign-ins succeeded', value: `${this.successPct()}%`, tone: 'success', icon: 'login' }
  ]);

  /** First letter of the signed-in user's name, for the welcome avatar. */
  protected readonly userInitial = computed(() => (this.userFirstName().trim()[0] ?? '·').toUpperCase());

  protected readonly kpis = computed<Kpi[]>(() => {
    const c = this.counts();
    const p = this.people();
    const s = this.signIns();
    return [
      { label: 'Organisations live', value: String(c.active), sub: `out of ${this.totalOrgs()} · ${c.onboarding} onboarding`, icon: 'building', tone: 'success', pct: this.livePct() },
      { label: 'Awaiting review', value: String(c.inReview), sub: c.inReview ? 'Registrations to decide' : 'Nothing to decide', icon: 'review', tone: 'info', pct: this.share(c.inReview, this.totalOrgs()) },
      { label: 'People', value: String(p.total), sub: `${p.invited} invited · ${p.suspended} suspended`, icon: 'users', tone: 'warning', pct: p.twoStepPct },
      { label: 'Sign-ins', value: String(this.signinTotal()), sub: `${s.failed} failed · last 14 days`, icon: 'login', tone: 'primary', pct: this.successPct() }
    ];
  });

  protected readonly statusTiles = computed<Tile[]>(() => {
    const c = this.counts();
    return [
      { label: 'Active', value: c.active, icon: 'building', tone: 'success' },
      { label: 'In review', value: c.inReview, icon: 'review', tone: 'warning' },
      { label: 'Onboarding', value: c.onboarding, icon: 'flag', tone: 'primary' },
      { label: 'Approved', value: c.approved, icon: 'check', tone: 'info' },
      { label: 'Suspended', value: c.suspended, icon: 'pause', tone: 'danger' },
      { label: 'Archived', value: c.archived, icon: 'archive', tone: 'neutral' },
      { label: 'People active', value: this.people().total - this.people().suspended, icon: 'users', tone: 'primary' }
    ];
  });

  /* ---------------------------------------------------------------- sign-ins chart */
  /** The day under the pointer (or keyboard focus); null when nothing is hovered. */
  protected readonly hoverIndex = signal<number | null>(null);

  /** One date per value in the series, the last one is today. */
  private readonly seriesDates = computed(() => {
    const n = this.signInSeries().length;
    const today = this.now();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (n - 1 - i));
      return d;
    });
  });

  private readonly chartMax = computed(() => {
    const ok = this.signInSeries();
    const bad = this.failedSeries();
    return Math.max(1, ...ok.map((v, i) => v + (bad[i] ?? 0)));
  });

  /** Points sit in the middle of equal-width day columns, so the hover columns line up with them. */
  protected readonly points = computed<ChartPoint[]>(() => {
    const ok = this.signInSeries();
    const bad = this.failedSeries();
    const dates = this.seriesDates();
    const n = ok.length;
    const max = this.chartMax();
    const full = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const week = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

    return ok.map((v, i) => {
      const failed = bad[i] ?? 0;
      const total = v + failed;
      const y = PLOT_BASE - (total / max) * PLOT_SPAN;
      const dateLabel = full.format(dates[i]);
      return {
        i,
        x: ((i + 0.5) / n) * 100,
        y,
        tipTop: Math.min(Math.max(y, 24), 76),
        total,
        ok: v,
        failed,
        dateLabel,
        week: week.format(dates[i]).slice(0, 2),
        day: String(dates[i].getDate()),
        today: i === n - 1,
        aria: `${dateLabel}: ${total} sign-in attempts, ${v} succeeded, ${failed} failed`
      };
    });
  });

  protected readonly hovered = computed(() => {
    const i = this.hoverIndex();
    return i === null ? null : this.points()[i] ?? null;
  });

  /** Smooth line through the points and the filled area under it. */
  protected readonly chartPaths = computed(() => {
    const pts = this.points();
    if (!pts.length) return { line: '', area: '' };
    let line = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const mx = (a.x + b.x) / 2;
      line += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    }
    const area = `${line} L ${pts[pts.length - 1].x} ${PLOT_BASE} L ${pts[0].x} ${PLOT_BASE} Z`;
    return { line, area };
  });

  protected readonly yTicks = computed(() => {
    const max = this.chartMax();
    return [1, 0.5, 0].map((f) => {
      const v = max * f;
      return { label: Number.isInteger(v) ? String(v) : v.toFixed(1), y: PLOT_BASE - f * PLOT_SPAN };
    });
  });

  protected readonly signinSummary = computed(() => {
    const s = this.signIns();
    const attempts = this.signinTotal();
    return [
      { label: 'Signed in', value: s.succeeded, pct: this.share(s.succeeded, attempts), tone: 'success' as Tone, icon: 'login' as DashIcon },
      { label: 'Failed', value: s.failed, pct: this.share(s.failed, attempts), tone: 'danger' as Tone, icon: 'alert' as DashIcon },
      { label: 'People', value: s.people, pct: this.share(s.people, this.people().total), tone: 'info' as Tone, icon: 'users' as DashIcon }
    ];
  });

  /* ---------------------------------------------------------------- organisation health */
  protected readonly health = computed<Share[]>(() => {
    const c = this.counts();
    return [
      { label: 'Active', value: c.active, tone: 'success', icon: 'building' },
      { label: 'Getting started', value: c.onboarding + c.inReview + c.approved, tone: 'primary', icon: 'flag' },
      { label: 'Suspended', value: c.suspended, tone: 'warning', icon: 'pause' },
      { label: 'Archived or rejected', value: c.archived, tone: 'danger', icon: 'archive' }
    ];
  });

  /** The welcome legend lists only what is there. */
  protected readonly welcomeLegend = computed(() => this.health().filter((h) => h.value > 0));

  /**
   * One block per organisation on the welcome card, coloured by its health. With many organisations
   * (more than 24) one block per group is drawn instead, sized by its count.
   */
  protected readonly orgBlocks = computed(() => {
    const groups = this.welcomeLegend();
    if (this.totalOrgs() <= 24) {
      return groups.flatMap((h) => Array.from({ length: h.value }, () => ({ tone: h.tone, grow: 1, label: h.label })))
        .map((b, i) => ({ ...b, i }));
    }
    return groups.map((h, i) => ({ tone: h.tone, grow: h.value, label: h.label, i }));
  });

  /** Donut segments on a circle of circumference 100, starting at the top. */
  protected readonly donut = computed(() => {
    const total = this.totalOrgs();
    if (!total) return [];
    const parts = this.health().filter((h) => h.value > 0);
    const gap = parts.length > 1 ? 1.5 : 0;
    let acc = 0;
    return parts.map((h) => {
      const pct = (h.value / total) * 100;
      const len = Math.max(pct - gap, 0);
      const seg = { label: h.label, tone: h.tone, dash: `${len} ${100 - len}`, offset: String(25 - acc) };
      acc += pct;
      return seg;
    });
  });

  protected readonly rings = computed<Ring[]>(() => [
    { label: 'Live', sub: 'Organisations active', pct: this.livePct(), tone: 'success' },
    { label: 'Protected', sub: 'People with two-step sign-in', pct: this.people().twoStepPct, tone: 'info' },
    { label: 'Signed in', sub: 'Attempts that succeeded', pct: this.successPct(), tone: 'primary' }
  ]);

  /* ---------------------------------------------------------------- activity */
  protected readonly activitySummary = computed(() => [
    { value: this.activity().length, label: 'events', tone: 'primary' as Tone },
    { value: new Set(this.activity().map((a) => a.actor)).size, label: 'people', tone: 'info' as Tone },
    { value: this.signIns().failed, label: 'failed', tone: 'danger' as Tone }
  ]);

  /* ---------------------------------------------------------------- organisations overview */
  protected readonly overview = computed<Share[]>(() => {
    const c = this.counts();
    return [
      { label: 'Onboarding', value: c.onboarding, tone: 'primary', icon: 'flag' },
      { label: 'In review', value: c.inReview, tone: 'warning', icon: 'review' },
      { label: 'Approved', value: c.approved, tone: 'info', icon: 'check' },
      { label: 'Active', value: c.active, tone: 'success', icon: 'building' },
      { label: 'Suspended', value: c.suspended, tone: 'danger', icon: 'pause' },
      { label: 'Archived', value: c.archived, tone: 'neutral', icon: 'archive' }
    ];
  });

  protected readonly overviewBar = computed(() =>
    this.overview()
      .filter((o) => o.value > 0)
      .map((o) => ({ label: o.label, tone: o.tone, pct: this.share(o.value, this.totalOrgs()) }))
  );

  protected readonly largest = computed(() => {
    const rows = [...this.largestRows()].sort((a, b) => b.people - a.people);
    const sum = rows.reduce((t, r) => t + r.people, 0);
    return rows.map((r) => ({ ...r, share: this.share(r.people, sum) }));
  });

  /** Registered → submitted → approved → live. */
  protected readonly funnel = computed(() => {
    const c = this.counts();
    return [
      { label: 'Registered', value: this.totalOrgs(), tone: 'primary' as Tone },
      { label: 'Submitted', value: c.inReview + c.approved + c.active + c.suspended, tone: 'info' as Tone },
      { label: 'Approved', value: c.approved + c.active + c.suspended, tone: 'warning' as Tone },
      { label: 'Live', value: c.active, tone: 'success' as Tone }
    ];
  });

  /* ---------------------------------------------------------------- newest organisations table */
  protected readonly query = signal('');
  protected readonly page = signal(1);

  protected readonly newestLive = computed(() => this.newest().filter((r) => r.status === 'Active').length);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.newest();
    return q
      ? rows.filter((r) => [r.name, r.code, r.subdomain, r.status].some((v) => v.toLowerCase().includes(q)))
      : rows;
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  protected readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i + 1));
  protected readonly pageRows = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });
  protected readonly rangeFrom = computed(() => (this.filtered().length ? (this.page() - 1) * PAGE_SIZE + 1 : 0));
  protected readonly rangeTo = computed(() => Math.min(this.page() * PAGE_SIZE, this.filtered().length));

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /* ---------------------------------------------------------------- actions */
  protected icon(name: DashIcon): string {
    return ICONS[name];
  }

  protected statusTone(status: OrgStatus): Tone {
    return STATUS_TONE[status];
  }

  /** Whole-number percentage, 0 when there is nothing to divide by. */
  protected share(value: number, total: number): number {
    return total ? Math.round((value / total) * 100) : 0;
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  protected goPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  /** Wire this to your dashboard API reload. */
  protected refresh(): void {
    this.now.set(new Date());
    this.updatedAt.set(new Date());
  }

  private formatTime(d: Date): string {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  }
}