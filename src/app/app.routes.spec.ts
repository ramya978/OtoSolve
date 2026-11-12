import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { GRANTS, menuGuard } from './Shared/Auth/auth.guard';
import { NavigationService } from './Shared/services/navigation.service';
import { MenuPage } from './Shared/layout/menu-page';
import { ATTENDANCE_MENUS } from './Shared/layout/menu.data';

const route = (path: string): Route | undefined => routes.find((r) => r.path === path);
const grants = (path: string) => route(path)?.data?.[GRANTS];

describe('route table (NEW-03, NEW-04, NEW-08, NEW-17)', () => {
  it('loads every page lazily', () => {
    const eager = routes.filter((r) => r.component && !r.redirectTo).map((r) => r.path);
    expect(eager).toEqual([]);
  });

  it('opens a menu page only from its own menu entry', () => {
    expect(grants('app/platform/business-unit')).toEqual(['/app/platform/business-unit']);
    expect(grants('app/administration/access/user-directory')).toEqual(['/app/administration/access/user-directory']);
    expect(grants('app/fundraising/relationships/lead-work-queue')).toEqual(['/app/fundraising/relationships/lead-work-queue']);
  });

  it('opens a page inside a module from any of the module menu pages', () => {
    const plan = grants('app/fundraising/relationships/follow-up-queue/plan') as string[];
    expect(plan).toContain('/app/fundraising/relationships/lead-work-queue');
    expect(plan).toContain('/app/fundraising/relationships/my-leads');
    expect(grants('app/administration/access/create-user')).toEqual(['/app/administration/access/user-directory']);
    expect(grants('app/masters/country/:id/edit')).toEqual(['/app/masters/country']);
  });

  it('lets the Platform Admin review an applicant organisation from the directory or the queue', () => {
    expect(grants('app/administration/organisation/details')).toEqual(expect.arrayContaining([
      '/app/administration/organisation/directory', '/app/administration/organisation/registration-verification']));
  });

  it('gives the approval queue a real screen, filtered to organisations awaiting review (NEW-17)', () => {
    const queue = route('app/administration/organisation/registration-verification');
    expect(queue?.loadComponent).toBeDefined();
    expect(queue?.data?.['status']).toBe('review');
    expect(route('app/administration/organisation/registration-verification/:id')?.redirectTo).toBeDefined();
  });

  it('gives every route a real screen: none falls back to the "not built yet" page (NEW-17)', async () => {
    // The router answers a path with its FIRST matching route; a later duplicate is never reached.
    const firstByPath = routes.filter((r, i) => routes.findIndex((x) => x.path === r.path) === i);
    const loaded = await Promise.all(firstByPath
      .filter((r) => r.loadComponent)
      .map(async (r) => ({ path: r.path, component: await r.loadComponent!() })));
    expect(loaded.filter((r) => r.component === MenuPage).map((r) => r.path)).toEqual([]);
  }, 60_000); // imports every page

  it('registers the Attendance pages exactly when the build shows their menus (NEW-04)', () => {
    // The sidebar adds these five groups under the same flag (Sidebar.menu); a link it draws with
    // no route behind it falls through to `**` and bounces the person back to the Dashboard.
    const links = ATTENDANCE_MENUS.flatMap((group) => group.children).map((page) => page.route!.replace(/^\//, ''));
    expect(links).toHaveLength(25);

    const registered = links.filter((path) => route(path)?.loadComponent !== undefined);
    expect(registered).toEqual(environment.features.attendance ? links : []);

    // No server menu names an Attendance page, so the menu guard must not ask for one.
    for (const path of registered) expect(grants(path), path).toBe('any');
  });

  it('guards every workspace page with the sign-in and the menu guards', () => {
    const unguarded = routes
      .filter((r) => r.path?.startsWith('app/') && !r.redirectTo)
      .filter((r) => !(r.canActivate ?? []).includes(menuGuard))
      .map((r) => r.path);
    expect(unguarded).toEqual([]);
  });
});

describe('menuGuard (NEW-03)', () => {
  const tree = signal<{ menu: { route: string; children: unknown[] }[] } | null>(null);

  const run = async (path: string) => {
    const snapshot = { data: route(path)?.data ?? {} } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/' + path } as RouterStateSnapshot;
    const result = TestBed.runInInjectionContext(() => menuGuard(snapshot, state));
    return isObservable(result) ? firstValueFrom(result) : await result;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: NavigationService, useValue: { navigation: tree, loading: signal(false), load: () => of(null) } },
      ],
    });
  });

  it('opens a page the person\'s own menu offers', async () => {
    tree.set({ menu: [{ route: '/app/fundraising/relationships/lead-work-queue', children: [] }] });
    expect(await run('app/fundraising/relationships/lead-work-queue')).toBe(true);
    expect(await run('app/fundraising/relationships/follow-up-queue/plan')).toBe(true);
  });

  it('sends anything else to the no-access page', async () => {
    tree.set({ menu: [{ route: '/app/fundraising/relationships/lead-work-queue', children: [] }] });
    const result = await run('app/platform/business-unit');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/app/forbidden?page=%2Fapp%2Fplatform%2Fbusiness-unit');
  });

  it('lets everybody signed in reach their dashboard and their own security settings', async () => {
    tree.set({ menu: [] });
    expect(await run('app/dashboard')).toBe(true);
    expect(await run('app/administration/access/my-security')).toBe(true);
  });
});
