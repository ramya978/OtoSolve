/* =====================================================================================================
   DEMO DATA for the mock API.

   Generated from a fixed seed relative to "now", so a fresh browser always gets the same spread of
   tickets: a year of history, mostly closed, and a working queue of recent tickets in every status
   with SLA clocks on track, at risk and breached.
   ===================================================================================================== */
import {
  Agent, Customer, HistoryKind, KbArticle, Sentiment, Team, Ticket, TicketCategory, TicketChannel,
  TicketHistoryEntry, TicketPriority, TicketStatus, TicketType,
} from '../models/ticket.model';
import { TicketComment } from '../models/comment.model';
import { TicketAttachment } from '../models/attachment.model';
import { DEFAULT_SLA_POLICIES, SLA_PAUSED_STATUSES, SlaPolicy } from '../models/sla.model';

export interface DemoDatabase {
  version: number;
  counter: number;
  tickets: Ticket[];
  comments: TicketComment[];
  attachments: TicketAttachment[];
  history: TicketHistoryEntry[];
  policies: SlaPolicy[];
  /** Soft-deleted ticket ids. */
  deleted: string[];
}

export const DEMO_SCHEMA_VERSION = 1;

export const TEAMS: readonly Team[] = [
  { id: 't1', name: 'Support L1' },
  { id: 't2', name: 'Support L2' },
  { id: 't3', name: 'Payments' },
  { id: 't4', name: 'Platform' },
];

export const AGENTS: readonly Agent[] = [
  { id: 'a1', name: 'Aarthi Nair', initials: 'AN', email: 'aarthi.nair@example.org', teamId: 't1', role: 'Agent', skills: ['Technical', 'Account', 'General'], capacity: 12, available: true },
  { id: 'a2', name: 'Bhaskar Menon', initials: 'BM', email: 'bhaskar.menon@example.org', teamId: 't1', role: 'Agent', skills: ['Billing', 'Donation', 'General'], capacity: 10, available: true },
  { id: 'a3', name: 'Chitra Rao', initials: 'CR', email: 'chitra.rao@example.org', teamId: 't2', role: 'Agent', skills: ['Technical', 'Feature Request'], capacity: 8, available: true },
  { id: 'a4', name: 'Dev Malhotra', initials: 'DM', email: 'dev.malhotra@example.org', teamId: 't3', role: 'Agent', skills: ['Billing', 'Donation'], capacity: 10, available: true },
  { id: 'a5', name: 'Esha Kulkarni', initials: 'EK', email: 'esha.kulkarni@example.org', teamId: 't1', role: 'Agent', skills: ['Account', 'General'], capacity: 10, available: false },
  { id: 'a6', name: 'Farhan Qureshi', initials: 'FQ', email: 'farhan.qureshi@example.org', teamId: 't4', role: 'Agent', skills: ['Technical', 'Feature Request', 'Account'], capacity: 8, available: true },
  { id: 'm1', name: 'Gayatri Iyer', initials: 'GI', email: 'gayatri.iyer@example.org', teamId: 't1', role: 'Manager', skills: ['General', 'Billing'], capacity: 6, available: true },
  { id: 'm2', name: 'Harish Pillai', initials: 'HP', email: 'harish.pillai@example.org', teamId: 't2', role: 'Admin', skills: ['Technical'], capacity: 4, available: true },
];

