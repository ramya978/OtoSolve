import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MENU_ICONS, MENU_ICON_FALLBACK } from '../menu-icons';
import { ATTENDANCE_MENUS, MENU_DATA, MenuItem } from '../menu.data';
import { NavigationService } from '../../services/navigation.service';
import { ThemeSettingsService } from '../../../pages/Auth/Profile/theme-settings';

/** Width of a horizontal-menu dropdown (keeps it inside the screen). */
const DROP_W = 260;

const MENU_TONES: Record<string, string> = {
  DASHBOARD: 'green',
  PLATFORM: 'slate',
  FR_DONORS: 'teal',
  FR_LEADS: 'olive',
  FR_CAMPAIGNS: 'green',
  MN_DONATIONS: 'blue',
  COMMUNICATIONS: 'amber',
  ORGANISATION: 'olive',
  ADMINISTRATION: 'teal',
  MASTERS: 'sea'
};
const TONE_CYCLE = ['teal', 'green', 'blue', 'amber', 'olive', 'sea', 'slate'];

const MENU_SECTIONS: Record<string, string> = {
  DASHBOARD: 'Workspace',
  // Attendance's groups, which withAttendance() places straight after the Dashboard
  ATTENDANCE: 'Workspace',
  ATT_LEAVE: 'Workspace',
  ATT_SHIFTS: 'Workspace',
  ATT_REPORTS: 'Workspace',
  ATT_SELF: 'Workspace',
  SALES_RELATIONSHIPS: 'Sales & Relationships',
  PLATFORM: 'Platform',
  FR_DONORS: 'Fundraising',
  FR_LEADS: 'Fundraising',
  FR_CAMPAIGNS: 'Fundraising',
  MN_DONATIONS: 'Fundraising',
  COMMUNICATIONS: 'Fundraising',
  ORGANISATION: 'Administration',
  ADMINISTRATION: 'Administration',
  MASTERS: 'Administration'
};

export interface MenuSection {
  label: string;
  items: MenuItem[];
}

/** Attendance is in this build: its pages are registered (app.routes.ts) and its menus are shown. */
const ATTENDANCE_ON = environment.features.attendance;

/**
 * The built-in catalogue, shown only when the server's menu cannot be fetched - without the
 * Attendance groups when the module is not in this build, because their links would lead nowhere.
 */
const BUILT_IN_MENU: MenuItem[] = ATTENDANCE_ON ? MENU_DATA : MENU_DATA.filter((item) => !ATTENDANCE_MENUS.includes(item));

/**
 * The server's tree with Attendance's groups added straight after the Dashboard.
 *
 * WHY THE SIDEBAR ADDS THEM. The server's menu catalogue has no Attendance entry (see
 * ATTENDANCE_MENUS), so a sidebar drawn only from /navigation showed no Attendance at all, and one
 * drawn only from MENU_DATA showed every menu to everybody whatever the server decided. These five
 * groups are the one part of the menu the browser owns; app.routes.ts opens their pages to every
 * signed-in person under the same flag. A group the server does send (same code) is not doubled.
 *
 * PLACED BY ORDER, NOT BY POSITION, because the sidebar sorts by displayOrder: each group takes an
 * order between the Dashboard's and the next whole number (server orders are whole numbers), which
 * keeps the five together, in their own order, under the Dashboard's heading.
 */
function withAttendance(server: MenuItem[]): MenuItem[] {
  if (!ATTENDANCE_ON) return server;

  const present = new Set(server.map((item) => item.code));
  const groups = ATTENDANCE_MENUS.filter((item) => !present.has(item.code)).sort((a, b) => a.displayOrder - b.displayOrder);
  if (groups.length === 0) return server;

  const dashboard = server.find((item) => item.code === 'DASHBOARD');
  const base = dashboard ? (dashboard.displayOrder ?? 0) : Math.min(0, ...server.map((item) => item.displayOrder ?? 0)) - 1;
  const step = 1 / (groups.length + 1);

  return [...server, ...groups.map((item, i) => ({ ...item, displayOrder: base + step * (i + 1) }))];
}

