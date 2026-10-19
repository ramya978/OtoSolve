import { Injectable, signal } from '@angular/core';

/* =====================================================================================================
   COMMUNICATION STORE - shared by Communication timeline and Log communication.
   Holds the leads and their logged communications as signals, so an entry saved on the
   Log communication page shows on the timeline straight away. Sample data until the API is wired.
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

const LEADS: CommLead[] = [
  {
    code: 'LED-2026-000038', name: 'Gopal Krishnan', stage: 'Contacted', phone: '+919830273826', email: 'gopal.krishnan@mail.test',
    language: 'bn-IN', owner: 'Vivek Sridhar', source: 'Residents’ association QR', campaign: 'Adopt a Day-Care Centre',
    donationLink: 'https://give.example.org/adopt-day-care?ref=LED-2026-000038', temperature: 'warm', potential: 'low', health: 57,
    contactRhythm: 'Low frequency', engagement: 'Stable', interestedReplies: 0, followUpsDone: 50
  },
  {
    code: 'LED-2026-000006', name: 'Dinesh Babu', stage: 'Contacted', phone: '+919842161104', email: 'dinesh.babu@mail.test',
    language: 'ta-IN', owner: 'Vivek Sridhar', source: 'Walk-in enquiry', campaign: 'Mobile Healthcare Units',
    donationLink: 'https://give.example.org/mobile-health?ref=LED-2026-000006', temperature: 'cold', potential: 'low', health: 44,
    contactRhythm: 'Low frequency', engagement: 'Stable', interestedReplies: 0, followUpsDone: 0
  }
];

const ENTRIES: CommEntry[] = [
  {
    id: 'c-1', lead: 'LED-2026-000038', at: '2026-10-08T11:42', channel: 'call', direction: 'out', outcome: 'no-answer',
    engagement: null, quality: null, summary: 'Contact attempt - no answer', note: 'Rang twice during the day with no answer; a message was left.',
    by: 'Vivek Sridhar', important: false, attachment: null
  },
  {
    id: 'c-2', lead: 'LED-2026-000006', at: '2026-10-11T16:05', channel: 'call', direction: 'out', outcome: 'no-answer',
    engagement: null, quality: null, summary: 'Contact attempt - no answer', note: '',
    by: 'Vivek Sridhar', important: false, attachment: null
  }
];

@Injectable({ providedIn: 'root' })
export class CommunicationStore {
  readonly leads = signal<CommLead[]>(LEADS);
  readonly entries = signal<CommEntry[]>(ENTRIES);

  lead(code: string | null): CommLead {
    return this.leads().find((l) => l.code === code) ?? this.leads()[0];
  }

  entriesFor(code: string): CommEntry[] {
    return this.entries().filter((e) => e.lead === code).sort((a, b) => b.at.localeCompare(a.at));
  }

  add(entry: Omit<CommEntry, 'id'>): void {
    // TODO: POST to the API, then refresh.
    this.entries.update((list) => [{ ...entry, id: 'c-' + Date.now() }, ...list]);
  }

  toggleImportant(id: string): void {
    this.entries.update((list) => list.map((e) => (e.id === id ? { ...e, important: !e.important } : e)));
  }

  setStanding(code: string, patch: Partial<Pick<CommLead, 'temperature' | 'potential'>>): void {
    // TODO: PATCH the lead.
    this.leads.update((list) => list.map((l) => (l.code === code ? { ...l, ...patch } : l)));
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