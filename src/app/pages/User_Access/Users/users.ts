import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  IAM_PATHS, IamOption, IamUser, USER_STATUS_LABEL, UserStatus, fmtDate, initialsOf
} from '../../../Shared/IAM/iam-data';
import { IamDirectoryStore, mergeDetail } from '../../../Shared/IAM/iam-directory.store';
import { UserDirectoryApiService } from '../../../Service/user-directory-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { UserStatisticsResponse } from '../../../Shared/models/iam-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

type View = 'cards' | 'list';

interface UserDraft {
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  name: string;            // display name
  preferredName: string;
  email: string;
  countryCode: string;
  mobile: string;          // number only (country code is separate)
  employeeNumber: string;
  designation: string;
  workLocation: string;
  unit: string;
  department: string;
  role: string;
  preferredCulture: string;
  timeZone: string;
  reason: string;
}

const EMPTY_DRAFT: UserDraft = {
  title: '', firstName: '', middleName: '', lastName: '', name: '', preferredName: '', email: '', countryCode: '', mobile: '',
  employeeNumber: '', designation: '', workLocation: '', unit: '', department: '', role: '', preferredCulture: '', timeZone: '', reason: ''
};

const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'];
const DIAL_CODES = ['+91', '+1', '+44', '+61', '+65', '+971', '+49', '+33', '+81', '+86'];
const REASON_MIN = 10;

/** Users — Workspace Kit "People directory" pattern: summary strip, filters, cards ↔ compact list,
 *  record detail drawer and an invite / edit drawer. */
@Component({
  selector: 'app-iam-users',
  imports: [IamSelect],
  templateUrl: './users.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './users.css']
})
export class Users implements OnInit {
  private readonly router = inject(Router);
  private readonly store = inject(IamDirectoryStore);
  private readonly api = inject(UserDirectoryApiService);
  private readonly toast = inject(ToastService);
  private readonly geo = inject(GeoMasterService);

  readonly users = this.store.users;
  readonly loading = this.store.loading;
  readonly loadError = this.store.error;
  readonly saving = signal(false);

  ngOnInit(): void {
    this.store.load();
    this.loadStats();
    this.geo.getTimeZoneOptions().subscribe({ next: (z) => this.tzList.set(z.map((t) => t.ianaKey)), error: () => undefined });
    this.geo.getLanguageOptions().subscribe({ next: (l) => this.langList.set(l.map((x) => x.cultureCode)), error: () => undefined });
  }

  readonly view = signal<View>('cards');
  readonly status = signal<'' | UserStatus>('');
  readonly query = signal('');
  readonly department = signal('');
  readonly unit = signal('');
  readonly role = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(12);
  readonly pageSizes = [12, 24, 48];
  readonly rowsOpen = signal(false);
  readonly checked = signal<Set<string>>(new Set());
  /** person open in the detail drawer ('' = closed) */
  readonly selectedId = signal<string>('');

  /** drawer: null = closed */
  readonly drawer = signal<'create' | 'edit' | null>(null);
  readonly draft = signal<UserDraft>({ ...EMPTY_DRAFT });
  readonly tried = signal(false);

  // ---- edit-drawer dropdown options ----
  private readonly tzList = signal<string[]>([]);
  private readonly langList = signal<string[]>([]);
  readonly reasonMin = REASON_MIN;
  readonly titleOptions: IamOption[] = [{ value: '', label: 'None' }, ...TITLES.map((t) => ({ value: t, label: t }))];
  /** Options always include the stored value, so opening the editor never drops it. */
  readonly countryCodeOptions = computed<IamOption[]>(() => {
    const c = this.draft().countryCode;
    const all = c && !DIAL_CODES.includes(c) ? [c, ...DIAL_CODES] : DIAL_CODES;
    return all.map((v) => ({ value: v, label: v }));
  });
  readonly languageOptions = computed<IamOption[]>(() => {
    const c = this.draft().preferredCulture;
    const l = this.langList();
    const all = c && !l.includes(c) ? [c, ...l] : l;
    return [{ value: '', label: 'Organisation default' }, ...all.map((v) => ({ value: v, label: this.langLabel(v) }))];
  });
  readonly timeZoneOptions = computed<IamOption[]>(() => {
    const c = this.draft().timeZone;
    const l = this.tzList();
    const all = c && !l.includes(c) ? [c, ...l] : l;
    return [{ value: '', label: 'Organisation default' }, ...all.map((v) => ({ value: v, label: this.tzLabel(v) }))];
  });
  readonly reasonLength = computed(() => this.draft().reason.trim().length);

