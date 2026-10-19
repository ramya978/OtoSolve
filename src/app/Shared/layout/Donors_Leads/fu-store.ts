import { Injectable, computed, signal } from '@angular/core';

/* =====================================================================================================
   FOLLOW-UP STORE - shared by Follow-ups (queue), New follow-up, Follow-up planner and Assignment board.
   Holds follow-ups, people (leads / donors) and owners as signals, so a follow-up scheduled in the
   planner or reassigned on the board shows everywhere straight away. Sample data until the API is wired.
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

export const FU_OWNERS: FuOwner[] = [
  { name: 'Arvind Murali', team: 'INSTITUTIONAL' },
  { name: 'Gaurav Deepak', team: 'NORTH' },
  { name: 'Vivek Sridhar', team: 'NATIONAL' },
  { name: 'Imran Iqbal', team: 'DONOR_SERVICES' },
  { name: 'Shalini Balaji', team: 'DONOR_SERVICES' },
  { name: 'Nisha Karthik', team: 'SOUTH' }
];
export const FU_MANAGERS = ['Meera Raghavan', 'Sanjay Kulkarni', 'Farah Siddiqui'];
export const CURRENT_USER = 'Vivek Sridhar';

export const FU_CAMPAIGNS = [
  'Adopt a Day-Care Centre',
  'Care for the Elderly - Annual Appeal 2026',
  'Elder Helpline - Keep the Line Open',
  'Mobile Healthcare Units - Care at the Doorstep',
  'Cataract Surgery Drive'
];

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

/* ---------- sample data (generated around today) ---------- */
const NAMES = [
  ['Nilanjana Amit', 'donor'], ['Sameer Ishwar', 'donor'], ['Sahyadri Cement Limited', 'donor'], ['Saroj Naresh', 'lead'],
  ['Pranab Subrata', 'lead'], ['Arnab Sukumar', 'donor'], ['Sushma Raghunath', 'donor'], ['Bhuvan Prem', 'lead'],
  ['Moloy Tapan', 'donor'], ['Lalit Pramod', 'lead'], ['Coromandel Logistics Private Limited', 'donor'], ['Prakash Subhash', 'donor'],
  ['Chandra Mohan', 'lead'], ['Neelima Shankar', 'lead'], ['Ajay Sekar', 'lead'], ['Poonam Ashok', 'lead'],
  ['Kavya Prabhu', 'lead'], ['Tanuja Mohan', 'lead'], ['Rajib Supriyo', 'donor'], ['Charu Vivek', 'lead'],
  ['Rahul Devraj', 'donor'], ['Santosh Vinay', 'donor'], ['Jatin Varun', 'lead'], ['Abhijit Tarun', 'donor'],
  ['Prabha Senthil', 'lead'], ['Gopal Krishnan', 'lead'], ['Geeta Ramesh', 'lead'], ['Dinesh Kailash', 'lead'],
  ['Sarita Mahesh', 'lead'], ['Ramakant Bhushan', 'donor'], ['Fathima Ismail', 'lead'], ['Ishita Rakesh', 'donor'],
  ['Arun Selvam', 'donor'], ['Ankita Lalit', 'lead'], ['Vinod Kishore', 'donor'], ['Sudipta Arup', 'lead'],
  ['Kunal Mahendra', 'donor'], ['Ritika Sunder', 'lead'], ['Kamala Sundar', 'donor'], ['Kakoli Ashim', 'lead'],
  ['Pushpa Girish', 'donor'], ['Ananya Sourav', 'lead'], ['Usha Govind', 'donor'], ['Varsha Dilip', 'lead'],
  ['Geetha Raman', 'donor'], ['Pallavi Harsh', 'lead'], ['Yamini Prasad', 'donor'], ['Rajan Mathew', 'donor'],
  ['Mousumi Debasish', 'lead'], ['Kanta Subhash', 'donor'], ['Irfan Hameed', 'lead'], ['Raghu Madhavan', 'donor'],
  ['Wasim Akbar', 'lead'], ['Mukul Anup', 'lead'], ['Elizabeth George', 'donor'], ['Shyamal Ranjan', 'lead']
] as const;