export const CUSTOMERS: readonly Customer[] = [
  { id: 'c1', name: 'Priya Sharma', initials: 'PS', email: 'priya@hopefoundation.example', phone: '+91 98450 11223', organisation: 'Hope Foundation', tier: 'VIP', since: '2021-04-12' },
  { id: 'c2', name: 'Rohan Kapoor', initials: 'RK', email: 'rohan@sevatrust.example', phone: '+91 98200 44556', organisation: 'Seva Trust', tier: 'Premium', since: '2022-01-20' },
  { id: 'c3', name: 'Anjali Nair', initials: 'AN', email: 'anjali@greenearth.example', phone: '+91 94470 77889', organisation: 'Green Earth Society', tier: 'Standard', since: '2023-06-02' },
  { id: 'c4', name: 'Vikram Anand', initials: 'VA', email: 'vikram@brightfutures.example', phone: '+91 99000 12121', organisation: 'Bright Futures', tier: 'Premium', since: '2020-11-18' },
  { id: 'c5', name: 'Sneha Patel', initials: 'SP', email: 'sneha@annapurna.example', phone: '+91 98790 34343', organisation: 'Annapurna Kitchens', tier: 'Standard', since: '2024-02-09' },
  { id: 'c6', name: 'Kabir Singh', initials: 'KS', email: 'kabir@lifeline.example', phone: '+91 98110 56565', organisation: 'Lifeline Blood Bank', tier: 'VIP', since: '2019-08-30' },
  { id: 'c7', name: 'Meera Joshi', initials: 'MJ', email: 'meera@shiksha.example', phone: '+91 97300 78787', organisation: 'Shiksha Initiative', tier: 'Standard', since: '2023-10-14' },
  { id: 'c8', name: 'Arjun Reddy', initials: 'AR', email: 'arjun@wildlifewatch.example', phone: '+91 90000 90909', organisation: 'Wildlife Watch', tier: 'Standard', since: '2022-07-07' },
  { id: 'c9', name: 'Divya Menon', initials: 'DM', email: 'divya@careconnect.example', phone: '+91 94000 13579', organisation: 'CareConnect', tier: 'Premium', since: '2021-12-01' },
  { id: 'c10', name: 'Rahul Verma', initials: 'RV', email: 'rahul@cleanrivers.example', phone: '+91 98990 24680', organisation: 'Clean Rivers Trust', tier: 'Standard', since: '2024-05-21' },
  { id: 'c11', name: 'Nisha Gupta', initials: 'NG', email: 'nisha@ashakiran.example', phone: '+91 98300 11335', organisation: 'Asha Kiran', tier: 'Standard', since: '2023-03-16' },
  { id: 'c12', name: 'Sameer Khan', initials: 'SK', email: 'sameer@ruralhealth.example', phone: '+91 97000 55779', organisation: 'Rural Health Mission', tier: 'Premium', since: '2020-09-09' },
];

export const KB_ARTICLES: readonly KbArticle[] = [
  { id: 'kb1', title: 'Fixing a blank donation page on mobile browsers', summary: 'Clear the cached page, check the campaign is published, and confirm the payment widget domain is allow-listed.', category: 'Technical', keywords: ['donation', 'page', 'blank', 'mobile', 'browser', 'screen'], views: 1840 },
  { id: 'kb2', title: 'Regenerating an 80G receipt with corrected donor details', summary: 'Edit the donor PAN or address, then use Receipts → Regenerate. The old receipt number is voided and logged.', category: 'Donation', keywords: ['80g', 'receipt', 'pan', 'wrong', 'regenerate', 'donor'], views: 2310 },
  { id: 'kb3', title: 'Why a payment was charged twice and how to refund it', summary: 'Duplicate charges come from a retried gateway callback. Match both transaction ids, then refund the later one from Payments.', category: 'Billing', keywords: ['charged', 'twice', 'duplicate', 'refund', 'payment', 'gateway'], views: 1520 },
  { id: 'kb4', title: 'Resetting multi-factor authentication for a user', summary: 'An organisation admin can reset MFA from Users & Access → user → Security. The user enrols again at next sign-in.', category: 'Account', keywords: ['mfa', 'two-factor', 'locked', 'sign', 'login', 'code', 'device'], views: 2975 },
  { id: 'kb5', title: 'Bulk donor import: reading the error report', summary: 'The import stops at the first invalid row. Download the error report, fix the flagged columns and re-upload from that row.', category: 'Technical', keywords: ['import', 'bulk', 'donor', 'row', 'fails', 'csv'], views: 1210 },
  { id: 'kb6', title: 'WhatsApp receipts: delivery statuses explained', summary: 'Sent, delivered and read come from the WhatsApp provider. "Failed" usually means the template is not approved or the number has opted out.', category: 'Technical', keywords: ['whatsapp', 'receipt', 'delivered', 'message', 'template'], views: 980 },
  { id: 'kb7', title: 'When recurring donations are charged', summary: 'Mandates are charged on the chosen day at 06:00 IST. A failed charge retries twice, 24 hours apart, then notifies the donor.', category: 'Donation', keywords: ['recurring', 'mandate', 'charged', 'monthly', 'donation'], views: 1430 },
  { id: 'kb8', title: 'Archiving a finished campaign', summary: 'Close the campaign first, then Archive from the campaign register. Archived campaigns keep their reports and receipts.', category: 'General', keywords: ['archive', 'campaign', 'old', 'close'], views: 640 },
  { id: 'kb9', title: 'Adding or removing an organisation admin', summary: 'Only an existing admin can grant the Organisation Admin role. The change is recorded in the audit log.', category: 'Account', keywords: ['admin', 'organisation', 'add', 'role', 'user'], views: 870 },
  { id: 'kb10', title: 'Large report exports and time-outs', summary: 'Exports above 50,000 rows run in the background; you get a notification with the file when it is ready.', category: 'Technical', keywords: ['export', 'report', 'timeout', 'large', 'excel'], views: 760 },
];

