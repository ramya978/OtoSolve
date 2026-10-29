import { Component, DestroyRef, HostListener, ViewEncapsulation, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Sidebar } from './Shared/layout/Sidebar/sidebar';
import { Footer } from './Shared/layout/Footer/footer';
import { ThemeSettingsService, profileImageSrc } from './pages/Auth/Profile/theme-settings';
import { ThemeSettings } from './pages/Auth/Profile/settings';
import { ClockSettingsService, ClockZone, cityOf } from './Shared/studio/data/clock-settings';
import { AuthService } from './Shared/Auth/auth.service';
import { AuthTokenService } from './Shared/services/auth-token.service';
import { OrganisationContextService } from './Shared/services/organisation-context.service';
import { NavigationService } from './Shared/services/navigation.service';
import { ToastService } from './Shared/services/toast.service';
import { apiErrorMessage } from './Shared/models/api-response.model';
import { LoaderService } from './Shared/services/loader.service';

export interface Organisation {
  id: string;
  name: string;
  subdomain: string;
  status: 'Active' | 'Review only';
  mark: string;
  /** Shown under the name with the subdomain ("globalrelief · Chennai, India"). */
  location: string;
}

type HeaderIcon =
  | 'building' | 'search' | 'clock' | 'bell' | 'user' | 'shield' | 'sliders'
  | 'logout' | 'devices' | 'doc' | 'users' | 'check' | 'leave';

interface Note {
  id: string;
  title: string;
  detail: string;
  /** Where it came from, shown under the text ("Approval queue"). */
  source: string;
  time: string;
  unread: boolean;
  icon: HeaderIcon;
}

/** Notifications for the bell. The platform has no notification feed yet, so the list starts empty. */
const NOTES: Note[] = [];

/** Line icons used in the top bar, its menu and the notifications panel (24×24, stroke). */
const ICONS: Record<HeaderIcon, string> = {
  building: 'M4 21V5l8-3 8 3v16 M2 21h20 M8 8h1 M15 8h1 M8 12h1 M15 12h1 M10 21v-5h4v5',
  search: 'M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0 M21 21l-4.35-4.35',
  clock: 'M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0 M12 6v6l4 2',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  sliders: 'M21 5h-7 M10 5H3 M21 12h-9 M8 12H3 M21 19h-5 M12 19H3 M14 3v4 M8 10v4 M16 17v4',
  logout: 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5 M21 12H9 M17 8l4 4-4 4',
  devices: 'M3 4h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M6 18h7 M9.5 14v4 M18 9h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  /** door with an arrow going out - "Leave organisation" */
  leave: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 12H3 M6 8l-4 4 4 4'
};

const SIDEBAR_KEY = 'ydot-sidebar-collapsed';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Sidebar, Footer, ThemeSettings],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  encapsulation: ViewEncapsulation.None
})
export class App {
  protected readonly title = signal('OtoSolve');

  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly loaderService = inject(LoaderService);

  /** The routed URL as a signal — no extra wiring needed to know where we are. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** True while the router is navigating between pages (menu click → route change). */
  protected readonly navigating = toSignal(
    this.router.events.pipe(
      map((event) => {
        if (event instanceof NavigationStart) return true;
        if (event instanceof NavigationEnd) return false;
        return null;
      }),
      filter((v): v is boolean => v !== null)
    ),
    { initialValue: false }
  );

