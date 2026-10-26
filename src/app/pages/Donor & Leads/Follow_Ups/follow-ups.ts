import { Component, HostListener, OnDestroy, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FU_CAMPAIGNS, FU_CHANNELS, FU_ICONS, FU_PRIORITIES, FU_STATUSES, FollowUp, FollowUpStore, FuChannel, FuPriority, FuStatus,
  MONTHS, MONTHS_LONG, WEEKDAYS, addDays, channelOf, dayDiff, fmtDate, fmtTime, initials, isOpen, isoDay, monthWeeks,
  priorityOf, statusOf, toDate
} from '../../../Shared/layout/Donors_Leads/fu-store';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';


export type FuTab = 'all' | 'mine' | 'today' | 'overdue' | 'upcoming' | 'done-today' | 'high' | 'attention' | 'escalated' | 'calls';
export type FuView = 'list' | 'board' | 'calendar';
export type FuSort = 'latest' | 'oldest' | 'due' | 'priority';
type FuMenu = 'sort' | 'owner' | 'campaign' | 'from' | 'to' | 'row' | 'rows' | 'r-owner' | 'e-manager' | 'c-date' | 'c-cat' | 'c-staff' | null;
type FuDialog = 'reassign' | 'escalate' | 'reschedule' | 'cancel' | 'history' | 'day' | null;

/** The queue endpoint's own `view` word for each tab ('all' sends none). */
const SERVER_VIEW: Record<FuTab, string | null> = {
  all: null, mine: 'mine', today: 'today', overdue: 'overdue', upcoming: 'upcoming',
  'done-today': 'completedToday', high: 'high', attention: 'attention', escalated: 'escalated', calls: 'calls'
};

const PRIORITY_RANK: Record<FuPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

@Component({
  selector: 'app-follow-ups',
  standalone: true,
  templateUrl: './follow-ups.html',
  styleUrls: ['../../../Shared/layout/Donors_Leads/fu-shared.css', './follow-ups.css']
})
export class FollowUps implements OnDestroy {
  private readonly router = inject(Router);
  protected readonly store = inject(FollowUpStore);

  protected readonly newPath = '/app/fundraising/relationships/follow-up-queue/new';
  protected readonly runPath = '/app/fundraising/relationships/follow-up-queue/execute';
  protected readonly statuses = FU_STATUSES;
  protected readonly channels = FU_CHANNELS;
  protected readonly priorities = FU_PRIORITIES;
  protected readonly campaigns = FU_CAMPAIGNS;
  protected get owners(): string[] { return this.store.owners.map((o) => o.name); }
  protected readonly managers = this.store.managers;
  protected readonly rowOptions = [10, 20, 50];
  protected readonly sorts: { key: FuSort; label: string }[] = [
    { key: 'latest', label: 'Latest first' },
    { key: 'oldest', label: 'Oldest first' },
    { key: 'due', label: 'Due soonest' },
    { key: 'priority', label: 'Priority' }
  ];

  protected readonly now = signal(new Date());
  protected readonly todayIso = computed(() => isoDay(this.now()));

