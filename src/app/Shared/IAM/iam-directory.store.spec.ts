import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { AuthTokenService } from '../services/auth-token.service';
import { IamDirectoryStore } from './iam-directory.store';

/**
 * TS-220: the people directory is a root store that outlives every screen. Bulk users and Access
 * requests loaded it only "when empty", so after an Organisation switch they kept offering the
 * previous Organisation's people. `ensureLoaded` reloads whenever the Organisation differs.
 */
describe('IamDirectoryStore.ensureLoaded (TS-220)', () => {
  const tenant = signal<{ tenantId: string } | null>({ tenantId: 'smile' });
  const people: Record<string, { id: string; code: string; displayName: string }[]> = {
    smile: [{ id: '1', code: 'USR-00005', displayName: 'Kavita Ashok' }],
    helpage: [{ id: '2', code: 'USR-00001', displayName: 'Arvind Murali' }],
  };
  const searchUsers = vi.fn(() => of({ items: people[tenant()!.tenantId], totalCount: 1, page: 1, pageSize: 100 }));

  beforeEach(() => {
    searchUsers.mockClear();
    tenant.set({ tenantId: 'smile' });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthTokenService, useValue: { tenant } },
        { provide: UserDirectoryApiService, useValue: { searchUsers, getReference: () => of({ roles: [], organisationUnits: [], departments: [] }) } },
      ],
    });
  });

  it('does not reload while it already holds this Organisation', () => {
    const store = TestBed.inject(IamDirectoryStore);
    store.ensureLoaded();
    const calls = searchUsers.mock.calls.length;
    store.ensureLoaded();
    expect(searchUsers.mock.calls.length).toBe(calls);
    expect(store.users().map((u) => u.name)).toEqual(['Kavita Ashok']);
  });

  it('reloads, and drops the old list, after a switch to another Organisation', () => {
    const store = TestBed.inject(IamDirectoryStore);
    store.ensureLoaded();
    expect(store.users().map((u) => u.name)).toEqual(['Kavita Ashok']);

    tenant.set({ tenantId: 'helpage' });
    store.ensureLoaded();

    expect(store.users().map((u) => u.name)).toEqual(['Arvind Murali']);
  });
});
