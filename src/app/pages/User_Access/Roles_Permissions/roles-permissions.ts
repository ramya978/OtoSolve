import { Component, HostListener, computed, signal } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  IamOption, IamRole, PERMISSIONS, PERM_ACTIONS, PERM_ACTION_LABEL, PERM_AREAS, PermAction, PermArea, Permission,
  ROLES, ROLE_STATUS_LABEL, RoleStatus, USERS, initialsOf, slugCode
} from '../../../Shared/IAM/iam-data';

type StatusTab = 'all' | RoleStatus;
type DetailTab = 'permissions' | 'combine' | 'details';
type DrawerMode = 'create' | 'clone' | 'edit';
type Cell = 'allowed' | 'blocked' | 'none' | 'na';

interface RoleDraft {
  name: string;
  code: string;
  purpose: string;
  privileged: boolean | null;
  isDefault: boolean | null;
  priority: number;
  owningFunction: string;
  grants: string[];
  incompatible: string[];
}

/** Roles & Permissions — area-first view (record style): pick a permission area on the left and see what
 *  every role can do in it as cards; open a role card in an offcanvas to read or change its permissions
 *  (Allow / Not given / Block); create / clone / edit in an offcanvas; compare two roles in a popup. */
@Component({
  selector: 'app-iam-roles-permissions',
  imports: [IamSelect],
  templateUrl: './roles-permissions.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './roles-permissions.css']
})
export class RolesPermissions {
  readonly roles = signal<IamRole[]>(ROLES.map((r) => ({ ...r, grants: [...r.grants], blocks: [...r.blocks] })));

  readonly tab = signal<StatusTab>('all');
  readonly query = signal('');
  readonly showFilters = signal(false);
  readonly privFilter = signal('');
  readonly originFilter = signal('');
  readonly expanded = signal<string>('CAMPAIGN_MANAGER');
  /** area shown in the expansion */
  readonly area = signal<string>('campaigns');
  /** matrix cell figure: allowed permissions or sensitive ones */
  readonly show = signal<'allowed' | 'sensitive'>('allowed');
  readonly detailTab = signal<DetailTab>('permissions');

  // permission matrix (view mode)
  readonly openAreas = signal<Set<string>>(new Set());
  readonly showNames = signal(false);
  readonly permQuery = signal('');

  // permission editing (inline)
  readonly editing = signal(false);
  readonly editMode = signal<'allow' | 'block'>('allow');
  readonly editGrants = signal<Set<string>>(new Set());
  readonly editBlocks = signal<Set<string>>(new Set());
  readonly editQuery = signal('');
  readonly editReason = signal('');

  // drawer
  readonly drawer = signal<DrawerMode | null>(null);
  readonly draft = signal<RoleDraft>(this.emptyDraft());
  readonly tried = signal(false);

  // role-in-area offcanvas
  readonly panel = signal(false);

  // compare dialog
  readonly compareOpen = signal(false);
  readonly compareWith = signal('');
  readonly compared = signal(false);

  readonly areas = PERM_AREAS;
  readonly PERMISSIONS_TOTAL = PERMISSIONS.length;
  readonly actions = PERM_ACTIONS;
  readonly actionLabel = (a: PermAction): string => PERM_ACTION_LABEL[a];
  readonly statusLabel = (s: RoleStatus): string => ROLE_STATUS_LABEL[s];
  readonly initials = initialsOf;
  readonly statusOptions = computed<IamOption[]>(() => [
    { value: 'all', label: 'All roles', hint: this.counts()['all'] + ' roles' },
    { value: 'draft', label: 'Draft', hint: String(this.counts()['draft']) },
    { value: 'active', label: 'Active', hint: String(this.counts()['active']) },
    { value: 'inactive', label: 'Inactive', hint: String(this.counts()['inactive']) }
  ]);
  readonly showOptions: IamOption[] = [
    { value: 'allowed', label: 'Allowed permissions' },
    { value: 'sensitive', label: 'Sensitive permissions' }
  ];
  readonly tabs: { key: StatusTab; label: string }[] = [
    { key: 'all', label: 'All roles' }, { key: 'draft', label: 'Draft' }, { key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }
  ];
  readonly privOptions: IamOption[] = [
    { value: '', label: 'Any privilege level' }, { value: 'priv', label: 'Privileged', icon: 'shield' }, { value: 'std', label: 'Standard', icon: 'person' }
  ];
  readonly originOptions: IamOption[] = [
    { value: '', label: 'Built in and custom' }, { value: 'builtin', label: 'Built in', icon: 'lock' }, { value: 'custom', label: 'Custom', icon: 'edit' }
  ];

