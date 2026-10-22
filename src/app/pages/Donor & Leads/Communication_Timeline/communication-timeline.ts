import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommunicationStore, OUTCOME_GROUPS, OutcomeGroup, CommEntry, healthLabel, CommChannel, channelOf, isoDay, MONTHS, outcomeOf, COMM_ICONS, entryTitle, outcomeTone, pad2, Temperature, Level3, daysBetween } from '../../../Shared/layout/Donors_Leads/Store';

import { apiErrorMessage } from '../../../Shared/models/api-response.model';

export type CtTab = 'all' | 'call' | 'email' | 'meeting' | 'important';
type CtMenu = 'filters' | 'rows' | null;

@Component({
  selector: 'app-communication-timeline',
  standalone: true,
  templateUrl: './communication-timeline.html',
  styleUrl: './communication-timeline.css'
})
export class CommunicationTimeline {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(CommunicationStore);

  protected readonly logPath = '/app/fundraising/relationships/communication-timeline/log';
  protected readonly backPath = '/app/fundraising/relationships/lead-work-queue';
  protected readonly followUpPath = '/app/fundraising/relationships/follow-up-queue';
  protected readonly outcomeGroups = OUTCOME_GROUPS;
  protected readonly rowOptions = [10, 20, 50];

  private readonly ref = this.route.snapshot.queryParamMap.get('ref');

  constructor() { this.store.load(this.ref); }
  protected readonly lead = computed(() => this.store.lead(this.ref));
  protected readonly all = computed(() => this.store.entriesFor(this.lead().code));
  protected readonly today = new Date();