  /** "ta-IN" becomes "Tamil (India)". */
  private langLabel(code: string): string {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code; } catch { return code; }
  }
  /** "Asia/Calcutta" becomes "Asia/Calcutta (UTC+05:30)". */
  private tzLabel(zone: string): string {
    try {
      const off = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
      return `${zone.replace(/_/g, ' ')} (${off.replace('GMT', 'UTC') || 'UTC'})`;
    } catch { return zone; }
  }

  readonly statusOptions = computed<IamOption[]>(() => [
    { value: '', label: 'All statuses' },
    ...(Object.keys(USER_STATUS_LABEL) as UserStatus[]).map((s) => ({ value: s, label: USER_STATUS_LABEL[s], hint: this.counts()[s] + ' people' }))
  ]);

  readonly roleName = (code: string): string => code;
  readonly statusLabel = (s: UserStatus): string => USER_STATUS_LABEL[s];
  readonly initials = initialsOf;
  readonly fmtDate = fmtDate;

  // ---- dropdown options ----
  readonly departmentOptions = computed<IamOption[]>(() => [
    { value: '', label: 'All departments' },
    ...this.store.departments().map((d) => ({ value: d.name ?? '', label: d.name ?? '' }))
  ]);
  readonly unitOptions = computed<IamOption[]>(() => [
    { value: '', label: 'All organisation units' },
    ...this.store.units().map((d) => ({ value: d.name ?? '', label: d.name ?? '' }))
  ]);
  private readonly roleOptionsC = computed<IamOption[]>(() => [
    { value: '', label: 'All roles' },
    ...this.store.roles().map((r) => ({ value: r.name ?? '', label: r.name ?? '', hint: r.code ?? '' }))
  ]);
  private readonly roleChoiceC = computed<IamOption[]>(() =>
    this.store.roles().map((r) => ({ value: r.name ?? '', label: r.name ?? '', hint: r.code ?? '', initials: initialsOf(r.name ?? '') })));
  get roleOptions(): IamOption[] { return this.roleOptionsC(); }
  get roleChoice(): IamOption[] { return this.roleChoiceC(); }
  readonly unitChoice = computed<IamOption[]>(() => this.store.units().map((d) => ({ value: d.name ?? '', label: d.name ?? '', icon: 'unit' })));
  readonly deptChoice = computed<IamOption[]>(() => this.store.departments().map((d) => ({ value: d.name ?? '', label: d.name ?? '', icon: 'building' })));

  // ---- counts + facts ----
  /** GET /users/statistics: the counters come from the server, not from counting the rows that were loaded. */
  private readonly stats = signal<UserStatisticsResponse | null>(null);
  private loadStats(): void {
    this.api.getStatistics().subscribe({ next: (s) => this.stats.set(s), error: () => this.stats.set(null) });
  }
  readonly counts = computed(() => {
    const s = this.stats();
    const rows = this.users();
    const by = new Map(Object.entries(s?.byStatus ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const out: Record<string, number> = { all: s?.total ?? rows.length };
    for (const k of Object.keys(USER_STATUS_LABEL)) out[k] = by.get(k) ?? rows.filter((u) => u.status === k).length;
    if (s) {
      if (s.active !== undefined) out['active'] = s.active;
      if (s.invited !== undefined) out['invited'] = s.invited;
      if (s.suspended !== undefined) out['suspended'] = s.suspended;
    }
    return out;
  });
  readonly staffCount = computed(() => this.users().length);
  readonly enrolled = computed(() => this.stats()?.mfaEnabled ?? this.users().filter((u) => u.mfaEnrolled).length);
  readonly neverSigned = computed(() => this.stats()?.neverSignedIn ?? this.users().filter((u) => !u.lastSignIn).length);
  readonly unitCount = computed(() => this.distinct((u) => u.unit).length);

  // ---- list ----
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.users().filter((u) =>
      (!this.status() || u.status === this.status()) &&
      (!this.department() || u.department === this.department()) &&
      (!this.unit() || u.unit === this.unit()) &&
      (!this.role() || u.role === this.role()) &&
      (!q || (u.name + ' ' + u.email + ' ' + u.ref + ' ' + u.username).toLowerCase().includes(q))
    );
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  /** Current page kept inside 1..totalPages (a filter or rows change can shrink the page count). */
  readonly safePage = computed(() => Math.min(Math.max(1, this.page()), this.totalPages()));
  /** Page buttons with gaps: 1 2 ... 9 (null = "..."). Up to 7 pages are all shown. */
  readonly pages = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const cur = this.safePage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: (number | null)[] = [1];
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    if (start > 2) out.push(null);
    for (let p = start; p <= end; p++) out.push(p);
    if (end < total - 1) out.push(null);
    out.push(total);
    return out;
  });
  readonly pageRows = computed(() => this.filtered().slice((this.safePage() - 1) * this.pageSize(), this.safePage() * this.pageSize()));
  readonly from = computed(() => (this.filtered().length ? (this.safePage() - 1) * this.pageSize() + 1 : 0));
  readonly to = computed(() => Math.min(this.safePage() * this.pageSize(), this.filtered().length));

  // ---- pager actions ----
  goPage(p: number): void { this.page.set(Math.min(Math.max(1, p), this.totalPages())); }
  prevPage(): void { this.goPage(this.safePage() - 1); }
  nextPage(): void { this.goPage(this.safePage() + 1); }
  toggleRows(event: Event): void {
    event.stopPropagation();
    this.rowsOpen.update((o) => !o);
  }
  setPageSize(n: number): void {
    this.pageSize.set(n);
    this.page.set(1);
    this.rowsOpen.set(false);
  }
  @HostListener('document:click')
  onDocClick(): void { this.rowsOpen.set(false); }

  readonly selected = computed(() => this.users().find((u) => u.id === this.selectedId()) ?? null);
  readonly activeFilters = computed(() => [this.department(), this.unit(), this.role(), this.status(), this.query().trim()].filter(Boolean).length);

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  private distinct(fn: (u: IamUser) => string): string[] {
    return Array.from(new Set(this.users().map(fn).filter(Boolean))).sort();
  }

  // ---- filters ----
  setStatus(v: string): void {
    this.status.set(v as '' | UserStatus);
    this.page.set(1);
  }
  statusTone(s: UserStatus): string {
    return s === 'active' ? 'success' : s === 'invited' ? 'info' : s === 'draft' ? 'muted' : 'warning';
  }
  setQuery(v: string): void {
    this.query.set(v);
    this.page.set(1);
  }
  setDepartment(v: string): void { this.department.set(v); this.page.set(1); }
  setUnit(v: string): void { this.unit.set(v); this.page.set(1); }
  setRole(v: string): void { this.role.set(v); this.page.set(1); }
  resetFilters(): void {
    this.department.set('');
    this.unit.set('');
    this.role.set('');
    this.status.set('');
    this.query.set('');
    this.page.set(1);
  }

  // ---- selection ----
  select(u: IamUser): void {
    this.selectedId.set(u.id);
    this.api.getUser(u.id).subscribe({
      next: (d) => this.store.replace(mergeDetail(u, d)),
      error: () => undefined,
    });
  }
  closeDetail(): void {
    this.selectedId.set('');
  }
  toggleCheck(id: string): void {
    const n = new Set(this.checked());
    if (n.has(id)) n.delete(id);
    else n.add(id);
    this.checked.set(n);
  }
  allChecked(): boolean {
    return this.pageRows().length > 0 && this.pageRows().every((u) => this.checked().has(u.id));
  }
  toggleAll(): void {
    const n = new Set(this.checked());
    const all = this.allChecked();
    this.pageRows().forEach((u) => (all ? n.delete(u.id) : n.add(u.id)));
    this.checked.set(n);
  }
  /** all FILTERED users checked (for the Select-all near Cards/List tabs) */
  allFilteredChecked(): boolean {
    const list = this.filtered();
    return list.length > 0 && list.every((u) => this.checked().has(u.id));
  }
  /** toggle ALL filtered users (not just this page) */
  toggleAllFiltered(): void {
    const list = this.filtered();
    const n = new Set(this.checked());
    if (this.allFilteredChecked()) {
      list.forEach((u) => n.delete(u.id));
    } else {
      list.forEach((u) => n.add(u.id));
    }
    this.checked.set(n);
  }
  /** checked count for the floating "Bulk actions N" button */
  readonly checkedCount = computed(() => this.checked().size);
  /** open Bulk users page with the checked ids in router state */
  openBulkActions(): void {
    const ids = [...this.checked()];
    if (!ids.length) return;
    void this.router.navigate([IAM_PATHS.bulkUsers], { state: { userIds: ids } });
  }

  // ---- side panel actions ----
  deactivate(u: IamUser): void {
    const reactivate = u.status === 'deactivated' || u.status === 'suspended';
    const call = reactivate
      ? this.api.reactivateUser(u.id, { reason: 'Reactivated from the people directory' })
      : this.api.deactivateUser(u.id, { reason: 'Deactivated from the people directory' });
    call.subscribe({
      next: () => {
        this.toast.show(reactivate ? 'Reactivated' : 'Deactivated', u.name, 'success');
        this.store.load();
        this.loadStats();
      },
      error: (e) => this.toast.show('Could not update', apiErrorMessage(e, 'The change was not saved.'), 'error'),
    });
  }
  remove(u: IamUser): void {
    this.api.withdrawUser(u.id, { reason: 'Withdrawn from the people directory' }).subscribe({
      next: () => {
        this.toast.show('Withdrawn', u.name, 'success');
        this.selectedId.set('');
        this.store.load();
        this.loadStats();
      },
      error: (e) => this.toast.show('Could not withdraw', apiErrorMessage(e, 'The change was not saved.'), 'error'),
    });
  }

  // ---- create / edit drawer ----
  /** Invite → the full create-user page (the drawer is used for edits only). */
  openCreate(): void {
    this.router.navigate([IAM_PATHS.createUser]);
  }
  /** Full profile → the My profile page, carrying this person's record in the router state. */
  openFullProfile(u: IamUser): void {
    void this.router.navigate(['/app/auth/profile'], { state: { user: u } });
  }
  openEdit(u: IamUser): void {
    this.selectedId.set(u.id);
    const [cc, ...num] = (u.mobile ?? '').trim().split(/\s+/);
    this.draft.set({
      ...EMPTY_DRAFT,
      name: u.name, preferredName: u.preferredName ?? '', email: u.email,
      countryCode: num.length ? cc : '', mobile: num.length ? num.join('') : (u.mobile ?? ''),
      role: u.role, unit: u.unit, department: u.department, designation: u.designation
    });
    this.tried.set(false);
    this.drawer.set('edit');
    // The list row has no split name / employee / location / language fields: fill them from the full record.
    this.api.getUser(u.id).subscribe({
      next: (d) => {
        if (this.drawer() !== 'edit' || this.selectedId() !== u.id) return;
        this.draft.update((cur) => ({
          ...cur,
          title: d.title ?? '', firstName: d.firstName ?? '', middleName: d.middleName ?? '', lastName: d.lastName ?? '',
          name: d.displayName ?? cur.name, preferredName: d.preferredName ?? '',
          countryCode: d.mobileCountryCode ?? cur.countryCode, mobile: d.mobileNumber ?? cur.mobile,
          employeeNumber: d.employeeNumber ?? '', designation: d.designation ?? cur.designation, workLocation: d.workLocation ?? '',
          preferredCulture: d.preferredCulture ?? '', timeZone: d.timeZone ?? ''
        }));
      },
      error: () => undefined,
    });
  }
  closeDrawer(): void {
    this.drawer.set(null);
  }
  patch(key: keyof UserDraft, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }
  emailOk(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.draft().email.trim());
  }
  mobileOk(): boolean {
    const d = this.draft();
    if (!d.mobile.trim()) return true;
    return /^\+?\d{1,4}$/.test(d.countryCode.trim()) && /^\d{6,15}$/.test(d.mobile.replace(/[\s-]/g, ''));
  }
  canSave(): boolean {
    const d = this.draft();
    return d.name.trim().length > 1 && !!d.firstName.trim() && !!d.lastName.trim() && !!d.role
      && this.mobileOk() && d.reason.trim().length >= REASON_MIN;
  }
  save(): void {
    this.tried.set(true);
    if (!this.canSave()) return;
    const d = this.draft();
    const id = this.selectedId();
    this.saving.set(true);
    this.api.getUser(id).subscribe({
      next: (cur) => {
        const units = this.store.units();
        const depts = this.store.departments();
        const number = d.mobile.replace(/[\s-]/g, '');
        // Optional text goes as '' when emptied (never null): null means "leave alone", '' means "clear".
        this.api.updateUser(id, {
          expectedVersion: cur.version,
          title: d.title.trim(),
          firstName: d.firstName.trim(),
          middleName: d.middleName.trim(),
          lastName: d.lastName.trim(),
          displayName: d.name.trim(),
          preferredName: d.preferredName.trim(),
          employeeNumber: d.employeeNumber.trim(),
          designation: d.designation.trim(),
          workLocation: d.workLocation.trim(),
          preferredCulture: d.preferredCulture.trim(),
          timeZone: d.timeZone.trim(),
          mobileCountryCode: number ? d.countryCode.trim() : '',
          mobileNumber: number,
          organisationUnitId: units.find((x) => x.name === d.unit)?.id ?? cur.organisationUnitId ?? null,
          departmentId: depts.find((x) => x.name === d.department)?.id ?? cur.departmentId ?? null,
          managerUserId: cur.managerUserId ?? null,
          reason: d.reason.trim(),
        }).subscribe({
          next: () => {
            this.saving.set(false);
            this.toast.show('Saved', d.name.trim(), 'success');
            this.drawer.set(null);
            this.store.load();
            this.loadStats();
          },
          error: (e) => {
            this.saving.set(false);
            this.toast.show('Could not save', apiErrorMessage(e, 'The change was not saved.'), 'error');
          },
        });
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.show('Could not save', apiErrorMessage(e, 'The record could not be read.'), 'error');
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.rowsOpen()) this.rowsOpen.set(false);
    else if (this.drawer()) this.drawer.set(null);
    else this.selectedId.set('');
  }
}