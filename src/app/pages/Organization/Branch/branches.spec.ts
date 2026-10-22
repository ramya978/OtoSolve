import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../../../app.routes';
import { ADD_OFFICE_PATH, OFFICES_PATH } from '../../../Shared/Organization/org.store';
import { OrgAddOffice } from '../Add_Branch/add-office';
import { OrgBranches } from './branches';

/** The paths a route table exposes, without the leading slash. */
const registeredPaths = () =>
  routes.flatMap((r) => (typeof r.path === 'string' ? [r.path] : []));

describe('Organisation office navigation', () => {
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrgBranches, OrgAddOffice],
      providers: [provideRouter(routes)],
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  it('points the office paths at routes that really exist', () => {
    const paths = registeredPaths();

    expect(OFFICES_PATH.replace(/^\//, '')).toBe('app/administration/organisation/units');
    expect(ADD_OFFICE_PATH.replace(/^\//, '')).toBe('app/administration/organisation/units/new');
    expect(paths).toContain(OFFICES_PATH.replace(/^\//, ''));
    expect(paths).toContain(ADD_OFFICE_PATH.replace(/^\//, ''));
  });

  it('opens the Add Office page when Create is clicked on the branches page', async () => {
    const fixture: ComponentFixture<OrgBranches> = TestBed.createComponent(OrgBranches);
    await fixture.whenStable();

    const create = fixture.nativeElement.querySelector(
      '.og-page-actions .btn-primary'
    ) as HTMLButtonElement;
    expect(create).toBeTruthy();
    expect(create.textContent).toContain('Create');

    create.click();
    await fixture.whenStable();

    expect(router.url).toBe(ADD_OFFICE_PATH);
    // not swallowed by the wildcard route
    expect(router.url).not.toBe('/app/dashboard');
  });

  it('goes back to the branches list from the Add Office page', async () => {
    const fixture: ComponentFixture<OrgAddOffice> = TestBed.createComponent(OrgAddOffice);
    await fixture.whenStable();

    await router.navigateByUrl(ADD_OFFICE_PATH);
    await fixture.whenStable();

    const back = fixture.nativeElement.querySelector('.ao-head .btn-secondary') as HTMLButtonElement;
    expect(back).toBeTruthy();

    back.click();
    await fixture.whenStable();

    expect(router.url).toBe(OFFICES_PATH);
  });
});