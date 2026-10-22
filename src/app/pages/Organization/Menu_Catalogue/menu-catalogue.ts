import { Component, HostListener, computed, signal } from '@angular/core';

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

/** sample tree — replace buildItems() with your menu store / API when it is ready */
type Node = string | { label: string; children?: Node[] };
interface Top { label: string; module: string; route?: string; off?: boolean; children?: Node[]; }

const TREE: Top[] = [
  { label: 'Dashboard', module: 'WSP', route: '/app/dashboard' },
  { label: 'Platform', module: 'PLT', children: [
    { label: 'Organisations', children: ['All Organisations', 'Add Organisation'] },
    'Business Unit', 'Permission Catalogue', 'Menu Catalogue', 'Platform Audit'] },
  { label: 'Donors & Leads', module: 'DNR', children: ['Lead Work Queue', 'My Leads', 'All Donors', 'My Donors', 'Follow-ups'] },
  { label: 'Campaigns', module: 'CAM', children: ['All Campaigns', 'Tracking Asset Manager'] },
  { label: 'Donations', module: 'DON', children: ['New Donation', 'Payments & Receipts'] },
  { label: 'Communications', module: 'COM', children: ['WhatsApp Messages', 'Number Verification', 'Unified Inbox', 'Template Catalogue', 'Outbound Composer'] },
  { label: 'Organisation', module: 'ORG', children: ['Profile', 'Departments', 'Branches & Units', 'Settings'] },
  { label: 'Users & Access', module: 'IAM', children: ['Users', 'Roles & Permissions', 'Menu Configuration', 'Access Requests', 'Audit Trail'] },
  { label: 'Master Data', module: 'MST', children: ['Countries', 'States', 'Cities', 'Currencies', 'Time Zones'] },
  { label: 'Workspace', module: 'WSP', children: ['My Workspace', 'Executive Dashboard', 'Global Search', 'Notification Centre'] },
  { label: 'Finance', module: 'FIN', children: ['Finance Workbench', 'Reconciliation', 'Offline Donation Entry'] },
  { label: 'Supply', module: 'INV', off: true, children: ['Inventory Overview', 'Batch Ledger', 'Stock Movement'] }
];

const SUPPLY_ROUTES: Record<string, string> = {
  'Inventory Overview': '/app/supply/inventory/inventory-overview',
  'Batch Ledger': '/app/supply/inventory/batch-ledger',
  'Stock Movement': '/app/supply/inventory/stock-movement-form'
};

const slug = (s: string): string => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const codeOf = (s: string): string => slug(s).toUpperCase().replace(/-/g, '_');

function blankItem(over: Partial<MenuItem> & Pick<MenuItem, 'id' | 'label' | 'level' | 'module'>): MenuItem {
  return {
    code: codeOf(over.label), description: '', route: null, permission: null, icon: '', badgeKey: '', position: 0,
    defaultOn: true, newTab: false, platformOnly: false, required: false, retired: false, parentId: null, ...over
  };
}

function buildItems(): MenuItem[] {
  const out: MenuItem[] = [];
  const walk = (nodes: Node[], top: Top, parent: MenuItem, base: string): void => {
    nodes.forEach((n, i) => {
      const label = typeof n === 'string' ? n : n.label;
      const kids = typeof n === 'string' ? undefined : n.children;
      const item = blankItem({
        id: `${parent.id}.${slug(label)}`, label, module: top.module, parentId: parent.id,
        level: kids ? 'submenu' : 'item',
        route: kids ? null : (top.label === 'Supply' ? SUPPLY_ROUTES[label] : undefined) ?? `${base}/${slug(label)}`,
        position: (i + 1) * 10, defaultOn: !top.off
      });
      out.push(item);
      if (kids) walk(kids, top, item, `${base}/${slug(label)}`);
    });
  };

  TREE.forEach((t, i) => {
    const head = blankItem({ id: slug(t.label), label: t.label, module: t.module, level: 'menu', route: t.route ?? null, position: i * 10, defaultOn: !t.off });
    out.push(head);
    if (t.children) walk(t.children, t, head, `/app/${slug(t.label)}`);
  });
  return out;
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
export class MenuCatalogue {
  readonly items = signal<MenuItem[]>(buildItems());

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
    return e;
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
    const ids = new Set(this.descendants(id));
    this.items.update((list) => list.map((i) => (ids.has(i.id) ? { ...i, retired } : i)));
  }

  /** delete an item together with everything below it */
  remove(id: string): void {
    const item = this.items().find((i) => i.id === id);
    if (!item || !this.canChange(item)) return;
    if (!confirm(`Delete "${item.label}" and everything inside it? This changes the menu for every organisation.`)) return;
    const ids = new Set(this.descendants(id));
    this.items.update((list) => list.filter((i) => !ids.has(i.id)));
    this.close();
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

  closeForm(): void { this.formMode.set(null); this.editingId = null; }

  set<K extends keyof MenuForm>(key: K, value: MenuForm[K]): void { this.form.update((f) => ({ ...f, [key]: value })); }

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
    const fields = {
      label: f.name.trim(), description: f.description.trim(), module: f.module.trim().toUpperCase(),
      route: f.route.trim() || null, permission: f.permission.trim() || null, icon: f.icon.trim(), badgeKey: f.badgeKey.trim(),
      position: f.position, defaultOn: f.defaultOn, newTab: f.newTab, platformOnly: f.platformOnly, required: f.required
    };

    if (this.editingId) {
      const id = this.editingId;
      this.items.update((list) => list.map((i) => (i.id === id ? { ...i, ...fields } : i)));
      this.selectedId.set(id);
    } else {
      const code = f.code.trim().toUpperCase();
      const parent = f.parentId || null;
      const id = `${parent ? parent + '.' : ''}${slug(code)}`;
      this.items.update((list) => [...list, blankItem({ id, code, level: f.level as Level, parentId: parent, ...fields })]);
      this.selectedId.set(id);
    }
    this.closeForm();
  }

  private descendants(id: string): string[] {
    const kids = this.items().filter((i) => i.parentId === id).map((i) => i.id);
    return [id, ...kids.flatMap((k) => this.descendants(k))];
  }
}