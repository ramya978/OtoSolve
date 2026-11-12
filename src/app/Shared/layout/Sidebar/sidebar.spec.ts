import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { MenuItem } from '../menu.data';
import { NavigationService } from '../../services/navigation.service';
import { Sidebar } from './sidebar';

/** Stands in for every page, so the router accepts any address the tests navigate to. */
@Component({ template: '' })
class AnyPage {}

/** A menu node as GET /navigation sends it. */
const node = (code: string, name: string, displayOrder: number, extra: Partial<MenuItem> = {}): MenuItem => ({
  id: code.toLowerCase(),
  code,
  name,
  level: 'menu',
  moduleCode: 'CORE',
  displayOrder,
  opensInNewTab: false,
  isLandingPage: false,
  children: [],
  isGroupOnly: false,
  hasChildren: false,
  ...extra,
});

/** Roughly what the server sends the Platform Admin: no Attendance anywhere in it. */
const SERVER_MENU: MenuItem[] = [
  node('DASHBOARD', 'Dashboard', 10, { route: '/app/dashboard' }),
  node('PLATFORM', 'Platform', 15, {
    isGroupOnly: true,
    hasChildren: true,
    children: [node('PLATFORM_ORGANISATIONS', 'Organisations', 10, { level: 'subMenu', route: '/app/administration/organisation/directory' })],
  }),
];

const ATTENDANCE_GROUPS = ['Attendance', 'Leave & Holidays', 'Shifts & Rules', 'Attendance Reports', 'My Workspace'];

describe('Sidebar: Attendance menus (NEW-04)', () => {
  const tree = signal<{ menu: MenuItem[] } | null>(null);
  const failed = signal(false);

  const render = () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    return fixture;
  };

  /** Headings and top-level rows, top to bottom, as the person reads them. */
  const rows = (host: HTMLElement): string[] =>
    [...host.querySelectorAll('.nav-heading span, .nav-entry > .nav-link .nav-text')].map((el) => el.textContent?.trim() ?? '');

  beforeEach(() => {
    tree.set(null);
    failed.set(false);
    TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([{ path: '**', component: AnyPage }]),
        {
          provide: NavigationService,
          useValue: { navigation: tree, menu: () => tree()?.menu ?? [], failed, loading: signal(false) },
        },
      ],
    });
  });

  it('adds the five Attendance groups the server does not send, straight after the Dashboard', () => {
    tree.set({ menu: SERVER_MENU });
    const fixture = render();

    const attendance = environment.features.attendance ? ATTENDANCE_GROUPS : [];
    expect(rows(fixture.nativeElement)).toEqual(['Workspace', 'Dashboard', ...attendance, 'Platform', 'Organisations']);
  });

  it('opens an Attendance group onto the pages it links to', async () => {
    if (!environment.features.attendance) return;
    tree.set({ menu: SERVER_MENU });
    const fixture = render();
    const host: HTMLElement = fixture.nativeElement;

    const group = [...host.querySelectorAll<HTMLButtonElement>('button.nav-link')]
      .find((button) => button.querySelector('.nav-text')?.textContent?.trim() === 'Attendance');
    expect(group).toBeDefined();
    group!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const pages = [...host.querySelectorAll<HTMLAnchorElement>('.nav-children a.nav-child')]
      .map((link) => [link.textContent?.trim(), link.getAttribute('href')]);
    expect(pages).toEqual([
      ['Overview', '/app/attendance/overview'],
      ['Attendance Register', '/app/attendance'],
      ['Punch Station', '/app/attendance/punch-station'],
      ['Bulk Attendance', '/app/bulk-attendance'],
      ['Field Hub', '/app/attendance/field-hub'],
      ['Missed Punches & OT', '/app/attendance/exceptions'],
      ['Team Approvals', '/app/attendance/team-approvals'],
    ]);
  });

  it('lights only the page on screen, though Attendance Register sits above the other Attendance addresses', async () => {
    if (!environment.features.attendance) return;
    tree.set({ menu: SERVER_MENU });
    const fixture = render();
    const host: HTMLElement = fixture.nativeElement;

    await TestBed.inject(Router).navigateByUrl('/app/attendance/reports');
    fixture.detectChanges();
    await fixture.whenStable();

    // /app/attendance (Attendance Register) is a prefix of /app/attendance/reports: by prefix alone
    // it was lit too, and its whole group stayed open beside Attendance Reports.
    const open = [...host.querySelectorAll('button.nav-link[aria-expanded="true"] .nav-text')].map((e) => e.textContent?.trim());
    const lit = [...host.querySelectorAll('a.active .nav-text')].map((e) => e.textContent?.trim());
    expect(open).toEqual(['Attendance Reports']);
    expect(lit).toEqual(['Reports']);
    expect(host.querySelector('a.active')?.getAttribute('aria-current')).toBe('page');

    // Attendance Register itself still lights on its own address.
    await TestBed.inject(Router).navigateByUrl('/app/attendance');
    fixture.detectChanges();
    await fixture.whenStable();
    expect([...host.querySelectorAll('a.active .nav-text')].map((e) => e.textContent?.trim())).toEqual(['Attendance Register']);
  });

  it('stays empty until the server menu arrives, rather than show Attendance on its own', () => {
    const fixture = render();
    expect(fixture.componentInstance.menu()).toEqual([]);
  });

  it('does not double a group the server sends itself', () => {
    tree.set({ menu: [...SERVER_MENU, node('ATTENDANCE', 'Attendance', 50, { route: '/app/attendance' })] });
    const fixture = render();
    expect(rows(fixture.nativeElement).filter((row) => row === 'Attendance')).toHaveLength(1);
  });

  it('falls back to the built-in catalogue, with Attendance only when this build has its pages', () => {
    failed.set(true);
    const codes = render().componentInstance.menu().map((item) => item.code);
    expect(codes).toContain('DASHBOARD');
    expect(codes.includes('ATTENDANCE')).toBe(environment.features.attendance);
  });
});