/** Whether a menu route is the URL itself or one of its parents (query string and fragment aside). */
function covers(route: string, url: string): boolean {
  return url === route || url.startsWith(route + '/') || url.startsWith(route + '?') || url.startsWith(route + '#');
}


@Component({
  selector: 'app-sidebar',
  imports: [RouterLink],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  // the icon rail only exists in the vertical layout; the horizontal menu is always full
  host: { '[class.is-collapsed]': 'collapsed() && !horizontal()', '[class.is-horizontal]': 'horizontal()' }
})
export class Sidebar implements AfterViewInit {
  /** An explicit menu can still be passed in; by default the sidebar shows the tree the API returns. */
  readonly menuOverride = input<MenuItem[] | null>(null, { alias: 'menu' });

  private readonly navigation = inject(NavigationService);

  /**
   * The menu as the server decides it for THIS person (product x Organisation x role x
   * permissions), plus Attendance's groups, which the server does not hold (withAttendance).
   * While it loads the sidebar is empty; if it could not be fetched the built-in catalogue is
   * shown so the app stays navigable (the API still checks every call).
   */
  readonly menu = computed<MenuItem[]>(() => {
    const explicit = this.menuOverride();
    if (explicit) return explicit;
    if (this.navigation.failed()) return BUILT_IN_MENU;
    const server = this.navigation.menu() as unknown as MenuItem[];
    // Not loaded yet: stay empty rather than draw Attendance alone and the rest a moment later.
    return this.navigation.navigation() ? withAttendance(server) : server;
  });

