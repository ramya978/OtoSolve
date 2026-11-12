import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthTokenService } from '../../Shared/services/auth-token.service';
import { MockTicketApi } from './data/mock-ticket-api';
import { TicketApiError } from './data/ticket-api';
import { TicketAccessService } from './services/ticket-access.service';
import { EMPTY_QUERY, Ticket } from './models/ticket.model';
import { DEFAULT_SLA_POLICIES } from './models/sla.model';
import { computeSla, formatDuration } from './utils/sla';
import { transitionProblem, nextStatuses } from './utils/workflow';
import { csvText, xlsxBlob } from './utils/export';

const HOUR = 3_600_000;

function ticket(over: Partial<Ticket> = {}): Ticket {
  const now = Date.now();
  return {
    id: 't', number: 'TK-1', subject: 'Subject here', description: 'A description', status: 'In Progress', priority: 'High',
    category: 'Technical', type: 'Incident', channel: 'Email', customerId: 'c1', assigneeId: 'a1', teamId: 't1', watcherIds: [], tags: [],
    createdAt: new Date(now - HOUR).toISOString(), updatedAt: new Date(now).toISOString(), firstResponseAt: null, resolvedAt: null, closedAt: null,
    slaPausedMs: 0, pausedAt: null, reopenCount: 0, escalationLevel: 0, sentiment: 'Neutral', csat: null, mergedInto: null,
    commentCount: 1, attachmentCount: 0, version: 1, ...over,
  };
}

describe('Tickets workflow', () => {
  it('only closes a ticket that has been resolved', () => {
    expect(nextStatuses('In Progress')).not.toContain('Closed');
    expect(transitionProblem(ticket({ status: 'In Progress' }), { to: 'Closed' })).toContain("can't move to Closed");
    expect(transitionProblem(ticket({ status: 'Resolved' }), { to: 'Closed' })).toBeNull();
  });

  it('asks for a resolution and a reason where the rules need them', () => {
    expect(transitionProblem(ticket(), { to: 'Resolved' })).toContain('resolution');
    expect(transitionProblem(ticket(), { to: 'Resolved', resolution: 'Restarted the gateway sync' })).toBeNull();
    expect(transitionProblem(ticket(), { to: 'Escalated' })).toContain('reason');
  });

  it('refuses to reopen after the reopen window', () => {
    const old = ticket({ status: 'Closed', closedAt: new Date(Date.now() - 40 * 24 * HOUR).toISOString() });
    expect(transitionProblem(old, { to: 'Reopened', reason: 'It is back again' })).toContain('30 days');
    const recent = ticket({ status: 'Closed', closedAt: new Date(Date.now() - 2 * 24 * HOUR).toISOString() });
    expect(transitionProblem(recent, { to: 'Reopened', reason: 'It is back again' })).toBeNull();
  });
});

describe('Tickets SLA clocks', () => {
  const now = Date.now();
  const high = DEFAULT_SLA_POLICIES.find((p) => p.priority === 'High')!; // 4h response, 24h resolution

  it('is on track early, amber from 75% and red past the target', () => {
    expect(computeSla(ticket({ createdAt: new Date(now - 1 * HOUR).toISOString() }), DEFAULT_SLA_POLICIES, now).firstResponse.state).toBe('on-track');
    expect(computeSla(ticket({ createdAt: new Date(now - 3.5 * HOUR).toISOString() }), DEFAULT_SLA_POLICIES, now).firstResponse.state).toBe('warning');
    const late = computeSla(ticket({ createdAt: new Date(now - 5 * HOUR).toISOString() }), DEFAULT_SLA_POLICIES, now);
    expect(late.firstResponse.state).toBe('breached');
    expect(late.light).toBe('red');
    expect(high.firstResponseMins).toBe(240);
  });

  it('does not count waiting time against the resolution target', () => {
    const t = ticket({
      status: 'Pending Customer', firstResponseAt: new Date(now - 29 * HOUR).toISOString(),
      createdAt: new Date(now - 30 * HOUR).toISOString(), slaPausedMs: 10 * HOUR, pausedAt: new Date(now - 2 * HOUR).toISOString(),
    });
    const s = computeSla(t, DEFAULT_SLA_POLICIES, now);
    // 30h elapsed − 12h paused = 18h of a 24h target: paused, not breached.
    expect(s.resolution.state).toBe('paused');
    expect(Math.round(s.resolution.elapsedMs / HOUR)).toBe(18);
  });

  it('reports met or missed once the clock stops', () => {
    const created = now - 30 * HOUR;
    const met = ticket({ status: 'Resolved', createdAt: new Date(created).toISOString(), firstResponseAt: new Date(created + HOUR).toISOString(), resolvedAt: new Date(created + 20 * HOUR).toISOString() });
    const missed = ticket({ status: 'Resolved', createdAt: new Date(created).toISOString(), firstResponseAt: new Date(created + HOUR).toISOString(), resolvedAt: new Date(created + 28 * HOUR).toISOString() });
    expect(computeSla(met, DEFAULT_SLA_POLICIES, now).resolution.state).toBe('met');
    expect(computeSla(missed, DEFAULT_SLA_POLICIES, now).resolution.state).toBe('missed');
  });

  it('formats durations for badges', () => {
    expect(formatDuration(2 * HOUR + 14 * 60_000)).toBe('2h 14m');
    expect(formatDuration(3 * 24 * HOUR + 4 * HOUR)).toBe('3d 4h');
    expect(formatDuration(20_000)).toBe('under 1m');
  });
});

