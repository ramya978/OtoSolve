import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DonorApiService } from '../../../Service/donor-api.service';
import {
  FU_ICONS, FollowUp, FollowUpStore, FuPerson, FuRecordType, fmtDate, fmtTime, initials, isoAt, isoDay, toDate
} from '../../../Shared/layout/Donors_Leads/fu-store';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import {
  AssignmentBoardResponse, AssignmentBoardRow, AssignmentRequest, DonLookupItem, OwnerWorkload, QueueView
} from '../../../Shared/models/donor-contract.model';

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
export class AssignmentBoard implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(DonorApiService);
  protected readonly store = inject(FollowUpStore);

  protected readonly planPath = '/app/fundraising/relationships/follow-up-queue/plan';
  /** The board's own owners (with their open work), else the queue's list of people work can go to. */
  protected get owners(): { name: string; team: string }[] {
    const own = this.boardOwners();
    return own.length ? own.map((o) => ({ name: o.name, team: o.teamCode ?? '' })) : this.store.owners;
  }
  protected get campaigns(): string[] { return this.campaignOptions.map((c) => c.label); }
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

  /* ---------- the board, as the server pages, filters and counts it ---------- */
  private readonly boardRows = signal<FuPerson[]>([]);
  protected readonly totalRows = signal(0);
  private readonly pageCount = signal(1);
  private readonly strip = signal({ unassigned: 0, assigned: 0, dueToday: 0, breached: 0 });
  private readonly typeTotals = signal({ lead: 0, donor: 0 });
  private readonly boardOwners = signal<OwnerWorkload[]>([]);
  private readonly views = signal<QueueView[]>([]);
  private readonly bulkMax = signal(50);
  private readonly permitted = signal<string[]>([]);
  protected readonly loadingBoard = signal(false);
  private campaignOptions: DonLookupItem[] = [];
  private slaOptionsServer: DonLookupItem[] = [];
  private recordTypes: DonLookupItem[] = [];
  private readonly known = new Map<string, FuPerson>();
  private readonly slaByCode = new Map<string, string>();
  private readonly versions = new Map<string, number>();
  private seq = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sideDone = new Set<string>();

  /**
   * The leads the queue handed over (Assign / Reassign on one row, or Assign on a ticked set). The board
   * lists only those and ticks them, so the person lands on the records they chose, not on the whole board.
   */
  protected readonly pinned = signal<string[]>([]);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    if ((q.get('recordType') ?? '').toLowerCase().startsWith('donor')) {
      // From the Donor list: the donor's number is searched for, so the row is on the page.
      this.type.set('donor');
      this.query.set(q.get('search') ?? '');
    } else {
      const ids = [q.get('leadId'), ...(q.get('leadIds') ?? '').split(',')].map((v) => (v ?? '').trim()).filter(Boolean);
      this.pinned.set([...new Set(ids)]);
    }
    this.loadBoard();
  }

  private norm(v: string | null | undefined): string { return (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  private slaKey(state: string | null | undefined): AbSla {
    const n = this.norm(state);
    if (n.includes('breach') || n.includes('overdue')) return 'breached';
    if (n.includes('today') || n.includes('soon') || n.includes('due')) return 'today';
    if (n.includes('track')) return 'track';
    return 'none';
  }
  /** The server's value for one of the screen's SLA words. */
  private slaValue(key: AbSla): string | null {
    const word = { breached: 'breach', today: 'today', track: 'track', none: 'no' }[key];
    return this.slaOptionsServer.find((o) => this.norm(o.value).includes(word) || this.norm(o.label).includes(word))?.value ?? null;
  }
  private recordTypeValue(t: FuRecordType): string {
    return this.recordTypes.find((o) => this.norm(o.value) === t)?.value ?? (t === 'lead' ? 'Lead' : 'Donor');
  }
  private viewValue(tab: AbTab): string | null {
    if (tab === 'all') return null;
    return this.views().find((v) => this.norm(v.value) === tab || this.norm(v.label).startsWith(tab))?.value ?? tab;
  }
  protected ownerIdOf(name: string | null): string {
    if (!name) return '';
    return this.boardOwners().find((o) => o.name === name)?.userId ?? this.store.ownerId(name);
  }

  private buildFilter(type: FuRecordType = this.type()): Record<string, unknown> {
    const f: Record<string, unknown> = { page: this.page(), pageSize: this.rows(), recordType: this.recordTypeValue(type) };
    const view = this.viewValue(this.tab());
    if (view) f['view'] = view;
    if (this.query().trim()) f['search'] = this.query().trim();
    const owner = this.ownerIdOf(this.fOwner());
    if (owner) f['ownerUserId'] = owner;
    if (type === 'lead') {
      if (this.pinned().length) f['leadIds'] = this.pinned().join(',');
      // The id, not the label: the dropdowns show names, the API filters on the lookup value.
      const campaign = this.campaignOptions.find((c) => c.label === this.fCampaign());
      if (campaign) f['campaignId'] = campaign.value;
      // The server takes one SLA state; several ticked states are narrowed on the page below.
      const one = this.dueToday() ? 'today' : this.fSla().length === 1 ? this.fSla()[0] : null;
      const sla = one ? this.slaValue(one) : null;
      if (sla) f['slaState'] = sla;
    }
    return f;
  }

  loadBoard(): void {
    const n = ++this.seq;
    const type = this.type();
    this.loadingBoard.set(true);
    this.api.getAssignmentBoard(this.buildFilter(type)).subscribe({
      next: (r) => { if (n === this.seq) this.apply(r, type); },
      error: (e: unknown) => { if (n === this.seq) { this.loadingBoard.set(false); this.showToast(apiErrorMessage(e)); } }
    });
  }

  private toPerson(r: AssignmentBoardRow): FuPerson {
    return {
      id: r.leadId, code: r.leadReference, name: r.displayName || r.leadPreview, type: r.recordType === 'Donor' ? 'donor' : 'lead',
      stage: r.status, owner: r.currentOwnerName, email: '', phone: '', language: r.preferredLanguageLabel ?? r.preferredLanguage ?? '',
      bestTime: null, campaign: r.campaignName ?? '', region: r.teamCode ?? '', consent: {},
      slaDue: r.nextActionDueUtc ? isoAt(new Date(r.nextActionDueUtc)) : null, source: ''
    };
  }

  private apply(r: AssignmentBoardResponse, type: FuRecordType): void {
    const people = r.rows.items.map((row) => {
      const p = this.toPerson(row);
      this.known.set(p.code, p);
      this.slaByCode.set(p.code, row.slaStateLabel ?? row.slaState);
      this.versions.set(p.code, row.version);
      return p;
    });
    this.boardRows.set(people);
    // Rows handed over from the queue arrive ticked, ready for Assign.
    if (this.pinned().length && !this.selected().length) this.selected.set(people.map((p) => p.code));
    this.totalRows.set(r.rows.totalCount);
    this.pageCount.set(Math.max(1, r.rows.totalPages));
    this.boardOwners.set(r.owners ?? []);
    this.views.set(r.views ?? []);
    this.bulkMax.set(r.bulkRouteMaximumItems || 50);
    this.permitted.set(r.permittedActions ?? []);
    this.campaignOptions = r.campaignOptions ?? [];
    this.slaOptionsServer = r.slaStateOptions ?? [];
    this.recordTypes = r.recordTypeOptions ?? [];
    this.strip.update((s) => ({ ...s, unassigned: r.unassignedCount ?? 0, assigned: r.assignedCount ?? 0, dueToday: r.dueTodayCount ?? 0 }));
    this.typeTotals.update((t) => ({ ...t, [type]: (r.unassignedCount ?? 0) + (r.assignedCount ?? 0) }));
    this.loadingBoard.set(false);
    this.loadSideCounts(type);
  }

  /** The other tab's total and the SLA-breached count, each asked once with a one-row page. */
  private loadSideCounts(type: FuRecordType): void {
    const other: FuRecordType = type === 'lead' ? 'donor' : 'lead';
    if (!this.sideDone.has('type:' + other)) {
      this.sideDone.add('type:' + other);
      this.api.getAssignmentBoard({ page: 1, pageSize: 1, recordType: this.recordTypeValue(other) }).subscribe({
        next: (r) => this.typeTotals.update((t) => ({ ...t, [other]: (r.unassignedCount ?? 0) + (r.assignedCount ?? 0) })),
        error: () => this.sideDone.delete('type:' + other)
      });
    }
    if (type === 'lead' && !this.sideDone.has('breached')) {
      const sla = this.slaValue('breached');
      if (!sla) return;
      this.sideDone.add('breached');
      this.api.getAssignmentBoard({ page: 1, pageSize: 1, recordType: this.recordTypeValue('lead'), slaState: sla }).subscribe({
        next: (r) => this.strip.update((s) => ({ ...s, breached: r.rows.totalCount })),
        error: () => this.sideDone.delete('breached')
      });
    }
  }

  /* ---------- classification ---------- */
  sla(p: FuPerson): AbSla {
    const server = this.slaByCode.get(p.code);
    if (server !== undefined) return this.slaKey(server);
    if (!p.slaDue) return 'none';
    if (p.slaDue.slice(0, 10) === this.todayIso) return 'today';
    return toDate(p.slaDue) < this.now ? 'breached' : 'track';
  }
  slaInfo(p: FuPerson) { return this.slaOptions.find((s) => s.key === this.sla(p))!; }

  protected readonly figures = computed(() => {
    const s = this.strip();
    const total = s.unassigned + s.assigned;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const noun = this.type() === 'lead' ? 'leads' : 'donors';
    const un = s.unassigned, as = s.assigned, today = s.dueToday, br = s.breached;
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

  protected readonly typeCounts = computed(() => this.typeTotals());

  protected readonly tabCounts = computed(() => {
    const s = this.strip();
    return { all: s.unassigned + s.assigned, unassigned: s.unassigned, assigned: s.assigned };
  });

  /** This page's rows. Two or more ticked SLA states are narrowed here, since the server takes one. */
  protected readonly pageRows = computed(() => {
    const list = this.boardRows();
    return this.fSla().length > 1 ? list.filter((p) => this.fSla().includes(this.sla(p))) : list;
  });

  protected readonly totalPages = computed(() => this.pageCount());

  /** Current page, never past the last page (e.g. after a filter shrinks the list). */
  protected readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));

  protected readonly range = computed(() => {
    const n = this.totalRows();
    if (!n) return '0 of 0';
    const p = this.safePage();
    return `${(p - 1) * this.rows() + 1}–${Math.min((p - 1) * this.rows() + this.boardRows().length, n)} of ${n}`;
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


  goPage(n: number): void { this.page.set(Math.min(Math.max(1, n), this.totalPages())); this.loadBoard(); }


  protected readonly chips = computed(() => {
    const c: { key: string; label: string }[] = [];
    if (this.fOwner()) c.push({ key: 'owner', label: 'Owner: ' + this.fOwner() });
    if (this.fCampaign()) c.push({ key: 'campaign', label: 'Campaign: ' + this.fCampaign() });
    if (this.pinned().length) c.push({ key: 'pinned', label: this.pinned().length === 1 ? 'The lead opened from the queue' : `${this.pinned().length} leads selected in the queue` });
    for (const s of this.fSla()) c.push({ key: 'sla:' + s, label: 'SLA: ' + this.slaOptions.find((o) => o.key === s)!.label });
    if (this.query().trim()) c.push({ key: 'query', label: `"${this.query().trim()}"` });
    return c;
  });
  protected readonly filterCount = computed(() => (this.fOwner() ? 1 : 0) + (this.fCampaign() ? 1 : 0) + this.fSla().length);


  protected readonly allOnPage = computed(() => this.pageRows().length > 0 && this.pageRows().every((p) => this.selected().includes(p.code)));

  /* ---------- owners panel ---------- */
  protected readonly ownerLoad = computed(() => {
    const list = this.boardOwners();
    const max = Math.max(1, ...list.map((o) => o.openWorkCount));
    return list.map((o) => {
      const n = o.openWorkCount;
      return { name: o.name, team: o.teamCode ?? '', n, w: Math.round((n / max) * 100), tone: n >= max * 0.85 ? 'red' : n >= max * 0.6 ? 'amber' : 'green' };
    });
  });
  protected readonly ownerTotals = computed(() => {
    const total = this.ownerLoad().reduce((s, o) => s + o.n, 0);
    const count = this.ownerLoad().length;
    return { owners: count, open: total, per: count ? Math.round((total / count) * 10) / 10 : 0 };
  });

  /* ---------- dialogs ---------- */
  protected readonly targetPeople = computed(() => this.targets().map((c) => this.known.get(c)).filter((p): p is FuPerson => !!p));
  protected readonly aError = computed(() => (!this.aOwner() ? 'Choose an owner.' : ''));
  protected readonly historyPerson = signal<FuPerson | null>(null);
  /** The record's ownership trail from the server (who held it, who moved it, why), newest first. */
  protected readonly historyItems = signal<{ at: string; text: string; by: string }[]>([]);

  /* ---------- helpers ---------- */
  icon(n: string): string { return FU_ICONS[n] ?? ''; }
  ini(n: string): string { return initials(n); }
  load(o: string): number { return this.boardOwners().find((x) => x.name === o)?.openWorkCount ?? 0; }
  due(p: FuPerson): string { return p.slaDue ? fmtDate(p.slaDue) : '-'; }
  dueTime(p: FuPerson): string { return p.slaDue ? fmtTime(p.slaDue) : 'No next action'; }
  stamp(iso: string): string { return `${fmtDate(iso)} · ${fmtTime(iso)}`; }
  nextFor(p: FuPerson): FollowUp | null {
    return this.store.followUps().filter((f) => f.recordCode === p.code && !f.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null;
  }
  isSel(p: FuPerson): boolean { return this.selected().includes(p.code); }

  /* ---------- actions ---------- */
  toggleMenu(m: Exclude<AbMenu, null>, e: Event): void { e.stopPropagation(); this.menu.set(this.menu() === m ? null : m); }
  private reset(): void { this.page.set(1); this.selected.set([]); this.loadBoard(); }
  setType(t: FuRecordType): void { this.type.set(t); this.reset(); }
  setTab(t: AbTab): void { this.tab.set(t); this.reset(); }
  setQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.page.set(1); this.selected.set([]);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadBoard(), 300);
  }
  toggleDueToday(): void { this.dueToday.update((v) => !v); this.reset(); }
  pickOwner(o: string | null): void { this.fOwner.set(o); this.menu.set(null); this.reset(); }
  pickCampaign(c: string | null): void { this.fCampaign.set(c); this.menu.set(null); this.reset(); }
  toggleSla(s: AbSla): void { this.fSla.update((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s])); this.reset(); }
  removeChip(key: string): void {
    if (key === 'pinned') this.pinned.set([]);
    else if (key === 'owner') this.fOwner.set(null);
    else if (key === 'campaign') this.fCampaign.set(null);
    else if (key === 'query') this.query.set('');
    else if (key.startsWith('sla:')) this.fSla.update((l) => l.filter((x) => x !== key.slice(4)));
    this.reset();
  }
  clearAll(): void { this.pinned.set([]); this.fOwner.set(null); this.fCampaign.set(null); this.fSla.set([]); this.query.set(''); this.dueToday.set(false); this.reset(); }
  setRows(n: number): void { this.rows.set(n); this.menu.set(null); this.page.set(1); this.loadBoard(); }


  toggleSel(p: FuPerson): void { this.selected.update((l) => (l.includes(p.code) ? l.filter((x) => x !== p.code) : [...l, p.code])); }
  togglePage(): void {
    const codes = this.pageRows().map((p) => p.code);
    this.selected.update((l) => (this.allOnPage() ? l.filter((x) => !codes.includes(x)) : [...new Set([...l, ...codes])]));
  }

  startAssign(codes: string[]): void {
    if (!codes.length) return;
    if (codes.length > this.bulkMax()) {
      this.showToast(`Bulk assign takes at most ${this.bulkMax()} records at a time. ${codes.length} are selected.`);
      return;
    }
    this.targets.set(codes);
    const one = codes.length === 1 ? this.known.get(codes[0]) ?? null : null;
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
    const people = this.targetPeople();
    const n = people.length;
    const owner = this.aOwner()!;
    const ownerId = this.ownerIdOf(owner);
    if (!ownerId) { this.showToast('Choose an owner from the list.'); return; }
    const note = this.aNote().trim();
    const reason = note.length >= 10 ? note : 'Assigned from the assignment board.';
    const recordType = people[0]?.type === 'donor' ? 'Donor' as const : 'Lead' as const;
    const done = (msg: string) => { this.showToast(msg); this.selected.set([]); this.closeDialog(); this.loadBoard(); };
    const fail = (e: unknown) => this.showToast(apiErrorMessage(e));

    if (n > 1 && this.permitted().includes('Bulk route')) {
      // One request for the lot; the answer reports every record, so skipped ones are named.
      this.api.bulkRoute({
        recordType, leadIds: people.map((p) => p.id!), newOwnerUserId: ownerId, newOwnerName: owner, assignmentReason: reason
      }).subscribe({
        next: (r) => done(r.message || `${r.routedCount} of ${r.requestedCount} assigned to ${owner}${r.skippedCount ? `, ${r.skippedCount} skipped` : ''}`),
        error: fail
      });
      return;
    }
    forkJoin(people.map((p) => {
      const call: AssignmentRequest = {
        recordType, leadId: p.id!, newOwnerUserId: ownerId, newOwnerName: owner, assignmentReason: reason,
        expectedVersion: this.versions.get(p.code) ?? null
      };
      return p.owner ? this.api.reassignFromBoard(call) : this.api.assignFromBoard(call);
    })).subscribe({ next: () => done(`${n} record${n === 1 ? '' : 's'} assigned to ${owner}`), error: fail });
  }
  showHistory(p: FuPerson): void {
    this.historyPerson.set(p);
    this.historyItems.set([]);
    this.dialog.set('history');
    const trail = p.type === 'donor' ? this.api.getDonorOwnershipHistory(p.id!) : this.api.getAssignmentHistory(p.id!);
    trail.subscribe({
      next: (h) => this.historyItems.set((h?.items ?? []).map((i) => ({
        at: isoAt(new Date(i.effectiveAtUtc)),
        text: `${i.eventLabel || (i.previousOwnerName ? 'Reassigned' : 'Assigned')}: ${i.previousOwnerName ?? 'Unassigned'} → ${i.newOwnerName}${i.assignmentReason ? ' - ' + i.assignmentReason : ''}`,
        by: i.assignedByName ?? ''
      })).sort((a, b) => b.at.localeCompare(a.at))),
      error: (e: unknown) => this.showToast(apiErrorMessage(e))
    });
  }
  schedule(p: FuPerson): void {
    this.router.navigate([this.planPath], { queryParams: { ref: p.code, [p.type === 'lead' ? 'leadId' : 'donorId']: p.id } });
  }
  closeDialog(): void { this.dialog.set(null); this.menu.set(null); }

  /** The board as CSV under the same filters, written and logged by the server. */
  exportCsv(): void {
    this.api.exportAssignmentBoard(this.buildFilter()).subscribe({
      next: ({ blob, fileName }) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName || `assignment-board-${this.type()}s-${this.todayIso}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e))
    });
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