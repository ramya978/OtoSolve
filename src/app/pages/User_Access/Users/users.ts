import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  IAM_PATHS, IamOption, IamUser, ROLES, USERS, USER_STATUS_LABEL, UserStatus, fmtDate, initialsOf
} from '../../../Shared/IAM/iam-data';

type View = 'cards' | 'list';

interface UserDraft {
  name: string;
  email: string;
  mobile: string;
  role: string;
  unit: string;
  department: string;
  designation: string;
}

const EMPTY_DRAFT: UserDraft = { name: '', email: '', mobile: '', role: '', unit: '', department: '', designation: '' };

/** Users — Workspace Kit "People directory" pattern: summary strip, filters, cards ↔ compact list,
 *  record detail drawer and an invite / edit drawer. */
@Component({
  selector: 'app-iam-users',
  imports: [IamSelect],
  templateUrl: './users.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './users.css']
})
export class Users {
  private readonly router = inject(Router);

  readonly users = signal<IamUser[]>(USERS.map((u) => ({ ...u })));

  readonly view = signal<View>('cards');
  readonly status = signal<'' | UserStatus>('');
  readonly query = signal('');
  readonly department = signal('');
  readonly unit = signal('');
  readonly role = signal('');
  readonly page = signal(1);
  readonly pageSize = 12;
  readonly checked = signal<Set<string>>(new Set());
  /** person open in the detail drawer ('' = closed) */
  readonly selectedId = signal<string>('');

  /** drawer: null = closed */
  readonly drawer = signal<'create' | 'edit' | null>(null);
  readonly draft = signal<UserDraft>({ ...EMPTY_DRAFT });
  readonly tried = signal(false);

  readonly statusOptions = computed<IamOption[]>(() => [
    { value: '', label: 'All statuses' },
    ...(Object.keys(USER_STATUS_LABEL) as UserStatus[]).map((s) => ({ value: s, label: USER_STATUS_LABEL[s], hint: this.counts()[s] + ' people' }))
  ]);

  readonly roleName = (code: string): string => ROLES.find((r) => r.code === code)?.name ?? code;
  readonly statusLabel = (s: UserStatus): string => USER_STATUS_LABEL[s];
  readonly initials = initialsOf;
  readonly fmtDate = fmtDate;

  // ---- dropdown options ----
  readonly departmentOptions = computed<IamOption[]>(() => [
    { value: '', label: 'All departments' },
    ...this.distinct((u) => u.department).map((d) => ({ value: d, label: d }))
  ]);
  readonly unitOptions = computed<IamOption[]>(() => [
    { value: '', label: 'All organisation units' },
    ...this.distinct((u) => u.unit).map((d) => ({ value: d, label: d }))
  ]);
  readonly roleOptions: IamOption[] = [{ value: '', label: 'All roles' }, ...ROLES.map((r) => ({ value: r.code, label: r.name, hint: r.code }))];
  readonly roleChoice: IamOption[] = ROLES.map((r) => ({ value: r.code, label: r.name, hint: r.code, initials: initialsOf(r.name) }));
  readonly unitChoice = computed<IamOption[]>(() => this.distinct((u) => u.unit).map((d) => ({ value: d, label: d, icon: 'unit' })));
  readonly deptChoice = computed<IamOption[]>(() => this.distinct((u) => u.department).map((d) => ({ value: d, label: d, icon: 'building' })));

  // ---- counts + facts ----
  readonly counts = computed(() => {
    const out: Record<string, number> = { all: this.users().length };
    for (const s of Object.keys(USER_STATUS_LABEL)) out[s] = this.users().filter((u) => u.status === s).length;
    return out;
  });
  readonly staffCount = computed(() => this.users().filter((u) => u.role !== 'DONOR').length);
  readonly enrolled = computed(() => this.users().filter((u) => u.mfaEnrolled).length);
  readonly neverSigned = computed(() => this.users().filter((u) => !u.lastSignIn).length);
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
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
  readonly pageRows = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly from = computed(() => (this.filtered().length ? (this.page() - 1) * this.pageSize + 1 : 0));
  readonly to = computed(() => Math.min(this.page() * this.pageSize, this.filtered().length));

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
    this.users.update((list) => list.map((x) => (x.id === u.id ? { ...x, status: x.status === 'deactivated' ? 'active' : 'deactivated' } : x)));
  }
  remove(u: IamUser): void {
    this.users.update((list) => list.filter((x) => x.id !== u.id));
    this.selectedId.set('');
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
    this.draft.set({ name: u.name, email: u.email, mobile: u.mobile, role: u.role, unit: u.unit, department: u.department, designation: u.designation });
    this.tried.set(false);
    this.drawer.set('edit');
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
  canSave(): boolean {
    const d = this.draft();
    return d.name.trim().length > 1 && this.emailOk() && !!d.role;
  }
  save(): void {
    this.tried.set(true);
    if (!this.canSave()) return;
    const d = this.draft();
    if (this.drawer() === 'edit') {
      this.users.update((list) => list.map((u) => (u.id === this.selectedId()
        ? { ...u, name: d.name.trim(), email: d.email.trim(), mobile: d.mobile.trim(), role: d.role, unit: d.unit, department: d.department, designation: d.designation.trim() }
        : u)));
    } else {
      const n = this.users().length + 1;
      const id = 'u' + Date.now();
      const user = d.email.split('@')[0];
      this.users.update((list) => [{
        id, ref: 'USR-' + String(n).padStart(5, '0'), name: d.name.trim(), email: d.email.trim(), username: user, preferredName: '',
        mobile: d.mobile.trim(), role: d.role, unit: d.unit, department: d.department, designation: d.designation.trim(), manager: '',
        status: 'invited', invitation: 'Pending', mfaEnrolled: false, dataScope: 'Whole organisation',
        accessFrom: new Date().toISOString().slice(0, 10), lastSignIn: ''
      }, ...list]);
      this.status.set('');
      this.page.set(1);
    }
    this.drawer.set(null);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.drawer()) this.drawer.set(null);
    else this.selectedId.set('');
  }
}