const PURPOSES: [string, string][] = [
  ['Offer the monthly giving option after the donor’s second gift.', 'Explain the monthly plan and share the sign-up link'],
  ['Talk about renewing the donor’s support for the next financial year.', 'Agree the renewal amount and timing'],
  ['Present the half-year impact review to the partner’s CSR committee.', 'Send the impact review and book the committee meeting'],
  ['Keep in touch until the lead is ready to give.', 'Share a short update and ask about timing'],
  ['Send the consolidated 80G statement before the filing season.', 'Send the statement and confirm receipt'],
  ['Invite a volunteering donor to help at the Guwahati day-care centre.', 'Share dates and confirm a slot'],
  ['Share the cataract surgery report the partner asked for.', 'Send the report and answer questions'],
  ['Follow up on the conversation and answer the lead’s open questions.', 'Answer the questions and suggest a gift'],
  ['Agree the gift and send the payment link.', 'Send the payment link and confirm the amount'],
  ['Make first contact with the lead after capture.', 'Introduce the campaign and learn their interest'],
  ['Welcome a first-time donor and learn how they would like to hear from us.', 'Record their contact preferences']
];

function seed(): { follow: FollowUp[]; people: FuPerson[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const owners = ['Imran Iqbal', 'Shalini Balaji', 'Arvind Murali', 'Vivek Sridhar', 'Nisha Karthik', 'Gaurav Deepak'];
  const chans: FuChannel[] = ['call', 'email', 'whatsapp', 'call', 'email', 'sms', 'call', 'whatsapp', 'post'];
  const pris: FuPriority[] = ['normal', 'normal', 'high', 'low', 'normal', 'low', 'high', 'urgent', 'normal', 'low'];
  // due offsets (days from today) - a mix of overdue, today, upcoming and done
  const offsets = [40, 37, 35, 35, 33, 31, 30, 27, 23, 21, 0, 0, 0, 1, 1, -1, -2, -2, -2, -3, -6, -6, -6, -6, -6, -9, -8, -7, -7, -6,
    -6, -5, -4, -4, -3, -3, -15, -14, -14, -13, -13, -12, -11, -11, -10, -10, 2, 1, 3, 4, 7, 2, -16, -19, -20, -14];
  const follow: FollowUp[] = [];
  const people: FuPerson[] = [];
  NAMES.forEach(([name, type], i) => {
    const off = offsets[i % offsets.length];
    const due = addDays(today, off);
    due.setHours(9 + ((i * 3) % 11), [0, 15, 30, 45, 3][i % 5]);
    const done = (i >= 20 && i < 25) || i === 55;
    const status: FuStatus = done ? (i === 55 ? 'completed' : 'completed')
      : i === 4 ? 'rescheduled' : i === 17 ? 'escalated' : i === 30 ? 'no-response' : i === 44 ? 'cancelled' : 'pending';
    const p = PURPOSES[i % PURPOSES.length];
    const owner = owners[i % owners.length];
    const code = (type === 'lead' ? 'LED' : 'DON') + '-2026-' + String(1 + i * 3).padStart(6, '0');
    const created = addDays(due, -(3 + (i % 20)));
    const email = name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').slice(0, 2).join('.') + '@mail.test';
    const phone = '+9198' + String(30000000 + i * 104729).slice(0, 8);
    const campaign = FU_CAMPAIGNS[i % FU_CAMPAIGNS.length];
    follow.push({
      id: 'FUP-2026-' + String(682 - i).padStart(6, '0'),
      name, recordType: type, recordCode: code, purpose: p[0], nextAction: p[1],
      channel: chans[i % chans.length], dueAt: isoAt(due), createdAt: isoDay(created < today ? created : addDays(today, -1)),
      owner, priority: pris[i % pris.length], status, campaign, phone, email,
      blocked: i === 9 || i === 26, escalatedTo: status === 'escalated' ? 'Meera Raghavan' : null,
      completedAt: done ? isoAt(addDays(due, 0)) : null,
      history: [
        { at: isoAt(created), text: 'Follow-up scheduled', by: owner },
        ...(status === 'rescheduled' ? [{ at: isoAt(addDays(created, 2)), text: 'Rescheduled to a later date', by: owner }] : []),
        ...(status === 'escalated' ? [{ at: isoAt(addDays(created, 3)), text: 'Escalated to Meera Raghavan', by: owner }] : []),
        ...(done ? [{ at: isoAt(due), text: 'Marked completed', by: owner }] : [])
      ]
    });
    people.push({
      code, name, type, stage: type === 'lead' ? ['Contacted', 'New', 'Assigned', 'Qualified'][i % 4] : ['Active', 'Lapsing', 'Active'][i % 3],
      owner: i % 9 === 4 ? null : owner, email, phone, language: ['bn-IN', 'ta-IN', 'hi-IN', 'en-IN'][i % 4], bestTime: i % 3 === 0 ? 'Evenings after 6 pm' : null,
      campaign, region: ['NORTH', 'SOUTH', 'NATIONAL', 'EAST'][i % 4] + ' · ' + ['Hindi', 'Tamil', 'English', 'Bengali'][i % 4],
      consent: { call: i !== 9, email: true, sms: i % 5 !== 0, whatsapp: i % 4 !== 1, post: true },
      slaDue: i % 3 === 0 ? isoAt(addDays(today, (i % 7) - 5)) : null,
      source: ['Residents’ association QR', 'Walk-in enquiry', 'Website form', 'Event sign-up'][i % 4]
    });
  });
  return { follow, people };
}

@Injectable({ providedIn: 'root' })
export class FollowUpStore {
  private readonly data = seed();
  readonly followUps = signal<FollowUp[]>(this.data.follow);
  readonly people = signal<FuPerson[]>(this.data.people);
  readonly owners = FU_OWNERS;
  readonly managers = FU_MANAGERS;
  readonly currentUser = CURRENT_USER;

  /** Open work per owner (follow-ups that are not closed). */
  readonly load = computed(() => {
    const map = new Map<string, number>();
    for (const o of FU_OWNERS) map.set(o.name, 0);
    for (const p of this.people()) if (p.owner) map.set(p.owner, (map.get(p.owner) ?? 0) + 1);
    return map;
  });

  person(code: string | null): FuPerson | null { return this.people().find((p) => p.code === code) ?? null; }
  find(id: string): FollowUp | null { return this.followUps().find((f) => f.id === id) ?? null; }

  private patch(id: string, fn: (f: FollowUp) => FollowUp): void {
    // TODO: PATCH the follow-up through the API, then refresh.
    this.followUps.update((list) => list.map((f) => (f.id === id ? fn(f) : f)));
  }
  private stamp(text: string, by = CURRENT_USER): FuHistory { return { at: isoAt(new Date()), text, by }; }

  reassign(ids: string[], owner: string, reason: string): void {
    for (const id of ids) this.patch(id, (f) => ({ ...f, owner, history: [...f.history, this.stamp(`Reassigned to ${owner}${reason ? ' - ' + reason : ''}`)] }));
  }
  escalate(ids: string[], to: string, reason: string): void {
    for (const id of ids) this.patch(id, (f) => ({ ...f, status: 'escalated', escalatedTo: to, history: [...f.history, this.stamp(`Escalated to ${to} - ${reason}`)] }));
  }
  complete(id: string): void {
    this.patch(id, (f) => ({ ...f, status: 'completed', completedAt: isoAt(new Date()), history: [...f.history, this.stamp('Marked completed')] }));
  }
  /** Records what happened on a follow-up and closes it (completed / partial / no response). */
  execute(id: string, r: FuExecution): void {
    // TODO: POST the execution report to the API, then refresh.
    const label = r.status === 'completed' ? 'Completed' : r.status === 'partial' ? 'Partially completed' : 'No response';
    this.patch(id, (f) => ({
      ...f,
      status: r.status,
      completedAt: r.executedAt,
      history: [...f.history, this.stamp(`${label} by ${r.method} - ${r.outcome}${r.files.length ? ` · ${r.files.length} file(s)` : ''}`)]
    }));
  }
  assignPerson(codes: string[], owner: string): void {
    // TODO: POST the assignment.
    this.people.update((list) => list.map((p) => (codes.includes(p.code) ? { ...p, owner } : p)));
  }

  add(f: Omit<FollowUp, 'id' | 'history' | 'createdAt' | 'escalatedTo' | 'completedAt' | 'blocked'>): FollowUp {
    // TODO: POST to the API.
    const next = Math.max(...this.followUps().map((x) => Number(x.id.slice(-6)))) + 1;
    const item: FollowUp = {
      ...f, id: 'FUP-2026-' + String(next).padStart(6, '0'), createdAt: isoDay(new Date()), escalatedTo: null, completedAt: null, blocked: false,
      history: [this.stamp('Follow-up scheduled')]
    };
    this.followUps.update((list) => [item, ...list]);
    return item;
  }
}
