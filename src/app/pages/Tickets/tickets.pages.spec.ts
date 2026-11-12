import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthTokenService } from '../../Shared/services/auth-token.service';
import { TICKETS_ROUTES } from './tickets.routes';
import { NotificationService as AppNotificationService } from '../../Service/notification.service';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Renders every Tickets page through the real router and demo API and fails on any runtime error,
 * so template, DI and data mistakes surface here rather than in the browser.
 */
describe('Tickets pages (smoke)', () => {
  const errors: unknown[] = [];
  /** What reached the application header bell. */
  const bell: string[] = [];

  beforeEach(() => {
    errors.length = 0;
    bell.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => ({
          matches: false, addEventListener: () => undefined, removeEventListener: () => undefined,
          addListener: () => undefined, removeListener: () => undefined,
        }),
      });
    }
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([{ path: 'app/tickets', children: TICKETS_ROUTES }], withComponentInputBinding()),
        { provide: AppNotificationService, useValue: { notifyCurrentUser: (title: string) => bell.push(title) } },
        { provide: ErrorHandler, useValue: { handleError: (e: unknown) => errors.push(e) } },
        { provide: AuthTokenService, useValue: { isSuperAdmin: signal(false), isTenantAdmin: signal(true), displayName: signal('Test Admin'), hasPermission: () => true } },
      ],
    });
  });

  const pages: readonly [string, string][] = [
    ['/app/tickets', 'Ticket dashboard'],
    ['/app/tickets/list', 'All tickets'],
    ['/app/tickets/mine', 'My tickets'],
    ['/app/tickets/new', 'New ticket'],
    ['/app/tickets/board', 'Ticket board'],
    ['/app/tickets/analytics', 'Ticket analytics'],
    ['/app/tickets/sla', 'SLA monitor'],
    ['/app/tickets/reports', 'Ticket reports'],
    ['/app/tickets/settings', 'Ticket settings'],
    ['/app/tickets/tk1080', 'TK-1080'],
    ['/app/tickets/tk1080/edit', 'Edit ticket'],
  ];

  for (const [url, text] of pages) {
    it(`renders ${url}`, async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      for (let i = 0; i < 6; i++) {
        await wait(250);
        harness.detectChanges();
      }
      const el = harness.routeNativeElement?.closest('body') ?? document.body;
      expect(errors).toEqual([]);
      expect(el.textContent).toContain(text);
      // The page uses the application's own header block and adds no chrome of its own.
      expect(el.querySelectorAll('app-page-header').length).toBe(1);
      expect(el.querySelector('.tk-shell-head, .tk-subnav, .tk-brand')).toBeNull();
      // SLA warnings go to the shared header bell (the demo data always has some at-risk tickets).
      expect(bell.some((t) => /SLA/.test(t))).toBe(true);
    }, 15_000);
  }
});
