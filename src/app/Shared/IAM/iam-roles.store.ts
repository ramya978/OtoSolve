import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { RoleCatalogueApiService } from '../../Service/role-catalogue-api.service';
import { apiErrorMessage } from '../models/api-response.model';
import { PermissionModuleResponse, RoleDetailResponse, RoleListItemResponse } from '../models/iam-contract.model';
import { IamRole, PERMISSIONS, PERM_AREAS, Permission, PermAction } from './iam-data';

const AREA_ICON: Record<string, string> = {
  campaigns: 'flag', campaign: 'flag', donors: 'heart', donor: 'heart', iam: 'shield', donations: 'coin', payments: 'coin', platform: 'layers'
};

/**
 * Roles and the permission catalogue, loaded from the API.
 *
 * `PERM_AREAS` and `PERMISSIONS` stay the arrays the screens already read; they are refilled in
 * place from the server's permission matrix, and `version` ticks so computed lists redraw.
 */
@Injectable({ providedIn: 'root' })
export class IamRolesStore {
  private readonly api = inject(RoleCatalogueApiService);

  readonly roles = signal<IamRole[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly version = signal(0);
  /** role code → { conflicting role code → incompatibility id } */
  readonly incompatIds = new Map<string, Map<string, string>>();

  readonly roleByCode = computed(() => new Map(this.roles().map((r) => [r.code, r])));

  load(done?: () => void): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      matrix: this.api.getPermissionMatrix(),
      list: this.api.searchAll(),
    }).pipe(
      switchMap(({ matrix, list }) => {
        const details = list.length
          ? forkJoin(list.map((r) => this.api.getRole(r.id ?? '').pipe(catchError(() => of(null)))))
          : of([] as (RoleDetailResponse | null)[]);
        return details.pipe(map((d) => ({ matrix, list, details: d })));
      }),
    ).subscribe({
      next: ({ matrix, list, details }) => {
        this.fillCatalogue(matrix.modules ?? []);
        const idToCode = new Map(list.map((r) => [r.id ?? '', r.code ?? '']));
        this.incompatIds.clear();
        this.roles.set(list.map((r, i) => this.toRole(r, details[i], idToCode)));
        this.version.update((v) => v + 1);
        this.loading.set(false);
        done?.();
      },
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'Roles could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  private fillCatalogue(modules: PermissionModuleResponse[]): void {
    PERM_AREAS.length = 0;
    PERMISSIONS.length = 0;
    for (const m of modules) {
      const key = String(m.moduleCode ?? '').toLowerCase();
      PERM_AREAS.push({ key, name: m.moduleName ?? m.moduleCode ?? key, prefix: key, icon: AREA_ICON[key] ?? 'layers' });
      for (const g of m.groups ?? []) {
        for (const p of g.permissions ?? []) {
          PERMISSIONS.push({
            code: p.code ?? '', name: p.name ?? p.code ?? '', area: key,
            action: (p.action ?? 'view') as PermAction, sensitive: !!p.isSensitive
          } satisfies Permission);
        }
      }
    }
  }

  private toRole(r: RoleListItemResponse, d: RoleDetailResponse | null, idToCode: Map<string, string>): IamRole {
    const perms = d?.permissions ?? [];
    const code = r.code ?? '';
    const inc = new Map<string, string>();
    for (const x of d?.incompatibilities ?? []) {
      const other = idToCode.get(x.conflictingRoleId ?? '') ?? '';
      if (other && x.id) inc.set(other, x.id);
    }
    this.incompatIds.set(code, inc);
    return {
      id: r.id, version: d?.version ?? r.version, members: r.memberCount ?? 0,
      code, name: r.name ?? code, purpose: r.description ?? '',
      status: (r.status ?? 'draft') as IamRole['status'],
      type: r.roleTypeDisplay ?? 'Organisation',
      owningFunction: r.displayTag ?? '',
      privileged: !!r.isPrivileged, builtIn: !!r.isSystemRole, isDefault: !!r.isDefaultRole,
      priority: r.priority ?? 0,
      grants: perms.filter((p) => !p.isDenied).map((p) => p.permissionCode ?? ''),
      blocks: perms.filter((p) => p.isDenied).map((p) => p.permissionCode ?? ''),
      incompatible: [...inc.keys()],
      lastChanged: r.updatedAtUtc ?? '',
      all: !!r.grantsAllTenantPermissions,
    };
  }
}
