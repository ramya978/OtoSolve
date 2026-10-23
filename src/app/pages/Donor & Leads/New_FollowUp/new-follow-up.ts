import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FU_ICONS, FollowUp, FollowUpStore, FuPerson, FuRecordType, MONTHS, WEEKDAYS, channelOf, fmtTime, initials, isOpen,
  priorityOf, toDate
} from '../../../Shared/layout/Donors_Leads/fu-store';

/* =====================================================================================================
   NEW FOLLOW-UP  (route /app/fundraising/relationships/follow-up-queue/new)
   Page header (Back) → "Who is it for?" card (Leads / Donors, search, list, Plan →)
   → side card "Already scheduled" (open follow-ups by due date, paged).
   Plan → opens the planner with ?ref=<record code>.
   ===================================================================================================== */

@Component({
  selector: 'app-new-follow-up',
  standalone: true,
  templateUrl: './new-follow-up.html',
  styleUrls: ['../../../Shared/layout/Donors_Leads/fu-shared.css', './new-follow-up.css']
})
export class NewFollowUp {
  private readonly router = inject(Router);
  protected readonly store = inject(FollowUpStore);

  protected readonly queuePath = '/app/fundraising/relationships/follow-up-queue';
  protected readonly planPath = '/app/fundraising/relationships/follow-up-queue/plan';

  protected readonly type = signal<FuRecordType>('lead');
  protected readonly query = signal('');

  /* main table paging */
  protected readonly page = signal(1);
  protected readonly perPage = signal(10);
  protected readonly rowOptions = [10, 25, 50];
  protected readonly rowsOpen = signal(false);

  /* side card paging */
  protected readonly sPage = signal(1);
  protected readonly sPer = 6;

  /* ---------- people ---------- */
  protected readonly counts = computed(() => {
    const p = this.store.people();
    return { lead: p.filter((x) => x.type === 'lead').length, donor: p.filter((x) => x.type === 'donor').length };
  });

  private readonly openByCode = computed(() => {
    const map = new Map<string, number>();
    for (const f of this.store.followUps()) if (isOpen(f)) map.set(f.recordCode, (map.get(f.recordCode) ?? 0) + 1);
    return map;
  });

  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store.people()
      .filter((p) => p.type === this.type())
      .filter((p) => !q || [p.name, p.code, p.email, p.phone].some((v) => v.toLowerCase().includes(q)));
  });

  /* ---------- pagination (main table) ---------- */
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.matches().length / this.perPage())));

  /** Current page, never past the last page (e.g. after a search shrinks the list). */
  protected readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));

  protected readonly pageRows = computed(() => {
    const p = this.safePage();
    const size = this.perPage();
    return this.matches().slice((p - 1) * size, p * size);
  });

  protected readonly range = computed(() => {
    const n = this.matches().length;
    if (!n) return '0 of 0';
    const p = this.safePage();
    const size = this.perPage();
    return `${(p - 1) * size + 1}–${Math.min(p * size, n)} of ${n}`;
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

  /* ---------- already scheduled ---------- */
  protected readonly scheduled = computed(() =>
    this.store.followUps().filter(isOpen).slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  );
  protected readonly sPages = computed(() => Math.max(1, Math.ceil(this.scheduled().length / this.sPer)));
  protected readonly sRows = computed(() => {
    const p = Math.min(this.sPage(), this.sPages());
    return this.scheduled().slice((p - 1) * this.sPer, p * this.sPer);
  });

  /* ---------- helpers ---------- */
  icon(n: string): string { return FU_ICONS[n] ?? ''; }
  ini(n: string): string { return initials(n); }
  openCount(p: FuPerson): number { return this.openByCode().get(p.code) ?? 0; }
  chIcon(f: FollowUp): string { return FU_ICONS[channelOf(f.channel).icon]; }
  chLabel(f: FollowUp): string { return channelOf(f.channel).label; }
  pri(f: FollowUp) { return priorityOf(f.priority); }
  time(f: FollowUp): string { return fmtTime(f.dueAt); }
  tile(f: FollowUp) {
    const d = toDate(f.dueAt);
    return { day: d.getDate(), mon: MONTHS[d.getMonth()], wd: WEEKDAYS[d.getDay()] };
  }
  isLate(f: FollowUp): boolean { return toDate(f.dueAt) < new Date(); }

  /* ---------- actions ---------- */
  setType(t: FuRecordType): void { this.type.set(t); this.page.set(1); }
  setQuery(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.page.set(1); }
  clearQuery(): void { this.query.set(''); this.page.set(1); }

  goPage(n: number): void { this.page.set(Math.min(Math.max(1, n), this.totalPages())); }
  goSPage(n: number): void { this.sPage.set(Math.min(Math.max(1, n), this.sPages())); }

  toggleRows(e: Event): void { e.stopPropagation(); this.rowsOpen.set(!this.rowsOpen()); }
  setPerPage(n: number): void { this.perPage.set(n); this.page.set(1); this.rowsOpen.set(false); }

  plan(p: FuPerson): void { this.router.navigate([this.planPath], { queryParams: { ref: p.code } }); }
  back(): void { this.router.navigate([this.queuePath]); }

  /** Any click outside the Rows menu closes it. */
  @HostListener('document:click')
  onDocClick(): void { this.rowsOpen.set(false); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.rowsOpen.set(false); }
}