  // ---------------------------------------------------------------- summary
  readonly peopleOf = (code: string): number => USERS.filter((u) => u.role === code).length;
  readonly counts = computed(() => {
    const out: Record<string, number> = { all: this.roles().length };
    for (const s of ['draft', 'active', 'inactive']) out[s] = this.roles().filter((r) => r.status === s).length;
    return out;
  });
  readonly privilegedCount = computed(() => this.roles().filter((r) => r.privileged).length);
  readonly builtInCount = computed(() => this.roles().filter((r) => r.builtIn).length);
  readonly peopleTotal = computed(() => this.roles().reduce((t, r) => t + this.peopleOf(r.code), 0));
  readonly grantedTotal = computed(() => this.roles().filter((r) => !r.all).reduce((t, r) => t + r.grants.length, 0));

  readonly list = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.roles().filter((r) =>
      (this.tab() === 'all' || r.status === this.tab()) &&
      (!this.privFilter() || (this.privFilter() === 'priv') === r.privileged) &&
      (!this.originFilter() || (this.originFilter() === 'builtin') === r.builtIn) &&
      (!q || (r.name + ' ' + r.code + ' ' + r.purpose).toLowerCase().includes(q))
    ).sort((a, b) => b.priority - a.priority);
  });

  readonly current = computed(() => this.roles().find((r) => r.code === this.expanded()) ?? this.list()[0] ?? null);

  /** areas for the left list / the narrow-screen dropdown */
  readonly areaOptions: IamOption[] = PERM_AREAS.map((a) => ({ value: a.key, label: a.name, hint: PERMISSIONS.filter((p) => p.area === a.key).length + ' permissions', icon: a.icon }));

  /** roles in the list that hold at least one permission of the area */
  rolesWithAccess(a: PermArea): number {
    return this.list().filter((r) => this.areaAllowed(r, a) > 0).length;
  }

  /** sensitive permissions in the area */
  areaSensitiveTotal(a: PermArea): number {
    return this.areaPerms(a).filter((p) => p.sensitive).length;
  }

  /** role with the most allowed permissions in the area */
  topRole(a: PermArea): string {
    const best = [...this.list()].sort((x, y) => this.areaAllowed(y, a) - this.areaAllowed(x, a))[0];
    return best && this.areaAllowed(best, a) ? best.name : '—';
  }

  /** share of the area a role holds (0–100) */
  areaShare(r: IamRole, a: PermArea): number {
    const n = this.areaPerms(a).length;
    return n ? Math.round((this.areaAllowed(r, a) / n) * 100) : 0;
  }

  /** blocked permissions of a role in the area */
  areaBlocked(r: IamRole, a: PermArea): number {
    return this.areaPerms(a).filter((p) => r.blocks.includes(p.code)).length;
  }

  /** open a role card in the offcanvas for the current area */
  openPanel(r: IamRole, edit = false): void {
    this.expanded.set(r.code);
    this.permQuery.set('');
    this.editing.set(false);
    if (edit) this.startEdit(r);
    this.panel.set(true);
  }

  closePanel(): void {
    this.panel.set(false);
    this.editing.set(false);
  }

  /** colour of a role status: active green, draft amber, inactive grey */
  tone(s: RoleStatus): 'success' | 'warning' | 'muted' {
    return s === 'active' ? 'success' : s === 'draft' ? 'warning' : 'muted';
  }

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  // ---------------------------------------------------------------- list
  /** open a role below the cards */
  selectRole(code: string): void {
    if (this.current()?.code === code) return;
    this.expanded.set(code);
    this.permQuery.set('');
    this.editing.set(false);
  }

  setTab(t: StatusTab): void { this.tab.set(t); }
  setQuery(v: string): void { this.query.set(v); }

  toggleRow(r: IamRole): void {
    if (this.expanded() === r.code) {
      this.expanded.set('');
    } else {
      this.expanded.set(r.code);
      this.detailTab.set('permissions');
      this.openAreas.set(new Set());
      this.permQuery.set('');
    }
    this.editing.set(false);
  }

  /** matrix cell click: open that role on that area */
  openCell(r: IamRole, a: PermArea): void {
    if (this.expanded() !== r.code) {
      this.expanded.set(r.code);
      this.detailTab.set('permissions');
      this.editing.set(false);
    }
    this.area.set(a.key);
  }

  /** figure shown in a matrix cell */
  cellCount(r: IamRole, a: PermArea): number {
    return this.show() === 'sensitive' ? this.areaSensitive(r, a) : this.areaAllowed(r, a);
  }

  cellTotal(a: PermArea): number {
    const perms = this.areaPerms(a);
    return this.show() === 'sensitive' ? perms.filter((p) => p.sensitive).length : perms.length;
  }

  readonly currentArea = computed(() => PERM_AREAS.find((a) => a.key === this.area()) ?? PERM_AREAS[0]);

  /** permissions of the open area for the read view */
  areaRows(r: IamRole): Permission[] {
    const q = this.permQuery().trim().toLowerCase();
    return this.areaPerms(this.currentArea()).filter((p) =>
      (q ? (p.name + ' ' + p.code).toLowerCase().includes(q) : true) &&
      (this.showNames() || q || r.grants.includes(p.code) || r.blocks.includes(p.code)));
  }

  baseState(r: IamRole, p: Permission): 'allow' | 'block' | 'none' {
    return r.blocks.includes(p.code) ? 'block' : r.grants.includes(p.code) ? 'allow' : 'none';
  }

  /** worksheet state of a permission while editing */
  editState(p: Permission): 'allow' | 'block' | 'none' {
    return this.editBlocks().has(p.code) ? 'block' : this.editGrants().has(p.code) ? 'allow' : 'none';
  }

  setState(p: Permission, s: 'allow' | 'block' | 'none'): void {
    const g = new Set(this.editGrants());
    const b = new Set(this.editBlocks());
    g.delete(p.code);
    b.delete(p.code);
    if (s === 'allow') g.add(p.code);
    if (s === 'block') b.add(p.code);
    this.editGrants.set(g);
    this.editBlocks.set(b);
  }

  /** set every permission of the open area */
  setAreaState(s: 'allow' | 'none'): void {
    for (const p of this.editList(this.currentArea())) this.setState(p, s);
  }

  changedCount(r: IamRole): number {
    return PERMISSIONS.filter((p) => this.editState(p) !== this.baseState(r, p)).length;
  }

  areaEditAllowed(a: PermArea): number {
    return this.areaPerms(a).filter((p) => this.editGrants().has(p.code)).length;
  }

  permCount(r: IamRole): string {
    return r.all ? 'All' : String(r.grants.length);
  }

  sensitiveCount(r: IamRole): number {
    return PERMISSIONS.filter((p) => p.sensitive && r.grants.includes(p.code)).length;
  }

  // ---------------------------------------------------------------- matrix (view)
  areaPerms(area: PermArea): Permission[] {
    return PERMISSIONS.filter((p) => p.area === area.key);
  }

  /** Areas shown for a role: those with a grant, or every area while searching / showing all names. */
  matrixAreas(r: IamRole): PermArea[] {
    const q = this.permQuery().trim().toLowerCase();
    return this.areas.filter((a) => {
      const perms = this.areaPerms(a);
      if (q) return perms.some((p) => (p.name + ' ' + p.code).toLowerCase().includes(q));
      return perms.some((p) => r.grants.includes(p.code) || r.blocks.includes(p.code));
    });
  }

  cell(r: IamRole, area: PermArea, action: PermAction): Cell {
    const perms = this.areaPerms(area).filter((p) => p.action === action);
    if (!perms.length) return 'na';
    if (perms.some((p) => r.blocks.includes(p.code))) return 'blocked';
    return perms.some((p) => r.grants.includes(p.code)) ? 'allowed' : 'none';
  }

  areaAllowed(r: IamRole, area: PermArea): number {
    return this.areaPerms(area).filter((p) => r.grants.includes(p.code)).length;
  }

  areaSensitive(r: IamRole, area: PermArea): number {
    return this.areaPerms(area).filter((p) => p.sensitive && r.grants.includes(p.code)).length;
  }

  /** compact list of granted actions for narrow screens */
  areaActions(r: IamRole, area: PermArea): string {
    return this.actions.filter((a) => this.cell(r, area, a) === 'allowed').map((a) => this.actionLabel(a)).join(' · ') || '—';
  }

  isAreaOpen(area: PermArea): boolean {
    return this.showNames() || !!this.permQuery().trim() || this.openAreas().has(area.key);
  }

  toggleArea(area: PermArea): void {
    const n = new Set(this.openAreas());
    if (n.has(area.key)) n.delete(area.key);
    else n.add(area.key);
    this.openAreas.set(n);
  }

  areaNames(r: IamRole, area: PermArea): Permission[] {
    const q = this.permQuery().trim().toLowerCase();
    return this.areaPerms(area).filter((p) =>
      q ? (p.name + ' ' + p.code).toLowerCase().includes(q) : r.grants.includes(p.code) || r.blocks.includes(p.code) || this.showNames());
  }

  // ---------------------------------------------------------------- inline permission editing
  startEdit(r: IamRole): void {
    this.editGrants.set(new Set(r.grants));
    this.editBlocks.set(new Set(r.blocks));
    this.editMode.set('allow');
    this.editQuery.set(this.permQuery());
    this.editReason.set('');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  editList(area: PermArea): Permission[] {
    const q = this.editQuery().trim().toLowerCase();
    return this.areaPerms(area).filter((p) => !q || (p.name + ' ' + p.code).toLowerCase().includes(q));
  }

  isTicked(p: Permission): boolean {
    return this.editMode() === 'allow' ? this.editGrants().has(p.code) : this.editBlocks().has(p.code);
  }

  isBlocked(p: Permission): boolean {
    return this.editBlocks().has(p.code);
  }

  tick(p: Permission): void {
    const key = this.editMode() === 'allow' ? this.editGrants : this.editBlocks;
    const other = this.editMode() === 'allow' ? this.editBlocks : this.editGrants;
    const n = new Set(key());
    if (n.has(p.code)) n.delete(p.code);
    else {
      n.add(p.code);
      // deny beats allow: a permission is either allowed or blocked
      const o = new Set(other());
      o.delete(p.code);
      other.set(o);
    }
    key.set(n);
  }

  areaState(area: PermArea): 'all' | 'some' | 'none' {
    const set = this.editMode() === 'allow' ? this.editGrants() : this.editBlocks();
    const perms = this.areaPerms(area);
    const n = perms.filter((p) => set.has(p.code)).length;
    return n === 0 ? 'none' : n === perms.length ? 'all' : 'some';
  }

  tickArea(area: PermArea): void {
    const all = this.areaState(area) === 'all';
    const key = this.editMode() === 'allow' ? this.editGrants : this.editBlocks;
    const other = this.editMode() === 'allow' ? this.editBlocks : this.editGrants;
    const n = new Set(key());
    const o = new Set(other());
    for (const p of this.areaPerms(area)) {
      if (all) n.delete(p.code);
      else { n.add(p.code); o.delete(p.code); }
    }
    key.set(n);
    other.set(o);
  }

  editDirty(r: IamRole): boolean {
    const g = this.editGrants();
    const b = this.editBlocks();
    return g.size !== r.grants.length || b.size !== r.blocks.length ||
      r.grants.some((c) => !g.has(c)) || r.blocks.some((c) => !b.has(c));
  }

  saveEdit(r: IamRole): void {
    if (!this.editDirty(r)) return;
    const grants = PERMISSIONS.filter((p) => this.editGrants().has(p.code)).map((p) => p.code);
    const blocks = PERMISSIONS.filter((p) => this.editBlocks().has(p.code)).map((p) => p.code);
    this.roles.update((list) => list.map((x) => (x.code === r.code
      ? { ...x, grants, blocks, all: x.all && grants.length === PERMISSIONS.length, lastChanged: 'Just now' } : x)));
    this.editing.set(false);
  }

  // ---------------------------------------------------------------- drawer (create / clone / edit)
  private emptyDraft(): RoleDraft {
    return { name: '', code: '', purpose: '', privileged: null, isDefault: null, priority: 100, owningFunction: '', grants: [], incompatible: [] };
  }

  openCreate(): void {
    this.panel.set(false);
    this.draft.set(this.emptyDraft());
    this.tried.set(false);
    this.drawer.set('create');
  }

  openClone(r: IamRole): void {
    this.panel.set(false);
    this.draft.set({
      name: 'Copy of ' + r.name, code: r.code + '-COPY', purpose: r.purpose, privileged: r.privileged, isDefault: false,
      priority: r.priority, owningFunction: r.owningFunction, grants: [...r.grants], incompatible: [...r.incompatible]
    });
    this.tried.set(false);
    this.drawer.set('clone');
  }

  openEdit(r: IamRole): void {
    this.panel.set(false);
    this.draft.set({
      name: r.name, code: r.code, purpose: r.purpose, privileged: r.privileged, isDefault: r.isDefault,
      priority: r.priority, owningFunction: r.owningFunction, grants: [...r.grants], incompatible: [...r.incompatible]
    });
    this.tried.set(false);
    this.drawer.set('edit');
  }

  closeDrawer(): void {
    this.drawer.set(null);
  }

  patch<K extends keyof RoleDraft>(key: K, value: RoleDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  setName(v: string): void {
    const autoCode = this.drawer() !== 'edit' && (!this.draft().code || this.draft().code === slugCode(this.draft().name));
    this.draft.update((d) => ({ ...d, name: v, code: autoCode ? slugCode(v) : d.code }));
  }

  bumpPriority(step: number): void {
    this.patch('priority', Math.min(999, Math.max(0, this.draft().priority + step)));
  }

  setPriority(v: string): void {
    const n = parseInt(v, 10);
    this.patch('priority', isNaN(n) ? 0 : Math.min(999, Math.max(0, n)));
  }

  readonly isBuiltInEdit = computed(() => this.drawer() === 'edit' && !!this.roles().find((r) => r.code === this.draft().code)?.builtIn);

  readonly permOptions: IamOption[] = PERMISSIONS.map((p) => ({
    value: p.code, label: p.name, hint: PERM_AREAS.find((a) => a.key === p.area)?.name + (p.sensitive ? ' · Sensitive' : '')
  }));

  readonly roleChoice = computed<IamOption[]>(() =>
    this.roles().filter((r) => r.code !== this.draft().code).map((r) => ({ value: r.code, label: r.name, hint: r.code, initials: initialsOf(r.name) })));

  readonly errors = computed(() => {
    const d = this.draft();
    const codeTaken = this.drawer() !== 'edit' && this.roles().some((r) => r.code === d.code.trim());
    return {
      name: d.name.trim().length < 3 ? 'Enter a role name (at least 3 characters).' : '',
      code: !/^[A-Z0-9_-]{3,}$/.test(d.code.trim()) ? 'Use capitals, digits, _ or - (at least 3).' : codeTaken ? 'This code is already used by another role.' : '',
      purpose: d.purpose.trim().length < 10 ? 'Describe the purpose in at least 10 characters.' : '',
      privileged: d.privileged === null ? 'Choose a privilege level.' : '',
      isDefault: d.isDefault === null ? 'Choose whether everybody gets this role.' : ''
    };
  });

  hasErrors(): boolean {
    return Object.values(this.errors()).some(Boolean);
  }

  saveDrawer(): void {
    this.tried.set(true);
    if (this.hasErrors()) return;
    const d = this.draft();
    if (this.drawer() === 'edit') {
      this.roles.update((list) => list.map((r) => (r.code === d.code ? {
        ...r, name: d.name.trim(), purpose: d.purpose.trim(), privileged: !!d.privileged, isDefault: !!d.isDefault,
        priority: d.priority, owningFunction: d.owningFunction.trim(), lastChanged: 'Just now'
      } : r)));
    } else {
      const role: IamRole = {
        code: d.code.trim(), name: d.name.trim(), purpose: d.purpose.trim(), status: 'draft', type: 'Organisation',
        owningFunction: d.owningFunction.trim(), privileged: !!d.privileged, builtIn: false, isDefault: !!d.isDefault,
        priority: d.priority, grants: [...d.grants], blocks: [], incompatible: [...d.incompatible], lastChanged: 'Just now'
      };
      this.roles.update((list) => [...list, role]);
      this.expanded.set(role.code);
      this.detailTab.set('permissions');
      this.tab.set('all');
    }
    this.drawer.set(null);
  }

  // ---------------------------------------------------------------- compare
  openCompare(): void {
    const r = this.current();
    if (r) this.expanded.set(r.code);
    this.compareWith.set('');
    this.compared.set(false);
    this.compareOpen.set(true);
  }

  closeCompare(): void {
    this.compareOpen.set(false);
  }

  readonly compareOptions = computed<IamOption[]>(() =>
    this.roles().filter((r) => r.code !== this.expanded()).map((r) => ({ value: r.code, label: r.name, hint: r.code, initials: initialsOf(r.name) })));

  /** pick the role to compare with and show the result straight away */
  pickCompare(code: string): void {
    this.compareWith.set(code);
    this.compared.set(!!code);
  }

  readonly other = computed(() => this.roles().find((r) => r.code === this.compareWith()) ?? null);

  readonly diff = computed(() => {
    const a = this.current();
    const b = this.other();
    if (!a || !b) return null;
    const both = PERMISSIONS.filter((p) => a.grants.includes(p.code) && b.grants.includes(p.code));
    const onlyA = PERMISSIONS.filter((p) => a.grants.includes(p.code) && !b.grants.includes(p.code));
    const onlyB = PERMISSIONS.filter((p) => !a.grants.includes(p.code) && b.grants.includes(p.code));
    return { both, onlyA, onlyB };
  });

  areaName(key: string): string {
    return PERM_AREAS.find((a) => a.key === key)?.name ?? key;
  }

  // ---------------------------------------------------------------- misc
  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.compareOpen()) this.compareOpen.set(false);
    else if (this.drawer()) this.drawer.set(null);
    else this.closePanel();
  }
}