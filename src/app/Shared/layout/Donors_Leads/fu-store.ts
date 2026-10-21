import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { DonorApiService } from '../../../Service/donor-api.service';
import { AuthService } from '../../Auth/auth.service';
import { DonLookupItem, FollowUp as ApiFollowUp, FollowUpQueueResponse } from '../../models/donor-contract.model';
import { fetchPages } from '../../services/paging';

/* =====================================================================================================
   FOLLOW-UP STORE - shared by Follow-ups (queue), New follow-up, Follow-up planner, Follow-up execution
   and Assignment board. Holds follow-ups, people (leads / donors) and owners as signals, loaded from the
   donor API, so a follow-up scheduled in the planner or reassigned on the board shows everywhere.
   ===================================================================================================== */

export type FuChannel = 'call' | 'email' | 'sms' | 'whatsapp' | 'post';
export type FuPriority = 'low' | 'normal' | 'high' | 'urgent';
export type FuStatus = 'pending' | 'rescheduled' | 'escalated' | 'completed' | 'partial' | 'no-response' | 'cancelled';
export type FuRecordType = 'lead' | 'donor';

export interface FuHistory { at: string; text: string; by: string; }

export interface FollowUp {
  id: string;               // FUP-2026-000682
  name: string;
  recordType: FuRecordType;
  recordCode: string;
  purpose: string;
  nextAction: string;
  channel: FuChannel;
  dueAt: string;            // yyyy-mm-ddThh:mm (local)
  createdAt: string;        // yyyy-mm-dd
  owner: string;
  priority: FuPriority;
  status: FuStatus;
  campaign: string;
  phone: string;
  email: string;
  blocked: boolean;         // e.g. consent missing for the channel
  escalatedTo: string | null;
  completedAt: string | null;
  history: FuHistory[];
  /** API id and concurrency version (the `id` above is the readable reference). */
  uid?: string;
  version?: number;
  mine?: boolean;
  recordId?: string;
}

export interface FuPerson {
  code: string;
  name: string;
  type: FuRecordType;
  stage: string;
  owner: string | null;
  email: string;
  phone: string;
  language: string;
  bestTime: string | null;
  campaign: string;
  region: string;
  consent: Partial<Record<FuChannel, boolean>>;
  slaDue: string | null;    // next action due (yyyy-mm-ddThh:mm)
  source: string;
  /** API id of the lead or donor. */
  id?: string;
}

export type FuMethod = 'call' | 'email' | 'sms' | 'whatsapp' | 'meeting' | 'visit';

/** What the person who did the follow-up reports back. */
export interface FuExecution {
  method: FuMethod;
  executedAt: string;              // yyyy-mm-ddThh:mm
  status: 'completed' | 'partial' | 'no-response';
  reason: string;
  outcome: string;
  engagement: 'low' | 'medium' | 'high';
  quality: 'poor' | 'average' | 'good' | 'excellent';
  notes: string;
  internalNotes: string;
  temperature: 'cold' | 'warm' | 'hot';
  stage: string;
  disposition: string;
  files: string[];
}

export interface FuOwner { name: string; team: string; managers?: boolean; }

