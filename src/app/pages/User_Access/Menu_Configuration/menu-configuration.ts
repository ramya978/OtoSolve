import { Component, HostListener, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { IamOption, MenuGroup, MenuItem, initialsOf, slugCode } from '../../../Shared/IAM/iam-data';
import { IamRolesStore } from '../../../Shared/IAM/iam-roles.store';
import { IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { NavigationService } from '../../../Shared/services/navigation.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { RoleMenuNodeResponse, TenantMenuItemRequest, TenantMenuNodeResponse } from '../../../Shared/models/iam-contract.model';

interface NodeMeta {
  id: string; version: number; level: string; parentId: string | null; catalogueName: string; iconBase: string; order: number;
}

type Scope = 'org' | 'role';

interface MenuDraft {
  /** '' = top-level menu, otherwise the parent menu code */
  parent: string;
  /** code of the item being edited ('' = new) */
  editing: string;
  name: string;
  code: string;
  module: string;
  route: string;
  permission: string;
  position: number | null;
  icon: string;
}

const clone = (list: MenuGroup[]): MenuGroup[] => list.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i })) }));

/** Menu configuration — Workspace Kit "Planning worksheet": every sidebar menu and item as an editable
 *  working copy (rename, reorder, switch on/off) with a change column, totals, save / cancel and a live
 *  sidebar preview (optionally as one role sees it). */
@Component({
  selector: 'app-iam-menu-configuration',
  imports: [IamSelect],
  templateUrl: './menu-configuration.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './menu-configuration.css']
})
export class MenuConfiguration implements OnInit {
  private readonly api = inject(IamAdminApiService);
  private readonly rolesStore = inject(IamRolesStore);
  private readonly nav = inject(NavigationService);
  private readonly toast = inject(ToastService);
  private readonly meta = new Map<string, NodeMeta>();

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly saving = signal(false);
  private readonly permissionCodes = signal<{ code: string; name: string }[]>([]);
  private readonly roleVisible = signal<Set<string> | null>(null);

  /** saved baseline (what is published) */
  private readonly base = signal<MenuGroup[]>([]);
  private get original(): MenuGroup[] {
    return this.base();
  }
  readonly menus = signal<MenuGroup[]>([]);
  private readonly hasRoles = computed(() => this.rolesStore.roles().length > 0);
  get orgName(): string { return this.nav.organisationName(); }

  constructor() {
    // the role picker sets viewRole directly; load that role's visible entries when it changes
    effect(() => {
      const code = this.viewRole();
      const ready = this.hasRoles();
      if (code && ready) untracked(() => this.setViewRole(code));
    });
  }

