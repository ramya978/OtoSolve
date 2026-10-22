import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, switchMap, tap } from 'rxjs';
import { DonorApiService } from '../../../Service/donor-api.service';
import { CommunicationTimelineEntry, CommunicationTimelineResponse } from '../../models/donor-contract.model';

/* =====================================================================================================
   COMMUNICATION STORE - shared by Communication timeline and Log communication.
   Holds the leads and their logged communications as signals, so an entry saved on the
   Log communication page shows on the timeline straight away. Loaded from the donor API.
   ===================================================================================================== */

export type CommChannel = 'call' | 'email' | 'sms' | 'whatsapp' | 'meeting' | 'visit' | 'note';
export type CommDirection = 'out' | 'in';
export type OutcomeGroup = 'reached' | 'warm' | 'awaiting' | 'closed';
export type CommOutcome =
  | 'connected' | 'meeting-scheduled'
  | 'interested' | 'meeting-completed' | 'donation-discussion'
  | 'no-answer' | 'requested-callback' | 'requested-information'
  | 'not-interested' | 'wrong-contact' | 'do-not-contact';
export type Level3 = 'low' | 'medium' | 'high';
export type Quality = 'poor' | 'average' | 'good' | 'excellent';
export type Temperature = 'cold' | 'warm' | 'hot';

export interface CommLead {
  code: string;
  name: string;
  stage: string;
  phone: string;
  email: string;
  language: string;
  owner: string;
  source: string;
  campaign: string;
  donationLink: string;
  temperature: Temperature;
  potential: Level3;
  health: number;
  contactRhythm: string;
  engagement: string;
  interestedReplies: number;
  followUpsDone: number; // %
}

export interface CommEntry {
  id: string;
  lead: string;
  at: string;               // ISO date-time (local)
  channel: CommChannel;
  direction: CommDirection;
  outcome: CommOutcome;
  engagement: Level3 | null;
  quality: Quality | null;
  summary: string;
  note: string;
  by: string;
  important: boolean;
  attachment: string | null;
}

export const COMM_CHANNELS: { key: CommChannel; label: string; noun: string; icon: string }[] = [
  { key: 'call', label: 'Call', noun: 'call', icon: 'phone' },
  { key: 'email', label: 'E-mail', noun: 'e-mail', icon: 'mail' },
  { key: 'sms', label: 'SMS', noun: 'SMS', icon: 'sms' },
  { key: 'whatsapp', label: 'WhatsApp', noun: 'WhatsApp message', icon: 'whatsapp' },
  { key: 'meeting', label: 'Meeting', noun: 'meeting', icon: 'users' },
  { key: 'visit', label: 'Visit', noun: 'visit', icon: 'home' },
  { key: 'note', label: 'Note', noun: 'note', icon: 'pen' }
];

export const OUTCOME_GROUPS: { key: OutcomeGroup; label: string; tone: string }[] = [
  { key: 'reached', label: 'Reached', tone: 'primary' },
  { key: 'warm', label: 'Warm signals', tone: 'green' },
  { key: 'awaiting', label: 'Awaiting', tone: 'amber' },
  { key: 'closed', label: 'Closed', tone: 'red' }
];

export const OUTCOMES: { key: CommOutcome; label: string; group: OutcomeGroup }[] = [
  { key: 'connected', label: 'Connected', group: 'reached' },
  { key: 'meeting-scheduled', label: 'Meeting scheduled', group: 'reached' },
  { key: 'interested', label: 'Interested', group: 'warm' },
  { key: 'meeting-completed', label: 'Meeting completed', group: 'warm' },
  { key: 'donation-discussion', label: 'Donation discussion', group: 'warm' },
  { key: 'no-answer', label: 'No answer', group: 'awaiting' },
  { key: 'requested-callback', label: 'Requested callback', group: 'awaiting' },
  { key: 'requested-information', label: 'Requested information', group: 'awaiting' },
  { key: 'not-interested', label: 'Not interested', group: 'closed' },
  { key: 'wrong-contact', label: 'Wrong contact', group: 'closed' },
  { key: 'do-not-contact', label: 'Do not contact', group: 'closed' }
];

export const COMM_ICONS: Record<string, string> = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
  sms: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M8 10h.01 M12 10h.01 M16 10h.01',
  whatsapp: 'M3 21l1.7-5A9 9 0 1 1 8 19.3z M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-.8.8a4 4 0 0 1-2.3-2.3l.8-.8-1-2z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  pen: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  chev: 'M6 9l6 6 6-6',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  filter: 'M3 5h18 M6 12h12 M10 19h4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  copy: 'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  x: 'M18 6 6 18 M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  out: 'M7 17 17 7 M8 7h9v9',
  in: 'M17 7 7 17 M16 17H7V8',
  clip: 'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  note: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6',
  message: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'
};

const norm = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const EMPTY_LEAD: CommLead = {
  code: '', name: '', stage: '', phone: '', email: '', language: '', owner: '', source: '', campaign: '', donationLink: '',
  temperature: 'cold', potential: 'low', health: 0, contactRhythm: '', engagement: '', interestedReplies: 0, followUpsDone: 0
};