  /** True while the router shows an auth / public donor screen: the shell then hides sidebar + top bar. */
  protected readonly onAuthScreen = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/login') || url.startsWith('/auth/') || url.startsWith('/give/result');
  });

  /** The signed-in user for the top bar and account menu (placeholders while signed out). */
  protected readonly sessionUser = this.auth.user;
  protected readonly userName = computed(() => this.sessionUser()?.name ?? 'Signed out');
  protected readonly userRole = computed(() => this.sessionUser()?.role ?? '—');
  protected readonly userEmail = computed(() => this.sessionUser()?.email ?? '');
  protected readonly userInitials = computed(() => {
    const user = this.sessionUser();
    if (user?.initials) return user.initials;
    return (
      user?.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join('') || '--'
    );
  });

  protected readonly theme = inject(ThemeSettingsService);
  /** Shared with Theme Settings → Workspace (Clock presentation). */
  private readonly clock = inject(ClockSettingsService);

  protected readonly avatarSrc = computed<string | null>(
    () => profileImageSrc(this.theme.prefs().profileImage)
  );

  protected readonly avatarBg = computed<string | null>(() => {
    const src = this.avatarSrc();
    return src ? `url("${src}") center / cover no-repeat` : null;
  });

  // ---- sidebar ----------------------------------------------------------------------------------
  protected readonly sidebarCollapsed = signal(this.readCollapsed());

  // ---- account menu + organisation dropdown -----------------------------------------------------
  protected readonly userMenuOpen = signal(false);
  protected readonly orgListOpen = signal(false);
  protected readonly orgQuery = signal('');
  /** True while the "Leave organisation" request is running. */
  protected readonly leavingOrg = signal(false);
  private readonly tokens = inject(AuthTokenService);
  private readonly orgContext = inject(OrganisationContextService);
  private readonly navigation = inject(NavigationService);
  private readonly toast = inject(ToastService);

  /**
   * The organisation switcher is shown ONLY to a super admin (global scope, isSuperAdmin).
   * Tenant admins and ordinary users work inside the one Organisation their session belongs to,
   * so the "Choose an organisation" button is not drawn for them at all.
   */
  protected readonly canSwitchOrg = computed(() => this.orgContext.canSwitch());

  /**
   * The Organisations in the switcher. Only a root (global-scope) user has more than one to pick
   * from - the list comes from the API when the switcher opens. Everybody else sees the one
   * Organisation their session operates in.
   */
  protected readonly organisations = computed<Organisation[]>(() => {
    const current = this.tokens.tenant();
    if (!this.orgContext.canSwitch()) {
      return current?.tenantId ? [this.fromContext(current.tenantId, current.tenantName, current.subdomain, current.status === 'active', current.tenantCode)] : [];
    }
    return this.orgContext
      .selectable()
      .filter((o) => !!o.tenantId)
      .map((o) => this.fromContext(o.tenantId!, o.name, o.subdomain, o.isOperable === true, o.code));
  });

  /** The Organisation the session is operating in right now (null at platform scope). */
  protected readonly selectedOrg = computed<Organisation | null>(() => {
    const current = this.tokens.tenant();
    if (!current?.tenantId || !current.tenantName) return null;
    return this.fromContext(current.tenantId, current.tenantName, current.subdomain, current.status === 'active', current.tenantCode);
  });

  /**
   * "Leave <organisation>" is shown only while a global caller has actually stepped into an
   * Organisation (isActingInOrganisation). Someone bound to one Organisation has nowhere to go
   * back to, and at platform scope there is nothing to leave.
   */
  protected readonly canLeaveOrg = computed(
    () => !!this.selectedOrg() && this.canSwitchOrg() && this.orgContext.isActingInOrganisation()
  );

  protected readonly filteredOrgs = computed(() => {
    const q = this.orgQuery().trim().toLowerCase();
    const list = this.organisations();
    return q
      ? list.filter((o) => [o.name, o.subdomain, o.location].some((v) => v.toLowerCase().includes(q)))
      : list;
  });

  // ---- notifications ----------------------------------------------------------------------------
  protected readonly notificationsOpen = signal(false);
  protected readonly notes = signal<Note[]>(NOTES);
  protected readonly unreadCount = computed(() => this.notes().filter((n) => n.unread).length);

  // ---- workspace clock (settings live in ClockSettingsService) ----------------------------------
  /** Timezones in the dropdown (the device's own zone is added when it is not in the list). */
  protected readonly zones: ClockZone[] = this.clock.zones;

  protected readonly now = signal(new Date());
  protected readonly clockOpen = signal(false);
  protected readonly zoneListOpen = signal(false);
  protected readonly clockZone = this.clock.zone;
  protected readonly clock12h = this.clock.h12;
  protected readonly clockSeconds = this.clock.seconds;
  protected readonly clockPaused = this.clock.paused;
  protected readonly showClockInHeader = this.clock.inHeader;

  /** City shown under the header time ("London"). */
  protected readonly clockCity = computed(() => cityOf(this.clockZone().id));

  /** "08:23 AM", "08:23:05 AM" or "20:23" - in the selected timezone. */
  protected readonly clockTime = computed(() => {
    const h12 = this.clock12h();
    const seconds = this.clockSeconds();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.clockZone().id,
      hour: '2-digit',
      minute: '2-digit',
      second: seconds ? '2-digit' : undefined,
      hourCycle: h12 ? 'h12' : 'h23'
    }).formatToParts(this.now());
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    const time = `${get('hour')}:${get('minute')}${seconds ? ':' + get('second') : ''}`;
    return h12 ? `${time} ${get('dayPeriod').toUpperCase()}` : time;
  });

  /** "Thu, 15 Oct 2026" - in the selected timezone. */
  protected readonly clockDate = computed(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.clockZone().id,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).formatToParts(this.now());
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`;
  });

  /** "UTC+05:30" for the selected timezone. */
  protected readonly clockOffset = computed(() => {
    try {
      const value = new Intl.DateTimeFormat('en-US', { timeZone: this.clockZone().id, timeZoneName: 'longOffset' })
        .formatToParts(this.now())
        .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
      return value === 'GMT' ? 'UTC+00:00' : value.replace('GMT', 'UTC');
    } catch {
      return '';
    }
  });

  protected readonly isFullscreen = signal(false);

  constructor() {
    // The shell already carries a (hidden) #toast element with its own style. Messages sent to the
    // ToastService are shown there, so an error from any screen is visible without adding markup.
    let hideTimer = 0;
    effect(() => {
      const list = this.toast.toasts();
      const el = document.getElementById('toast');
      if (!el) return;
      const last = list[list.length - 1];
      clearTimeout(hideTimer);
      if (!last) { el.hidden = true; return; }
      el.textContent = last.message ? `${last.title} - ${last.message}` : last.title;
      el.hidden = false;
    });

    // If the session stops being a super admin (sign-out, a different user), make sure the
    // switcher popup is not left open with nothing to anchor it.
    effect(() => {
      if (!this.canSwitchOrg()) this.orgListOpen.set(false);
    });

    const timer = setInterval(() => {
      if (!this.clockPaused()) this.now.set(new Date());
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** The SVG path for a top-bar icon. */
  protected icon(name: HeaderIcon): string {
    return ICONS[name];
  }

  // ---------------------------------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------------------------------

  protected toggleSidebar(): void {
    if (window.matchMedia('(max-width: 800px)').matches) {
      document.getElementById('sidebar')?.classList.toggle('open');
      return;
    }
    this.setSidebarCollapsed(!this.sidebarCollapsed());
  }

  protected setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      // storage blocked - keep the in-memory state
    }
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Workspace clock
  // ---------------------------------------------------------------------------------------------

  /** The clock button: opens / closes the clock settings dropdown. */
  protected toggleClockPanel(event: Event): void {
    event.stopPropagation();
    const open = !this.clockOpen();
    this.closeAll();
    this.clockOpen.set(open);
  }

  protected closeClockPanel(): void {
    this.clockOpen.set(false);
    this.zoneListOpen.set(false);
  }

  /** The timezone field: opens / closes its option list. */
  protected toggleZoneList(event: Event): void {
    event.stopPropagation();
    this.zoneListOpen.update((open) => !open);
  }

  protected chooseZone(zone: ClockZone): void {
    this.clockZone.set(zone);
    this.zoneListOpen.set(false);
  }

  /** Pause freezes the shown time; resuming jumps back to now. */
  protected setPaused(paused: boolean): void {
    this.clockPaused.set(paused);
    if (!paused) this.now.set(new Date());
  }

  // ---------------------------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------------------------

  protected toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  @HostListener('document:fullscreenchange')
  protected onFullscreenChange(): void {
    this.isFullscreen.set(!!document.fullscreenElement);
  }

  // ---------------------------------------------------------------------------------------------
  // Account menu + organisation dropdown
  // ---------------------------------------------------------------------------------------------

  protected toggleUserMenu(event: Event): void {
    event.stopPropagation();
    const open = !this.userMenuOpen();
    this.closeAll();
    this.userMenuOpen.set(open);
  }

  protected closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  /** Account menu → My profile: opens the Auth · Profile screen. */
  protected openProfile(): void {
    this.closeUserMenu();
    void this.router.navigateByUrl('/app/auth/user-profile');
  }

  /**
   * Account menu → Sign out (and Sign out everywhere): ends the session on this device
   * and returns to the sign-in screen.
   */
  protected signOut(everywhere = false): void {
    this.closeAll();
    // The API revokes the session (every session when `everywhere`) and clears the HttpOnly
    // refresh cookie; the router then shows the sign-in screen.
    this.auth.logout(everywhere);
  }

  /** Account menu → My security. */
  protected openSecurity(): void {
    this.closeUserMenu();
    void this.router.navigateByUrl('/app/administration/access/my-security');
  }

  /** Account menu → Preferences: opens the shared Appearance studio popup (no navigation). */
  protected openPreferences(): void {
    this.closeUserMenu();
    this.theme.studioOpen.set(true);
  }

  /**
   * The organisation button in the top bar: opens a floating list under it (search on top), or
   * closes it. Super admin only - nobody else has the button.
   */
  protected toggleOrgList(event: Event): void {
    event.stopPropagation();
    if (!this.canSwitchOrg()) return;
    const open = !this.orgListOpen();
    this.closeAll();
    this.orgListOpen.set(open);
    if (open) this.openedOrgList();
  }

  /** Account menu → Current organisation: closes the menu and opens the organisation list. */
  protected openOrgFromMenu(event: Event): void {
    event.stopPropagation();
    if (!this.canSwitchOrg()) return;
    this.closeAll();
    this.orgListOpen.set(true);
    this.openedOrgList();
  }

  protected closeOrgList(): void {
    this.orgListOpen.set(false);
    this.orgQuery.set('');
  }

  /**
   * Pick the organisation to act in. Asks the SERVER to re-issue the access token against it
   * (POST /auth/select-organisation); the sidebar menu for that Organisation is fetched before
   * this completes, then the person lands on its landing route.
   */
  protected chooseOrg(org: Organisation): void {
    this.closeOrgList();
    if (!this.canSwitchOrg() || org.id === this.selectedOrg()?.id) return;

    this.orgContext.select(org.id).subscribe({
      next: () => void this.router.navigateByUrl(this.navigation.landingRoute()),
      error: (error: unknown) =>
        this.toast.show('Organisation not opened', apiErrorMessage(error, 'That organisation could not be opened.'), 'error')
    });
  }

  /**
   * "Leave <organisation>": steps back out to platform scope. The server re-issues the token
   * without an Organisation (exitToPlatform), the platform menu is fetched before that completes,
   * then the person lands on the platform landing route.
   */
  protected leaveOrg(): void {
    const org = this.selectedOrg();
    if (!org || !this.canLeaveOrg() || this.leavingOrg()) return;

    this.leavingOrg.set(true);
    this.orgContext.exitToPlatform().subscribe({
      next: () => {
        this.leavingOrg.set(false);
        this.closeOrgList();
        this.toast.show('Organisation left', `You are no longer working inside ${org.name}.`, 'success');
        void this.router.navigateByUrl(this.navigation.landingRoute());
      },
      error: (error: unknown) => {
        this.leavingOrg.set(false);
        this.toast.show('Could not leave', apiErrorMessage(error, `${org.name} could not be left.`), 'error');
      }
    });
  }

  /** The switcher is filled only when it is opened: most people can switch nowhere. */
  private openedOrgList(): void {
    if (this.canSwitchOrg() && this.orgContext.selectable().length === 0) {
      this.orgContext.loadSelectable().subscribe({ error: () => undefined });
    }
    this.focusOrgSearch();
  }

  private fromContext(id: string, name: string | null | undefined, subdomain: string | null | undefined, operable: boolean, code?: string | null): Organisation {
    const label = (name ?? '').trim() || 'Organisation';
    return {
      id,
      name: label,
      subdomain: subdomain ?? '',
      status: operable ? 'Active' : 'Review only',
      mark: label.charAt(0).toUpperCase(),
      location: code ?? ''
    };
  }

  private focusOrgSearch(): void {
    this.orgQuery.set('');
    // focus the search once the list is drawn
    setTimeout(() => document.querySelector<HTMLInputElement>('.hd-org-pop input')?.focus());
  }

  // ---------------------------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------------------------

  protected toggleNotifications(event: Event): void {
    event.stopPropagation();
    const open = !this.notificationsOpen();
    this.closeAll();
    this.notificationsOpen.set(open);
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected markRead(id: string): void {
    this.notes.update((list) => list.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  }

  protected markAllRead(): void {
    this.notes.update((list) => list.map((n) => ({ ...n, unread: false })));
  }

  // ---------------------------------------------------------------------------------------------
  // Outside click / Esc
  // ---------------------------------------------------------------------------------------------

  private closeAll(): void {
    this.closeUserMenu();
    this.closeOrgList();
    this.closeNotifications();
    this.closeClockPanel();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (this.zoneListOpen() && !target?.closest('.hd-select-wrap')) this.zoneListOpen.set(false);
    if (this.clockOpen() && !target?.closest('.hd-clock-wrap')) this.closeClockPanel();
    if (this.orgListOpen() && !target?.closest('.hd-org-wrap')) this.closeOrgList();
    if (this.userMenuOpen() && !target?.closest('.hd-account')) this.closeUserMenu();
    if (this.notificationsOpen() && !target?.closest('.hd-bell-wrap')) this.closeNotifications();
  }

  /** Esc closes the timezone list first, then any open dropdown. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.zoneListOpen()) this.zoneListOpen.set(false);
    else this.closeAll();
  }
}