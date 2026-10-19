import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CwPageHead } from '../../../Shared/Campaign/cw-page-head';
import { CwSelect, CwOption } from '../../../Shared/Campaign/cw-select';
import { CW_ICONS, CwIcon } from '../../../Shared/Campaign/cw-icons';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';
import { Activity, Donation, daysBetween, fmtDate, fmtTime, inr, todayIso } from '../../../Shared/Campaign/cw.data';

interface CalDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
  steps: number;
  /** One icon per kind of activity on the day (edit, approval, pause ...). */
  stepIcons: { icon: CwIcon; label: string; kind: string }[];
  gifts: number;
}

type Range = '12m' | '90d' | 'all';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Component({
  selector: 'app-campaign-detail',
  imports: [CwPageHead, CwSelect, RouterLink],
  templateUrl: './campaign-detail.html',
  styleUrls: ['../../../Shared/Campaign/cw-shared.css', './campaign-detail.css']
})
export class CampaignDetail {
  protected readonly store = inject(CampaignWorkspaceStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly c = this.store.campaign;
  protected readonly paths = CW_PATHS;
  protected readonly today = todayIso();
  protected readonly fmtDate = fmtDate;
  protected readonly fmtTime = fmtTime;
  protected readonly inr = inr;
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  constructor() {
    const code = this.route.snapshot.paramMap.get('code');
    if (code) this.store.select(code);
  }

  // ---- KPIs ----
  protected readonly raisedPct = computed(() => (this.c().target ? Math.min(100, Math.round((this.c().raised / this.c().target) * 100)) : 0));
  protected readonly revenueChange = computed(() => this.change(this.c().monthlyRevenue, this.c().monthlyRevenuePrev));
  protected readonly assetCount = computed(() => this.store.assets().filter((a) => a.campaign === this.c().code).length);
  protected readonly liveAssets = computed(() => this.store.assets().filter((a) => a.campaign === this.c().code && a.status === 'active').length);
  protected readonly daysLeft = computed(() => daysBetween(this.today, this.c().end));

  // ---- mini charts on the right side of the KPI cards (shown only when a card is wide) ----
  /** Last 6 months (oldest first) with revenue, donors and gift counts per month. */
  protected readonly trend = computed(() => {
    const [y, m] = this.today.split('-').map(Number);
    const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7));
    const list = this.donations();
    const rows = months.map((key) => {
      const inMonth = list.filter((d) => d.date.slice(0, 7) === key);
      return {
        key,
        label: MONTH_NAMES[Number(key.slice(5)) - 1].slice(0, 3),
        revenue: inMonth.reduce((s, d) => s + d.amount, 0),
        donors: new Set(inMonth.map((d) => d.donor)).size,
        gifts: inMonth.length
      };
    });
    const series = (pick: (r: (typeof rows)[number]) => number) => {
      const max = Math.max(1, ...rows.map(pick));
      const bars = rows.map((r, i) => ({
        label: r.label,
        value: pick(r),
        /** bar height in % (0 = empty month, drawn as a dot on the baseline) */
        h: pick(r) ? Math.max(12, Math.round((pick(r) / max) * 100)) : 0,
        now: i === rows.length - 1,
        peak: pick(r) > 0 && pick(r) === max,
        /** shade level 0-4 for the heat tiles */
        lv: pick(r) ? Math.max(1, Math.ceil((pick(r) / max) * 4)) : 0
      }));
      return { bars, total: rows.reduce((t, r) => t + pick(r), 0) };
    };
    return { revenue: series((r) => r.revenue), donors: series((r) => r.donors), gifts: series((r) => r.gifts) };
  });
  /** Top tracking assets by donations traced (max 3) for the asset card. */
  protected readonly topAssets = computed(() => {
    const list = this.store.assets()
      .filter((a) => a.campaign === this.c().code)
      .sort((a, b) => b.received - a.received)
      .slice(0, 3);
    const max = Math.max(1, ...list.map((a) => a.received));
    return list.map((a) => ({ ref: a.ref, type: a.type, live: a.status === 'active', received: a.received, pct: Math.round((a.received / max) * 100) }));
  });

  // ---- calendar ----
  private readonly month = signal(this.today.slice(0, 7)); // yyyy-mm
  protected readonly selectedDay = signal(this.today);

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  });

  protected readonly days = computed<CalDay[]>(() => {
    const [y, m] = this.month().split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const start = Date.UTC(y, m - 1, 1 - lead);
    const c = this.c();
    const steps = this.activity().map((a) => a.at.slice(0, 10));
    const gifts = this.donations().map((d) => d.date);
    const out: CalDay[] = [];
    for (let i = 0; i < 42; i++) {
      const iso = new Date(start + i * 86400000).toISOString().slice(0, 10);
      out.push({
        iso,
        day: Number(iso.slice(8)),
        inMonth: iso.slice(0, 7) === this.month(),
        isToday: iso === this.today,
        isStart: iso === c.start,
        isEnd: iso === c.end,
        inRange: iso >= c.start && iso <= c.end,
        steps: steps.filter((d) => d === iso).length,
        stepIcons: this.dayIcons(iso),
        gifts: gifts.filter((d) => d === iso).length
      });
    }
    // drop a trailing week that is entirely next month
    return out.slice(35).every((d) => !d.inMonth) ? out.slice(0, 35) : out;
  });

  protected readonly dayRecords = computed(() => {
    const d = this.selectedDay();
    return {
      activity: this.activity().filter((a) => a.at.slice(0, 10) === d),
      gifts: this.donations().filter((g) => g.date === d),
      isStart: d === this.c().start,
      isEnd: d === this.c().end
    };
  });

  // ---- donations by channel ----
  protected readonly range = signal<Range>('12m');
  protected readonly rangeOptions: CwOption[] = [
    { value: '12m', label: 'Last 12 months' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'all', label: 'All time' }
  ];

  private readonly donations = computed<Donation[]>(() => this.store.donations.filter((d) => d.campaign === this.c().code));

  protected readonly channels = computed(() => {
    const r = this.range();
    const from = r === 'all' ? '' : new Date(Date.parse(this.today) - (r === '12m' ? 365 : 90) * 86400000).toISOString().slice(0, 10);
    const list = this.donations().filter((d) => d.date >= from);
    const colours = ['var(--w-primary)', 'var(--status-info, #3c62a3)', 'var(--status-warning, #976821)', 'var(--purple, #7a5af5)'];
    const groups = new Map<string, { count: number; amount: number }>();
    for (const d of list) {
      const g = groups.get(d.channel) ?? { count: 0, amount: 0 };
      g.count++;
      g.amount += d.amount;
      groups.set(d.channel, g);
    }
    const total = list.length;
    let offset = 0;
    const rows = [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, g], i) => {
        const pct = total ? (g.count / total) * 100 : 0;
        const row = { name, count: g.count, amount: g.amount, pct: Math.round(pct), dash: `${pct} ${100 - pct}`, offset: -offset, colour: colours[i % colours.length] };
        offset += pct;
        return row;
      });
    return { rows, total, amount: list.reduce((s, d) => s + d.amount, 0) };
  });

  // ---- activity ----
  protected readonly activity = computed<Activity[]>(() => this.store.activityFor(this.c().code));

  // ---- close decision ----
  protected readonly rejecting = signal(false);
  protected readonly reason = signal('');
  protected readonly reasonTouched = signal(false);

  /** Back to the register list (full page). */
  protected goBack(): void {
    this.router.navigate([this.paths.register]);
  }

  protected icon(name: CwIcon): string {
    return CW_ICONS[name];
  }

  protected shiftMonth(d: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + d, 1));
    this.month.set(next.toISOString().slice(0, 7));
  }

  protected goToday(): void {
    this.month.set(this.today.slice(0, 7));
    this.selectedDay.set(this.today);
  }

  protected dayLabel(iso: string): string {
    return iso === this.today ? `Today · ${fmtDate(iso)}` : fmtDate(iso);
  }

  /** Distinct activity icons for a day, in the order they happened. */
  private dayIcons(iso: string): { icon: CwIcon; label: string; kind: string }[] {
    const seen = new Set<string>();
    const out: { icon: CwIcon; label: string; kind: string }[] = [];
    for (const a of this.activity()) {
      if (a.at.slice(0, 10) !== iso || seen.has(a.kind)) continue;
      seen.add(a.kind);
      out.push({ icon: this.kindIcon(a), label: a.title, kind: a.kind });
    }
    return out;
  }

  protected kindLabel(a: Activity): string {
    return { change: 'Change', approval: 'Approval', create: 'Created', pause: 'Paused', resume: 'Resumed' }[a.kind];
  }

  protected kindIcon(a: Activity): CwIcon {
    return ({ change: 'edit', approval: 'checkCircle', create: 'plus', pause: 'pause', resume: 'play' } as const)[a.kind];
  }

  protected approveClose(): void {
    this.store.approveClose(this.c().code);
  }

  protected openReject(): void {
    this.reason.set('');
    this.reasonTouched.set(false);
    this.rejecting.set(true);
  }

  protected reasonError(): string | null {
    const n = this.reason().trim().length;
    return n < 10 ? 'Say why in at least 10 characters.' : null;
  }

  protected confirmReject(): void {
    this.reasonTouched.set(true);
    if (this.reasonError()) return;
    this.store.rejectClose(this.c().code, this.reason().trim());
    this.rejecting.set(false);
  }

  protected setReason(e: Event): void {
    this.reason.set((e.target as HTMLTextAreaElement).value);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.rejecting.set(false);
  }

  private change(now: number, prev: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
    if (!prev) return { pct: now ? 100 : 0, dir: now ? 'up' : 'flat' };
    const pct = Math.round(((now - prev) / prev) * 100);
    return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }
}