  /* ---------- view state ---------- */
  protected readonly tab = signal<FuTab>('all');
  protected readonly view = signal<FuView>('list');
  protected readonly sort = signal<FuSort>('latest');
  protected readonly query = signal('');
  protected readonly filtersOpen = signal(false);
  protected readonly fStatus = signal<FuStatus[]>([]);
  protected readonly fChannel = signal<FuChannel[]>([]);
  protected readonly fPriority = signal<FuPriority[]>([]);
  protected readonly fOwner = signal<string | null>(null);
  protected readonly fCampaign = signal<string | null>(null);
  protected readonly fFrom = signal<string | null>(null);
  protected readonly fTo = signal<string | null>(null);
  protected readonly fDay = signal<string | null>(null);          // week-strip day
  protected readonly weekStart = signal(this.mondayOf(new Date()));
  protected readonly calMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); // calendar view month
  protected readonly pickMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); // date-picker month
  protected readonly rows = signal(10);
  protected readonly page = signal(1);
  protected readonly selected = signal<string[]>([]);
  protected readonly menu = signal<FuMenu>(null);
  protected readonly menuRow = signal<string | null>(null);

  protected readonly drawer = signal<string | null>(null);         // follow-up id
  protected readonly dialog = signal<FuDialog>(null);
  protected readonly targets = signal<string[]>([]);               // ids for reassign / escalate
  protected readonly dialogDay = signal<string | null>(null);
  protected readonly rOwner = signal<string | null>(null);
  protected readonly rReason = signal('');
  protected readonly eTo = signal<string | null>(null);
  protected readonly eReason = signal('');
  protected readonly eNotes = signal('');
  protected readonly tried = signal(false);
  protected readonly sDate = signal('');                           // reschedule: new date (yyyy-mm-dd)
  protected readonly sTime = signal('');                           // reschedule: new time (hh:mm)
  protected readonly sReason = signal('');
  protected readonly cReason = signal('');
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- classification ---------- */
  private dueDay(f: FollowUp): string { return f.dueAt.slice(0, 10); }
  isOverdue(f: FollowUp): boolean { return isOpen(f) && toDate(f.dueAt) < this.now() && this.dueDay(f) < this.todayIso(); }
  isDueToday(f: FollowUp): boolean { return isOpen(f) && this.dueDay(f) === this.todayIso(); }
  isUpcoming(f: FollowUp): boolean { return isOpen(f) && this.dueDay(f) > this.todayIso(); }
  isDoneToday(f: FollowUp): boolean { return !!f.completedAt && f.completedAt.slice(0, 10) === this.todayIso(); }

  protected readonly all = computed(() => this.store.followUps());
  protected readonly open = computed(() => this.all().filter(isOpen));

  /* ---------- figures ---------- */
  protected readonly figures = computed(() => {
    const a = this.all();
    // The server counts these over the caller's whole scope; the local count is only the fallback.
    const s = this.store.options()?.summary;
    return [
      { key: 'today' as FuTab, label: 'Due today', value: s?.dueToday ?? a.filter((f) => this.isDueToday(f)).length, icon: 'clock', tone: 'blue' },
      { key: 'upcoming' as FuTab, label: 'Upcoming', value: s?.upcoming ?? a.filter((f) => this.isUpcoming(f)).length, icon: 'calendar', tone: 'green' },
      { key: 'overdue' as FuTab, label: 'Overdue', value: s?.overdue ?? a.filter((f) => this.isOverdue(f)).length, icon: 'alert', tone: 'red' },
      { key: 'done-today' as FuTab, label: 'Completed today', value: s?.completedToday ?? a.filter((f) => this.isDoneToday(f)).length, icon: 'checkCircle', tone: 'primary' },
      { key: 'escalated' as FuTab, label: 'Escalated', value: s?.escalated ?? a.filter((f) => f.status === 'escalated').length, icon: 'flag', tone: 'amber' }
    ];
  });

  protected readonly health = computed(() => {
    const a = this.all();
    const open = this.open();
    const done = a.filter((f) => !isOpen(f)).length;
    const overdue = open.filter((f) => this.isOverdue(f)).length;
    const pct = open.length ? Math.round((overdue / open.length) * 100) : 0;
    return {
      done: a.length ? Math.round((done / a.length) * 100) : 0,
      overduePct: pct,
      overdue,
      escalated: open.filter((f) => f.status === 'escalated').length,
      blocked: open.filter((f) => f.blocked).length,
      state: pct >= 50 ? { label: 'Critical', tone: 'red' } : pct >= 20 ? { label: 'Watch', tone: 'amber' } : { label: 'Healthy', tone: 'green' }
    };
  });

  protected readonly sla = computed(() => {
    const open = this.open();
    const overdue = open.filter((f) => this.isOverdue(f)).length;
    const today = open.filter((f) => this.isDueToday(f)).length;
    const onTime = open.length - overdue - today;
    const pct = (n: number) => (open.length ? (n / open.length) * 100 : 0);
    return {
      open: open.length, onTime, today, overdue, onTimePct: Math.round(pct(onTime)),
      parts: [
        { key: 'on', label: 'On time', value: onTime, w: pct(onTime), tone: 'green' },
        { key: 'today', label: 'Due today', value: today, w: pct(today), tone: 'amber' },
        { key: 'over', label: 'Overdue', value: overdue, w: pct(overdue), tone: 'red' }
      ]
    };
  });

  /** Open work by age since it was created. */
  protected readonly ages = computed(() => {
    const open = this.open().filter((f) => f.status === 'pending' || f.status === 'rescheduled');
    const buckets = [
      { label: '0–3d', min: 0, max: 3, tone: 'green' },
      { label: '4–7d', min: 4, max: 7, tone: 'blue' },
      { label: '8–15d', min: 8, max: 15, tone: 'amber' },
      { label: '15d+', min: 16, max: 9999, tone: 'red' }
    ].map((b) => ({ ...b, n: open.filter((f) => { const d = dayDiff(toDate(f.createdAt), this.now()); return d >= b.min && d <= b.max; }).length }));
    const max = Math.max(1, ...buckets.map((b) => b.n));
    return { total: open.length, buckets: buckets.map((b) => ({ ...b, pct: Math.round((b.n / max) * 100) })) };
  });

  protected readonly agenda = computed(() => {
    const t = this.todayIso();
    const today = this.all().filter((f) => this.dueDay(f) === t && (isOpen(f) || this.isDoneToday(f))).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const soonEnd = isoDay(addDays(this.now(), 3));
    const coming = this.open().filter((f) => this.dueDay(f) > t && this.dueDay(f) <= soonEnd).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4);
    return { today, coming, todo: today.filter(isOpen).length, done: today.filter((f) => !isOpen(f)).length };
  });

  /* ---------- my queue (hero card) ---------- */
  protected readonly me = computed(() => {
    const name = this.store.currentUser;
    const mine = this.open().filter((f) => f.mine ?? f.owner === name);
    return {
      name,
      ini: initials(name),
      team: this.store.owners.find((o) => o.name === name)?.team ?? 'Relationship team',
      open: mine.length,
      overdue: mine.filter((f) => this.isOverdue(f)).length,
      today: mine.filter((f) => this.isDueToday(f)).length,
      ready: mine.filter((f) => this.isReady(f)).length
    };
  });
  /** Next open item on today's agenda (for the hero side panel). */
  protected readonly nextUp = computed(() => this.agenda().today.find(isOpen) ?? this.agenda().coming[0] ?? null);
  /** Overdue + blocked open work, for the attention banner. */
  protected readonly attention = computed(() => ({ overdue: this.health().overdue, blocked: this.health().blocked }));
  protected readonly views = computed(() => [
    { key: 'list' as FuView, label: 'List', icon: 'list' },
    { key: 'board' as FuView, label: 'Board', icon: 'board' },
    { key: 'calendar' as FuView, label: 'Calendar', icon: 'calendar' }
  ]);

  /* ---------- tabs + list ---------- */
  private matchTab(f: FollowUp, t: FuTab): boolean {
    switch (t) {
      case 'mine': return f.mine ?? f.owner === this.store.currentUser;
      case 'today': return this.isDueToday(f);
      case 'overdue': return this.isOverdue(f);
      case 'upcoming': return this.isUpcoming(f);
      case 'done-today': return this.isDoneToday(f);
      case 'high': return isOpen(f) && (f.priority === 'high' || f.priority === 'urgent');
      case 'attention': return this.isOverdue(f) || f.blocked;
      case 'escalated': return f.status === 'escalated';
      case 'calls': return f.channel === 'call';
      default: return true;
    }
  }
  protected readonly tabs = computed(() => {
    const a = this.all();
    const served = this.store.options()?.views ?? [];
    // The tab's count is the server's, over the whole scope, when it sends one for that view.
    const n = (t: FuTab) => served.find((v) => v.value === SERVER_VIEW[t])?.count ?? a.filter((f) => this.matchTab(f, t)).length;
    return [
      [{ key: 'all' as FuTab, label: 'All', n: a.length }, { key: 'mine' as FuTab, label: 'Mine', n: n('mine') }, { key: 'today' as FuTab, label: 'Today', n: n('today') },
        { key: 'overdue' as FuTab, label: 'Overdue', n: n('overdue') }, { key: 'upcoming' as FuTab, label: 'Upcoming', n: n('upcoming') }, { key: 'done-today' as FuTab, label: 'Done today', n: n('done-today') }],
      [{ key: 'high' as FuTab, label: 'High priority', n: n('high') }, { key: 'attention' as FuTab, label: 'Needs attention', n: n('attention') }, { key: 'escalated' as FuTab, label: 'Escalated', n: n('escalated') }],
      [{ key: 'calls' as FuTab, label: 'Calls', n: n('calls') }]
    ];
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const st = this.fStatus(), ch = this.fChannel(), pr = this.fPriority();
    const owner = this.fOwner(), camp = this.fCampaign(), from = this.fFrom(), to = this.fTo(), day = this.fDay();
    // A tab other than "All" is the server's own view of the queue (view=completedToday ...). Until its
    // rows arrive the local rule stands in, so the list is never blank.
    const served = this.store.viewRows();
    const list = (served ?? this.all()).filter((f) =>
      (served !== null || this.matchTab(f, this.tab())) &&
      (!q || `${f.name} ${f.id} ${f.recordCode} ${f.purpose}`.toLowerCase().includes(q)) &&
      (!st.length || st.includes(f.status)) && (!ch.length || ch.includes(f.channel)) && (!pr.length || pr.includes(f.priority)) &&
      (!owner || f.owner === owner) && (!camp || f.campaign === camp) &&
      (!from || this.dueDay(f) >= from) && (!to || this.dueDay(f) <= to) && (!day || this.dueDay(f) === day));
    const s = this.sort();
    return [...list].sort((a, b) =>
      s === 'oldest' ? a.dueAt.localeCompare(b.dueAt) :
      s === 'due' ? (Number(!isOpen(a)) - Number(!isOpen(b))) || a.dueAt.localeCompare(b.dueAt) :
      s === 'priority' ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueAt.localeCompare(b.dueAt) :
      b.dueAt.localeCompare(a.dueAt));
  });
  protected readonly filterCount = computed(() =>
    this.fStatus().length + this.fChannel().length + this.fPriority().length + (this.fOwner() ? 1 : 0) + (this.fCampaign() ? 1 : 0) + (this.fFrom() || this.fTo() ? 1 : 0));


  protected readonly allOnPage = computed(() => this.pageRows().length > 0 && this.pageRows().every((f) => this.selected().includes(f.id)));

  /* ---------- week strip ---------- */
  protected readonly week = computed(() => {
    const start = this.weekStart();
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const iso = isoDay(d);
      const items = this.all().filter((f) => this.dueDay(f) === iso);
      const done = items.filter((f) => !isOpen(f)).length;
      return { iso, wd: iso === this.todayIso() ? 'Today' : WEEKDAYS[d.getDay()], d: d.getDate(), n: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
    });
  });
  protected readonly weekSum = computed(() => {
    const w = this.week();
    const total = w.reduce((n, d) => n + d.n, 0);
    const done = w.reduce((n, d) => n + Math.round((d.n * d.pct) / 100), 0);
    return { total, done };
  });
  protected readonly weekTitle = computed(() => {
    const s = this.weekStart(), e = addDays(s, 6);
    return { month: `${MONTHS_LONG[s.getMonth()]} ${s.getFullYear()}`, range: `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}` };
  });

  /* ---------- board ---------- */
  protected readonly board = computed(() => {
    const list = this.filtered();
    return [
      { key: 'today', label: 'Due today', tone: 'blue', items: list.filter((f) => this.isDueToday(f)) },
      { key: 'upcoming', label: 'Upcoming', tone: 'green', items: list.filter((f) => this.isUpcoming(f)) },
      { key: 'overdue', label: 'Overdue', tone: 'red', items: list.filter((f) => this.isOverdue(f)) },
      { key: 'done', label: 'Completed', tone: 'primary', items: list.filter((f) => !isOpen(f)) }
    ];
  });

  /* ---------- calendar ---------- */
  protected readonly calendar = computed(() => {
    const m = this.calMonth();
    const list = this.filtered();
    return monthWeeks(m).map((w) => w.map((c) => {
      const items = list.filter((f) => this.dueDay(f) === c.iso).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      return { ...c, items, today: c.iso === this.todayIso() };
    }));
  });
  protected readonly calTitle = computed(() => `${MONTHS_LONG[this.calMonth().getMonth()]} ${this.calMonth().getFullYear()}`);
  protected readonly dayItems = computed(() => {
    const d = this.dialogDay();
    return d ? this.filtered().filter((f) => this.dueDay(f) === d).sort((a, b) => a.dueAt.localeCompare(b.dueAt)) : [];
  });

  /* ---------- calendar view: week × staff planner ---------- */
  protected readonly cCat = signal<FuChannel | null>(null);       // category = channel
  protected readonly cStaff = signal<string | null>(null);
  protected readonly goDate = signal<string | null>(null);
  protected readonly weekDays = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(this.weekStart(), i);
      const iso = isoDay(d);
      return { iso, wd: WEEKDAYS[d.getDay()], label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, today: iso === this.todayIso() };
    }));
  protected readonly weekLabel = computed(() => {
    const s = this.weekStart(), e = addDays(s, 6);
    return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  });
  protected readonly weekItems = computed(() => {
    const days = new Set(this.weekDays().map((d) => d.iso));
    return this.filtered().filter((f) => days.has(this.dueDay(f)) && (!this.cCat() || f.channel === this.cCat()) && (!this.cStaff() || f.owner === this.cStaff()));
  });
  protected readonly weekStats = computed(() => {
    const it = this.weekItems();
    return { total: it.length, staff: new Set(it.map((f) => f.owner)).size, open: it.filter(isOpen).length, overdue: it.filter((f) => this.isOverdue(f)).length };
  });
  protected readonly planner = computed(() => {
    const items = this.weekItems();
    return this.store.owners
      .filter((o) => !this.cStaff() || o.name === this.cStaff())
      .map((o) => {
        const mine = items.filter((f) => f.owner === o.name);
        return {
          name: o.name,
          team: o.team,
          count: mine.length,
          open: mine.filter(isOpen).length,
          days: this.weekDays().map((d) => ({ iso: d.iso, items: mine.filter((f) => this.dueDay(f) === d.iso).sort((a, b) => a.dueAt.localeCompare(b.dueAt)) }))
        };
      });
  });

  /* ---------- date picker (filters) ---------- */
  protected readonly pickWeeks = computed(() => monthWeeks(this.pickMonth()));
  protected readonly pickTitle = computed(() => `${MONTHS[this.pickMonth().getMonth()]} ${this.pickMonth().getFullYear()}`);

  /* ---------- drawer + dialogs ---------- */
  protected readonly current = computed(() => (this.drawer() ? this.store.find(this.drawer()!) : null));
  protected readonly targetItems = computed(() => this.targets().map((id) => this.store.find(id)).filter((f): f is FollowUp => !!f));
  protected readonly rError = computed(() => (!this.rOwner() ? 'Choose the new owner.' : ''));
  protected readonly sErrors = computed(() => ({
    date: !this.sDate() ? 'Pick the new date.' : this.sDate() < this.todayIso() ? 'The new date cannot be in the past.' : '',
    time: !this.sTime() ? 'Pick the new time.' : ''
  }));
  protected readonly cError = computed(() => (this.cReason().trim().length < 10 ? 'Give a reason (at least 10 characters).' : ''));
  protected readonly eErrors = computed(() => ({ to: !this.eTo() ? 'Choose a manager.' : '', reason: !this.eReason().trim() ? 'Give a reason.' : '' }));

  /* ---------- helpers ---------- */
  icon(n: string): string { return FU_ICONS[n] ?? ''; }
  chIcon(f: FollowUp): string { return FU_ICONS[channelOf(f.channel).icon]; }
  chLabel(f: FollowUp): string { return channelOf(f.channel).label; }
  pri(f: FollowUp) { return priorityOf(f.priority); }
  st(f: FollowUp) { return statusOf(f.status); }
  ini(n: string): string { return initials(n); }
  date(iso: string): string { return fmtDate(iso); }
  time(iso: string): string { return fmtTime(iso); }
  when(f: FollowUp): { text: string; tone: string } {
    if (!isOpen(f)) {
      const n = dayDiff(toDate(f.completedAt ?? f.dueAt), this.now());
      return { text: n === 0 ? 'Today' : `${n} day${n === 1 ? '' : 's'} ago`, tone: 'muted' };
    }
    const n = dayDiff(this.now(), toDate(f.dueAt));
    if (n === 0) return { text: 'Today', tone: 'blue' };
    if (n < 0) return { text: `${-n} day${n === -1 ? '' : 's'} overdue`, tone: 'red' };
    return { text: `In ${n} day${n === 1 ? '' : 's'}`, tone: 'muted' };
  }
  execution(f: FollowUp): string {
    if (f.blocked) return 'Blocked - no consent';
    if (f.status === 'escalated') return `With ${f.escalatedTo}`;
    if (f.status === 'completed' || f.status === 'partial') return 'Done';
    return '—';
  }
  isSel(id: string): boolean { return this.selected().includes(id); }
  hasStatus(k: FuStatus): boolean { return this.fStatus().includes(k); }
  hasChannel(k: FuChannel): boolean { return this.fChannel().includes(k); }
  hasPriority(k: FuPriority): boolean { return this.fPriority().includes(k); }
  dateLabel(iso: string | null): string { return iso ? fmtDate(iso) : 'dd-mm-yyyy'; }
  dayTitle(iso: string | null): string { if (!iso) return ''; const d = toDate(iso); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

  /* ---------- tabs / search / filters ---------- */
  setTab(t: FuTab): void {
    this.tab.set(t); this.page.set(1); this.selected.set([]);
    this.store.setQueueView(SERVER_VIEW[t]);
  }
  ngOnDestroy(): void { this.store.setQueueView(null); }
  setQuery(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.page.set(1); }
  toggleIn<T>(sig: WritableSignal<T[]>, v: T): void {
    const l = sig();
    sig.set(l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
    this.page.set(1);
  }
  toggleStatus(k: FuStatus): void { this.toggleIn(this.fStatus, k); }
  toggleChannel(k: FuChannel): void { this.toggleIn(this.fChannel, k); }
  togglePriority(k: FuPriority): void { this.toggleIn(this.fPriority, k); }
  pickOwner(o: string | null): void { this.fOwner.set(o); this.menu.set(null); this.page.set(1); }
  pickCampaign(c: string | null): void { this.fCampaign.set(c); this.menu.set(null); this.page.set(1); }
  resetFilters(): void {
    this.fStatus.set([]); this.fChannel.set([]); this.fPriority.set([]); this.fOwner.set(null); this.fCampaign.set(null);
    this.fFrom.set(null); this.fTo.set(null); this.fDay.set(null); this.query.set(''); this.page.set(1);
  }
  setSort(s: FuSort): void { this.sort.set(s); this.menu.set(null); }
  sortLabel(): string { return this.sorts.find((s) => s.key === this.sort())!.label; }
  setView(v: FuView): void { this.view.set(v); if (v === 'calendar') this.fDay.set(null); }

  toggleMenu(m: Exclude<FuMenu, null>, e: Event, row: string | null = null): void {
    e.stopPropagation();
    if ((m === 'from' || m === 'to' || m === 'c-date') && this.menu() !== m) {
      const cur = (m === 'from' ? this.fFrom() : m === 'to' ? this.fTo() : this.goDate()) ?? this.todayIso();
      const d = toDate(cur);
      this.pickMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    const same = this.menu() === m && this.menuRow() === row;
    this.menu.set(same ? null : m);
    this.menuRow.set(same ? null : row);
  }
  movePick(step: number): void { const m = this.pickMonth(); this.pickMonth.set(new Date(m.getFullYear(), m.getMonth() + step, 1)); }
  pickDate(which: 'from' | 'to', iso: string | null): void {
    (which === 'from' ? this.fFrom : this.fTo).set(iso);
    if (iso && this.fFrom() && this.fTo() && this.fFrom()! > this.fTo()!) (which === 'from' ? this.fTo : this.fFrom).set(iso);
    this.menu.set(null);
    this.page.set(1);
  }

  /* ---------- week strip ---------- */
  private mondayOf(d: Date): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); }
  moveWeek(step: number): void { this.weekStart.set(addDays(this.weekStart(), step * 7)); }
  thisWeek(): void { this.weekStart.set(this.mondayOf(this.now())); this.fDay.set(null); }
  pickDay(iso: string): void { this.fDay.set(this.fDay() === iso ? null : iso); this.page.set(1); }

  /* ---------- calendar (week planner) ---------- */
  evTone(f: FollowUp): string { return this.isOverdue(f) ? 'red' : !isOpen(f) ? 'green' : f.status === 'escalated' ? 'amber' : 'ink'; }
  catLabel(): string { return this.cCat() ? channelOf(this.cCat()!).label : 'All channels'; }
  pickCat(c: FuChannel | null): void { this.cCat.set(c); this.menu.set(null); }
  pickStaff(o: string | null): void { this.cStaff.set(o); this.menu.set(null); }
  goTo(iso: string): void { this.goDate.set(iso); this.weekStart.set(this.mondayOf(toDate(iso))); this.menu.set(null); }
  addFor(owner: string): void { this.router.navigate([this.newPath], { queryParams: { owner } }); }
  moveMonth(step: number): void { const m = this.calMonth(); this.calMonth.set(new Date(m.getFullYear(), m.getMonth() + step, 1)); }
  calToday(): void { const n = this.now(); this.calMonth.set(new Date(n.getFullYear(), n.getMonth(), 1)); }
  openDay(iso: string): void { this.dialogDay.set(iso); this.dialog.set('day'); }

  /* ---------- selection + paging ---------- */
  toggleSel(id: string): void { this.selected.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); }
  togglePage(): void {
    const ids = this.pageRows().map((f) => f.id);
    this.selected.set(this.allOnPage() ? this.selected().filter((x) => !ids.includes(x)) : [...new Set([...this.selected(), ...ids])]);
  }
  clearSel(): void { this.selected.set([]); }
  setRows(n: number): void { this.rows.set(n); this.page.set(1); this.menu.set(null); }
  goPage(p: number | '…'): void { if (p !== '…') this.page.set(p); }
  go(step: number): void { this.page.set(Math.min(this.pages(), Math.max(1, this.page() + step))); }

  /* ---------- row actions ---------- */
  openDetails(id: string): void { this.menu.set(null); this.dialog.set(null); this.drawer.set(id); this.store.loadDetail(id).subscribe(); }
  /** The ticked or clicked follow-ups the server lets the caller do this to; says so when some are left out. */
  private allowed(ids: string[], action: string): string[] {
    const ok = ids.filter((id) => { const f = this.store.find(id); return !!f && this.store.can(f, action); });
    if (!ok.length) this.flash('That follow-up is closed, or you are not allowed to do this to it.');
    else if (ok.length < ids.length) this.flash(`${ids.length - ok.length} of ${ids.length} left out: closed, or not yours to change.`);
    return ok;
  }
  can(f: FollowUp, action: string): boolean { return this.store.can(f, action); }
  startReassign(all: string[]): void {
    const ids = this.allowed(all, 'Reassign'); if (!ids.length) return;
    this.menu.set(null); this.targets.set(ids); this.rOwner.set(null); this.rReason.set(''); this.tried.set(false); this.dialog.set('reassign');
  }
  startEscalate(all: string[]): void {
    const ids = this.allowed(all, 'Escalate'); if (!ids.length) return;
    this.menu.set(null); this.targets.set(ids); this.eTo.set(null); this.eReason.set(''); this.eNotes.set(''); this.tried.set(false); this.dialog.set('escalate');
  }
  startReschedule(id: string): void {
    const f = this.store.find(id);
    if (!f || !this.store.can(f, 'Reschedule')) { this.flash('That follow-up is closed, or assigned to somebody else.'); return; }
    this.menu.set(null); this.targets.set([id]); this.sDate.set(f.dueAt.slice(0, 10)); this.sTime.set(f.dueAt.slice(11, 16));
    this.sReason.set(''); this.tried.set(false); this.dialog.set('reschedule');
  }
  startCancel(id: string): void {
    const f = this.store.find(id);
    if (!f || !this.store.can(f, 'Cancel')) { this.flash('That follow-up is closed, or assigned to somebody else.'); return; }
    this.menu.set(null); this.targets.set([id]); this.cReason.set(''); this.tried.set(false); this.dialog.set('cancel');
  }
  /** History comes from the follow-up's own record, because the queue rows do not always carry it. */
  showHistory(id: string): void {
    this.menu.set(null); this.targets.set([id]); this.dialog.set('history');
    this.store.loadDetail(id).subscribe();
  }
  closeDialog(): void { this.dialog.set(null); this.menu.set(null); }
  setText(sig: WritableSignal<string>, e: Event): void { sig.set((e.target as HTMLInputElement).value); }
  pickROwner(o: string): void { this.rOwner.set(o); this.menu.set(null); }
  pickEManager(m: string): void { this.eTo.set(m); this.menu.set(null); }

  confirmReassign(): void {
    this.tried.set(true);
    if (this.rError()) return;
    const count = this.targets().length;
    const owner = this.rOwner();
    this.store.reassign(this.targets(), owner!, this.rReason().trim()).subscribe({
      next: () => {
        this.flash(`${count === 1 ? 'Follow-up' : count + ' follow-ups'} reassigned to ${owner}.`);
        this.selected.set([]);
        this.dialog.set(null);
      },
      error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }
  confirmEscalate(): void {
    this.tried.set(true);
    const e = this.eErrors();
    if (e.to || e.reason) return;
    const to = this.eTo();
    this.store.escalate(this.targets(), to!, this.eReason().trim() + (this.eNotes().trim() ? ' (' + this.eNotes().trim() + ')' : '')).subscribe({
      next: () => {
        this.flash(`Escalated to ${to}.`);
        this.selected.set([]);
        this.dialog.set(null);
      },
      error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }
  confirmReschedule(): void {
    this.tried.set(true);
    const e = this.sErrors();
    if (e.date || e.time) return;
    this.store.reschedule(this.targets()[0], `${this.sDate()}T${this.sTime()}`, this.sReason()).subscribe({
      next: () => { this.flash('Follow-up rescheduled.'); this.dialog.set(null); },
      error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }
  confirmCancel(): void {
    this.tried.set(true);
    if (this.cError()) return;
    this.store.cancel(this.targets()[0], this.cReason()).subscribe({
      next: () => { this.flash('Follow-up cancelled.'); this.dialog.set(null); },
      error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }
  markDone(id: string): void {
    this.store.complete(id).subscribe({
      next: () => this.flash('Marked completed.'),
      error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }




// Pagination

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.rows())));

  /** Current page, never past the last page (e.g. after a filter shrinks the list). */
  protected readonly safePage = computed(() => Math.min(this.page(), this.pages()));

  protected readonly pageRows = computed(() => {
    const p = this.safePage();
    return this.filtered().slice((p - 1) * this.rows(), p * this.rows());
  });

  protected readonly range = computed(() => {
    const n = this.filtered().length;
    const p = this.safePage();
    return n ? { from: (p - 1) * this.rows() + 1, to: Math.min(p * this.rows(), n), n } : { from: 0, to: 0, n };
  });

  /** 5 pages or fewer: all. More: 1 2 ... 9, 1 ... 4 5 6 ... 9, 1 ... 8 9 */
  protected readonly pageList = computed<(number | '…')[]>(() => {
    const total = this.pages();
    const cur = this.safePage();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);

    const out: (number | '…')[] = [1];
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    if (start > 2) out.push('…');
    for (let p = start; p <= end; p++) out.push(p);
    if (end < total - 1) out.push('…');
    out.push(total);
    return out;
  });




  /* ---------- page actions ---------- */
  refresh(): void { this.now.set(new Date()); this.store.reload(); this.flash('Queue refreshed.'); }
  newFollowUp(): void { this.router.navigate([this.newPath]); }

  /** Play button: your own open follow-up that is due today or overdue, and not blocked. */
  isReady(f: FollowUp): boolean {
    return isOpen(f) && !f.blocked && (f.mine ?? f.owner === this.store.currentUser) && f.dueAt.slice(0, 10) <= this.todayIso();
  }
  /**
   * Execute belongs to the person the follow-up is assigned to, and nobody else (the old screen's
   * rule): it is open, it is mine, the server lists Execute for it, it is not blocked, and it is not
   * scheduled for a later day.
   */
  canRun(f: FollowUp): boolean {
    const state = (f.dueState ?? '').trim().toLowerCase();
    const upcoming = state === 'upcoming' || state === 'tomorrow' || f.dueAt.slice(0, 10) > this.todayIso();
    return isOpen(f)
      && !!f.mine
      && (f.permitted ?? []).includes('Execute')
      && !f.blocked
      && !upcoming;
  }
  run(f: FollowUp): void { this.menu.set(null); this.router.navigate([this.runPath], { queryParams: { id: f.id } }); }
  openAgenda(): void { this.setTab('today'); this.view.set('list'); }

  exportCsv(): void {
    const head = ['Reference', 'Name', 'Type', 'Record', 'Purpose', 'Channel', 'Due', 'Owner', 'Priority', 'Status'];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = this.filtered().map((f) => [f.id, f.name, f.recordType, f.recordCode, f.purpose, this.chLabel(f), `${fmtDate(f.dueAt)} ${fmtTime(f.dueAt)}`,
      f.owner, this.pri(f).label, this.st(f).label].map(esc).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'follow-ups.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); this.menuRow.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menu()) { this.menu.set(null); return; }
    if (this.dialog()) { this.dialog.set(null); return; }
    this.drawer.set(null);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');