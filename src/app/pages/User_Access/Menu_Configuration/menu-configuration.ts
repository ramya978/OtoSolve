import { Component, HostListener, computed, signal } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  IamOption, MENUS, MENU_MODULES, MenuGroup, MenuItem, ORG_NAME, PERMISSIONS, PERM_AREAS, ROLES, initialsOf, slugCode
} from '../../../Shared/IAM/iam-data';

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

/** permission prefix → permission area (for the role-visibility preview) */
const PREFIX_AREA: Record<string, string> = Object.fromEntries(PERM_AREAS.map((a) => [a.prefix, a.key]));

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
export class MenuConfiguration {
  /** saved baseline (what is published) */
  private readonly base = signal<MenuGroup[]>(clone(MENUS));
  private get original(): MenuGroup[] {
    return this.base();
  }
  readonly menus = signal<MenuGroup[]>(clone(MENUS));
  readonly orgName = ORG_NAME;

  readonly scope = signal<Scope>('org');
  readonly viewRole = signal('CAMPAIGN_MANAGER');
  readonly query = signal('');
  readonly selected = signal('DONORS_LEADS');
  /** expanded menu groups in the worksheet */
  readonly openGroups = signal<Set<string>>(new Set(['DONORS_LEADS']));
  readonly saved = signal(true);
  readonly added = signal<string[]>([]);

  readonly drawer = signal(false);
  readonly draft = signal<MenuDraft>(this.blank(''));
  readonly tried = signal(false);

  readonly roleOptions: IamOption[] = ROLES.map((r) => ({ value: r.code, label: r.name, hint: r.code, initials: initialsOf(r.name) }));
  readonly moduleOptions: IamOption[] = MENU_MODULES.map((m) => ({ value: m, label: m, icon: 'layers' }));
  readonly iconOptions: IamOption[] = [
    { value: '', label: 'No icon', icon: 'image' },
    ...['grid', 'heart', 'flag', 'coin', 'chat', 'home', 'people', 'database', 'layout', 'wallet', 'box', 'doc', 'calendar', 'shield', 'key', 'star']
      .map((i) => ({ value: i, label: i.charAt(0).toUpperCase() + i.slice(1), icon: i }))
  ];
  readonly permissionOptions: IamOption[] = [
    { value: '', label: 'No permission — everyone given the item sees it', icon: 'key' },
    ...PERMISSIONS.map((p) => ({ value: p.code, label: p.code, hint: p.name, icon: 'key' }))
  ];
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
  readonly group = computed(() => this.menus().find((m) => m.code === this.selected()) ?? this.menus()[0]);
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
    const role = ROLES.find((r) => r.code === this.viewRole());
    if (!role) return false;
    if (role.all || !item.permission) return true;
    const area = PREFIX_AREA[item.permission.split('.')[0].toLowerCase()];
    if (!area) return false;
    return PERMISSIONS.some((p) => p.area === area && role.grants.includes(p.code));
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
    this.base.set(clone(this.menus()));
    this.saved.set(true);
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
    const pos = (d.position ?? 0) - 1;

    if (!d.parent) {
      // top-level menu
      this.change((list) => {
        if (d.editing) {
          const out = list.map((g) => (g.code === d.editing ? { ...g, name: d.name.trim(), module: d.module, permission: d.permission, icon: d.icon || g.icon } : g));
          const from = out.findIndex((g) => g.code === d.editing);
          if (pos >= 0 && pos !== from) out.splice(Math.min(pos, out.length - 1), 0, out.splice(from, 1)[0]);
          return out;
        }
        const g: MenuGroup = { code: d.code, name: d.name.trim(), icon: d.icon || 'grid', permission: d.permission, inUse: true, module: d.module, items: [] };
        if (pos >= 0) list.splice(pos, 0, g);
        else list.push(g);
        return list;
      });
      if (!d.editing) {
        this.added.update((a) => [...a, d.code]);
        this.selected.set(d.code);
      }
    } else {
      // item inside a menu
      this.change((list) => list.map((g) => {
        if (g.code !== d.parent) return g;
        const items = [...g.items];
        if (d.editing) {
          const from = items.findIndex((i) => i.code === d.editing);
          items[from] = { ...items[from], name: d.name.trim(), route: d.route.trim(), permission: d.permission };
          if (pos >= 0 && pos !== from) items.splice(Math.min(pos, items.length - 1), 0, items.splice(from, 1)[0]);
        } else {
          const item: MenuItem = { code: d.code, name: d.name.trim(), route: d.route.trim(), permission: d.permission, inUse: true };
          if (pos >= 0) items.splice(pos, 0, item);
          else items.push(item);
        }
        return { ...g, items };
      }));
      if (!d.editing) this.added.update((a) => [...a, d.code]);
    }
    this.drawer.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.drawer.set(false);
  }
}