export const FU_CHANNELS: { key: FuChannel; label: string; icon: string }[] = [
  { key: 'call', label: 'Call', icon: 'phone' },
  { key: 'email', label: 'E-mail', icon: 'mail' },
  { key: 'sms', label: 'SMS', icon: 'sms' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
  { key: 'post', label: 'Post', icon: 'post' }
];
export const FU_PRIORITIES: { key: FuPriority; label: string; tone: string }[] = [
  { key: 'low', label: 'Low', tone: 'muted' },
  { key: 'normal', label: 'Normal', tone: 'blue' },
  { key: 'high', label: 'High', tone: 'amber' },
  { key: 'urgent', label: 'Urgent', tone: 'red' }
];
export const FU_STATUSES: { key: FuStatus; label: string; tone: string; open: boolean }[] = [
  { key: 'pending', label: 'Pending', tone: 'blue', open: true },
  { key: 'rescheduled', label: 'Rescheduled', tone: 'primary', open: true },
  { key: 'escalated', label: 'Escalated', tone: 'amber', open: true },
  { key: 'completed', label: 'Completed', tone: 'green', open: false },
  { key: 'partial', label: 'Partially completed', tone: 'green', open: false },
  { key: 'no-response', label: 'No response', tone: 'muted', open: false },
  { key: 'cancelled', label: 'Cancelled', tone: 'muted', open: false }
];

/** Filled in place from the API (owner options), so pages that captured the array see the data. */
export const FU_OWNERS: FuOwner[] = [];
export const FU_MANAGERS: string[] = [];
export const CURRENT_USER = '';

/** Campaign names, filled in place from the API. */
export const FU_CAMPAIGNS: string[] = [];

export const FU_ICONS: Record<string, string> = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
  sms: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M8 10h.01 M12 10h.01 M16 10h.01',
  whatsapp: 'M3 21l1.7-5A9 9 0 1 1 8 19.3z M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-.8.8a4 4 0 0 1-2.3-2.3l.8-.8-1-2z',
  post: 'M3 7l9 6 9-6 M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-9-4z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  donor: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  back: 'M19 12H5 M12 19l-7-7 7-7',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  upright: 'M7 17 17 7 M8 7h9v9',
  chev: 'M6 9l6 6 6-6',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  filter: 'M3 5h18 M6 12h12 M10 19h4',
  sort: 'M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  board: 'M4 4h6v16H4z M14 4h6v10h-6z',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  more: 'M12 6h.01 M12 12h.01 M12 18h.01',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  reassign: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6',
  escalate: 'M7 17 17 7 M8 7h9v9',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l4 2',
  x: 'M18 6 6 18 M6 6l12 12',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  hourglass: 'M6 2h12 M6 22h12 M7 2v4l5 6-5 6v4 M17 2v4l-5 6 5 6v4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  shieldOff: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 9l6 6 M15 9l-6 6',
  undo: 'M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13',
  language: 'M5 8l6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6',
  note: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z',
  pin: 'M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  meeting: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1 M14 15h4a4 4 0 0 1 4 4v1',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  clip: 'M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9',
  thermo: 'M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'
};

/* ---------- helpers ---------- */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const isoAt = (d: Date) => `${isoDay(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const toDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00' : iso);
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function dayDiff(a: Date, b: Date): number {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((y - x) / 86400000);
}
export const fmtDate = (iso: string) => { const d = toDate(iso); return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtTime = (iso: string) => {
  const d = toDate(iso); const h = d.getHours();
  return `${pad2(h % 12 === 0 ? 12 : h % 12)}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
};
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const channelOf = (k: FuChannel) => FU_CHANNELS.find((c) => c.key === k)!;
export const priorityOf = (k: FuPriority) => FU_PRIORITIES.find((p) => p.key === k)!;
export const statusOf = (k: FuStatus) => FU_STATUSES.find((s) => s.key === k)!;
export const isOpen = (f: FollowUp) => statusOf(f.status).open;

/** Calendar weeks (Monday first) for a month - used by every custom date picker. */
export function monthWeeks(month: Date): { iso: string; day: number; out: boolean }[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, w * 7 + i);
      return { iso: isoDay(d), day: d.getDate(), out: d.getMonth() !== month.getMonth() };
    }));
}

/* ---------- API mapping ---------- */
const norm = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function channelKey(v: string | null | undefined): FuChannel {
  const n = norm(v);
  if (n.includes('whatsapp')) return 'whatsapp';
  if (n.includes('sms') || n.includes('text')) return 'sms';
  if (n.includes('mail') && !n.includes('post')) return 'email';
  if (n.includes('post') || n.includes('letter')) return 'post';
  return 'call';
}

function statusKey(v: string | null | undefined): FuStatus {
  const n = norm(v);
  if (n.startsWith('partial')) return 'partial';
  if (n.startsWith('noresponse')) return 'no-response';
  if (n.startsWith('resched')) return 'rescheduled';
  if (n.startsWith('escal')) return 'escalated';
  if (n.startsWith('complet')) return 'completed';
  if (n.startsWith('cancel')) return 'cancelled';
  return 'pending';
}

function priorityKey(v: string | null | undefined): FuPriority {
  const n = norm(v);
  return n === 'low' ? 'low' : n === 'high' ? 'high' : n === 'urgent' || n === 'critical' ? 'urgent' : 'normal';
}

const localIso = (utc: string | null | undefined): string => (utc ? isoAt(new Date(utc)) : '');

