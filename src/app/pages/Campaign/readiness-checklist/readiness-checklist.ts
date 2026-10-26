import { ActivatedRoute, Router } from '@angular/router';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { CwSelect, CwOption } from '../../../Shared/Campaign/cw-select';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { CW_ICONS, CwIcon } from '../../../Shared/Campaign/cw-icons';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';
import { CATEGORIES, CheckCategory, CheckStatus, PEOPLE, ReadinessCheck, fmtDate, fmtTime, initials } from '../../../Shared/Campaign/cw.data';
import { CwPageHead } from '../../../Shared/Campaign/cw-page-head';

type Filter = 'all' | CheckStatus;

interface CheckDraft {
  name: string;
  category: string;
  description: string;
  criteria: string;
  required: boolean;
  owner: string;
  due: string;
  notes: string;
}

const EMPTY_DRAFT: CheckDraft = { name: '', category: '', description: '', criteria: '', required: true, owner: '', due: '', notes: '' };

@Component({
  selector: 'app-readiness-checklist',
  imports: [CwSelect, PageHeader],
  templateUrl: './readiness-checklist.html',
  styleUrls: ['../../../Shared/Campaign/cw-shared.css', './readiness-checklist.css', '../../../Shared/layout/page-header/page-header.css']
})
export class ReadinessChecklist {
  protected readonly store = inject(CampaignWorkspaceStore);
  protected readonly c = this.store.campaign;
  protected readonly fmtDate = fmtDate;
  protected readonly fmtTime = fmtTime;
  protected readonly initials = initials;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    // The register passes the campaign on the link, so a refresh or a shared link still opens it.
    // A code that matches no campaign is reported and sent back to the register: checks are never
    // added to (or shown for) the first campaign in its place.
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) this.store.select(code);
    effect(() => {
      // No campaign on the link: there is nothing to check, so the person is sent to pick one.
      if (!code) {
        this.store.showToast('Open the checklist from a campaign in the register.', 'warn');
        this.router.navigate([CW_PATHS.register]);
        return;
      }
      if (code && this.store.notFound()) {
        this.store.showToast(`Campaign ${code} was not found.`, 'warn');
        this.router.navigate([CW_PATHS.register]);
      }
    });
  }

  // ---- data ----
  protected readonly checks = computed(() => this.store.checksFor(this.c().code));
  protected readonly filter = signal<Filter>('all');

  protected readonly counts = computed(() => {
    const list = this.checks();
    return {
      all: list.length,
      passed: list.filter((c) => c.status === 'passed').length,
      failed: list.filter((c) => c.status === 'failed').length,
      pending: list.filter((c) => c.status === 'pending').length
    };
  });

  protected readonly passedPct = computed(() => (this.counts().all ? Math.round((this.counts().passed / this.counts().all) * 100) : 0));
  protected readonly requiredOpen = computed(() => this.checks().filter((c) => c.required && c.status !== 'passed').length);
  protected readonly ready = computed(() => this.checks().length > 0 && this.requiredOpen() === 0);
  protected readonly awaitingDecision = computed(() => !!this.c().readinessRequest && this.c().lifecycle === 'submitted');
  protected readonly preLaunch = computed(() => this.c().lifecycle === 'draft' || this.c().lifecycle === 'submitted');
  protected readonly blocking = computed(() => this.checks().filter((c) => c.required && c.status !== 'passed'));

  protected readonly groups = computed(() => {
    void this.store.reference();   // the categories arrive with the reference data
    const f = this.filter();
    const shown = this.checks().filter((c) => f === 'all' || c.status === f);
    return CATEGORIES.map((cat) => {
      const all = this.checks().filter((c) => c.category === cat);
      return { category: cat, items: shown.filter((c) => c.category === cat), passed: all.filter((c) => c.status === 'passed').length, total: all.length };
    }).filter((g) => g.items.length);
  });

  // ---- views used by the table / board / stepper designs ----

  /** Table design: the checks the status filter lets through. */
  protected readonly tableRows = computed(() => {
    const f = this.filter();
    return this.checks().filter((c) => f === 'all' || c.status === f);
  });

  /** Board design: one column per status. */
  protected readonly columns = computed(() =>
    (['pending', 'failed', 'passed'] as CheckStatus[]).map((status) => ({
      status,
      label: status[0].toUpperCase() + status.slice(1),
      items: this.checks().filter((c) => c.status === status)
    }))
  );

  /** Stepper design: every category with its checks (no filter). */
  protected readonly allGroups = computed(() =>
    CATEGORIES.map((cat) => {
      const items = this.checks().filter((c) => c.category === cat);
      return { category: cat, items, passed: items.filter((c) => c.status === 'passed').length, total: items.length };
    }).filter((g) => g.total)
  );

  /** Stepper design: the picked category (first one until the user picks). */
  protected readonly activeCat = signal<string | null>(null);
  protected readonly activeGroup = computed(() => {
    const gs = this.allGroups();
    return gs.find((g) => g.category === this.activeCat()) ?? gs[0] ?? null;
  });

  protected readonly filters: { key: Filter; label: string; tone: string }[] = [
    { key: 'all', label: 'All', tone: '' },
    { key: 'pending', label: 'Pending', tone: 'tone-warning' },
    { key: 'failed', label: 'Failed', tone: 'tone-danger' },
    { key: 'passed', label: 'Passed', tone: 'tone-success' }
  ];

  protected get categoryOptions(): CwOption[] { return CATEGORIES.map((c) => ({ value: c, label: c })); }
  protected get ownerOptions(): CwOption[] { return PEOPLE.map((p) => ({ value: p, label: p })); }

  // ---- check drawer ----
  protected readonly openId = signal<string | null>(null);
  protected readonly open = computed(() => this.checks().find((c) => c.id === this.openId()) ?? null);
  protected readonly verdictNote = signal('');

  // ---- create / edit drawer ----
  protected readonly editing = signal<'new' | string | null>(null);
  protected readonly draft = signal<CheckDraft>({ ...EMPTY_DRAFT });
  protected readonly submitted = signal(false);

  // ---- confirmations ----
  protected readonly deleting = signal<ReadinessCheck | null>(null);
  protected readonly launchMenu = signal(false);
  protected readonly rejecting = signal(false);
  protected readonly reason = signal('');
  protected readonly reasonTouched = signal(false);

  protected icon(name: CwIcon): string {
    return CW_ICONS[name];
  }

  /** Icon inside the status circle: tick, cross or clock. */
  protected statusIcon(s: CheckStatus): CwIcon {
    return s === 'passed' ? 'check' : s === 'failed' ? 'x' : 'clock';
  }

  protected statusTone(s: CheckStatus): string {
    return s === 'passed' ? 'tone-success' : s === 'failed' ? 'tone-danger' : 'tone-warning';
  }

  protected statusLabel(s: CheckStatus): string {
    return s[0].toUpperCase() + s.slice(1);
  }

  // ---- check drawer actions ----
  protected openCheck(c: ReadinessCheck): void {
    this.verdictNote.set(c.verdictNote ?? '');
    this.openId.set(c.id);
  }

  protected verdict(status: CheckStatus): void {
    const c = this.open();
    if (!c) return;
    this.store.setCheckStatus(c.id, status, status === 'pending' ? '' : this.verdictNote().trim());
  }

  // ---- create / edit ----
  protected startCreate(): void {
    this.draft.set({ ...EMPTY_DRAFT });
    this.submitted.set(false);
    this.editing.set('new');
  }

  protected startEdit(c: ReadinessCheck): void {
    this.openId.set(null);
    this.draft.set({ name: c.name, category: c.category, description: c.description, criteria: c.criteria, required: c.required, owner: c.owner, due: c.due, notes: c.notes });
    this.submitted.set(false);
    this.editing.set(c.id);
  }

  protected setDraft<K extends keyof CheckDraft>(key: K, value: CheckDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected draftErrors = computed(() => {
    const d = this.draft();
    const e: Partial<Record<keyof CheckDraft, string>> = {};
    if (d.name.trim().length < 3) e.name = 'Name the check (at least 3 characters).';
    if (!d.category) e.category = 'Choose a category.';
    if (d.criteria.trim().length < 5) e.criteria = 'Say what condition marks this check as met.';
    return e;
  });

  protected err(key: keyof CheckDraft): string | null {
    return this.submitted() ? this.draftErrors()[key] ?? null : null;
  }

  protected saveDraft(): void {
    this.submitted.set(true);
    if (Object.keys(this.draftErrors()).length) return;
    const d = this.draft();
    const id = this.editing() === 'new' ? this.store.newCheckId(this.c().code) : (this.editing() as string);
    const old = this.checks().find((c) => c.id === id);
    this.store.saveCheck({
      id,
      campaign: this.c().code,
      name: d.name.trim(),
      category: d.category as CheckCategory,
      description: d.description.trim(),
      criteria: d.criteria.trim(),
      required: d.required,
      owner: d.owner || 'Unassigned',
      due: d.due,
      notes: d.notes.trim(),
      status: old?.status ?? 'pending',
      verdictBy: old?.verdictBy,
      verdictNote: old?.verdictNote
    });
    this.editing.set(null);
  }

  protected confirmDelete(): void {
    const c = this.deleting();
    if (c) this.store.removeCheck(c.id);
    this.deleting.set(null);
    this.openId.set(null);
  }

  // ---- launch decision ----
  protected toggleLaunchMenu(e: Event): void {
    e.stopPropagation();
    this.launchMenu.set(!this.launchMenu());
  }

  protected approveLaunch(): void {
    this.launchMenu.set(false);
    if (!this.ready()) return;
    this.store.approveLaunch(this.c().code);
  }

  protected openReject(): void {
    this.launchMenu.set(false);
    this.reason.set('');
    this.reasonTouched.set(false);
    this.rejecting.set(true);
  }

  protected reasonError(): string | null {
    return this.reason().trim().length < 10 ? 'Say what has to change, in at least 10 characters.' : null;
  }

  protected confirmReject(): void {
    this.reasonTouched.set(true);
    if (this.reasonError()) return;
    this.store.rejectLaunch(this.c().code, this.reason().trim());
    this.rejecting.set(false);
  }

  @HostListener('document:click')
  protected onDocClick(): void {
    this.launchMenu.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.deleting()) this.deleting.set(null);
    else if (this.rejecting()) this.rejecting.set(false);
    else if (this.editing()) this.editing.set(null);
    else if (this.openId()) this.openId.set(null);
    else this.launchMenu.set(false);
  }
}