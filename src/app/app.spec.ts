import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AssignmentBoard } from './pages/Donor & Leads/Assignment_Board/assignment-board';
import { NewFollowUp } from './pages/Donor & Leads/New_FollowUp/new-follow-up';
import { FollowUpPlanner } from './pages/Donor & Leads/Follow_Planner/follow-up-planner';
import { FollowUps } from './pages/Donor & Leads/Follow_Ups/follow-ups';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the app brand', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.hd-brand-text strong')?.textContent).toContain('OtoSolve');
  });
});

describe('Follow-up routes', () => {
  const comp = (path: string) => routes.find((r) => r.path === path)?.component;

  it('routes the follow-up queue, new follow-up, planner and assignment board', () => {
    expect(comp('app/fundraising/relationships/follow-up-queue')).toBe(FollowUps);
    expect(comp('app/fundraising/relationships/follow-up-queue/new')).toBe(NewFollowUp);
    expect(comp('app/fundraising/relationships/follow-up-queue/plan')).toBe(FollowUpPlanner);
    expect(comp('app/fundraising/relationships/assignment-board')).toBe(AssignmentBoard);
  });
});
