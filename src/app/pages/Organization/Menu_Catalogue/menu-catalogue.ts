import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { concat, forkJoin, last } from 'rxjs';
import { IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage, apiFieldErrors } from '../../../Shared/models/api-response.model';
import { MenuDefinitionResponse, MenuLevel } from '../../../Shared/models/iam-contract.model';

type Level = 'menu' | 'submenu' | 'item';
const LEVEL_LABEL: Record<Level, string> = { menu: 'Menu', submenu: 'Sub-menu', item: 'Item' };

/** one entry of the product menu — top-level menus, sub-menus and leaf pages share this shape */
interface MenuItem {
  id: string;
  label: string;
  code: string;
  level: Level;
  description: string;
  module: string;
  route: string | null;
  permission: string | null;
  icon: string;
  badgeKey: string;
  position: number;
  defaultOn: boolean;
  newTab: boolean;
  platformOnly: boolean;
  required: boolean;
  retired: boolean;
  parentId: string | null;
  version: number;
}

interface Row { item: MenuItem; depth: number; }
interface Group { head: MenuItem; rows: Row[]; live: number; }

/** everything the create / edit form edits */
interface MenuForm {
  name: string; code: string; description: string;
  level: Level | ''; parentId: string; module: string; route: string;
  permission: string; icon: string; position: number; badgeKey: string;
  defaultOn: boolean; newTab: boolean; platformOnly: boolean; required: boolean;
}

const slug = (s: string): string => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const LEVEL_FROM_API: Record<string, Level> = { menu: 'menu', subMenu: 'submenu', childSubMenu: 'item' };
const LEVEL_TO_API: Record<Level, MenuLevel> = { menu: 'menu', submenu: 'subMenu', item: 'childSubMenu' };

/** Flattens the server's menu tree into the rows the page draws. */
function flatten(nodes: MenuDefinitionResponse[], parentId: string | null = null): MenuItem[] {
  return nodes.flatMap((n) => {
    const id = n.id ?? '';
    const item: MenuItem = {
      id, label: n.name ?? '', code: n.code ?? '', level: LEVEL_FROM_API[n.level ?? 'menu'] ?? 'item', description: n.description ?? '',
      module: n.moduleCode ?? '', route: n.route ?? null, permission: n.requiredPermissionCode ?? null, icon: n.icon ?? '',
      badgeKey: n.badgeKey ?? '', position: n.displayOrder ?? 0, defaultOn: n.isEnabledByDefault !== false, newTab: n.opensInNewTab === true,
      platformOnly: n.isPlatformOnly === true, required: n.isMandatory === true, retired: n.status === 'retired',
      parentId: n.parentMenuId ?? parentId, version: n.version ?? 0
    };
    return [item, ...flatten(n.children ?? [], id)];
  });
}

const blankForm = (): MenuForm => ({
  name: '', code: '', description: '', level: '', parentId: '', module: '', route: '',
  permission: '', icon: '', position: 0, badgeKey: '',
  defaultOn: true, newTab: false, platformOnly: false, required: false
});

const ICONS: Record<string, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  layers: 'M12 3l9 4.5-9 4.5-9-4.5L12 3z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  menuadd: 'M4 6h13M4 12h8M4 18h8 M18 14v7 M14.5 17.5h7',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  pause: 'M8 5v14M16 5v14',
  restore: 'M4 12a8 8 0 1 0 3-6.2 M4 4v5h5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 7.5h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  down: 'M6 9l6 6 6-6',
  file: 'M7 3h7l5 5v13H7z M14 3v5h5',
  sub: 'M5 5v8a3 3 0 0 0 3 3h9 M14 12l3 4-3 4'
};