function toFollowUp(r: ApiFollowUp): FollowUp {
  const isLead = !!r.leadId;
  const open = r.isOpen;
  return {
    id: r.followUpReference,
    uid: r.id,
    version: r.version,
    mine: r.isAssignedToMe,
    recordId: (isLead ? r.leadId : r.donorId) ?? undefined,
    name: r.recordDisplayName ?? r.donorDisplayName ?? r.leadDisplayName ?? '',
    recordType: isLead ? 'lead' : 'donor',
    recordCode: (isLead ? r.leadReference : r.donorReference) ?? '',
    purpose: r.purpose ?? '',
    nextAction: r.nextAction ?? '',
    channel: channelKey(r.permittedChannel),
    dueAt: localIso(r.dueAtUtc),
    createdAt: r.createdAtUtc ? isoDay(new Date(r.createdAtUtc)) : '',
    owner: r.relationshipOwnerName ?? '',
    priority: priorityKey(r.priority),
    status: statusKey(r.queueStatus || r.status),
    campaign: r.campaignName ?? '',
    phone: r.contactPhone ?? '',
    email: r.contactEmail ?? '',
    blocked: open && !!r.consentWarning?.hasWarning &&
      (r.consentWarning.prohibitedChannels ?? []).some((c) => channelKey(c) === channelKey(r.permittedChannel)),
    escalatedTo: r.escalatedAtUtc ? (r.escalationReason ? 'Manager' : 'Manager') : null,
    completedAt: r.completedAtUtc ? localIso(r.completedAtUtc) : null,
    history: [...(r.history ?? [])].reverse().map((h) => ({
      at: localIso(h.occurredAtUtc),
      text: h.detail ? `${h.action} - ${h.detail}` : h.action,
      by: h.actorName ?? ''
    }))
  };
}

@Injectable({ providedIn: 'root' })
export class FollowUpStore {
  private readonly api = inject(DonorApiService);
  private readonly auth = inject(AuthService);

