import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** change these to your real routes */
const ORGS_PATH = '/app/administration/organisation/details';
const CREATE_PATH = '/app/administration/organisation/setup-wizard';

type Status = 'active' | 'review' | 'invited' | 'suspended';
type View = 'table' | 'cards';

interface Org {
  id: string;
  code: string;
  name: string;
  domain: string;
  adminEmail: string;
  people: number;
  created: string;
  status: Status;
}

/** sample data — replace with your organisations store / API */
const ORGS: Org[] = [
  { id: 'o4', code: 'TEN004', name: 'Unity for Change', domain: 'unityforchange.localhost', adminEmail: 'rahul.mukund@unityforchange.test', people: 1, created: 'Oct 14, 2026', status: 'invited' },
  { id: 'o3', code: 'TEN003', name: 'Global Relief Foundation', domain: 'globalrelief.localhost', adminEmail: 'farah.naseem@globalreliefoundation.test', people: 1, created: 'Oct 14, 2026', status: 'invited' },
  { id: 'o2', code: 'TEN002', name: 'HelpAge India', domain: 'helpageindia.localhost', adminEmail: 'arvind.murali@helpageindia.test', people: 21, created: 'Oct 14, 2026', status: 'active' },
  { id: 'o1', code: 'TEN001', name: 'Smile Foundation', domain: 'smilefoundation.localhost', adminEmail: 'anjali.prakash@smilefoundationindia.test', people: 21, created: 'Oct 14, 2026', status: 'active' }
];

const STATUS: Record<Status, { label: string; tone: 'ok' | 'warn' | 'info' | 'bad' }> = {
  active: { label: 'Active', tone: 'ok' },
  review: { label: 'Awaiting review', tone: 'warn' },
  invited: { label: 'Invitation sent', tone: 'info' },
  suspended: { label: 'Suspended', tone: 'bad' }
};

const ICONS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  building: 'M5 21V4h9v17 M14 9h5v12 M3 21h18 M8 8h2M8 12h2M8 16h2',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8.5 12.5l2.5 2.5 4.5-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M5.6 5.6l12.8 12.8',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3.2 3 14.8 0 18 M12 3c-3 3.2-3 14.8 0 18',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  people: 'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20 M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M22 20v-1.5a4 4 0 0 0-3-3.87 M16 3.63a4 4 0 0 1 0 7.75',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v5M16 3v5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  enter: 'M10 17l5-5-5-5 M15 12H3 M14 4h6v16h-6',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  close: 'M6 6l12 12M18 6L6 18',
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6'
};

const STATUS_ICON: Record<Status, string> = { active: 'check', review: 'clock', invited: 'mail', suspended: 'ban' };
const PAGE_SIZE = 12;

/** Organisations — Workspace Kit layout: heading and one card: KPI widgets, filters,
 *  a card grid or list, and pagination. */
@Component({
  selector: 'app-organisations',
  templateUrl: './organisations.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './organisations.css']
})
export class Organisations {
  private readonly router = inject(Router);

