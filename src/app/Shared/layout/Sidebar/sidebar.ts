import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { MENU_ICONS, MENU_ICON_FALLBACK } from '../menu-icons';
import { MENU_DATA, MenuItem } from '../menu.data';
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


@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
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
   * permissions). While it loads the sidebar is empty; if it could not be fetched the built-in
   * catalogue is shown so the app stays navigable (the API still checks every call).
   */
  readonly menu = computed<MenuItem[]>(() => {
    const explicit = this.menuOverride();
    if (explicit) return explicit;
    if (this.navigation.failed()) return MENU_DATA;
    return this.navigation.menu() as unknown as MenuItem[];
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
      const parents = this.parentsOf(this.url());
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
    const url = this.url();
    const walk = (kids: readonly MenuItem[]): boolean =>
      kids.some((child) => this.matches(child, url) || walk(child.children));
    return walk(item.children);
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

  private matches(item: MenuItem, url: string): boolean {
    const route = item.route;
    return !!route && (url === route || url.startsWith(route + '/') || url.startsWith(route + '?'));
  }

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

  private parentsOf(url: string): string[] {
    const found: string[] = [];
    const walk = (items: readonly MenuItem[]): boolean => {
      let hit = false;
      for (const item of items) {
        const childHit = walk(item.children);
        if (childHit) found.push(item.id);
        if (childHit || this.matches(item, url)) hit = true;
      }
      return hit;
    };
    walk(this.menu());
    return found;
  }
}