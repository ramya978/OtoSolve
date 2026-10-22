import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ActionDef, ACTIONS, ActionKey, Permission } from '../../../Shared/Organization/permission-catalogue.data';
import { IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

const ROLES_PATH = '/app/administration/access/role-and-permission-catalogue';

/** icons for this page (24x24, currentColor) */
const ICONS: Record<string, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  empty: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3 M8 11h6',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3l2-2h2v-2h2l2.1-2.1A4 4 0 0 1 15 7z M16.5 8.5h.01',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  shield: 'M12 3l7.5 3v6c0 4.6-3.1 8.2-7.5 9.2C7.6 20.2 4.5 16.6 4.5 12V6L12 3z M9 12l2.2 2.2L15.2 10',
  pie: 'M12 3a9 9 0 1 0 9 9h-9V3z',
  layers: 'M12 3l9 4.5-9 4.5-9-4.5L12 3z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20 M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M22 20v-1.5a4 4 0 0 0-3-3.87 M16 3.63a4 4 0 0 1 0 7.75'
};

/** Permission catalogue: page header, stat tiles, filter toolbar, table, pagination. */
@Component({
  selector: 'app-permission-catalogue',
  templateUrl: './permission-catalogue.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './permission-catalogue.css']
})
export class PermissionCatalogue implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(IamAdminApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  private readonly catalogue = signal<Permission[]>([]);
  get all(): Permission[] { return this.catalogue(); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.getPermissionMatrix().subscribe({
      next: (matrix) => {
        const rows: Permission[] = (matrix.modules ?? []).flatMap((m) => (m.groups ?? []).flatMap((g) =>
          (g.permissions ?? []).map((p) => ({
            code: p.code ?? '',
            name: p.name ?? '',
            group: g.groupName || g.groupCode || '',
            module: m.moduleName || m.moduleCode || '',
            action: (p.action ?? 'view') as ActionKey,
            sensitive: p.isSensitive === true,
          }))));
        this.catalogue.set(rows);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.toast.error('Catalogue not loaded', apiErrorMessage(e, 'The permission catalogue could not be loaded.'));
      },
    });
  }
  readonly actions: ActionDef[] = ACTIONS;
  readonly pageSizes = [10, 25, 50];

  /* filters */
  readonly module = signal<string>('');
  readonly group = signal<string>('');
  readonly action = signal<ActionKey | ''>('');
  readonly sensitiveOnly = signal(false);
  readonly query = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly copied = signal<string>('');

  /* stats */
  get total(): number { return this.all.length; }
  get sensitiveTotal(): number { return this.all.filter((p) => p.sensitive).length; }
  get sensitivePct(): number { return this.total ? Math.round((this.sensitiveTotal / this.total) * 100) : 0; }
  readonly moduleList = computed(() => {
    const map = new Map<string, number>();
    for (const p of this.all) map.set(p.module, (map.get(p.module) ?? 0) + 1);
    return [...map].map(([name, count]) => ({ name, count }));
  });

  /** module breakdown for the distribution widget (sensitive share per module) */
  readonly moduleStats = computed(() => {
    const map = new Map<string, { count: number; sensitive: number }>();
    for (const p of this.all) {
      const e = map.get(p.module) ?? { count: 0, sensitive: 0 };
      e.count++;
      if (p.sensitive) e.sensitive++;
      map.set(p.module, e);
    }
    const max = Math.max(1, ...[...map.values()].map((v) => v.count));
    return [...map]
      .map(([name, v]) => ({
        name,
        count: v.count,
        sensitive: v.sensitive,
        pct: Math.round((v.count / this.total) * 100),
        bar: Math.round((v.count / max) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  });

  /** permission groups (sub-grouping inside a module) for the groups widget */
  readonly groupList = computed(() => {
    const map = new Map<string, number>();
    for (const p of this.all) map.set(p.group, (map.get(p.group) ?? 0) + 1);
    const max = Math.max(1, ...[...map.values()]);
    return [...map]
      .map(([name, count]) => ({ name, count, bar: Math.round((count / max) * 100) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  /** action mix for the donut widget — share of all permissions per action */
  readonly actionMix = computed(() => {
    const counts = new Map<ActionKey, number>();
    for (const p of this.all) counts.set(p.action, (counts.get(p.action) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    return this.actions
      .map((a) => {
        const count = counts.get(a.key) ?? 0;
        return {
          key: a.key,
          label: a.label,
          tone: a.tone,
          count,
          pct: this.total ? Math.round((count / this.total) * 100) : 0,
          bar: Math.round((count / max) * 100),
        };
      })
      .sort((a, b) => b.count - a.count);
  });

  /** degrees of the donut, one per action */
  readonly actionSlices = computed(() => {
    const total = this.actionMix().reduce((s, a) => s + a.count, 0) || 1;
    let acc = 0;
    return this.actionMix().map((a) => {
      const from = acc;
      acc += (a.count / total) * 360;
      return { key: a.key, tone: a.tone, from, to: acc };
    });
  });

  /** largest group in the catalogue — used by the "top group" widget */
  readonly topGroup = computed(() => {
    const g = this.groupList()[0];
    if (!g) return null;
    const modules = new Set(this.all.filter((p) => p.group === g.name).map((p) => p.module));
    return { ...g, modules: modules.size };
  });

  /* rows after module + group + sensitive + search filters (action chips count from this) */
  private readonly base = computed(() => {
    const m = this.module(), g = this.group(), s = this.sensitiveOnly(), q = this.query().trim().toLowerCase();
    return this.all.filter((p) =>
      (!m || p.module === m) &&
      (!g || p.group === g) &&
      (!s || p.sensitive) &&
      (!q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q)));
  });

  readonly rows = computed(() => {
    const a = this.action();
    return a ? this.base().filter((p) => p.action === a) : this.base();
  });

  readonly hasFilters = computed(() => !!(this.module() || this.group() || this.action() || this.sensitiveOnly() || this.query().trim()));

  readonly pages = computed(() => Math.max(1, Math.ceil(this.rows().length / this.pageSize())));
  readonly pageRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
  });
  readonly from = computed(() => (this.rows().length ? (this.page() - 1) * this.pageSize() + 1 : 0));
  readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.rows().length));

  /** page numbers with gaps, e.g. [1, 2, '…', 26] */
  readonly pageList = computed<(number | '…')[]>(() => {
    const t = this.pages(), c = this.page();
    const keep = new Set([1, 2, t, c - 1, c, c + 1].filter((n) => n >= 1 && n <= t));
    const sorted = [...keep].sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    sorted.forEach((n, i) => {
      if (i && n - sorted[i - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  });

  /* helpers */
  actionCount(key: ActionKey): number { return this.base().filter((p) => p.action === key).length; }
  baseCount(): number { return this.base().length; }
  actionOf(key: ActionKey): ActionDef { return this.actions.find((a) => a.key === key)!; }
  icon(name: string): string { return ICONS[name] ?? ''; }

  /** dash pattern for one donut slice — the ring's circumference is 100 user units */
  dash(from: number, to: number): string {
    const len = ((to - from) / 360) * 100;
    return `${len} ${100 - len}`;
  }
  /** where the slice starts, negated so it starts at 12 o'clock */
  dashOffset(from: number): number { return -(from / 360) * 100; }

  /** permissions that are not sensitive */
  get standardTotal(): number { return this.total - this.sensitiveTotal; }

  /* actions */
  pickModule(name: string): void { this.module.set(name); this.page.set(1); }
  onModule(e: Event): void { this.pickModule((e.target as HTMLSelectElement).value); }

  /** click a module row in the distribution widget → filter by it */
  pickModuleFromWidget(name: string): void { this.pickModule(this.module() === name ? '' : name); }

  /** click a group row in the groups widget → filter by it */
  pickGroup(name: string): void { this.group.set(this.group() === name ? '' : name); this.page.set(1); }
  onGroup(e: Event): void { this.pickGroup((e.target as HTMLSelectElement).value); }

  pickAction(key: ActionKey | ''): void { this.action.set(key); this.page.set(1); }
  toggleSensitive(): void { this.sensitiveOnly.update((v) => !v); this.page.set(1); }
  onSearch(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.page.set(1); }
  onPageSize(e: Event): void { this.pageSize.set(+(e.target as HTMLSelectElement).value); this.page.set(1); }
  go(n: number | '…'): void { if (typeof n === 'number' && n >= 1 && n <= this.pages()) this.page.set(n); }

  clearFilters(): void {
    this.module.set('');
    this.group.set('');
    this.action.set('');
    this.sensitiveOnly.set(false);
    this.query.set('');
    this.page.set(1);
  }

  openRoles(): void { this.router.navigate([ROLES_PATH]); }

  async copy(code: string): Promise<void> {
    try { await navigator.clipboard.writeText(code); } catch { /* clipboard blocked: ignore */ }
    this.copied.set(code);
    setTimeout(() => { if (this.copied() === code) this.copied.set(''); }, 1400);
  }
}