const pad = (n: number) => String(n).padStart(2, '0');
const localIso = (utc: string) => {
  const d = new Date(utc);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function channelOfType(v: string | null | undefined): CommChannel {
  const n = norm(v);
  if (n.includes('whatsapp')) return 'whatsapp';
  if (n.includes('sms') || n.includes('text')) return 'sms';
  if (n.includes('mail')) return 'email';
  if (n.includes('meeting')) return 'meeting';
  if (n.includes('visit')) return 'visit';
  if (n.includes('note')) return 'note';
  return 'call';
}

function outcomeKey(v: string | null | undefined, label?: string | null): CommOutcome {
  const n = norm(v);
  const l = norm(label);
  return (OUTCOMES.find((o) => norm(o.key) === n || norm(o.label) === n || norm(o.label) === l)?.key ?? 'connected') as CommOutcome;
}

const level = (v: string | null | undefined): Level3 | null => {
  const n = norm(v);
  return n === 'low' ? 'low' : n === 'medium' ? 'medium' : n === 'high' ? 'high' : null;
};
const quality = (v: string | null | undefined): Quality | null => {
  const n = norm(v);
  return n === 'poor' || n === 'average' || n === 'good' || n === 'excellent' ? n : null;
};

@Injectable({ providedIn: 'root' })
export class CommunicationStore {
  private readonly api = inject(DonorApiService);

  readonly leads = signal<CommLead[]>([]);
  readonly entries = signal<CommEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** The server's lists for the Log form (interaction types, outcomes ...). */
  readonly options = signal<CommunicationTimelineResponse | null>(null);

  private readonly ids = new Map<string, { leadId: string | null; donorId: string | null; version?: number }>();
  private readonly versions = new Map<string, number>();

  lead(code: string | null): CommLead {
    return this.leads().find((l) => l.code === code) ?? (code ? EMPTY_LEAD : this.leads()[0] ?? EMPTY_LEAD);
  }

  entriesFor(code: string): CommEntry[] {
    return this.entries().filter((e) => e.lead === code).sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * Opens a lead's (or donor's) timeline. `ref` is the readable reference from the query string;
   * with none, the first lead on the work queue is shown.
   */
  load(ref: string | null): void {
    this.loading.set(true);
    this.error.set(null);
    this.resolve(ref).pipe(
      switchMap((r) => (r ? this.api.getCommunicationTimeline(r.leadId, r.donorId) : of(null)))
    ).subscribe({
      next: (t) => { if (t) this.apply(t); this.loading.set(false); },
      error: (e: unknown) => { this.loading.set(false); this.error.set(e instanceof Error ? e.message : 'The timeline could not be loaded.'); }
    });
  }

  private resolve(ref: string | null): Observable<{ leadId: string | null; donorId: string | null } | null> {
    if (!ref) {
      return this.api.getLeadWorkQueue({ page: 1, pageSize: 1 }).pipe(
        map((r) => { const l = r.leads.items[0]; return l ? { leadId: l.id, donorId: null } : null; }));
    }
    if (ref.toUpperCase().startsWith('DON')) {
      return this.api.lookupDonors(ref, 5).pipe(
        switchMap((list) => (list.length ? of(list) : this.api.searchDonors({ search: ref, pageSize: 5 }).pipe(
          map((p) => p.items.map((d) => ({ id: d.id, displayName: d.displayName, status: d.status })))))),
        map((list) => (list[0] ? { leadId: null, donorId: list[0].id } : null)));
    }
    return this.api.searchLeads(ref, 5).pipe(
      map((list) => { const l = list.find((x) => x.leadReference === ref) ?? list[0]; return l ? { leadId: l.id, donorId: null } : null; }));
  }

  private apply(t: CommunicationTimelineResponse): void {
    this.options.set(t);
    const code = t.leadReference ?? t.donorReference ?? '';
    this.ids.set(code, { leadId: t.leadId, donorId: t.donorId });
    const lead: CommLead = {
      code, name: t.displayName, stage: t.status, phone: t.mobileNumber ?? '', email: t.emailAddress ?? '',
      language: t.preferredLanguage ?? '', owner: t.ownerName ?? '', source: t.source ?? '', campaign: t.campaignName ?? '',
      donationLink: t.isLead && t.campaignId && t.leadId
        ? `${window.location.origin}/auth/donor-form?campaign=${t.campaignId}&lead=${t.leadId}` : '',
      temperature: (norm(t.temperature) === 'hot' ? 'hot' : norm(t.temperature) === 'warm' ? 'warm' : 'cold'),
      potential: level(t.donationPotential) ?? 'low',
      health: t.healthScore ?? 0,
      contactRhythm: t.contactRhythm ?? '',
      engagement: t.engagementTrend ?? '',
      interestedReplies: t.interestedCount ?? 0,
      followUpsDone: t.followUpCount > 0 ? Math.round((t.followUpCompletedCount / t.followUpCount) * 100) : 0
    };
    this.leads.update((list) => [lead, ...list.filter((l) => l.code !== code)]);
    for (const e of t.entries ?? []) this.versions.set(e.id, e.version);
    const mapped = (t.entries ?? []).map((e) => this.toEntry(code, e));
    this.entries.update((list) => [...mapped, ...list.filter((e) => e.lead !== code)]);
  }

  private toEntry(code: string, e: CommunicationTimelineEntry): CommEntry {
    return {
      id: e.id, lead: code, at: localIso(e.occurredAtUtc),
      channel: channelOfType(e.interactionType), direction: norm(e.direction).startsWith('in') ? 'in' : 'out',
      outcome: outcomeKey(e.outcome, e.outcomeLabel), engagement: level(e.engagementLevel), quality: quality(e.quality),
      summary: e.summary, note: e.notes ?? '', by: e.performedByName ?? '', important: e.isImportant, attachment: e.attachmentName
    };
  }

  private serverValue(list: { value: string; label: string }[] | undefined, word: string): string {
    const n = norm(word);
    return (list ?? []).find((o) => norm(o.value) === n || norm(o.label) === n)?.value ?? word;
  }

  /** Logs a communication; the timeline is reloaded so the new entry arrives as the server holds it. */
  add(entry: Omit<CommEntry, 'id'>): Observable<unknown> {
    const o = this.options();
    const target = this.ids.get(entry.lead);
    const typeWord = { call: 'Call', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', meeting: 'Meeting', visit: 'Visit', note: 'Note' }[entry.channel];
    const outcomeLabel = OUTCOMES.find((x) => x.key === entry.outcome)?.label ?? entry.outcome;
    const cap = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : null);
    return this.api.logCommunication({
      leadId: target?.leadId ?? null,
      donorId: target?.donorId ?? null,
      interactionType: this.serverValue(o?.interactionTypeOptions, typeWord),
      direction: this.serverValue(o?.directionOptions, entry.direction === 'in' ? 'Incoming' : 'Outgoing'),
      occurredAtUtc: new Date(entry.at).toISOString(),
      outcome: this.serverValue(o?.outcomeOptions, outcomeLabel),
      summary: entry.summary,
      notes: entry.note || null,
      engagementLevel: cap(entry.engagement),
      quality: cap(entry.quality),
      isImportant: entry.important,
      attachmentName: entry.attachment
    }).pipe(tap(() => this.load(entry.lead)));
  }

  toggleImportant(id: string): Observable<unknown> {
    const current = this.entries().find((e) => e.id === id);
    if (!current) return of(null);
    const next = !current.important;
    return this.api.flagCommunication(id, next).pipe(
      tap(() => this.entries.update((list) => list.map((e) => (e.id === id ? { ...e, important: next } : e)))));
  }

  setStanding(code: string, patch: Partial<Pick<CommLead, 'temperature' | 'potential'>>): Observable<unknown> {
    const target = this.ids.get(code);
    const lead = this.leads().find((l) => l.code === code);
    if (!target?.leadId || !lead) return of(null);
    const temp = patch.temperature ?? lead.temperature;
    const pot = patch.potential ?? lead.potential;
    const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
    return this.api.scoreLead(target.leadId, {
      temperature: cap(temp), donationPotential: cap(pot), reason: 'Updated from the communication timeline.'
    }).pipe(tap(() => this.leads.update((list) => list.map((l) => (l.code === code ? { ...l, ...patch } : l)))));
  }

  /** Server CSV for the open record. */
  export(code: string): Observable<{ blob: Blob; fileName: string }> {
    const t = this.ids.get(code);
    return this.api.exportCommunicationTimeline(t?.leadId ?? null, t?.donorId ?? null);
  }
}

/* ---------- shared helpers ---------- */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function channelOf(key: CommChannel) { return COMM_CHANNELS.find((c) => c.key === key)!; }
export function outcomeOf(key: CommOutcome) { return OUTCOMES.find((o) => o.key === key)!; }
export function outcomeTone(key: CommOutcome): string {
  const g = outcomeOf(key).group;
  return OUTCOME_GROUPS.find((x) => x.key === g)!.tone;
}

/** "Outgoing call", "Incoming e-mail", "Meeting", "Note". */
export function entryTitle(channel: CommChannel, direction: CommDirection): string {
  if (channel === 'note') return 'Note';
  if (channel === 'meeting' || channel === 'visit') return channelOf(channel).label;
  return (direction === 'out' ? 'Outgoing ' : 'Incoming ') + channelOf(channel).noun;
}

export function healthLabel(h: number): { label: string; tone: string } {
  if (h >= 70) return { label: 'Healthy', tone: 'green' };
  if (h >= 40) return { label: 'Needs attention', tone: 'amber' };
  return { label: 'At risk', tone: 'red' };
}

export function daysBetween(a: Date, b: Date): number {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((y - x) / 86400000);
}