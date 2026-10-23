import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FU_CAMPAIGNS, FU_ICONS, FollowUp, FollowUpStore, FuPerson, FuRecordType, fmtDate, fmtTime, initials, isoDay, toDate
} from '../../../Shared/layout/Donors_Leads/fu-store';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

type AbTab = 'all' | 'unassigned' | 'assigned';
type AbSla = 'breached' | 'today' | 'track' | 'none';
type AbMenu = 'owner' | 'campaign' | 'rows' | 'a-owner' | null;
type AbDialog = 'assign' | 'history' | null;

@Component({
  selector: 'app-assignment-board',
  standalone: true,
  templateUrl: './assignment-board.html',
  styleUrls: ['../../../Shared/layout/Donors_Leads/fu-shared.css', './assignment-board.css']
})
export class AssignmentBoard {
  private readonly router = inject(Router);
  protected readonly store = inject(FollowUpStore);

  protected readonly planPath = '/app/fundraising/relationships/follow-up-queue/plan';
  protected get owners() { return this.store.owners; }
  protected readonly campaigns = FU_CAMPAIGNS;
  protected readonly rowOptions = [10, 20, 50];
  protected readonly slaOptions: { key: AbSla; label: string; tone: string }[] = [
    { key: 'breached', label: 'Breached', tone: 'red' },
    { key: 'today', label: 'Due today', tone: 'amber' },
    { key: 'track', label: 'On track', tone: 'green' },
    { key: 'none', label: 'No SLA', tone: 'muted' }
  ];

  private readonly now = new Date();
  protected readonly todayIso = isoDay(this.now);

  /* ---------- state ---------- */
  protected readonly type = signal<FuRecordType>('lead');
  protected readonly tab = signal<AbTab>('all');
  protected readonly query = signal('');
  protected readonly dueToday = signal(false);
  protected readonly filtersOpen = signal(false);
  protected readonly fOwner = signal<string | null>(null);
  protected readonly fCampaign = signal<string | null>(null);
  protected readonly fSla = signal<AbSla[]>([]);
  protected readonly rows = signal(10);
  protected readonly page = signal(1);
  protected readonly selected = signal<string[]>([]);
  protected readonly menu = signal<AbMenu>(null);

  protected readonly dialog = signal<AbDialog>(null);
  protected readonly targets = signal<string[]>([]);
  protected readonly aOwner = signal<string | null>(null);
  protected readonly aNote = signal('');
  protected readonly tried = signal(false);
  protected readonly historyOf = signal<string | null>(null);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- classification ---------- */
  sla(p: FuPerson): AbSla {
    if (!p.slaDue) return 'none';
    if (p.slaDue.slice(0, 10) === this.todayIso) return 'today';
    return toDate(p.slaDue) < this.now ? 'breached' : 'track';
  }
  slaInfo(p: FuPerson) { return this.slaOptions.find((s) => s.key === this.sla(p))!; }

  private readonly ofType = computed(() => this.store.people().filter((p) => p.type === this.type()));

  protected readonly figures = computed(() => {
    const list = this.ofType();
    const total = list.length;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const noun = this.type() === 'lead' ? 'leads' : 'donors';
    const un = list.filter((p) => !p.owner).length;
    const as = total - un;
    const today = list.filter((p) => this.sla(p) === 'today').length;
    const br = list.filter((p) => this.sla(p) === 'breached').length;
    return [
      { key: 'unassigned', label: 'Unassigned', value: un, pct: pct(un), hint: `${pct(un)}% of ${noun} have no owner`, icon: 'user', tone: 'amber' },
      { key: 'assigned', label: 'Assigned', value: as, pct: pct(as), hint: `${pct(as)}% of ${noun} are owned`, icon: 'users', tone: 'primary' },
      { key: 'today', label: 'Due today', value: today, pct: pct(today), hint: `Next action due on ${today === 1 ? 'one record' : today + ' records'}`, icon: 'clock', tone: 'blue' },
      { key: 'breached', label: 'SLA breached', value: br, pct: pct(br), hint: br ? `${br} past their next-action time` : 'Nothing past its next-action time', icon: 'alert', tone: 'red' }
    ];
  });
  /** Which widget matches the current filters (for the highlighted state). */
  isFigOn(key: string): boolean {
    switch (key) {
      case 'unassigned': return this.tab() === 'unassigned';
      case 'assigned': return this.tab() === 'assigned';
      case 'today': return this.dueToday();
      case 'breached': return this.fSla().length === 1 && this.fSla()[0] === 'breached';
      default: return false;
    }
  }
  /** Widget click: filter the list to that group (click again to clear). */
  pickFigure(key: string): void {
    const on = this.isFigOn(key);
    if (key === 'unassigned' || key === 'assigned') this.tab.set(on ? 'all' : key);
    else if (key === 'today') this.dueToday.set(!on);
    else if (key === 'breached') this.fSla.set(on ? [] : ['breached']);
    this.reset();
  }