interface Template {
  subject: string;
  body: string;
  category: TicketCategory;
  type: TicketType;
  priority: TicketPriority;
  sentiment: Sentiment;
  tags: string[];
}

const TEMPLATES: readonly Template[] = [
  { subject: 'Donation page shows a blank screen on mobile', body: 'Since this morning our donation page opens as a blank white screen on Android phones. Desktop works. We have a campaign going live tonight, so this is urgent.', category: 'Technical', type: 'Incident', priority: 'Critical', sentiment: 'Urgent', tags: ['donation-page', 'mobile'] },
  { subject: 'Campaign QR code returns a 404 page', body: 'The QR code printed on our posters opens a "page not found" error. The campaign is published and the link worked last week.', category: 'Technical', type: 'Bug', priority: 'High', sentiment: 'Negative', tags: ['campaign', 'qr'] },
  { subject: 'WhatsApp receipts are not being delivered', body: 'Donors say they no longer get the WhatsApp receipt after paying. Email receipts still arrive. Can you check the delivery status?', category: 'Technical', type: 'Incident', priority: 'High', sentiment: 'Negative', tags: ['whatsapp', 'receipts'] },
  { subject: 'Bulk donor import fails at row 412', body: 'Uploading our donor spreadsheet stops at row 412 with "invalid value". I cannot see anything wrong with that row.', category: 'Technical', type: 'Bug', priority: 'Medium', sentiment: 'Neutral', tags: ['import'] },
  { subject: 'Dashboard totals do not match the export', body: 'The dashboard shows ₹4,82,000 for October but the Excel export adds up to ₹4,76,500. Which one is right?', category: 'Technical', type: 'Question', priority: 'Medium', sentiment: 'Neutral', tags: ['reports'] },
  { subject: 'Report export times out for last year', body: 'Exporting all donations for the last financial year spins for a few minutes and then fails. We need it for our audit.', category: 'Technical', type: 'Incident', priority: 'High', sentiment: 'Negative', tags: ['export', 'audit'] },
  { subject: 'Two-factor code never arrives by SMS', body: 'I am locked out because the sign-in code is not reaching my phone. I tried three times.', category: 'Account', type: 'Incident', priority: 'High', sentiment: 'Urgent', tags: ['mfa', 'login'] },
  { subject: 'Charged twice for the annual plan', body: 'Our card was charged twice for the annual subscription on the same day. Please refund the duplicate payment.', category: 'Billing', type: 'Request', priority: 'High', sentiment: 'Negative', tags: ['refund'] },
  { subject: 'Invoice is missing our GST number', body: 'The latest invoice does not show our GSTIN. Could you reissue it with the number on file?', category: 'Billing', type: 'Request', priority: 'Low', sentiment: 'Neutral', tags: ['invoice', 'gst'] },
  { subject: 'Refund for a duplicate donation has not arrived', body: 'A donor paid twice by mistake. The refund was promised ten days ago but the donor has not received it and is upset.', category: 'Billing', type: 'Incident', priority: 'High', sentiment: 'Negative', tags: ['refund', 'donor'] },
  { subject: 'Payment gateway settlement is two days late', body: 'Settlements usually arrive the next working day. Monday and Tuesday collections have still not been credited.', category: 'Billing', type: 'Question', priority: 'Medium', sentiment: 'Neutral', tags: ['settlement'] },
  { subject: 'Cannot sign in after resetting my password', body: 'I reset my password using the email link, but the new password is rejected on the sign-in page.', category: 'Account', type: 'Incident', priority: 'Medium', sentiment: 'Negative', tags: ['login'] },
  { subject: 'Please add a second organisation admin', body: 'Our treasurer needs admin access while I am on leave next month. How do we set that up?', category: 'Account', type: 'Request', priority: 'Low', sentiment: 'Positive', tags: ['admin'] },
  { subject: 'User locked out after changing phones', body: 'One of our staff changed phones and the authenticator app no longer works. Can you reset her MFA?', category: 'Account', type: 'Request', priority: 'Medium', sentiment: 'Neutral', tags: ['mfa'] },
  { subject: '80G receipt shows the wrong PAN', body: 'A donor received an 80G receipt with someone else\'s PAN number. We need a corrected receipt quickly for their tax filing.', category: 'Donation', type: 'Incident', priority: 'High', sentiment: 'Urgent', tags: ['80g', 'receipt'] },
  { subject: 'Recurring donation was not charged this month', body: 'A monthly donor says nothing was debited on the 5th. The mandate shows as active.', category: 'Donation', type: 'Question', priority: 'Medium', sentiment: 'Neutral', tags: ['recurring'] },
  { subject: 'Donor wants all receipts merged into one', body: 'A long-time donor asked for one consolidated receipt for the year instead of twelve monthly ones. Is that possible?', category: 'Donation', type: 'Request', priority: 'Low', sentiment: 'Positive', tags: ['receipt'] },
  { subject: 'Offline cheque donation missing from donor history', body: 'We recorded a cheque donation yesterday but it does not appear on the donor\'s profile or in the campaign total.', category: 'Donation', type: 'Bug', priority: 'Medium', sentiment: 'Neutral', tags: ['offline', 'donor-360'] },
  { subject: 'Export follow-ups to Excel', body: 'It would help our volunteers if the follow-up queue could be exported to Excel with notes.', category: 'Feature Request', type: 'Change Request', priority: 'Low', sentiment: 'Positive', tags: ['follow-ups'] },
  { subject: 'Add Hindi to the donation form', body: 'Many of our donors prefer Hindi. Could the public donation form offer a language switch?', category: 'Feature Request', type: 'Change Request', priority: 'Low', sentiment: 'Positive', tags: ['i18n'] },
  { subject: 'Schedule campaign emails in advance', body: 'We would like to schedule the campaign launch email for a set date and time rather than sending it manually.', category: 'Feature Request', type: 'Change Request', priority: 'Medium', sentiment: 'Positive', tags: ['email'] },
  { subject: 'How do I archive an old campaign?', body: 'We have several campaigns from 2023 that are finished. How do we archive them without losing reports?', category: 'General', type: 'Question', priority: 'Low', sentiment: 'Neutral', tags: ['campaign'] },
  { subject: 'Training session for new volunteers', body: 'We have six new volunteers joining. Could someone run a 30-minute walkthrough of the donor screens?', category: 'General', type: 'Request', priority: 'Low', sentiment: 'Positive', tags: ['training'] },
  { subject: 'Where can I see who changed a donor record?', body: 'A donor\'s address was changed and nobody remembers doing it. Is there a log of edits?', category: 'General', type: 'Question', priority: 'Medium', sentiment: 'Neutral', tags: ['audit'] },
];