/** Menu catalogue: the product's own menu, shared by every organisation. */
@Component({
  selector: 'app-menu-catalogue',
  templateUrl: './menu-catalogue.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './menu-catalogue.css']
})
export class MenuCatalogue implements OnInit {
  private readonly api = inject(IamAdminApiService);
  private readonly toast = inject(ToastService);
  readonly items = signal<MenuItem[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  private readonly serverErrors = signal<Record<string, string>>({});

  ngOnInit(): void { this.reload(); }

  /** Reads the whole catalogue (retired entries included, the page filters them). */
  reload(done?: () => void): void {
    this.loading.set(true);
    this.api.getMenuDefinitions(true).subscribe({
      next: (tree) => { this.items.set(flatten(tree)); this.loading.set(false); done?.(); },
      error: (e: unknown) => {
        this.loading.set(false);
        this.toast.error('Menu not loaded', apiErrorMessage(e, 'The menu catalogue could not be loaded.'));
      }
    });
  }

  private fail(title: string, e: unknown, fallback: string): void {
    this.saving.set(false);
    this.toast.error(title, apiErrorMessage(e, fallback));
  }

  /* filters + selection */
  readonly query = signal('');
  readonly module = signal('');
  readonly showRetired = signal(false);
  readonly selectedId = signal<string | null>(null);

  /* stats */
  readonly total = computed(() => this.items().length);
  readonly live = computed(() => this.items().filter((i) => !i.retired).length);
  readonly modules = computed(() => [...new Set(this.items().map((i) => i.module))].sort());
  readonly moduleCounts = computed(() =>
    this.modules().map((code) => ({ code, count: this.items().filter((i) => i.module === code).length })));

  /** top-level menus with every item below them (depth 1 = direct child, 2 = sub-menu item) */
  readonly groups = computed<Group[]>(() => {
    const all = this.items();
    const q = this.query().trim().toLowerCase();
    const mod = this.module();
    const retired = this.showRetired();
    const match = (i: MenuItem) => !q || [i.label, i.code, i.route ?? '', i.permission ?? ''].some((v) => v.toLowerCase().includes(q));

    const rowsOf = (parentId: string, depth: number): Row[] =>
      all.filter((c) => c.parentId === parentId).flatMap((c) => [{ item: c, depth }, ...rowsOf(c.id, depth + 1)]);

    return all
      .filter((h) => !h.parentId && (!mod || h.module === mod) && (retired || !h.retired))
      .map((head) => {
        const every = rowsOf(head.id, 1).filter((r) => retired || !r.item.retired);
        const rows = match(head) ? every : every.filter((r) => match(r.item));
        return { head, rows, live: every.filter((r) => !r.item.retired).length } as Group;
      })
      .filter((g) => !q || match(g.head) || g.rows.length > 0);
  });

  readonly shownItems = computed(() => this.groups().reduce((n, g) => n + 1 + g.rows.length, 0));
  readonly hasFilters = computed(() => !!(this.query().trim() || this.module() || this.showRetired()));

  /* detail dock */
  readonly selected = computed(() => this.items().find((i) => i.id === this.selectedId()) ?? null);
  readonly selectedLevel = computed(() => { const s = this.selected(); return s ? LEVEL_LABEL[s.level] : ''; });
  readonly selectedParent = computed(() => {
    const s = this.selected();
    return s?.parentId ? this.items().find((i) => i.id === s.parentId) ?? null : null;
  });

  /* ---------- create / edit offcanvas ---------- */
  readonly levels: { key: Level; label: string }[] = [
    { key: 'menu', label: 'Menu — top level' },
    { key: 'submenu', label: 'Sub-menu — inside a menu' },
    { key: 'item', label: 'Item — a page' }
  ];

  readonly formMode = signal<'create' | 'edit' | null>(null);
  readonly form = signal<MenuForm>(blankForm());
  readonly submitted = signal(false);
  private editingId: string | null = null;

  /** what the "Sits under" list offers, depending on the chosen level */
  readonly parentOptions = computed(() => {
    const level = this.form().level;
    if (!level || level === 'menu') return [];
    const all = this.items();
    const label = (i: MenuItem) => (i.parentId ? `${all.find((p) => p.id === i.parentId)?.label} › ${i.label}` : i.label);
    return all
      .filter((i) => !i.retired && i.id !== this.editingId && (level === 'submenu' ? i.level === 'menu' : i.level !== 'item'))
      .map((i) => ({ id: i.id, label: label(i) }));
  });

  readonly errors = computed(() => {
    const f = this.form();
    const code = f.code.trim().toUpperCase();
    const clash = this.items().some((i) => i.code === code && i.id !== this.editingId);
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Give it a name.';
    if (!code) e['code'] = 'Add a code.';
    else if (!/^[A-Z0-9_-]+$/.test(code)) e['code'] = 'Use upper case letters, digits, underscores or hyphens.';
    else if (clash) e['code'] = 'This code is already used.';
    if (!f.level) e['level'] = 'Select a level.';
    else if (f.level !== 'menu' && !f.parentId) e['parentId'] = 'Select the menu it sits under.';
    if (!f.module.trim()) e['module'] = 'Add a module.';
    if (f.route.trim() && !f.route.trim().startsWith('/')) e['route'] = 'A route starts with /.';
    return { ...e, ...this.serverErrors() };
  });
  readonly firstError = computed(() => Object.values(this.errors())[0] ?? '');
  readonly canSave = computed(() => Object.keys(this.errors()).length === 0);

  icon(name: string): string { return ICONS[name] ?? ''; }

  onSearch(e: Event): void { this.query.set((e.target as HTMLInputElement).value); }
  onModule(e: Event): void { this.module.set((e.target as HTMLSelectElement).value); }
  toggleRetired(): void { this.showRetired.update((v) => !v); }
  clearFilters(): void { this.query.set(''); this.module.set(''); this.showRetired.set(false); }

  /** click an item: open its details, click again to close */
  toggle(id: string): void { this.selectedId.update((cur) => (cur === id ? null : id)); }

  /** Esc / X: closes the form first, then the detail dock */
  @HostListener('document:keydown.escape')
  close(): void {
    if (this.formMode()) { this.closeForm(); return; }
    this.selectedId.set(null);
  }

  /** required items can not be retired or deleted */
  canChange(item: MenuItem): boolean { return !item.required; }

  /** retire / restore an item together with everything below it */
  setRetired(id: string, retired: boolean): void {
    const item = this.items().find((i) => i.id === id);
    if (!item || (retired && !this.canChange(item))) return;
    const rows = this.descendants(id).map((x) => this.items().find((i) => i.id === x)).filter((i): i is MenuItem => !!i && i.retired !== retired);
    if (!rows.length || this.saving()) return;
    this.saving.set(true);
    forkJoin(rows.map((r) => this.api.updateMenuDefinition(r.id, { expectedVersion: r.version, status: retired ? 'retired' : 'active' }))).subscribe({
      next: () => { this.saving.set(false); this.reload(); this.toast.success(retired ? 'Retired' : 'Restored', item.label); },
      error: (e: unknown) => { this.fail(retired ? 'Not retired' : 'Not restored', e, 'The menu entry could not be changed.'); this.reload(); }
    });
  }

  /** delete an item together with everything below it */
  remove(id: string): void {
    const item = this.items().find((i) => i.id === id);
    if (!item || !this.canChange(item)) return;
    if (!confirm(`Delete "${item.label}" and everything inside it? This changes the menu for every organisation.`)) return;
    if (this.saving()) return;
    // children first, so nothing is deleted while something still depends on it
    const rows = this.descendants(id).reverse().map((x) => this.items().find((i) => i.id === x)).filter((i): i is MenuItem => !!i);
    this.saving.set(true);
    concat(...rows.map((r) => this.api.deleteMenuDefinition(r.id, r.version))).pipe(last()).subscribe({
      next: () => { this.saving.set(false); this.close(); this.reload(); this.toast.success('Deleted', item.label); },
      error: (e: unknown) => { this.fail('Not deleted', e, 'The menu entry could not be deleted. Retire it instead if it is in use.'); this.reload(); }
    });
  }

  /* ---------- form actions ---------- */
  /** Create button; "Add inside" passes the parent so the form opens pre-filled */
  create(parentId: string | null = null): void {
    const parent = parentId ? this.items().find((i) => i.id === parentId) ?? null : null;
    this.editingId = null;
    this.submitted.set(false);
    this.form.set({
      ...blankForm(),
      ...(parent ? { level: 'item' as Level, parentId: parent.id, module: parent.module } : {})
    });
    this.formMode.set('create');
  }

  edit(id: string): void {
    const i = this.items().find((x) => x.id === id);
    if (!i) return;
    this.editingId = id;
    this.submitted.set(false);
    this.form.set({
      name: i.label, code: i.code, description: i.description, level: i.level, parentId: i.parentId ?? '', module: i.module,
      route: i.route ?? '', permission: i.permission ?? '', icon: i.icon, position: i.position, badgeKey: i.badgeKey,
      defaultOn: i.defaultOn, newTab: i.newTab, platformOnly: i.platformOnly, required: i.required
    });
    this.formMode.set('edit');
  }

  closeForm(): void { this.formMode.set(null); this.editingId = null; this.serverErrors.set({}); }

  set<K extends keyof MenuForm>(key: K, value: MenuForm[K]): void { this.serverErrors.set({}); this.form.update((f) => ({ ...f, [key]: value })); }

  setLevel(level: Level | ''): void {
    this.form.update((f) => ({ ...f, level, parentId: '' }));
  }

  setPosition(raw: string): void {
    const n = Number(raw);
    this.set('position', Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  }

  save(): void {
    this.submitted.set(true);
    if (!this.canSave()) {
      setTimeout(() => document.querySelector<HTMLElement>('.mc-oc .mc-input.bad')?.focus());
      return;
    }
    const f = this.form();
    if (this.saving()) return;
    this.saving.set(true);
    this.serverErrors.set({});
    const onError = (e: unknown) => {
      const fields = apiFieldErrors(e);
      const map: Record<string, string> = {};
      const keys: Record<string, string> = { name: 'name', code: 'code', route: 'route', moduleCode: 'module', parentMenuId: 'parentId', level: 'level' };
      for (const [k, v] of Object.entries(fields)) { const t = keys[k.charAt(0).toLowerCase() + k.slice(1)]; if (t) map[t] = v; }
      this.serverErrors.set(map);
      this.fail('Menu entry not saved', e, 'The menu entry could not be saved.');
    };

    if (this.editingId) {
      const id = this.editingId;
      const cur = this.items().find((i) => i.id === id);
      this.api.updateMenuDefinition(id, {
        expectedVersion: cur?.version, name: f.name.trim(), description: f.description.trim() || null, route: f.route.trim() || null,
        icon: f.icon.trim() || null, requiredPermissionCode: f.permission.trim() || null, displayOrder: f.position,
        isEnabledByDefault: f.defaultOn, opensInNewTab: f.newTab, badgeKey: f.badgeKey.trim() || null
      }).subscribe({
        next: () => { this.saving.set(false); this.selectedId.set(id); this.closeForm(); this.reload(); this.toast.success('Saved', f.name.trim()); },
        error: onError
      });
    } else {
      this.api.createMenuDefinition({
        code: f.code.trim().toUpperCase(), name: f.name.trim(), level: LEVEL_TO_API[f.level as Level], moduleCode: f.module.trim().toUpperCase(),
        parentMenuId: f.parentId || null, route: f.route.trim() || null, icon: f.icon.trim() || null,
        requiredPermissionCode: f.permission.trim() || null, description: f.description.trim() || null, displayOrder: f.position,
        isPlatformOnly: f.platformOnly, isEnabledByDefault: f.defaultOn, isMandatory: f.required, opensInNewTab: f.newTab,
        badgeKey: f.badgeKey.trim() || null
      }).subscribe({
        next: (created) => { this.saving.set(false); this.selectedId.set(created.id ?? null); this.closeForm(); this.reload(); this.toast.success('Created', f.name.trim()); },
        error: onError
      });
    }
  }

  private descendants(id: string): string[] {
    const kids = this.items().filter((i) => i.parentId === id).map((i) => i.id);
    return [id, ...kids.flatMap((k) => this.descendants(k))];
  }
}