  protected readonly typeCounts = computed(() => {
    const p = this.store.people();
    return { lead: p.filter((x) => x.type === 'lead').length, donor: p.filter((x) => x.type === 'donor').length };
  });

  protected readonly tabCounts = computed(() => {
    const list = this.ofType();
    return { all: list.length, unassigned: list.filter((p) => !p.owner).length, assigned: list.filter((p) => !!p.owner).length };
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.ofType().filter((p) => {
      if (this.tab() === 'unassigned' && p.owner) return false;
      if (this.tab() === 'assigned' && !p.owner) return false;
      if (this.dueToday() && this.sla(p) !== 'today') return false;
      if (this.fOwner() && p.owner !== this.fOwner()) return false;
      if (this.fCampaign() && p.campaign !== this.fCampaign()) return false;
      if (this.fSla().length && !this.fSla().includes(this.sla(p))) return false;
      return !q || [p.name, p.code, p.email, p.phone].some((v) => v.toLowerCase().includes(q));
    });
  });



  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.rows())));

  /** Current page, never past the last page (e.g. after a filter shrinks the list). */
  protected readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));

  protected readonly pageRows = computed(() => {
    const p = this.safePage();
    return this.filtered().slice((p - 1) * this.rows(), p * this.rows());
  });

  protected readonly range = computed(() => {
    const n = this.filtered().length;
    if (!n) return '0 of 0';
    const p = this.safePage();
    return `${(p - 1) * this.rows() + 1}–${Math.min(p * this.rows(), n)} of ${n}`;
  });

  /** 0 = the "..." gap. 5 pages or fewer: show all. */
  protected readonly pages = computed<number[]>(() => {
    const total = this.totalPages();
    const cur = this.safePage();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);

    const out: number[] = [1];
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    if (start > 2) out.push(0);
    for (let p = start; p <= end; p++) out.push(p);
    if (end < total - 1) out.push(0);
    out.push(total);
    return out;
  });


  goPage(n: number): void { this.page.set(Math.min(Math.max(1, n), this.totalPages())); }


  protected readonly chips = computed(() => {
    const c: { key: string; label: string }[] = [];
    if (this.fOwner()) c.push({ key: 'owner', label: 'Owner: ' + this.fOwner() });
    if (this.fCampaign()) c.push({ key: 'campaign', label: 'Campaign: ' + this.fCampaign() });
    for (const s of this.fSla()) c.push({ key: 'sla:' + s, label: 'SLA: ' + this.slaOptions.find((o) => o.key === s)!.label });
    if (this.query().trim()) c.push({ key: 'query', label: `"${this.query().trim()}"` });
    return c;
  });
  protected readonly filterCount = computed(() => (this.fOwner() ? 1 : 0) + (this.fCampaign() ? 1 : 0) + this.fSla().length);


  protected readonly allOnPage = computed(() => this.pageRows().length > 0 && this.pageRows().every((p) => this.selected().includes(p.code)));

  /* ---------- owners panel ---------- */
  protected readonly ownerLoad = computed(() => {
    const load = this.store.load();
    const max = Math.max(1, ...this.owners.map((o) => load.get(o.name) ?? 0));
    return this.owners.map((o) => {
      const n = load.get(o.name) ?? 0;
      return { ...o, n, w: Math.round((n / max) * 100), tone: n >= max * 0.85 ? 'red' : n >= max * 0.6 ? 'amber' : 'green' };
    });
  });
  protected readonly ownerTotals = computed(() => {
    const total = this.ownerLoad().reduce((s, o) => s + o.n, 0);
    return { owners: this.owners.length, open: total, per: this.owners.length ? Math.round((total / this.owners.length) * 10) / 10 : 0 };
  });

  /* ---------- dialogs ---------- */
  protected readonly targetPeople = computed(() => this.store.people().filter((p) => this.targets().includes(p.code)));
  protected readonly aError = computed(() => (!this.aOwner() ? 'Choose an owner.' : ''));
  protected readonly historyPerson = computed(() => this.store.person(this.historyOf()));
  protected readonly historyItems = computed(() => {
    const code = this.historyOf();
    if (!code) return [];
    const items: { at: string; text: string; by: string }[] = [];
    for (const f of this.store.followUps().filter((x) => x.recordCode === code)) {
      for (const h of f.history) items.push({ ...h, text: `${h.text} - ${f.purpose}` });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  });

  /* ---------- helpers ---------- */
  icon(n: string): string { return FU_ICONS[n] ?? ''; }
  ini(n: string): string { return initials(n); }
  load(o: string): number { return this.store.load().get(o) ?? 0; }
  due(p: FuPerson): string { return p.slaDue ? fmtDate(p.slaDue) : '-'; }
  dueTime(p: FuPerson): string { return p.slaDue ? fmtTime(p.slaDue) : 'No next action'; }
  stamp(iso: string): string { return `${fmtDate(iso)} · ${fmtTime(iso)}`; }
  nextFor(p: FuPerson): FollowUp | null {
    return this.store.followUps().filter((f) => f.recordCode === p.code && !f.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null;
  }
  isSel(p: FuPerson): boolean { return this.selected().includes(p.code); }

  /* ---------- actions ---------- */
  toggleMenu(m: Exclude<AbMenu, null>, e: Event): void { e.stopPropagation(); this.menu.set(this.menu() === m ? null : m); }
  private reset(): void { this.page.set(1); this.selected.set([]); }
  setType(t: FuRecordType): void { this.type.set(t); this.reset(); }
  setTab(t: AbTab): void { this.tab.set(t); this.reset(); }
  setQuery(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.reset(); }
  toggleDueToday(): void { this.dueToday.update((v) => !v); this.reset(); }
  pickOwner(o: string | null): void { this.fOwner.set(o); this.menu.set(null); this.reset(); }
  pickCampaign(c: string | null): void { this.fCampaign.set(c); this.menu.set(null); this.reset(); }
  toggleSla(s: AbSla): void { this.fSla.update((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s])); this.reset(); }
  removeChip(key: string): void {
    if (key === 'owner') this.fOwner.set(null);
    else if (key === 'campaign') this.fCampaign.set(null);
    else if (key === 'query') this.query.set('');
    else if (key.startsWith('sla:')) this.fSla.update((l) => l.filter((x) => x !== key.slice(4)));
    this.reset();
  }
  clearAll(): void { this.fOwner.set(null); this.fCampaign.set(null); this.fSla.set([]); this.query.set(''); this.dueToday.set(false); this.reset(); }
  setRows(n: number): void { this.rows.set(n); this.menu.set(null); this.page.set(1); }


  toggleSel(p: FuPerson): void { this.selected.update((l) => (l.includes(p.code) ? l.filter((x) => x !== p.code) : [...l, p.code])); }
  togglePage(): void {
    const codes = this.pageRows().map((p) => p.code);
    this.selected.update((l) => (this.allOnPage() ? l.filter((x) => !codes.includes(x)) : [...new Set([...l, ...codes])]));
  }

  startAssign(codes: string[]): void {
    if (!codes.length) return;
    this.targets.set(codes);
    const one = codes.length === 1 ? this.store.person(codes[0]) : null;
    this.aOwner.set(one?.owner ?? null);
    this.aNote.set('');
    this.tried.set(false);
    this.dialog.set('assign');
  }
  pickAOwner(o: string): void { this.aOwner.set(o); this.menu.set(null); }
  setNote(e: Event): void { this.aNote.set((e.target as HTMLInputElement).value); }
  confirmAssign(): void {
    this.tried.set(true);
    if (this.aError()) return;
    const n = this.targets().length;
    const owner = this.aOwner()!;
    const note = this.aNote().trim();
    this.store.assignPerson(this.targets(), owner, note.length >= 10 ? note : undefined).subscribe({
      next: () => {
        this.showToast(`${n} record${n === 1 ? '' : 's'} assigned to ${owner}`);
        this.selected.set([]);
        this.closeDialog();
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e))
    });
  }
  showHistory(p: FuPerson): void { this.historyOf.set(p.code); this.dialog.set('history'); }
  schedule(p: FuPerson): void { this.router.navigate([this.planPath], { queryParams: { ref: p.code } }); }
  closeDialog(): void { this.dialog.set(null); this.menu.set(null); }

  exportCsv(): void {
    const head = ['Code', 'Name', 'Type', 'Stage', 'Owner', 'Campaign', 'Region', 'E-mail', 'Phone', 'SLA', 'Next action'];
    const lines = this.filtered().map((p) => [p.code, p.name, p.type, p.stage, p.owner ?? '', p.campaign, p.region, p.email, p.phone, this.slaInfo(p).label, p.slaDue ?? '']);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `assignment-board-${this.type()}s-${this.todayIso}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private showToast(t: string): void {
    this.toast.set(t);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.menu()) this.menu.set(null); else this.closeDialog(); }
}