  ngOnInit(): void {
    if (!this.rolesStore.roles().length) this.rolesStore.load();
    this.api.getMenuPermissionCodes().subscribe({ next: (l) => this.permissionCodes.set(l), error: () => undefined });
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.getMenuConfiguration().subscribe({
      next: (cfg) => {
        this.meta.clear();
        const groups = (cfg.nodes ?? []).slice().sort((a, b) => (a.resolvedOrder ?? 0) - (b.resolvedOrder ?? 0)).map((n) => this.toGroup(n));
        this.base.set(clone(groups));
        this.menus.set(clone(groups));
        this.saved.set(true);
        if (!groups.some((g) => g.code === this.selected())) this.selected.set(groups[0]?.code ?? '');
        this.loading.set(false);
      },
      error: (e) => {
        this.loadError.set(apiErrorMessage(e, 'The menu could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  private remember(n: TenantMenuNodeResponse, parentId: string | null): void {
    this.meta.set(n.code ?? '', {
      id: n.menuDefinitionId ?? '', version: n.version ?? 0, level: n.level ?? 'menu', parentId,
      catalogueName: n.catalogueName ?? n.resolvedName ?? '', iconBase: n.resolvedIcon ?? '', order: n.resolvedOrder ?? 0,
    });
  }

  private toGroup(n: TenantMenuNodeResponse): MenuGroup {
    this.remember(n, null);
    const items: MenuItem[] = [];
    const walk = (list: TenantMenuNodeResponse[] | null | undefined, parent: string): void => {
      for (const c of (list ?? []).slice().sort((a, b) => (a.resolvedOrder ?? 0) - (b.resolvedOrder ?? 0))) {
        this.remember(c, parent);
        items.push({ code: c.code ?? '', name: c.resolvedName ?? c.catalogueName ?? '', route: c.route ?? '', permission: c.requiredPermissionCode ?? '', inUse: !!c.isEnabled });
        walk(c.children, c.menuDefinitionId ?? parent);
      }
    };
    walk(n.children, n.menuDefinitionId ?? '');
    return {
      code: n.code ?? '', name: n.resolvedName ?? n.catalogueName ?? '', icon: n.resolvedIcon ?? 'grid',
      permission: n.requiredPermissionCode ?? '', inUse: !!n.isEnabled, module: n.moduleCode ?? '', items,
    };
  }

  readonly scope = signal<Scope>('org');
  readonly viewRole = signal('');
  readonly query = signal('');
  readonly selected = signal('');
  /** expanded menu groups in the worksheet */
  readonly openGroups = signal<Set<string>>(new Set());
  readonly saved = signal(true);
  readonly added = signal<string[]>([]);

  readonly drawer = signal(false);
  readonly draft = signal<MenuDraft>(this.blank(''));
  readonly tried = signal(false);

  private readonly roleOptionsC = computed<IamOption[]>(() =>
    this.rolesStore.roles().map((r) => ({ value: r.code, label: r.name, hint: r.code, initials: initialsOf(r.name) })));
  get roleOptions(): IamOption[] { return this.roleOptionsC(); }
  private readonly moduleOptionsC = computed<IamOption[]>(() =>
    Array.from(new Set(this.menus().map((m) => m.module).filter(Boolean))).map((m) => ({ value: m, label: m, icon: 'layers' })));
  get moduleOptions(): IamOption[] { return this.moduleOptionsC(); }
  readonly iconOptions: IamOption[] = [
    { value: '', label: 'No icon', icon: 'image' },
    ...['grid', 'heart', 'flag', 'coin', 'chat', 'home', 'people', 'database', 'layout', 'wallet', 'box', 'doc', 'calendar', 'shield', 'key', 'star']
      .map((i) => ({ value: i, label: i.charAt(0).toUpperCase() + i.slice(1), icon: i }))
  ];
  private readonly permissionOptionsC = computed<IamOption[]>(() => [
    { value: '', label: 'No permission — everyone given the item sees it', icon: 'key' },
    ...this.permissionCodes().map((p) => ({ value: p.code, label: p.code, hint: p.name, icon: 'key' }))
  ]);
  get permissionOptions(): IamOption[] { return this.permissionOptionsC(); }
  readonly menuOptions = computed<IamOption[]>(() =>
    this.menus().map((m) => ({ value: m.code, label: m.name, hint: m.inUse ? `${this.onCount(m)}/${m.items.length} in use` : 'Off', icon: m.icon })));

  // ---------------------------------------------------------------- facts
  readonly totalItems = computed(() => this.menus().reduce((t, m) => t + 1 + m.items.length, 0));
  readonly inUseItems = computed(() => this.menus().reduce((t, m) => t + (m.inUse ? 1 + m.items.filter((i) => i.inUse).length : 0), 0));
  readonly topCount = computed(() => this.menus().length);
  readonly topInUse = computed(() => this.menus().filter((m) => m.inUse).length);
  readonly renamed = computed(() => {
    let n = 0;
    for (const m of this.menus()) {
      const o = this.original.find((x) => x.code === m.code);
      if (o && (o.name !== m.name || o.icon !== m.icon)) n++;
      for (const i of m.items) {
        const oi = o?.items.find((x) => x.code === i.code);
        if (oi && oi.name !== i.name) n++;
      }
    }
    return n;
  });

  // ---------------------------------------------------------------- selection
  private static readonly NO_GROUP: MenuGroup = { code: '', name: '', icon: 'grid', permission: '', inUse: false, module: '', items: [] };
  readonly group = computed<MenuGroup>(() => this.menus().find((m) => m.code === this.selected()) ?? this.menus()[0] ?? MenuConfiguration.NO_GROUP);
  readonly groupIndex = computed(() => this.menus().findIndex((m) => m.code === this.group().code));

  readonly shownItems = computed(() => {
    const q = this.query().trim().toLowerCase();
    const items = this.group().items;
    return q ? items.filter((i) => (i.name + ' ' + i.route + ' ' + i.permission).toLowerCase().includes(q)) : items;
  });

  /** left list filtered by the search (matches menu or any of its items) */
  readonly shownMenus = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.menus();
    return this.menus().filter((m) =>
      (m.name + ' ' + m.permission).toLowerCase().includes(q) ||
      m.items.some((i) => (i.name + ' ' + i.route + ' ' + i.permission).toLowerCase().includes(q)));
  });

  onCount(m: MenuGroup): number {
    return m.items.filter((i) => i.inUse).length;
  }

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  select(code: string): void {
    this.selected.set(code);
  }

  step(dir: number): void {
    const list = this.menus();
    const i = (this.groupIndex() + dir + list.length) % list.length;
    this.selected.set(list[i].code);
  }

  // ---------------------------------------------------------------- worksheet
  isOpen(m: MenuGroup): boolean {
    return !!this.query().trim() || this.openGroups().has(m.code);
  }

  toggleOpen(m: MenuGroup): void {
    const n = new Set(this.openGroups());
    if (n.has(m.code)) n.delete(m.code);
    else n.add(m.code);
    this.openGroups.set(n);
    this.selected.set(m.code);
  }

  expandAll(): void {
    this.openGroups.set(new Set(this.menus().map((m) => m.code)));
  }

  collapseAll(): void {
    this.openGroups.set(new Set());
  }

  /** items of a group filtered by the search */
  itemsOf(m: MenuGroup): MenuItem[] {
    const q = this.query().trim().toLowerCase();
    if (!q || (m.name + ' ' + m.permission).toLowerCase().includes(q)) return m.items;
    return m.items.filter((i) => (i.name + ' ' + i.route + ' ' + i.permission).toLowerCase().includes(q));
  }

  renameGroup(m: MenuGroup, name: string): void {
    this.change((list) => list.map((g) => (g.code === m.code ? { ...g, name } : g)));
  }

  renameItem(m: MenuGroup, item: MenuItem, name: string): void {
    this.change((list) => list.map((g) => (g.code === m.code
      ? { ...g, items: g.items.map((i) => (i.code === item.code ? { ...i, name } : i)) } : g)));
  }

  toggleItemIn(m: MenuGroup, item: MenuItem): void {
    this.change((list) => list.map((g) => (g.code === m.code
      ? { ...g, items: g.items.map((i) => (i.code === item.code ? { ...i, inUse: !i.inUse } : i)) } : g)));
  }

  moveIn(m: MenuGroup, item: MenuItem, dir: number): void {
    this.selected.set(m.code);
    this.move(item, dir);
  }

  /** Change column text against the saved baseline */
  groupChange(m: MenuGroup): string {
    const o = this.original.find((x) => x.code === m.code);
    if (!o) return 'New';
    const out: string[] = [];
    if (o.name !== m.name) out.push('Renamed');
    if (o.inUse !== m.inUse) out.push(m.inUse ? 'Switched on' : 'Switched off');
    if (this.original.indexOf(o) !== this.menus().indexOf(m)) out.push('Moved');
    return out.join(' · ') || 'Saved baseline';
  }

  itemChange(m: MenuGroup, it: MenuItem): string {
    const o = this.original.find((x) => x.code === m.code)?.items;
    const oi = o?.find((x) => x.code === it.code);
    if (!o || !oi) return 'New';
    const out: string[] = [];
    if (oi.name !== it.name) out.push('Renamed');
    if (oi.inUse !== it.inUse) out.push(it.inUse ? 'Switched on' : 'Switched off');
    if (o.indexOf(oi) !== m.items.indexOf(it)) out.push('Moved');
    return out.join(' · ') || 'Saved baseline';
  }

  readonly changes = computed(() => {
    let n = 0;
    for (const m of this.menus()) {
      if (this.groupChange(m) !== 'Saved baseline') n++;
      for (const it of m.items) if (this.itemChange(m, it) !== 'Saved baseline') n++;
    }
    return n;
  });

  isFirstIn(m: MenuGroup, it: MenuItem): boolean {
    return m.items[0]?.code === it.code;
  }

  isLastIn(m: MenuGroup, it: MenuItem): boolean {
    return m.items[m.items.length - 1]?.code === it.code;
  }

  editItemIn(m: MenuGroup, it: MenuItem): void {
    this.selected.set(m.code);
    this.editItem(it);
  }

  createIn(m: MenuGroup, after?: MenuItem): void {
    this.selected.set(m.code);
    this.createItem(after);
  }

  editGroupOf(m: MenuGroup): void {
    this.selected.set(m.code);
    this.editGroup();
  }

  // ---------------------------------------------------------------- role visibility
  /** Can the chosen role open this item? (tenant admin sees all; otherwise the role needs a permission in the item's area) */
  visibleTo(item: MenuItem | MenuGroup): boolean {
    if (this.scope() !== 'role') return true;
    const visible = this.roleVisible();
    return !!visible && visible.has(item.code);
  }

  // ---- role-to-menu mapping (PUT /menus/role-mapping/{roleId})
  readonly roleDirty = signal(false);
  readonly roleSaving = signal(false);
  private readonly rolePermitted = signal<Set<string>>(new Set());
  private roleLanding: string | null = null;

  toggleRoleVisible(item: MenuItem | MenuGroup): void {
    if (!this.rolePermitted().has(item.code)) {
      this.toast.show('Not permitted', 'This role does not hold the permission this item needs.', 'warning');
      return;
    }
    const n = new Set(this.roleVisible() ?? []);
    if (n.has(item.code)) n.delete(item.code);
    else n.add(item.code);
    this.roleVisible.set(n);
    this.roleDirty.set(true);
  }

  saveRoleMapping(): void {
    const role = this.rolesStore.roles().find((r) => r.code === this.viewRole());
    if (!role?.id || this.roleSaving()) return;
    const visible = new Set(this.roleVisible() ?? []);
    // A menu is shown when any of its items is.
    for (const g of this.menus()) if (g.items.some((i) => visible.has(i.code))) visible.add(g.code);
    const ids = [...visible].map((c) => this.meta.get(c)?.id).filter((x): x is string => !!x);
    this.roleSaving.set(true);
    this.api.mapRoleMenus(role.id, { visibleMenuIds: ids, expectedVersion: role.version ?? 0, landingMenuId: this.roleLanding }).subscribe({
      next: (o) => {
        this.roleSaving.set(false);
        this.roleDirty.set(false);
        this.toast.show('Role menus saved', o.message ?? role.name, 'success');
        this.rolesStore.load();
      },
      error: (e) => {
        this.roleSaving.set(false);
        this.toast.show('Not saved', apiErrorMessage(e, 'The role menus could not be saved.'), 'error');
      },
    });
  }

  // ---- export of the working copy
  exportCsv(): void {
    const q = (v: string) => '"' + v.replace(/"/g, '""') + '"';
    const rows = [['Menu', 'Item', 'Route', 'Permission', 'In use'].join(',')];
    for (const g of this.menus()) {
      rows.push([q(g.name), '', '', q(g.permission), g.inUse ? 'Yes' : 'No'].join(','));
      for (const i of g.items) rows.push([q(g.name), q(i.name), q(i.route), q(i.permission), i.inUse ? 'Yes' : 'No'].join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-configuration.csv';
    a.click();
    URL.revokeObjectURL(url);
    this.toast.show('Export ready', 'The menu configuration was downloaded as CSV.', 'success');
  }

  /** loads which menu entries the chosen role can open */
  private setViewRole(code: string): void {
    const role = this.rolesStore.roles().find((r) => r.code === code);
    if (!role?.id) { this.roleVisible.set(null); return; }
    this.api.getRoleMenuMapping(role.id).subscribe({
      next: (m) => {
        const out = new Set<string>();
        const permitted = new Set<string>();
        const walk = (l: RoleMenuNodeResponse[] | null | undefined): void => {
          for (const n of l ?? []) {
            if (n.isPermitted !== false) permitted.add(n.code ?? '');
            if (n.isVisible && n.isPermitted !== false) out.add(n.code ?? '');
            walk(n.children);
          }
        };
        walk(m.nodes);
        this.roleLanding = m.landingMenuId ?? null;
        this.rolePermitted.set(permitted);
        this.roleDirty.set(false);
        this.roleVisible.set(out);
      },
      error: () => this.roleVisible.set(new Set()),
    });
  }

  readonly preview = computed(() =>
    this.menus().filter((m) => m.inUse && this.visibleTo(m) && (m.items.length === 0 || m.items.some((i) => i.inUse && this.visibleTo(i)))));

  previewItems(m: MenuGroup): MenuItem[] {
    return m.items.filter((i) => i.inUse && this.visibleTo(i));
  }

  // ---------------------------------------------------------------- edits
  private change(fn: (list: MenuGroup[]) => MenuGroup[]): void {
    this.menus.update((list) => fn(clone(list)));
    this.saved.set(false);
  }

  toggleGroup(m: MenuGroup): void {
    this.change((list) => list.map((g) => (g.code === m.code ? { ...g, inUse: !g.inUse } : g)));
  }

  toggleItem(item: MenuItem): void {
    const code = this.group().code;
    this.change((list) => list.map((g) => (g.code === code ? { ...g, items: g.items.map((i) => (i.code === item.code ? { ...i, inUse: !i.inUse } : i)) } : g)));
  }

  move(item: MenuItem, dir: number): void {
    const code = this.group().code;
    this.change((list) => list.map((g) => {
      if (g.code !== code) return g;
      const items = [...g.items];
      const i = items.findIndex((x) => x.code === item.code);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= items.length) return g;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...g, items };
    }));
  }

  isFirst(item: MenuItem): boolean {
    return this.group().items[0]?.code === item.code;
  }

  isLast(item: MenuItem): boolean {
    const items = this.group().items;
    return items[items.length - 1]?.code === item.code;
  }

  discard(): void {
    this.menus.set(clone(this.base()));
    this.saved.set(true);
  }

  save(): void {
    if (this.saving()) return;
    const items: TenantMenuItemRequest[] = [];
    this.menus().forEach((g, gi) => {
      const gm = this.meta.get(g.code);
      if (gm) items.push(this.requestFor(g.code, g.name, g.inUse, g.icon, gi + 1));
      g.items.forEach((it, ii) => {
        if (this.meta.get(it.code)) items.push(this.requestFor(it.code, it.name, it.inUse, '', ii + 1));
      });
    });
    this.saving.set(true);
    this.api.configureMenu({ items }).subscribe({
      next: (o) => {
        this.saving.set(false);
        this.toast.show('Menu updated', o.message ?? 'The navigation has been saved.', 'success');
        this.nav.load().subscribe({ error: () => undefined });
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.show('Not saved', apiErrorMessage(e, 'The menu could not be saved.'), 'error');
      },
    });
  }

  private requestFor(code: string, name: string, enabled: boolean, icon: string, order: number): TenantMenuItemRequest {
    const m = this.meta.get(code)!;
    return {
      menuDefinitionId: m.id,
      isEnabled: enabled,
      displayNameOverride: name.trim() && name.trim() !== m.catalogueName ? name.trim() : null,
      iconOverride: icon && icon !== m.iconBase ? icon : null,
      displayOrderOverride: order,
    };
  }

  // ---------------------------------------------------------------- drawer
  private blank(parent: string): MenuDraft {
    return { parent, editing: '', name: '', code: '', module: '', route: '', permission: '', position: null, icon: '' };
  }

  /** header Create → a new top-level menu */
  createTop(): void {
    this.open(this.blank(''));
  }

  /** card Create / row + → a new item inside the selected menu (after `after` when given) */
  createItem(after?: MenuItem): void {
    const g = this.group();
    const d = this.blank(g.code);
    d.module = g.module;
    if (after) d.position = g.items.findIndex((i) => i.code === after.code) + 2;
    this.open(d);
  }

  editGroup(): void {
    const g = this.group();
    this.open({ parent: '', editing: g.code, name: g.name, code: g.code, module: g.module, route: '', permission: g.permission, position: this.groupIndex() + 1, icon: g.icon });
  }

  editItem(item: MenuItem): void {
    const g = this.group();
    this.open({
      parent: g.code, editing: item.code, name: item.name, code: item.code, module: g.module, route: item.route,
      permission: item.permission, position: g.items.findIndex((i) => i.code === item.code) + 1, icon: ''
    });
  }

  private open(d: MenuDraft): void {
    this.draft.set(d);
    this.tried.set(false);
    this.drawer.set(true);
  }

  close(): void {
    this.drawer.set(false);
  }

  patch<K extends keyof MenuDraft>(key: K, value: MenuDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  setName(v: string): void {
    const d = this.draft();
    const auto = !d.editing && (!d.code || d.code === slugCode(d.name));
    this.draft.update((x) => ({ ...x, name: v, code: auto ? slugCode(v) : x.code }));
  }

  bumpPosition(step: number): void {
    const max = this.draft().parent ? (this.menus().find((m) => m.code === this.draft().parent)?.items.length ?? 0) + 1 : this.menus().length + 1;
    const cur = this.draft().position ?? max;
    this.patch('position', Math.min(max, Math.max(1, cur + step)));
  }

  readonly parentName = computed(() => this.menus().find((m) => m.code === this.draft().parent)?.name ?? '');

  readonly errors = computed(() => {
    const d = this.draft();
    const taken = !d.editing && this.menus().some((m) => m.code === d.code || m.items.some((i) => i.code === d.code));
    return {
      name: d.name.trim().length < 2 ? 'Enter a display name.' : '',
      code: !/^[A-Z0-9_]{2,}$/.test(d.code) ? 'Use capitals, digits and _ only.' : taken ? 'This code is already in use.' : '',
      module: !d.module ? 'Choose a module.' : '',
      route: d.route && !d.route.startsWith('/') ? 'Routes start with /.' : ''
    };
  });

  submit(): void {
    this.tried.set(true);
    const e = this.errors();
    if (e.name || e.code || e.module || e.route) return;
    const d = this.draft();
    const meta = this.meta.get(d.editing);
    const order = d.position ?? 0;
    this.saving.set(true);
    const done = (msg: string): void => {
      this.saving.set(false);
      this.drawer.set(false);
      this.toast.show(msg, d.name.trim(), 'success');
      this.nav.load().subscribe({ error: () => undefined });
      this.load();
    };
    const fail = (err: unknown): void => {
      this.saving.set(false);
      this.toast.show('Not saved', apiErrorMessage(err, 'That change could not be saved.'), 'error');
    };
    if (d.editing && meta) {
      // An organisation's edit is an override saved through PUT /menus/configuration (the same
      // call as the switches); the catalogue definition itself belongs to the platform.
      const items: TenantMenuItemRequest[] = [];
      this.menus().forEach((g, gi) => {
        if (this.meta.get(g.code)) {
          const edited = g.code === d.editing;
          items.push(this.requestFor(g.code, edited ? d.name : g.name, g.inUse, edited ? (d.icon || g.icon) : g.icon, edited && order ? order : gi + 1));
        }
        g.items.forEach((it, ii) => {
          if (!this.meta.get(it.code)) return;
          const edited = it.code === d.editing;
          items.push(this.requestFor(it.code, edited ? d.name : it.name, it.inUse, '', edited && order ? order : ii + 1));
        });
      });
      this.api.configureMenu({ items }).subscribe({ next: () => done('Menu item updated'), error: fail });
      return;
    }
    const parent = d.parent ? this.meta.get(d.parent) : undefined;
    this.api.createMenuDefinition({
      code: d.code.trim().toUpperCase(), name: d.name.trim(), level: parent ? 'subMenu' : 'menu',
      moduleCode: d.module, parentMenuId: parent?.id ?? null, route: d.route.trim() || null, icon: d.icon || null,
      requiredPermissionCode: d.permission || null, displayOrder: order || 0,
      isPlatformOnly: false, isEnabledByDefault: true, isMandatory: false, opensInNewTab: false,
    }).subscribe({
      next: () => { this.added.update((a) => [...a, d.code]); this.selected.set(parent ? d.parent : d.code); done('Menu item added'); },
      error: fail,
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.drawer.set(false);
  }
}
