import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { OrganisationApiService } from '../../Service/organisation-api.service';
import { IamAdminApiService } from '../../Service/iam-admin-api.service';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { fetchAllPages } from '../services/paging';
import { DepartmentResponse, OrganisationDetailResponse, OrganisationUnitResponse } from '../models/iam-contract.model';

/* ---- route paths: keep in sync with the organisation routes in app.routes.ts ---- */
export const ORG_PATH = '/app/administration/organisation';
export const OFFICES_PATH = ORG_PATH + '/units';
export const ADD_OFFICE_PATH = OFFICES_PATH + '/new';

/* ---- models ---- */
export interface Person { id: string; name: string; deptId: string; officeId: string; }

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  parentId: string | null;
  headId: string | null;
  order: number;
  active: boolean;
  version?: number;
  members?: number;
  children?: number;
}

export interface Office {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  managerId: string | null;
  email: string;
  phone: string;
  timezone: string;
  description: string;
  order: number;
  active: boolean;
  address1: string;
  address2: string;
  country: string;
  state: string;
  city: string;
  postal: string;
  version?: number;
  members?: number;
  children?: number;
}

export interface Security {
  twoStep: 'optional' | 'required';
  maxFailed: number;
  lockoutMin: number;
  idleMin: number;
  minLength: number;
  expireDays: number;
}

/* ---- shared icons (24x24 stroke paths) ---- */
export const ICONS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  chevron: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  checkcircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3',
  offcircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8',
  check: 'M20 6L9 17l-5-5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  userstar: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4',
  org: 'M12 3v5M5 14v-3h14v3M12 8v3M3 14h4v4H3zM10 14h4v4h-4zM17 14h4v4h-4z',
  order: 'M3 6h12M3 12h8M3 18h5M17 8v10M14 15l3 3 3-3',
  docok: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 14l2 2 4-4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  save: 'M5 3h11l4 4v14H5zM8 3v5h7V3M8 21v-7h8v7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v5M9 2h6',
  length: 'M4 6h16M4 12h10M4 18h6',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4'
};

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Moves keyboard focus into the open popup. */
export function focusDialog(): void {
  setTimeout(() => document.querySelector<HTMLElement>('.og-dialog')?.focus());
}

/* ---- API mapping ---- */
const toDept = (r: DepartmentResponse, userIds: Set<string>): Department => ({
  id: r.id ?? '', code: r.code ?? '', name: r.name ?? '', description: r.description ?? '',
  parentId: r.parentDepartmentId ?? null, headId: r.headUserId && userIds.has(r.headUserId) ? r.headUserId : (r.headUserId ?? null),
  order: r.displayOrder ?? 0, active: r.status === 'active', version: r.version, members: r.memberCount, children: r.childCount
});

const toOffice = (r: OrganisationUnitResponse): Office => ({
  id: r.id ?? '', code: r.code ?? '', name: r.name ?? '', kind: r.unitType ?? '', parentId: r.parentUnitId ?? null,
  managerId: r.managerUserId ?? null, email: r.contactEmail ?? '', phone: r.contactPhone ?? '', timezone: r.timeZone ?? '',
  description: r.description ?? '', order: r.displayOrder ?? 0, active: r.status === 'active',
  address1: r.addressLine1 ?? '', address2: r.addressLine2 ?? '', country: r.country ?? '', state: r.state ?? '',
  city: r.city ?? '', postal: r.postalCode ?? '', version: r.version, members: r.memberCount, children: r.childCount
});

const SEC_DEFAULT: Security = { twoStep: 'optional', maxFailed: 5, lockoutMin: 15, idleMin: 30, minLength: 10, expireDays: 0 };

/** One store shared by Profile, Departments, Branches, Add Office and Settings; everything comes from the API. */
@Injectable({ providedIn: 'root' })
export class OrgStore {
  private readonly orgApi = inject(OrganisationApiService);
  private readonly admin = inject(IamAdminApiService);
  private readonly users = inject(UserDirectoryApiService);