  readonly collapsed = input(false);
  readonly expandRequest = output<void>();

  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  private readonly theme = inject(ThemeSettingsService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Appearance studio -> Layout -> Horizontal: the menu runs across the top with dropdowns. */
  protected readonly horizontal = computed(() => this.theme.prefs().layout === 'horizontal');

  /** Horizontal layout: the one top-level menu whose dropdown is open, and where it sits. */
  private readonly dropId = signal<string | null>(null);
  protected readonly dropPos = signal({ left: 0, top: 0 });

  /** Horizontal layout: the menu row slides; these show the left / right arrows. */
  protected readonly canLeft = signal(false);
  protected readonly canRight = signal(false);

  protected readonly items = computed(() => this.sorted(this.menu()));

  protected readonly sections = computed<MenuSection[]>(() => {
    const sections: MenuSection[] = [];
    for (const item of this.items()) {
      const label = item.section ?? MENU_SECTIONS[item.code] ?? sections.at(-1)?.label ?? 'Workspace';
      const rows = this.hasChildren(item) && this.same(label, item.name) ? this.sorted(item.children) : [item];
      const last = sections.at(-1);
      if (last && last.label === label) last.items.push(...rows);
      else sections.push({ label, items: rows });
    }
    return sections;
  });

  /** Ids of the rows shown on the top level (those open as dropdowns in the horizontal layout). */
  private readonly topIds = computed(() => new Set(this.sections().flatMap((s) => s.items.map((i) => i.id))));

  constructor() {
    effect(() => {
      const parents = this.parentsOf();
      if (parents.length) {
        // accordion: only the opened page's own branch stays open
        this.expanded.update(() => new Set(parents));
      }
    });
    // a page change, or switching layout, closes the horizontal dropdown
    effect(() => {
      this.url();
      this.horizontal();
      this.dropId.set(null);
    });
    // switching layout (or the menu changing) re-measures the slider once the DOM has updated
    effect(() => {
      this.horizontal();
      this.sections();
      setTimeout(() => this.updateSlide());
    });
    // the dropdown is position: fixed - close it when the page scrolls under it
    const onScroll = (event: Event): void => {
      if (!this.dropId()) return;
      const drop = this.host.nativeElement.querySelector('.nav-children.is-drop');
      if (!drop?.contains(event.target as Node)) this.dropId.set(null);
    };
    document.addEventListener('scroll', onScroll, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', onScroll, true));
  }

  /** Horizontal layout: a click outside the menu closes the dropdown. */
  @HostListener('document:click', ['$event'])
  protected onDocClick(event: MouseEvent): void {
    if (this.dropId() && !this.host.nativeElement.contains(event.target as Node)) this.dropId.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.dropId.set(null);
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.dropId.set(null);
    this.updateSlide();
  }

  ngAfterViewInit(): void {
    this.updateSlide();
  }

  // ---- horizontal slider ----------------------------------------------------------------------

  private navEl(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('.nav');
  }

  /** Shows an arrow only on the side that has more menus to reveal. */
  protected updateSlide(): void {
    const nav = this.navEl();
    if (!nav || !this.horizontal()) {
      this.canLeft.set(false);
      this.canRight.set(false);
      return;
    }
    const max = nav.scrollWidth - nav.clientWidth;
    this.canLeft.set(nav.scrollLeft > 2);
    this.canRight.set(nav.scrollLeft < max - 2);
  }

  /** Arrow click: slide about three quarters of the visible row. */
  protected slide(dir: 1 | -1): void {
    const nav = this.navEl();
    if (!nav) return;
    this.dropId.set(null);
    nav.scrollBy({ left: dir * Math.max(160, nav.clientWidth * 0.75), behavior: 'smooth' });
  }

  /** Mouse wheel over the row scrolls it sideways (horizontal layout only). */
  protected onNavWheel(event: WheelEvent): void {
    const nav = this.navEl();
    if (!nav || !this.horizontal() || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (nav.scrollWidth <= nav.clientWidth) return;
    event.preventDefault();
    nav.scrollLeft += event.deltaY;
  }

  protected iconPath(name?: string): string {
    return (name && MENU_ICONS[name]) || MENU_ICON_FALLBACK;
  }

  protected toneOf(item: MenuItem): string {
    const tone = MENU_TONES[item.code] ?? TONE_CYCLE[Math.max(0, this.items().indexOf(item)) % TONE_CYCLE.length];
    return 'tone-' + tone;
  }

  /**
   * Whether a row opens a list of sub-pages. Same rule as the reference sidebar: only a folder
   * (group-only, or one with no page of its own) does. A menu that is a page (has a route) is a plain
   * link even when the API lists children under it, e.g. Organisations stays a link, with no
   * Create Organisation / Approval Queue underneath.
   */
  protected hasChildren(item: MenuItem): boolean {
    return item.children.length > 0 && (item.isGroupOnly || !item.route);
  }

  protected childrenOf(item: MenuItem): MenuItem[] {
    return this.sorted(item.children);
  }
  protected toggle(item: MenuItem, event?: Event): void {
    // horizontal: a top-level menu opens a dropdown under itself (one at a time)
    if (this.horizontal() && this.topIds().has(item.id)) {
      const row = event?.currentTarget as HTMLElement | undefined;
      event?.preventDefault();
      event?.stopPropagation();
      if (this.dropId() === item.id) {
        this.dropId.set(null);
        return;
      }
      if (row) {
        const r = row.getBoundingClientRect();
        const left = Math.max(8, Math.min(r.left, window.innerWidth - DROP_W - 8));
        this.dropPos.set({ left, top: r.bottom + 6 });
      }
      this.dropId.set(item.id);
      return;
    }
    event?.preventDefault();
    event?.stopPropagation();
    if (this.collapsed() && !this.horizontal()) {
      this.expandRequest.emit();
      this.expanded.set(this.branchOf(item.id));
      return;
    }
    this.expanded.update((set) => {
      // accordion: opening a menu keeps only its own branch open; closing it also
      // closes whatever was open inside it
      if (set.has(item.id)) {
        return new Set([...set].filter((id) => !this.branchOf(id).has(item.id)));
      }
      return this.branchOf(item.id);
    });
  }

  protected isExpanded(item: MenuItem): boolean {
    if (this.horizontal() && this.topIds().has(item.id)) return this.dropId() === item.id;
    return this.expanded().has(item.id);
  }

  /** Sub-pages are listed when the menu is open - in the vertical layout only off the icon rail. */
  protected showChildren(item: MenuItem): boolean {
    return this.hasChildren(item) && this.isExpanded(item) && (this.horizontal() || !this.collapsed());
  }

  protected hasActiveChild(item: MenuItem): boolean {
    const walk = (kids: readonly MenuItem[]): boolean =>
      kids.some((child) => this.isCurrent(child) || walk(child.children));
    return walk(item.children);
  }

  /** The entry for the page on screen: highlighted, and the branch the accordion keeps open. */
  protected isCurrent(item: MenuItem): boolean {
    return !!item.route && item.route === this.currentRoute();
  }

  protected openOrGo(item: MenuItem, event: Event): void {
    if (this.hasChildren(item) && !this.isExpanded(item)) {
      this.toggle(item, event);
      return;
    }
    this.closeMobileMenu();
  }

  protected targetOf(item: MenuItem): string | null {
    return item.opensInNewTab ? '_blank' : null;
  }

  protected closeMobileMenu(): void {
    document.getElementById('sidebar')?.classList.remove('open');
    this.dropId.set(null);
  }

  // ---------------------------------------------------------------------------------------------

  private same(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  private sorted(items: readonly MenuItem[]): MenuItem[] {
    return [...items].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * The route of the menu entry for the page on screen: the LONGEST menu route that is the URL
   * itself or one of its parents.
   *
   * MOST SPECIFIC WINS. Attendance Register lives at /app/attendance and most other Attendance
   * pages live beneath it (/app/attendance/overview, /app/attendance/reports ...). Matched by prefix
   * alone, Attendance Register was "current" on every one of them, so it stayed highlighted and kept
   * the Attendance group open beside the group of the page actually on screen. A page no entry names
   * exactly (a detail, an edit form) still lights the entry it sits under.
   */
  private readonly currentRoute = computed<string | null>(() => {
    const url = this.url();
    let best: string | null = null;
    const walk = (items: readonly MenuItem[]): void => {
      for (const item of items) {
        const route = item.route;
        if (route && covers(route, url) && (best === null || route.length > best.length)) best = route;
        walk(item.children);
      }
    };
    walk(this.menu());
    return best;
  });

  /** Parent id for every sub-menu, built from the menu tree (drives the accordion behaviour). */
  private readonly parentIdOf = computed(() => {
    const map = new Map<string, string>();
    const walk = (items: readonly MenuItem[], parent: string | null): void => {
      for (const item of items) {
        if (parent) map.set(item.id, parent);
        walk(item.children, item.id);
      }
    };
    walk(this.menu(), null);
    return map;
  });

  /** A menu plus its ancestors: opening it keeps this branch and collapses every other one. */
  private branchOf(id: string): ReadonlySet<string> {
    const branch = new Set<string>();
    const parents = this.parentIdOf();
    let current: string | undefined = id;
    while (current !== undefined) {
      branch.add(current);
      current = parents.get(current);
    }
    return branch;
  }

  /** The menus above the page on screen (see currentRoute), innermost first. */
  private parentsOf(): string[] {
    const found: string[] = [];
    const walk = (items: readonly MenuItem[]): boolean => {
      let hit = false;
      for (const item of items) {
        const childHit = walk(item.children);
        if (childHit) found.push(item.id);
        if (childHit || this.isCurrent(item)) hit = true;
      }
      return hit;
    };
    walk(this.menu());
    return found;
  }
}