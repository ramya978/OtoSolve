import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { fetchPages } from '../services/paging';
import { apiErrorMessage } from '../models/api-response.model';
import { LookupItem, ReferenceDataResponse, UserDetailResponse, UserListItemResponse } from '../models/iam-contract.model';
import { IamUser, UserStatus } from './iam-data';

/** Maps the API's list row onto the shape the (unchanged) Users screens bind to. */
export function toIamUser(r: UserListItemResponse): IamUser {
  return {
    id: r.id ?? '',
    ref: r.code ?? '',
    name: r.displayName ?? '',
    email: r.email ?? '',
    username: r.username ?? '',
    preferredName: r.preferredName ?? '',
    mobile: '',
    role: (r.roleNames ?? [])[0] ?? '',
    unit: r.organisationUnitName ?? '',
    department: r.departmentName ?? '',
    designation: r.designation ?? '',
    manager: '',
    status: (r.status ?? 'draft') as UserStatus,
    invitation: r.status === 'invited' ? 'Pending' : r.status === 'expired' ? 'Expired' : 'Accepted',
    mfaEnrolled: !!r.mfaEnabled,
    dataScope: '',
    accessFrom: '',
    lastSignIn: r.lastLoginAtUtc ?? '',
  };
}

/** Overlays the detail record (mobile, manager, access start) onto a list row. */
export function mergeDetail(u: IamUser, d: UserDetailResponse): IamUser {
  return {
    ...u,
    mobile: [d.mobileCountryCode, d.mobileNumber].filter(Boolean).join(' '),
    manager: d.managerName ?? '',
    accessFrom: d.accessStartsAtUtc ?? '',
    role: d.roles?.[0]?.roleName ?? u.role,
    preferredName: d.preferredName ?? u.preferredName,
  };
}

/** The organisation's people and the vocabulary the screens filter by, loaded from the API. */
@Injectable({ providedIn: 'root' })
export class IamDirectoryStore {
  private readonly api = inject(UserDirectoryApiService);

  readonly users = signal<IamUser[]>([]);
  readonly reference = signal<ReferenceDataResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly roles = computed<LookupItem[]>(() => this.reference()?.roles ?? []);
  readonly units = computed<LookupItem[]>(() => this.reference()?.organisationUnits ?? []);
  readonly departments = computed<LookupItem[]>(() => this.reference()?.departments ?? []);

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      page: fetchPages((p, size) => this.api.searchUsers({ pageIndex: p, pageSize: size })),
      reference: this.api.getReference(),
    }).subscribe({
      next: ({ page, reference }) => {
        this.users.set(page.items.map(toIamUser));
        this.reference.set(reference);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'The people directory could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  replace(user: IamUser): void {
    this.users.update((l) => l.map((x) => (x.id === user.id ? user : x)));
  }
}
