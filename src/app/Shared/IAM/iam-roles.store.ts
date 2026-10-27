import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
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
  /** True while the per-role permission sets are still arriving in the background. */
  readonly hydrating = signal(false);
  /** role code → { conflicting role code → incompatibility id } */
  readonly incompatIds = new Map<string, Map<string, string>>();

  readonly roleByCode = computed(() => new Map(this.roles().map((r) => [r.code, r])));

  load(done?: () => void): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      matrix: this.api.getPermissionMatrix(),
      list: this.api.searchAll(),
    }).subscribe({
      next: ({ matrix, list }) => {
        this.fillCatalogue(matrix.modules ?? []);
        const idToCode = new Map(list.map((r) => [r.id ?? '', r.code ?? '']));
        this.incompatIds.clear();
        // The list paints at once; each role's permission set follows (four at a time).
        this.roles.set(list.map((r) => this.toRole(r, null, idToCode)));
        this.version.update((v) => v + 1);
        this.loading.set(false);
        done?.();
        this.hydrate(list, idToCode);
      },
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'Roles could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  private hydrate(list: RoleListItemResponse[], idToCode: Map<string, string>): void {
    if (!list.length) return;
    this.hydrating.set(true);
    from(list).pipe(
      mergeMap((r) => this.api.getRole(r.id ?? '').pipe(catchError(() => of(null)), mergeMap((d) => of({ r, d }))), 4),
    ).subscribe({
      next: ({ r, d }) => {
        if (!d) return;
        const full = this.toRole(r, d, idToCode);
        this.roles.update((all) => all.map((x) => (x.code === full.code ? full : x)));
        this.version.update((v) => v + 1);
      },
      complete: () => this.hydrating.set(false),
      error: () => this.hydrating.set(false),
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