  /* ---------- view state ---------- */
  protected readonly tab = signal<CtTab>('all');
  protected readonly query = signal('');
  protected readonly fGroups = signal<OutcomeGroup[]>([]);
  protected readonly fDirection = signal<'any' | 'out' | 'in'>('any');
  protected readonly menu = signal<CtMenu>(null);
  protected readonly rows = signal(10);
  protected readonly page = signal(1);
  protected readonly viewing = signal<CommEntry | null>(null);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- figures ---------- */
  protected readonly initials = computed(() => this.lead().name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  protected readonly health = computed(() => ({ value: this.lead().health, ...healthLabel(this.lead().health) }));

  protected readonly figures = computed(() => {
    const list = this.all();
    const of = (c: CommChannel) => list.filter((e) => e.channel === c);
    const calls = of('call');
    const last = (l: CommEntry[]) => (l.length ? 'Last on ' + this.date(l[0].at) : 'None logged');
    return [
      { key: 'logged', label: 'Logged', value: list.length, sub: list.length === 1 ? 'entry' : 'entries', tone: 'muted' },
      { key: 'call', label: 'Calls', value: calls.length, sub: last(calls), tone: 'primary' },
      { key: 'email', label: 'E-mails', value: of('email').length, sub: last(of('email')), tone: 'green' },
      { key: 'meeting', label: 'Meetings', value: of('meeting').length, sub: last(of('meeting')), tone: 'amber' }
    ];
  });

  protected readonly lastContact = computed(() => {
    const e = this.all()[0];
    if (!e) return null;
    const days = daysBetween(new Date(e.at), this.today);
    return { ago: days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`, date: this.date(e.at), channel: channelOf(e.channel).label };
  });

  /** Last 8 weeks: one bar per week (oldest first), height by number of entries. */
  protected readonly heat = computed(() => {
    const end = new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
    const start = new Date(end);
    start.setDate(end.getDate() - 55);
    const weeks = Array.from({ length: 8 }, (_, w) => {
      const from = new Date(start);
      from.setDate(start.getDate() + w * 7);
      const to = new Date(from);
      to.setDate(from.getDate() + 6);
      return { from: isoDay(from), to: isoDay(to), n: 0, label: `${from.getDate()} ${MONTHS[from.getMonth()]}`, current: w === 7 };
    });
    const days = new Set<string>();
    for (const e of this.all()) {
      const d = e.at.slice(0, 10);
      const wk = weeks.find((w) => d >= w.from && d <= w.to);
      if (wk) { wk.n++; days.add(d); }
    }
    const max = Math.max(1, ...weeks.map((w) => w.n));
    return {
      weeks: weeks.map((w) => ({ ...w, pct: w.n ? Math.max(18, Math.round((w.n / max) * 100)) : 0, tip: `Week of ${w.label}: ${w.n} ${w.n === 1 ? 'entry' : 'entries'}` })),
      active: days.size,
      first: weeks[0].label
    };
  });

  /* ---------- list ---------- */
  protected readonly tabs = computed(() => {
    const list = this.all();
    return [
      { key: 'all' as CtTab, label: 'All', n: list.length },
      { key: 'call' as CtTab, label: 'Calls', n: list.filter((e) => e.channel === 'call').length },
      { key: 'email' as CtTab, label: 'E-mails', n: list.filter((e) => e.channel === 'email').length },
      { key: 'meeting' as CtTab, label: 'Meetings', n: list.filter((e) => e.channel === 'meeting').length },
      { key: 'important' as CtTab, label: 'Important', n: list.filter((e) => e.important).length }
    ];
  });

  protected readonly filtered = computed(() => {
    const t = this.tab();
    const q = this.query().trim().toLowerCase();
    const groups = this.fGroups();
    const dir = this.fDirection();
    return this.all().filter((e) =>
      (t === 'all' || (t === 'important' ? e.important : e.channel === t)) &&
      (!groups.length || groups.includes(outcomeOf(e.outcome).group)) &&
      (dir === 'any' || e.direction === dir) &&
      (!q || `${e.summary} ${e.note} ${e.by} ${outcomeOf(e.outcome).label} ${channelOf(e.channel).label}`.toLowerCase().includes(q)));
  });
  protected readonly filterCount = computed(() => this.fGroups().length + (this.fDirection() !== 'any' ? 1 : 0));
  protected readonly anyFilter = computed(() => this.tab() !== 'all' || !!this.query().trim() || this.filterCount() > 0);

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.rows())));
  protected readonly pageRows = computed(() => {
    const p = Math.min(this.page(), this.pages());
    return this.filtered().slice((p - 1) * this.rows(), p * this.rows());
  });
  protected readonly range = computed(() => {
    const n = this.filtered().length;
    if (!n) return { from: 0, to: 0, n };
    const p = Math.min(this.page(), this.pages());
    return { from: (p - 1) * this.rows() + 1, to: Math.min(p * this.rows(), n), n };
  });

  /** Page rows grouped by month (newest first). */
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; items: CommEntry[] }[] = [];
    for (const e of this.pageRows()) {
      const key = e.at.slice(0, 7);
      let g = out.find((x) => x.key === key);
      if (!g) {
        const d = new Date(e.at);
        g = { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  });

  /* ---------- helpers ---------- */
  icon(n: string): string { return COMM_ICONS[n] ?? ''; }
  channelIcon(e: CommEntry): string { return COMM_ICONS[channelOf(e.channel).icon]; }
  title(e: CommEntry): string { return entryTitle(e.channel, e.direction); }
  outcome(e: CommEntry): string { return outcomeOf(e.outcome).label; }
  tone(e: CommEntry): string { return outcomeTone(e.outcome); }
  date(at: string): string { const d = new Date(at); return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
  day(at: string): string { return pad2(new Date(at).getDate()); }
  weekday(at: string): string { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(at).getDay()]; }
  time(at: string): string { const d = new Date(at); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  ago(at: string): string {
    const n = daysBetween(new Date(at), this.today);
    return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
  }
  hasGroup(g: OutcomeGroup): boolean { return this.fGroups().includes(g); }

  /* ---------- actions ---------- */
  setTab(t: CtTab): void { this.tab.set(t); this.page.set(1); }
  setQuery(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.page.set(1); }
  toggleMenu(m: Exclude<CtMenu, null>, e: Event): void { e.stopPropagation(); this.menu.set(this.menu() === m ? null : m); }
  toggleGroup(g: OutcomeGroup): void {
    this.fGroups.update((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));
    this.page.set(1);
  }
  setDirection(d: 'any' | 'out' | 'in'): void { this.fDirection.set(d); this.page.set(1); }
  clearFilters(): void {
    this.tab.set('all');
    this.query.set('');
    this.fGroups.set([]);
    this.fDirection.set('any');
    this.page.set(1);
    this.menu.set(null);
  }
  setRows(n: number): void { this.rows.set(n); this.page.set(1); this.menu.set(null); }
  go(step: number): void { this.page.set(Math.min(this.pages(), Math.max(1, this.page() + step))); }

  toggleImportant(e: CommEntry): void {
    this.store.toggleImportant(e.id).subscribe({ error: (err: unknown) => this.flash(apiErrorMessage(err)) });
  }
  setTemperature(t: Temperature): void {
    this.store.setStanding(this.lead().code, { temperature: t }).subscribe({
      next: () => this.flash('Temperature updated.'), error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }
  setPotential(p: Level3): void {
    this.store.setStanding(this.lead().code, { potential: p }).subscribe({
      next: () => this.flash('Donation potential updated.'), error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }

  logCommunication(): void { this.router.navigate([this.logPath], { queryParams: { ref: this.lead().code } }); }
  back(): void { this.router.navigate([this.backPath]); }
  scheduleFollowUp(): void { this.router.navigate([this.followUpPath], { queryParams: { ref: this.lead().code, new: 1 } }); }

  copyLink(): void {
    navigator.clipboard?.writeText(this.lead().donationLink).then(() => this.flash('Donation link copied.'), () => this.flash('Could not copy the link.'));
  }

  exportCsv(): void {
    this.store.export(this.lead().code).subscribe({
      next: ({ blob, fileName }) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: (err: unknown) => this.flash(apiErrorMessage(err))
    });
  }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2400);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menu()) { this.menu.set(null); return; }
    this.viewing.set(null);
  }
}