  readonly orgs = signal<Org[]>(ORGS);
  readonly query = signal('');
  readonly status = signal<Status | ''>('');
  readonly view = signal<View>('cards');
  readonly page = signal(1);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly statuses = (Object.keys(STATUS) as Status[]).map((key) => ({ key, label: STATUS[key].label }));
  readonly notice = signal('');
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  /** KPI widgets: big number, one side figure and a short footnote */
  readonly kpis = computed(() => {
    const all = this.orgs();
    const total = all.length;
    const by = (st: Status) => all.filter((o) => o.status === st);
    const share = (n: number) => (total ? Math.round((n / total) * 100) : 0) + '%';
    const active = by('active');
    const largest = [...active].sort((x, y) => y.people - x.people)[0];
    return [
      {
        label: 'Organisations', icon: 'building', tone: 'plain', value: total,
        sideValue: String(all.reduce((n, o) => n + o.people, 0)), sideLabel: 'People',
        note: `${active.length} active · ${by('invited').length} onboarding`
      },
      {
        label: 'Active', icon: 'check', tone: 'ok', value: active.length,
        sideValue: share(active.length), sideLabel: 'Of all',
        note: largest ? `Largest: ${largest.name} (${largest.people} people)` : 'No active organisations yet'
      },
      {
        label: 'Awaiting review', icon: 'clock', tone: 'warn', value: by('review').length,
        sideValue: share(by('review').length), sideLabel: 'Of all', note: 'Waiting for approval'
      },
      {
        label: 'Onboarding', icon: 'pencil', tone: 'info', value: by('invited').length,
        sideValue: share(by('invited').length), sideLabel: 'Of all', note: 'Invitation sent, not yet activated'
      },
      {
        label: 'Suspended', icon: 'ban', tone: 'bad', value: by('suspended').length,
        sideValue: share(by('suspended').length), sideLabel: 'Of all', note: 'Temporarily suspended'
      }
    ];
  });

  readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const s = this.status();
    return this.orgs().filter((o) =>
      (!s || o.status === s) &&
      (!q || [o.name, o.code, o.domain, o.adminEmail].some((v) => v.toLowerCase().includes(q))));
  });

  readonly hasFilters = computed(() => !!(this.query().trim() || this.status()));

  readonly pages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE_SIZE)));
  readonly current = computed(() => Math.min(this.page(), this.pages()));
  readonly paged = computed(() => this.rows().slice((this.current() - 1) * PAGE_SIZE, this.current() * PAGE_SIZE));
  readonly from = computed(() => (this.rows().length ? (this.current() - 1) * PAGE_SIZE + 1 : 0));
  readonly to = computed(() => Math.min(this.current() * PAGE_SIZE, this.rows().length));

  /** every organisation on the current page is ticked */
  readonly allSelected = computed(() => this.paged().length > 0 && this.paged().every((o) => this.selected().has(o.id)));

  icon(name: string): string { return ICONS[name] ?? ''; }
  label(s: Status): string { return STATUS[s].label; }
  tone(s: Status): string { return STATUS[s].tone; }
  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  statusIcon(s: Status): string { return STATUS_ICON[s]; }

  onSearch(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.page.set(1); }
  onStatus(e: Event): void { this.status.set((e.target as HTMLSelectElement).value as Status | ''); this.page.set(1); }

  isSelected(id: string): boolean { return this.selected().has(id); }
  toggle(id: string): void {
    this.selected.update((set) => { const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  toggleAll(): void {
    const ids = this.paged().map((o) => o.id);
    const all = this.allSelected();
    this.selected.update((set) => { const next = new Set(set); ids.forEach((id) => (all ? next.delete(id) : next.add(id))); return next; });
  }
  clearSelection(): void { this.selected.set(new Set()); }

  go(delta: number): void { this.page.set(Math.min(this.pages(), Math.max(1, this.current() + delta))); }
  setView(v: View): void { this.view.set(v); }
  clearFilters(): void { this.query.set(''); this.status.set(''); this.page.set(1); }

  primary(o: Org): { label: string; icon: string } | null {
    switch (o.status) {
      case 'invited': return { label: 'Re-send invitation', icon: 'mail' };
      case 'active': return { label: 'Work inside', icon: 'enter' };
      case 'review': return { label: 'Review', icon: 'check' };
      default: return null;
    }
  }

  runPrimary(o: Org): void {
    if (o.status === 'invited') {
      this.flash(`Invitation re-sent to ${o.adminEmail}`);
    }
  }

  open(o: Org): void { this.router.navigate([ORGS_PATH], { queryParams: { id: o.id } }); }
  create(): void { this.router.navigate([CREATE_PATH]); }

  dismissNotice(): void { this.notice.set(''); }
  private flash(msg: string): void {
    this.notice.set(msg);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3500);
  }
}