  private orgId: string | null = null;
  readonly detail = signal<OrganisationDetailResponse | null>(null);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly people = signal<Person[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly offices = signal<Office[]>([]);

  /** Header summary used by Settings. */
  get org() {
    const d = this.detail();
    return {
      name: d?.name ?? '', verified: d?.status === 'active', code: d?.code ?? '', domain: d?.hostName ?? '',
      type: d?.organisationType ?? '', peopleUsed: d?.userCount ?? 0, peopleLimit: d?.maximumUsers ?? 0,
      administrator: d?.primaryAdmin?.displayName ?? ''
    };
  }

  readonly security = computed<Security>(() => {
    const d = this.detail();
    if (!d) return SEC_DEFAULT;
    return {
      twoStep: d.defaultMfaRequirement === 'required' ? 'required' : 'optional',
      maxFailed: d.maximumFailedAccessAttempts ?? SEC_DEFAULT.maxFailed,
      lockoutMin: d.lockoutDurationMinutes ?? SEC_DEFAULT.lockoutMin,
      idleMin: d.sessionIdleTimeoutMinutes ?? SEC_DEFAULT.idleMin,
      minLength: d.passwordMinimumLength ?? SEC_DEFAULT.minLength,
      expireDays: d.passwordExpiryDays ?? SEC_DEFAULT.expireDays
    };
  });

  readonly sortedDepartments = computed(() => [...this.departments()].sort((a, b) => a.order - b.order));
  readonly sortedOffices = computed(() => [...this.offices()].sort((a, b) => a.order - b.order));

  /** Loads the organisation record (the signed-in one, or `orgId` for a platform administrator). */
  loadDetail(orgId?: string | null): Observable<OrganisationDetailResponse> {
    this.orgId = orgId ?? null;
    this.loading.set(true);
    return (orgId ? this.orgApi.get(orgId) : this.orgApi.getMine()).pipe(
      tap({ next: (d) => { this.detail.set(d); this.loading.set(false); this.loaded.set(true); }, error: () => this.loading.set(false) })
    );
  }

  setDetail(d: OrganisationDetailResponse): void { this.detail.set(d); }

  /** Re-reads the record after a save so the version stays current. */
  refreshDetail(): Observable<OrganisationDetailResponse> { return this.loadDetail(this.orgId); }

  /** Loads departments, units and people. */
  loadStructure(): Observable<void> {
    return forkJoin({
      users: fetchAllPages((page, size) => this.users.searchUsers({ pageIndex: page, pageSize: size })),
      depts: this.admin.getDepartments(),
      units: this.admin.getUnits()
    }).pipe(map(({ users, depts, units }) => {
      const dRows = (depts ?? []).filter((d) => d.status !== 'archived');
      const uRows = (units ?? []).filter((u) => u.status !== 'archived');
      const deptByName = new Map(dRows.map((d) => [(d.name ?? '').toLowerCase(), d.id ?? '']));
      const unitByName = new Map(uRows.map((u) => [(u.name ?? '').toLowerCase(), u.id ?? '']));
      this.people.set(users.map((u) => ({
        id: u.id ?? '',
        name: u.displayName ?? '',
        deptId: deptByName.get((u.departmentName ?? '').toLowerCase()) ?? '',
        officeId: unitByName.get((u.organisationUnitName ?? '').toLowerCase()) ?? ''
      })));
      const ids = new Set(users.map((u) => u.id ?? ''));
      this.departments.set(dRows.map((d) => toDept(d, ids)));
      this.offices.set(uRows.map(toOffice));
    }));
  }

  person(id: string | null): Person | null {
    return id ? this.people().find((p) => p.id === id) ?? null : null;
  }

  deptPeople(id: string): number {
    const n = this.people().filter((p) => p.deptId === id).length;
    return n || (this.departments().find((d) => d.id === id)?.members ?? 0);
  }
  officePeople(id: string): number {
    const n = this.people().filter((p) => p.officeId === id).length;
    return n || (this.offices().find((o) => o.id === id)?.members ?? 0);
  }
  deptChildren(id: string): number { return this.departments().filter((d) => d.parentId === id).length; }
  officeChildren(id: string): number { return this.offices().filter((o) => o.parentId === id).length; }
  nextDeptOrder(): number { return Math.max(0, ...this.departments().map((d) => d.order)) + 10; }
  nextOfficeOrder(): number { return Math.max(0, ...this.offices().map((o) => o.order)) + 10; }

  saveDepartment(d: Department, creating: boolean): Observable<Department> {
    const ids = new Set(this.people().map((p) => p.id));
    const done = (r: DepartmentResponse) => {
      const row = toDept(r, ids);
      this.departments.update((list) => (list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]));
      return row;
    };
    if (!creating) {
      return this.admin.updateDepartment(d.id, {
        expectedVersion: d.version, name: d.name, code: d.code, description: d.description,
        parentDepartmentId: d.parentId, headUserId: d.headId, status: d.active ? 'active' : 'inactive', displayOrder: d.order
      }).pipe(map(done));
    }
    return this.admin.createDepartment({
      name: d.name, code: d.code, description: d.description, parentDepartmentId: d.parentId, headUserId: d.headId, displayOrder: d.order
    }).pipe(
      switchMap((r) => d.active ? of(r) : this.admin.updateDepartment(r.id ?? '', {
        expectedVersion: r.version, name: r.name, code: r.code, status: 'inactive'
      })),
      map(done)
    );
  }

  removeDepartment(d: Department): Observable<unknown> {
    return this.admin.deleteDepartment(d.id, { expectedVersion: d.version }).pipe(
      tap(() => this.departments.update((list) => list.filter((x) => x.id !== d.id))));
  }

  saveOffice(o: Office, creating: boolean): Observable<Office> {
    const done = (r: OrganisationUnitResponse) => {
      const row = toOffice(r);
      this.offices.update((list) => (list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]));
      return row;
    };
    const body = {
      name: o.name, code: o.code, description: o.description, parentUnitId: o.parentId, unitType: o.kind,
      addressLine1: o.address1, addressLine2: o.address2, city: o.city, state: o.state, country: o.country,
      postalCode: o.postal, contactEmail: o.email, contactPhone: o.phone, timeZone: o.timezone,
      managerUserId: o.managerId, displayOrder: o.order
    };
    if (!creating) {
      return this.admin.updateUnit(o.id, { ...body, expectedVersion: o.version, status: o.active ? 'active' : 'inactive' }).pipe(map(done));
    }
    return this.admin.createUnit(body).pipe(
      switchMap((r) => o.active ? of(r) : this.admin.updateUnit(r.id ?? '', { expectedVersion: r.version, status: 'inactive' })),
      map(done)
    );
  }

  removeOffice(o: Office): Observable<unknown> {
    return this.admin.deleteUnit(o.id, { expectedVersion: o.version }).pipe(
      tap(() => this.offices.update((list) => list.filter((x) => x.id !== o.id))));
  }
}