  readonly followUps = signal<FollowUp[]>([]);
  readonly people = signal<FuPerson[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** The server's lists (channels, execution statuses, reasons, dispositions ...). */
  readonly options = signal<FollowUpQueueResponse | null>(null);

  /** Same arrays as the exported constants - filled in place. */
  readonly owners = FU_OWNERS;
  readonly managers = FU_MANAGERS;
  readonly campaigns = FU_CAMPAIGNS;

  private readonly ownerIds = new Map<string, string>();
  private readonly managerIds = new Map<string, string>();

  get currentUser(): string { return this.auth.user()?.name ?? ''; }

  constructor() {
    this.reload();
  }

  /** Open work per owner (people each owner looks after). */
  readonly load = computed(() => {
    const map = new Map<string, number>();
    for (const o of FU_OWNERS) map.set(o.name, 0);
    for (const p of this.people()) if (p.owner) map.set(p.owner, (map.get(p.owner) ?? 0) + 1);
    return map;
  });

  person(code: string | null): FuPerson | null { return this.people().find((p) => p.code === code) ?? null; }
  find(id: string): FollowUp | null { return this.followUps().find((f) => f.id === id) ?? null; }

  ownerId(name: string): string { return this.ownerIds.get(name) ?? this.managerIds.get(name) ?? ''; }

  /** The server's value for one of the screen's channel keys (falls back to the key's word). */
  channelValue(key: FuChannel): string {
    const list = this.options()?.channelOptions ?? [];
    return list.find((o) => channelKey(o.value) === key || channelKey(o.label) === key)?.value
      ?? { call: 'Call', email: 'Email', sms: 'Sms', whatsapp: 'WhatsApp', post: 'Post' }[key];
  }

  /** The server option that matches a word the screen shows (by value or label), else the word itself. */
  pick(list: DonLookupItem[] | undefined, word: string): string {
    const n = norm(word);
    return (list ?? []).find((o) => norm(o.value) === n || norm(o.label) === n)?.value ?? word;
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getFollowUpQueue({}).subscribe({
      next: (r) => {
        this.options.set(r);
        this.followUps.set((r.followUps ?? []).map(toFollowUp));
        this.fillLists(r);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.error.set(e instanceof Error ? e.message : 'The follow-ups could not be loaded.');
      }
    });
    this.loadPeople();
  }

  private fillLists(r: FollowUpQueueResponse): void {
    FU_OWNERS.length = 0;
    FU_MANAGERS.length = 0;
    this.ownerIds.clear();
    this.managerIds.clear();
    for (const o of r.ownerOptions ?? []) {
      FU_OWNERS.push({ name: o.label, team: o.description ?? '' });
      FU_MANAGERS.push(o.label);
      this.ownerIds.set(o.label, o.value);
      this.managerIds.set(o.label, o.value);
    }
    FU_CAMPAIGNS.length = 0;
    for (const c of r.campaignOptions ?? []) FU_CAMPAIGNS.push(c.label);
  }

  private loadPeople(): void {
    const donors$ = fetchPages((page, size) => this.api.searchDonors({ page, pageSize: size }), 100, 1000).pipe(
      map(({ items }) => items.map((d): FuPerson => ({
        id: d.id, code: d.displayCode, name: d.displayName, type: 'donor', stage: d.status,
        owner: d.relationshipOwnerName, email: d.emailAddress ?? '', phone: d.mobileNumber ?? '', language: '',
        bestTime: null, campaign: d.campaignName ?? '', region: '', consent: {},
        slaDue: d.nextFollowUpDueUtc ? localIso(d.nextFollowUpDueUtc) : null, source: ''
      }))),
      catchError(() => of([] as FuPerson[]))
    );
    const leads$ = fetchPages(
      (page, size) => this.api.getLeadWorkQueue({ page, pageSize: size }).pipe(map((r) => r.leads)), 100, 1000
    ).pipe(
      map(({ items }) => items.map((l): FuPerson => ({
        id: l.id, code: l.leadReference, name: l.name, type: 'lead', stage: l.status,
        owner: l.ownerName, email: l.emailAddress ?? '', phone: l.mobileNumber ?? '', language: l.preferredLanguage ?? '',
        bestTime: null, campaign: l.campaignName ?? '', region: '', consent: {},
        slaDue: l.nextActionDueUtc ? localIso(l.nextActionDueUtc) : null, source: l.source ?? ''
      }))),
      catchError(() => of([] as FuPerson[]))
    );
    forkJoin([leads$, donors$]).subscribe(([leads, donors]) => this.people.set([...leads, ...donors]));
  }

  private replace(updated: ApiFollowUp): void {
    const next = toFollowUp(updated);
    this.followUps.update((list) => list.map((f) => (f.uid === next.uid ? next : f)));
  }

  private byRef(id: string): FollowUp {
    const f = this.find(id);
    if (!f?.uid) throw new Error('That follow-up is no longer in the list. Refresh and try again.');
    return f;
  }

  /** Reassigns each follow-up; the list is refreshed from what the server returns. */
  reassign(ids: string[], owner: string, reason: string): Observable<unknown> {
    const userId = this.ownerId(owner);
    return forkJoin(ids.map((id) => {
      const f = this.byRef(id);
      return this.api.assignFollowUp(f.uid!, {
        relationshipOwnerUserId: userId, relationshipOwnerName: owner,
        reason: reason.length >= 10 ? reason : (reason + ' - reassigned from the follow-up queue').trim(),
        expectedVersion: f.version
      }).pipe(tap((u) => this.replace(u)));
    }));
  }

  escalate(ids: string[], to: string, reason: string): Observable<unknown> {
    const userId = this.ownerId(to);
    return forkJoin(ids.map((id) => {
      const f = this.byRef(id);
      return this.api.escalateFollowUp(f.uid!, {
        escalateToUserId: userId, escalateToName: to,
        reason: reason.length >= 10 ? reason : (reason + ' - escalated from the follow-up queue').trim(),
        expectedVersion: f.version
      }).pipe(tap((u) => this.replace(u)));
    }));
  }

  /** "Mark done" from the queue: completes with a standard outcome note. */
  complete(id: string): Observable<unknown> {
    const f = this.byRef(id);
    const o = this.options();
    return this.api.completeFollowUp(f.uid!, {
      completionOutcome: 'Marked completed from the follow-up queue.',
      completedAtUtc: new Date().toISOString(),
      expectedVersion: f.version,
      executionStatus: this.pick(o?.executionStatusOptions, 'Completed')
    }).pipe(tap((u) => this.replace(u)));
  }

  /** Records what happened on a follow-up and closes it (completed / partial / no response). */
  execute(id: string, r: FuExecution): Observable<unknown> {
    const f = this.byRef(id);
    const o = this.options();
    const statusWord = r.status === 'completed' ? 'Completed' : r.status === 'partial' ? 'Partially completed' : 'No response';
    const methodWord = { call: 'Call', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', meeting: 'Meeting', visit: 'Visit' }[r.method];
    const qualityWord = r.quality.charAt(0).toUpperCase() + r.quality.slice(1);
    const engagementWord = r.engagement.charAt(0).toUpperCase() + r.engagement.slice(1);
    return this.api.completeFollowUp(f.uid!, {
      completionOutcome: (r.notes + (r.files.length ? '\nAttachments: ' + r.files.join(', ') : '')).slice(0, 2000),
      completedAtUtc: new Date(r.executedAt).toISOString(),
      expectedVersion: f.version,
      outcome: r.outcome,
      interactionType: this.pick(o?.contactChannelOptions, methodWord),
      direction: 'Outgoing',
      notes: r.internalNotes.trim() || null,
      engagementLevel: engagementWord,
      quality: qualityWord,
      attachmentName: r.files.length ? r.files.join(', ').slice(0, 260) : null,
      executionStatus: this.pick(o?.executionStatusOptions, statusWord),
      completionReason: this.pick(o?.completionReasonOptions, r.reason),
      disposition: this.pick(o?.dispositionOptions, r.disposition)
    }).pipe(tap((u) => this.replace(u)));
  }

  /** Assigns leads / donors to an owner (the Assignment board's own endpoint does the audited write). */
  assignPerson(codes: string[], owner: string, reason = 'Assigned from the assignment board.'): Observable<unknown> {
    const userId = this.ownerId(owner);
    return forkJoin(codes.map((code) => {
      const p = this.person(code);
      if (!p?.id) throw new Error('That record is no longer in the list.');
      const call = {
        recordType: p.type === 'donor' ? 'Donor' as const : 'Lead' as const,
        leadId: p.id, newOwnerUserId: userId, newOwnerName: owner, assignmentReason: reason
      };
      return (p.owner ? this.api.reassignFromBoard(call) : this.api.assignFromBoard(call)).pipe(
        tap(() => this.people.update((list) => list.map((x) => (x.code === code ? { ...x, owner } : x)))));
    }));
  }

  /** Schedules a follow-up. Resolves to the created follow-up; rejects with the server's message. */
  create(f: {
    person: FuPerson; owner: string; channel: FuChannel; dueAt: string; priority: FuPriority;
    purpose: string; nextAction: string; acknowledged: boolean;
  }): Observable<FollowUp> {
    const personId = f.person.id ?? '';
    return this.api.scheduleFollowUp({
      donorId: f.person.type === 'donor' ? personId : null,
      leadId: f.person.type === 'lead' ? personId : null,
      relationshipOwnerUserId: this.ownerId(f.owner) || null,
      relationshipOwnerName: f.owner,
      purpose: f.purpose,
      permittedChannel: this.channelValue(f.channel),
      preferredLanguage: f.person.language || null,
      nextAction: f.nextAction,
      dueAtUtc: new Date(f.dueAt).toISOString(),
      priority: this.pick(this.options()?.priorityOptions, f.priority),
      consentWarningAcknowledged: f.acknowledged
    }).pipe(map((created) => {
      const item = toFollowUp(created);
      this.followUps.update((list) => [item, ...list]);
      return item;
    }));
  }

  /** Whether each channel is permitted for a person: ok, caution (acknowledge) or blocked. */
  consentFor(p: FuPerson): Observable<Record<FuChannel, 'ok' | 'caution' | 'blocked'>> {
    const keys: FuChannel[] = ['call', 'email', 'sms', 'whatsapp', 'post'];
    return forkJoin(keys.map((k) => this.api.getConsentWarning(
      p.type === 'donor' ? p.id : undefined, p.type === 'lead' ? p.id : undefined, this.channelValue(k)
    ).pipe(
      map((w) => (!w?.hasWarning ? 'ok'
        : w.level === 'Blocking' || (w.prohibitedChannels ?? []).some((c) => channelKey(c) === k) ? 'blocked' : 'caution') as 'ok' | 'caution' | 'blocked'),
      catchError(() => of('ok' as const))
    ))).pipe(map((res) => Object.fromEntries(keys.map((k, i) => [k, res[i]])) as Record<FuChannel, 'ok' | 'caution' | 'blocked'>));
  }
}