const STAFF_REPLIES: readonly string[] = [
  'Thanks for reporting this. I am looking into it now and will update you within the hour.',
  'I have reproduced the issue on our side and raised it with the platform team.',
  'Could you share a screenshot and the approximate time you saw this? That will help us trace it.',
  'We have applied a fix. Could you check again and let us know if it works for you?',
];

const INTERNAL_NOTES: readonly string[] = [
  'Checked gateway logs: two callbacks 4 seconds apart for the same order.',
  'Looks related to last night\'s deployment. Linking to the release notes.',
  'Customer is VIP. Keeping the manager in the loop.',
  'Waiting for the payments team to confirm the settlement batch id.',
];

const RESOLUTIONS: readonly string[] = [
  'Cleared the cached campaign page and republished. Verified on Android Chrome and Safari.',
  'Refund of the duplicate charge issued; reference shared with the customer.',
  'Reset MFA for the user and confirmed they re-enrolled successfully.',
  'Corrected the donor PAN and regenerated the 80G receipt. Old receipt voided.',
  'Explained the steps and shared the knowledge-base article. Customer confirmed it is clear.',
];

/** Small deterministic PRNG so every fresh browser sees the same demo. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const TEAM_FOR: Readonly<Record<TicketCategory, string>> = {
  Technical: 't2', Billing: 't3', Account: 't1', Donation: 't3', 'Feature Request': 't4', General: 't1',
};

export function buildDemoDatabase(now = Date.now()): DemoDatabase {
  const rand = mulberry32(20261112);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const weighted = <T>(entries: readonly [T, number][]): T => {
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let r = rand() * total;
    for (const [v, w] of entries) { if ((r -= w) <= 0) return v; }
    return entries[entries.length - 1][0];
  };

  const tickets: Ticket[] = [];
  const comments: TicketComment[] = [];
  const history: TicketHistoryEntry[] = [];
  const attachments: TicketAttachment[] = [];
  let hId = 0;
  let cId = 0;
  const addHistory = (ticketId: string, at: number, actor: { id: string; name: string }, kind: HistoryKind, extra: Partial<TicketHistoryEntry> = {}) => {
    history.push({ id: `h${++hId}`, ticketId, at: iso(at), actorId: actor.id, actorName: actor.name, kind, ...extra });
  };

  const COUNT = 84;
  for (let i = 0; i < COUNT; i++) {
    const tpl = TEMPLATES[(i * 7 + Math.floor(rand() * 5)) % TEMPLATES.length];
    const customer = pick(CUSTOMERS);
    const recent = i >= COUNT - 30;
    // Recent tickets cluster in the last week (some only hours old); older ones spread over a year.
    const ageMs = recent ? rand() * rand() * 7 * DAY + 0.3 * HOUR : (8 + Math.pow(rand(), 1.4) * 355) * DAY;
    const created = now - ageMs;
    const priority: TicketPriority = rand() < 0.65 ? tpl.priority : pick(['Critical', 'High', 'Medium', 'Low'] as const);
    const policy = DEFAULT_SLA_POLICIES.find((p) => p.priority === priority)!;

    const status: TicketStatus = recent
      ? weighted<TicketStatus>([
          ['New', 3], ['Open', 3], ['Assigned', 4], ['In Progress', 6], ['Pending Customer', 3],
          ['Pending Approval', 2], ['On Hold', 1], ['Escalated', 3], ['Resolved', 3], ['Reopened', 1], ['Closed', 1],
        ])
      : weighted<TicketStatus>([['Closed', 80], ['Resolved', 6], ['Cancelled', 5], ['Escalated', 1], ['In Progress', 1]]);

    const teamId = TEAM_FOR[tpl.category];
    const skilled = AGENTS.filter((a) => a.role === 'Agent' && a.skills.includes(tpl.category));
    const unassigned = status === 'New' || (status === 'Open' && rand() < 0.6);
    const agent = unassigned ? null : (pick(skilled.length ? skilled : AGENTS));

    const responded = !['New', 'Open'].includes(status) || (status === 'Open' && rand() < 0.3);
    const frAt = responded ? Math.min(now - 60_000, created + rand() * policy.firstResponseMins * 60_000 * 1.35) : null;

    const done = ['Resolved', 'Closed'].includes(status);
    const resolvedAt = done ? Math.min(now - 5 * 60_000, created + (0.15 + rand() * 1.3) * policy.resolutionMins * 60_000) : null;
    const closedAt = status === 'Closed' ? Math.min(now - 60_000, (resolvedAt ?? created) + (0.5 + rand() * 2.5) * DAY)
      : status === 'Cancelled' ? created + rand() * 2 * DAY : null;

    const paused = SLA_PAUSED_STATUSES.includes(status);
    const pausedAt = paused ? Math.max(created + 10 * 60_000, now - rand() * 8 * HOUR) : null;
    const slaPausedMs = rand() < 0.3 ? Math.floor(rand() * 4 * HOUR) : 0;

    const lastTouch = Math.max(created, frAt ?? 0, resolvedAt ?? 0, closedAt ?? 0, pausedAt ?? 0);
    const updated = Math.min(now - 30_000, lastTouch + (done ? 0 : rand() * 3 * HOUR));

    const id = `tk${1001 + i}`;
    const number = `TK-${1001 + i}`;
    const watchers = rand() < 0.25 ? ['m1'] : [];
    const isStaff = (a: Agent | null) => a ?? AGENTS[0];

    // conversation
    const thread: TicketComment[] = [{
      id: `cm${++cId}`, ticketId: id, authorId: customer.id, authorName: customer.name, fromStaff: false,
      body: tpl.body, visibility: 'public', mentions: [], attachmentIds: [], createdAt: iso(created),
    }];
    if (frAt) {
      thread.push({ id: `cm${++cId}`, ticketId: id, authorId: isStaff(agent).id, authorName: isStaff(agent).name, fromStaff: true, body: pick(STAFF_REPLIES), visibility: 'public', mentions: [], attachmentIds: [], createdAt: iso(frAt) });
    }
    if (rand() < 0.45 && frAt) {
      thread.push({ id: `cm${++cId}`, ticketId: id, authorId: isStaff(agent).id, authorName: isStaff(agent).name, fromStaff: true, body: pick(INTERNAL_NOTES), visibility: 'internal', mentions: rand() < 0.4 ? ['m1'] : [], attachmentIds: [], createdAt: iso(frAt + 20 * 60_000) });
    }
    if (status === 'Pending Customer' && pausedAt) {
      thread.push({ id: `cm${++cId}`, ticketId: id, authorId: isStaff(agent).id, authorName: isStaff(agent).name, fromStaff: true, body: 'Could you confirm the transaction id and the donor\'s registered email? I will continue as soon as I hear back.', visibility: 'public', mentions: [], attachmentIds: [], createdAt: iso(pausedAt) });
    }
    const resolution = pick(RESOLUTIONS);
    if (resolvedAt) {
      thread.push({ id: `cm${++cId}`, ticketId: id, authorId: isStaff(agent).id, authorName: isStaff(agent).name, fromStaff: true, body: `Resolved: ${resolution}`, visibility: 'public', mentions: [], attachmentIds: [], createdAt: iso(resolvedAt) });
    }
    if (status === 'Reopened') {
      thread.push({ id: `cm${++cId}`, ticketId: id, authorId: customer.id, authorName: customer.name, fromStaff: false, body: 'This has started happening again since yesterday.', visibility: 'public', mentions: [], attachmentIds: [], createdAt: iso(updated) });
    }
    comments.push(...thread);

    if (rand() < 0.2) {
      attachments.push({ id: `at${i}`, ticketId: id, name: pick(['screenshot.png', 'gateway-log.txt', 'donor-import.csv', 'receipt.pdf']), size: Math.floor(30_000 + rand() * 900_000), mime: 'application/octet-stream', uploadedBy: customer.name, uploadedAt: iso(created + 2 * 60_000), url: null });
    }

    // audit trail
    const sys = { id: 'system', name: 'System' };
    const actor = agent ? { id: agent.id, name: agent.name } : sys;
    addHistory(id, created, { id: customer.id, name: customer.name }, 'created', { note: `Created via ${tpl.category === 'Account' ? 'Portal' : 'Email'}` });
    if (!['New'].includes(status)) addHistory(id, created + 5 * 60_000, sys, 'status', { field: 'status', from: 'New', to: 'Open' });
    if (agent) addHistory(id, created + 8 * 60_000, { id: 'm1', name: 'Gayatri Iyer' }, 'assignment', { field: 'assignee', from: null, to: agent.name });
    if (frAt) addHistory(id, frAt, actor, 'comment', { note: 'First public reply' });
    if (['In Progress', 'Pending Customer', 'Pending Approval', 'On Hold', 'Escalated', 'Resolved', 'Closed', 'Reopened'].includes(status)) {
      addHistory(id, (frAt ?? created) + 60_000, actor, 'status', { field: 'status', from: 'Assigned', to: 'In Progress' });
    }
    if (paused && pausedAt) addHistory(id, pausedAt, actor, 'status', { field: 'status', from: 'In Progress', to: status, note: 'SLA clock paused' });
    if (status === 'Escalated') addHistory(id, updated, actor, 'escalation', { field: 'status', from: 'In Progress', to: 'Escalated', note: 'Needs L2: affects several donors' });
    if (resolvedAt) addHistory(id, resolvedAt, actor, 'status', { field: 'status', from: 'In Progress', to: 'Resolved', note: resolution });
    if (closedAt && status === 'Closed') addHistory(id, closedAt, sys, 'status', { field: 'status', from: 'Resolved', to: 'Closed', note: 'Closed automatically after confirmation window' });
    if (status === 'Cancelled' && closedAt) addHistory(id, closedAt, actor, 'status', { field: 'status', from: 'Open', to: 'Cancelled', note: 'Duplicate of an existing ticket' });
    if (status === 'Reopened') addHistory(id, updated, { id: customer.id, name: customer.name }, 'status', { field: 'status', from: 'Resolved', to: 'Reopened', note: 'Customer reported it again' });

    const channel: TicketChannel = weighted<TicketChannel>([['Email', 5], ['Portal', 3], ['Phone', 2], ['WhatsApp', 2], ['Chat', 1]]);
    tickets.push({
      id, number, subject: tpl.subject, description: tpl.body, status, priority, category: tpl.category, type: tpl.type, channel,
      customerId: customer.id, assigneeId: agent?.id ?? null, teamId, watcherIds: watchers, tags: tpl.tags,
      createdAt: iso(created), updatedAt: iso(updated), firstResponseAt: frAt ? iso(frAt) : null,
      resolvedAt: resolvedAt ? iso(resolvedAt) : null, closedAt: closedAt ? iso(closedAt) : null,
      slaPausedMs, pausedAt: pausedAt ? iso(pausedAt) : null,
      reopenCount: status === 'Reopened' ? 1 : 0, escalationLevel: status === 'Escalated' ? 1 : 0,
      sentiment: status === 'Reopened' ? 'Negative' : tpl.sentiment,
      csat: done && rand() < 0.65 ? Math.max(1, Math.min(5, Math.round(3.4 + rand() * 1.9))) : null,
      mergedInto: null, commentCount: thread.length, attachmentCount: attachments.filter((a) => a.ticketId === id).length, version: 1,
    });
  }

  return {
    version: DEMO_SCHEMA_VERSION,
    counter: 1001 + COUNT,
    tickets,
    comments,
    attachments,
    history,
    policies: DEFAULT_SLA_POLICIES.map((p) => ({ ...p })),
    deleted: [],
  };
}