describe('Tickets export', () => {
  it('quotes CSV cells and neutralises spreadsheet formulas', () => {
    const csv = csvText(['A', 'B'], [['=1+1', 'say "hi"'], [3, null]]);
    expect(csv).toBe('"A","B"\r\n"\'=1+1","say ""hi"""\r\n"3",""');
  });

  it('writes a ZIP-packaged .xlsx with a worksheet', async () => {
    const blob = xlsxBlob('Tickets', ['ID', 'Subject'], [['TK-1', 'Donation page <blank> & slow']]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('Donation page &lt;blank&gt; &amp; slow');
    // End-of-central-directory record: six parts, and its offset points at a central-directory header.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 5 && bytes[i + 3] === 6) { eocd = i; break; }
    }
    expect(eocd).toBe(bytes.length - 22);
    const view = new DataView(bytes.buffer, eocd);
    expect(view.getUint16(10, true)).toBe(6);
    const cdOffset = view.getUint32(16, true);
    expect([...bytes.slice(cdOffset, cdOffset + 4)]).toEqual([0x50, 0x4b, 1, 2]);
    expect(cdOffset + view.getUint32(12, true)).toBe(eocd);
  });
});

describe('Tickets demo API', () => {
  let api: MockTicketApi;
  let access: TicketAccessService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        MockTicketApi,
        {
          provide: AuthTokenService,
          useValue: { isSuperAdmin: signal(false), isTenantAdmin: signal(true), displayName: signal('Test Admin'), hasPermission: () => true },
        },
      ],
    });
    api = TestBed.inject(MockTicketApi);
    access = TestBed.inject(TicketAccessService);
  });

  it('pages and filters on the server side', async () => {
    const page = await firstValueFrom(api.list({ ...EMPTY_QUERY, pageSize: 10 }));
    expect(page.items.length).toBe(10);
    expect(page.total).toBeGreaterThan(50);
    const critical = await firstValueFrom(api.list({ ...EMPTY_QUERY, priorities: ['Critical'], pageSize: 500 }));
    expect(critical.items.every((t) => t.priority === 'Critical')).toBe(true);
  });

  it('rejects a transition the workflow does not allow, with a readable reason', async () => {
    const page = await firstValueFrom(api.list({ ...EMPTY_QUERY, statuses: ['New'], pageSize: 1 }));
    const t = page.items[0];
    const err = await firstValueFrom(api.transition(t.id, { to: 'Closed' })).catch((e) => e);
    expect(err).toBeInstanceOf(TicketApiError);
    expect((err as TicketApiError).status).toBe(422);
  });

  it('creates a ticket, assigns it and records the history', async () => {
    const created = await firstValueFrom(api.create({
      subject: 'Receipts missing for March', description: 'Donors did not get receipts for March.', type: 'Incident', category: 'Donation',
      priority: 'High', channel: 'Email', customerId: 'c2', assigneeId: null, teamId: 't3', tags: [], watcherIds: [],
    }));
    expect(created.status).toBe('New');
    const assigned = await firstValueFrom(api.assign(created.id, 'a4'));
    expect(assigned.status).toBe('Assigned');
    const bundle = await firstValueFrom(api.get(created.id));
    expect(bundle.history.map((h) => h.kind)).toEqual(expect.arrayContaining(['created', 'assignment', 'status']));
  });

  it('refuses a stale update with 409', async () => {
    const t = (await firstValueFrom(api.list({ ...EMPTY_QUERY, statuses: ['In Progress'], pageSize: 1 }))).items[0];
    const draft = { subject: t.subject, description: t.description, type: t.type, category: t.category, priority: t.priority, channel: t.channel,
      customerId: t.customerId, assigneeId: t.assigneeId, teamId: t.teamId, tags: [...t.tags], watcherIds: [...t.watcherIds] };
    await firstValueFrom(api.update(t.id, draft, t.version));
    const err = await firstValueFrom(api.update(t.id, draft, t.version)).catch((e) => e);
    expect((err as TicketApiError).status).toBe(409);
  });

  it('shows a customer only their own tickets and no internal notes', async () => {
    access.setPreviewRole('Customer');
    const page = await firstValueFrom(api.list({ ...EMPTY_QUERY, pageSize: 1000 }));
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((t) => t.customerId === 'c1')).toBe(true);
    const bundle = await firstValueFrom(api.get(page.items[0].id));
    expect(bundle.comments.every((c) => c.visibility === 'public')).toBe(true);
    expect(bundle.history).toEqual([]);
  });
});
