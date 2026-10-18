/* =====================================================================================================
   CAMPAIGN WORKSPACE - types and seed data shared by the four campaign pages
   (Campaign detail · Readiness checklist · Pause, resume & close · Tracking asset manager).
   Content follows the existing screens; replace the seeds with API data when it is wired.
   ===================================================================================================== */

export type Lifecycle = 'draft' | 'submitted' | 'scheduled' | 'active' | 'paused' | 'closing' | 'closed';

export interface CampaignInfo {
  code: string;
  name: string;
  lifecycle: Lifecycle;
  owners: string[];
  fund: string;
  start: string; // ISO yyyy-mm-dd
  end: string;
  location: string;
  target: number;
  raised: number;
  monthlyRevenue: number;
  monthlyRevenuePrev: number;
  donors: number;
  donations: number;
  description: string;
  /** Readiness request (shown while a launch decision is awaited). */
  readinessRequest?: { by: string; at: string };
  /** Pending close request (shown while a close decision is awaited). */
  closeRequest?: { by: string; at: string; reason: string };
  updatedAt: string;
}

export type CheckStatus = 'pending' | 'passed' | 'failed';
export type CheckCategory = 'Budget' | 'Consent' | 'Content' | 'Payment' | 'Template' | 'Tracking';

export interface ReadinessCheck {
  id: string;
  campaign: string;
  name: string;
  category: CheckCategory;
  owner: string;
  due: string; // ISO
  required: boolean;
  status: CheckStatus;
  description: string;
  criteria: string;
  notes: string;
  verdictBy?: string;
  verdictNote?: string;
}

export type AssetType = 'qr' | 'landing';
export type AssetStatus = 'draft' | 'submitted' | 'active' | 'disable-requested' | 'disabled';
export type Medium = 'Offline' | 'Print' | 'Social Media' | 'Referral' | 'Email' | 'WhatsApp';

export interface TrackingAsset {
  ref: string;
  campaign: string;
  type: AssetType;
  medium: Medium;
  place: string;
  destination: string;
  status: AssetStatus;
  usage: number;
  received: number;
  from: string; // ISO
  to: string; // ISO
  approval: 'Approved' | 'Pending' | '—';
}

export type ActivityKind = 'change' | 'approval' | 'create' | 'pause' | 'resume';

export interface Activity {
  campaign: string;
  at: string; // ISO date-time
  title: string;
  detail: string;
  by: string;
  kind: ActivityKind;
}

export interface Donation {
  campaign: string;
  date: string; // ISO
  donor: string;
  amount: number;
  channel: 'Offline' | 'Online' | 'Bank transfer' | 'UPI';
}

/* ---------------------------------------------------------------------------- campaigns */
export const CAMPAIGNS: CampaignInfo[] = [
  {
    code: 'HAI-PHYSIO-2026', name: 'Physiotherapy at Home', lifecycle: 'closing',
    owners: ['Priyanka Naveen', 'Aditya Ganesh'], fund: 'Healthcare Fund',
    start: '2026-06-24', end: '2026-10-10', location: 'India · Maharashtra · Mumbai · 400028',
    target: 300000, raised: 60000, monthlyRevenue: 0, monthlyRevenuePrev: 60000, donors: 1, donations: 1,
    description: 'Send physiotherapists to the homes of older people recovering from a fall, a stroke or surgery who cannot travel to a clinic.',
    closeRequest: { by: 'Priyanka Naveen', at: '2026-10-11T17:54', reason: 'The pilot period has ended on schedule and the home-visit rota is fully funded to the end of the financial year.' },
    updatedAt: '2026-10-11T17:54'
  },
  {
    code: 'HAI-CSR-2027', name: 'Corporate Champions for Elder Care FY 2026-27', lifecycle: 'submitted',
    owners: ['Priyanka Naveen'], fund: 'CSR Partnerships',
    start: '2026-11-18', end: '2027-04-06', location: 'India · Delhi · New Delhi · 110016',
    target: 2500000, raised: 0, monthlyRevenue: 0, monthlyRevenuePrev: 0, donors: 0, donations: 0,
    description: 'Partner with companies to fund elder-care programmes through their CSR commitments for the financial year.',
    readinessRequest: { by: 'Ritu Anil', at: '2026-10-13T11:02' },
    updatedAt: '2026-10-18T19:16'
  },
  {
    code: 'HAI-LIVELIHOOD-2027', name: 'Elder Self-Help Groups - Livelihood Fund', lifecycle: 'submitted',
    owners: ['Aditya Ganesh'], fund: 'Livelihood Fund',
    start: '2027-01-07', end: '2027-07-06', location: 'India · Tamil Nadu · Madurai · 625001',
    target: 800000, raised: 0, monthlyRevenue: 0, monthlyRevenuePrev: 0, donors: 0, donations: 0,
    description: 'Seed money and training for self-help groups run by older women and men in rural districts.',
    readinessRequest: { by: 'Aditya Ganesh', at: '2026-10-09T15:40' },
    updatedAt: '2026-10-09T15:40'
  },
  {
    code: 'HAI-ELDERCARE-2026', name: 'Care for the Elderly - Annual Appeal 2026', lifecycle: 'active',
    owners: ['Ritu Anil', 'Priyanka Naveen'], fund: 'General Fund',
    start: '2026-07-03', end: '2027-04-02', location: 'India · Delhi · New Delhi · 110030',
    target: 1500000, raised: 642000, monthlyRevenue: 118000, monthlyRevenuePrev: 96000, donors: 214, donations: 268,
    description: 'The annual appeal that funds day care, health camps and helpline support for older people across Delhi.',
    updatedAt: '2026-10-16T10:12'
  },
  {
    code: 'HAI-WINTER-2026', name: 'Winter Relief - Warmth for Elders', lifecycle: 'scheduled',
    owners: ['Ritu Anil'], fund: 'Relief Fund',
    start: '2026-10-26', end: '2027-01-17', location: 'India · Delhi · New Delhi · 110016',
    target: 400000, raised: 0, monthlyRevenue: 0, monthlyRevenuePrev: 0, donors: 0, donations: 0,
    description: 'Blankets, warm clothing and heaters for older people living alone through the winter months.',
    updatedAt: '2026-10-14T09:30'
  },
  {
    code: 'HAI-HELPLINE-2026', name: 'Elder Helpline - Keep the Line Open', lifecycle: 'scheduled',
    owners: ['Ritu Anil'], fund: 'Helpline Fund',
    start: '2026-10-12', end: '2027-05-02', location: 'India · Karnataka · Bengaluru · 560001',
    target: 600000, raised: 18000, monthlyRevenue: 18000, monthlyRevenuePrev: 0, donors: 9, donations: 9,
    description: 'Keep the free elder helpline staffed every day of the year.',
    updatedAt: '2026-10-12T08:00'
  },
  {
    code: 'HAI-MOBILECARE-2026', name: 'Mobile Healthcare Units - Care at the Doorstep', lifecycle: 'paused',
    owners: ['Priyanka Naveen'], fund: 'Healthcare Fund',
    start: '2026-07-26', end: '2027-01-22', location: 'India · Rajasthan · Jaipur · 302001',
    target: 1200000, raised: 564000, monthlyRevenue: 42000, monthlyRevenuePrev: 88000, donors: 131, donations: 152,
    description: 'Mobile clinics that bring check-ups and medicines to villages without a health centre.',
    updatedAt: '2026-10-15T13:20'
  }
];

/* ---------------------------------------------------------------------------- readiness */
const CHECK_TEMPLATE: Omit<ReadinessCheck, 'id' | 'campaign' | 'status'>[] = [
  { name: 'Budget approval', category: 'Budget', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'The campaign budget is approved by Finance.', criteria: 'Signed budget sheet attached and approved by the Finance controller.', notes: '' },
  { name: 'Fundraising cost ratio within policy', category: 'Budget', owner: 'Ritu Anil', due: '2026-11-15', required: false, description: 'Cost of raising funds stays within the board policy.', criteria: 'Projected cost ratio at or below 20 % of the target.', notes: '' },
  { name: 'Communication opt-in wording approved', category: 'Consent', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'Donor opt-in text for email, SMS and WhatsApp.', criteria: 'Legal has approved the opt-in wording for every channel used.', notes: '' },
  { name: 'Consent notice version', category: 'Consent', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'The privacy notice shown on donor forms.', criteria: 'Donor forms link to the current consent notice version.', notes: '' },
  { name: 'Campaign imagery and beneficiary consent', category: 'Content', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'Photos and stories of beneficiaries.', criteria: 'Signed consent on file for every person shown.', notes: '' },
  { name: 'Public content status', category: 'Content', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'Public description, terms and notice.', criteria: 'Public description, terms and notice are published.', notes: '' },
  { name: 'Payment readiness', category: 'Payment', owner: 'Arvind Murali', due: '2026-11-15', required: true, description: 'Gateway, bank account and reconciliation set up.', criteria: 'A test payment settles and reconciles end to end.', notes: '' },
  { name: 'Refund and failed-payment handling briefed', category: 'Payment', owner: 'Arvind Murali', due: '2026-11-15', required: false, description: 'Support team knows the refund route.', criteria: 'Support has the refund and failed-payment playbook.', notes: '' },
  { name: '80G receipt wording verified', category: 'Template', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'Tax receipt text for Indian donors.', criteria: '80G registration number and wording match the current certificate.', notes: '' },
  { name: 'Template readiness', category: 'Template', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'Thank-you, receipt and reminder templates.', criteria: 'All donor templates are approved and linked to the campaign.', notes: '' },
  { name: 'Tracking readiness', category: 'Tracking', owner: 'Ritu Anil', due: '2026-11-15', required: true, description: 'Tracking assets for every planned channel.', criteria: 'At least one approved tracking asset per planned channel.', notes: '' },
  { name: 'UTM naming and channel tagging reviewed', category: 'Tracking', owner: 'Ritu Anil', due: '2026-11-15', required: false, description: 'Consistent UTM naming across assets.', criteria: 'UTM source, medium and campaign follow the naming guide.', notes: '' }
];

const buildChecks = (campaign: string, statuses: CheckStatus[]): ReadinessCheck[] =>
  CHECK_TEMPLATE.map((c, i) => ({ ...c, id: `${campaign}-chk-${i + 1}`, campaign, status: statuses[i] ?? 'pending' }));

export const CHECKS: ReadinessCheck[] = [
  ...buildChecks('HAI-CSR-2027', ['failed', 'pending', 'pending', 'pending', 'pending', 'passed']).map((c) =>
    c.status === 'failed' ? { ...c, verdictBy: 'Vikram Anand', verdictNote: 'The budget sheet is unsigned - send it back to Finance for sign-off.' }
      : c.status === 'passed' ? { ...c, verdictBy: 'Vikram Anand', verdictNote: 'Public description, terms and notice are live.' } : c
  ),
  ...buildChecks('HAI-LIVELIHOOD-2027', ['pending', 'pending', 'pending', 'pending', 'pending', 'passed']),
  ...buildChecks('HAI-WINTER-2026', ['passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'pending', 'passed', 'passed', 'passed', 'pending']),
  ...buildChecks('HAI-HELPLINE-2026', Array(12).fill('passed') as CheckStatus[])
];

/** The readiness checklist every new campaign starts from. */
export const newChecklist = (campaign: string): ReadinessCheck[] => buildChecks(campaign, []);

/* ---------------------------------------------------------------------------- tracking assets */
const DONOR_FORM = 'http://helpageindia.localhost:6700/auth/donor-form';
export const destinationFor = (code: string): string => `${DONOR_FORM}?campaignCode=${code}`;

export const ASSETS: TrackingAsset[] = [
  { ref: 'HAI-ELDERCARE-2026-QR-010', campaign: 'HAI-ELDERCARE-2026', type: 'qr', medium: 'Offline', place: 'Neighbourhood pharmacy counters, South Delhi', destination: destinationFor('HAI-ELDERCARE-2026') + '&utm_source=QR_POSTER&utm_medium=PRINT&utm_content=pharmacy-counter-standee', status: 'disable-requested', usage: 156, received: 0, from: '2026-07-03', to: '2027-04-02', approval: 'Approved' },
  { ref: 'HAI-WINTER-2026-QR-002', campaign: 'HAI-WINTER-2026', type: 'qr', medium: 'Offline', place: 'Blanket collection point, Qutab Institutional Area', destination: '', status: 'draft', usage: 0, received: 0, from: '2026-10-26', to: '2027-01-17', approval: '—' },
  { ref: 'HAI-ELDERCARE-2026-LP-011', campaign: 'HAI-ELDERCARE-2026', type: 'landing', medium: 'Social Media', place: '', destination: destinationFor('HAI-ELDERCARE-2026') + '&utm_source=INSTAGRAM&utm_medium=SOCIAL', status: 'disabled', usage: 91, received: 4500, from: '2026-07-03', to: '2026-09-30', approval: 'Approved' },
  { ref: 'HAI-ELDERCARE-2026-QR-014', campaign: 'HAI-ELDERCARE-2026', type: 'qr', medium: 'Offline', place: 'Republic Day health camp, Qutab Institutional Area', destination: '', status: 'draft', usage: 0, received: 0, from: '2027-01-20', to: '2027-01-31', approval: '—' },
  { ref: 'HAI-ELDERCARE-2026-LP-013', campaign: 'HAI-ELDERCARE-2026', type: 'landing', medium: 'Referral', place: '', destination: destinationFor('HAI-ELDERCARE-2026') + '&utm_source=REFERRAL', status: 'submitted', usage: 0, received: 0, from: '2026-10-20', to: '2027-04-02', approval: 'Pending' },
  { ref: 'HAI-ELDERCARE-2026-QR-003', campaign: 'HAI-ELDERCARE-2026', type: 'qr', medium: 'Print', place: 'Annual appeal brochure, back cover', destination: destinationFor('HAI-ELDERCARE-2026') + '&utm_source=BROCHURE&utm_medium=PRINT', status: 'active', usage: 4210, received: 186000, from: '2026-07-03', to: '2027-04-02', approval: 'Approved' },
  { ref: 'HAI-ELDERCARE-2026-LP-004', campaign: 'HAI-ELDERCARE-2026', type: 'landing', medium: 'Email', place: '', destination: destinationFor('HAI-ELDERCARE-2026') + '&utm_source=NEWSLETTER&utm_medium=EMAIL', status: 'active', usage: 3880, received: 214000, from: '2026-07-03', to: '2027-04-02', approval: 'Approved' },
  { ref: 'HAI-ELDERCARE-2026-LP-007', campaign: 'HAI-ELDERCARE-2026', type: 'landing', medium: 'WhatsApp', place: '', destination: destinationFor('HAI-ELDERCARE-2026') + '&utm_source=WHATSAPP&utm_medium=SOCIAL', status: 'active', usage: 2140, received: 96000, from: '2026-08-01', to: '2027-04-02', approval: 'Approved' },
  { ref: 'HAI-MOBILECARE-2026-QR-001', campaign: 'HAI-MOBILECARE-2026', type: 'qr', medium: 'Offline', place: 'Mobile clinic van, Jaipur rural route', destination: destinationFor('HAI-MOBILECARE-2026') + '&utm_source=VAN_DECAL&utm_medium=OFFLINE', status: 'active', usage: 1960, received: 88000, from: '2026-07-26', to: '2027-01-22', approval: 'Approved' },
  { ref: 'HAI-MOBILECARE-2026-LP-002', campaign: 'HAI-MOBILECARE-2026', type: 'landing', medium: 'Social Media', place: '', destination: destinationFor('HAI-MOBILECARE-2026') + '&utm_source=FACEBOOK&utm_medium=SOCIAL', status: 'active', usage: 1430, received: 61000, from: '2026-07-26', to: '2027-01-22', approval: 'Approved' },
  { ref: 'HAI-PHYSIO-2026-QR-001', campaign: 'HAI-PHYSIO-2026', type: 'qr', medium: 'Print', place: 'Clinic waiting-room posters, Mumbai', destination: destinationFor('HAI-PHYSIO-2026') + '&utm_source=QR_POSTER&utm_medium=PRINT', status: 'active', usage: 640, received: 60000, from: '2026-06-24', to: '2026-10-10', approval: 'Approved' },
  { ref: 'HAI-PHYSIO-2026-LP-002', campaign: 'HAI-PHYSIO-2026', type: 'landing', medium: 'Referral', place: '', destination: destinationFor('HAI-PHYSIO-2026') + '&utm_source=REFERRAL', status: 'disabled', usage: 210, received: 0, from: '2026-06-24', to: '2026-10-10', approval: 'Approved' },
  { ref: 'HAI-HELPLINE-2026-QR-001', campaign: 'HAI-HELPLINE-2026', type: 'qr', medium: 'Print', place: 'Helpline sticker on pension passbooks', destination: destinationFor('HAI-HELPLINE-2026') + '&utm_source=STICKER&utm_medium=PRINT', status: 'submitted', usage: 0, received: 0, from: '2026-10-12', to: '2027-05-02', approval: 'Pending' }
];

/* ---------------------------------------------------------------------------- activity + donations */
export const ACTIVITY: Activity[] = [
  { campaign: 'HAI-PHYSIO-2026', at: '2026-10-11T17:54', title: 'Campaign close requested', detail: 'The pilot period has ended on schedule and the home-visit rota is fully funded to the end of the financial year.', by: 'Priyanka Naveen', kind: 'change' },
  { campaign: 'HAI-PHYSIO-2026', at: '2026-06-24T14:58', title: 'Campaign activated', detail: 'Launch', by: 'Priyanka Naveen', kind: 'approval' },
  { campaign: 'HAI-PHYSIO-2026', at: '2026-06-07T17:46', title: 'Campaign approved', detail: 'Completed', by: 'Priyanka Naveen', kind: 'approval' },
  { campaign: 'HAI-PHYSIO-2026', at: '2026-06-02T16:09', title: 'Campaign submitted', detail: 'Sent for approval', by: 'Priyanka Naveen', kind: 'approval' },
  { campaign: 'HAI-PHYSIO-2026', at: '2026-05-28T11:20', title: 'Campaign created', detail: 'Draft', by: 'Priyanka Naveen', kind: 'create' },
  { campaign: 'HAI-CSR-2027', at: '2026-10-13T11:02', title: 'Readiness review requested', detail: 'Awaiting a Campaign Manager’s decision', by: 'Ritu Anil', kind: 'change' },
  { campaign: 'HAI-CSR-2027', at: '2026-10-05T10:15', title: 'Campaign submitted', detail: 'Sent for approval', by: 'Priyanka Naveen', kind: 'approval' },
  { campaign: 'HAI-CSR-2027', at: '2026-09-29T09:40', title: 'Campaign created', detail: 'Draft', by: 'Priyanka Naveen', kind: 'create' },
  { campaign: 'HAI-MOBILECARE-2026', at: '2026-10-15T13:20', title: 'Campaign paused', detail: 'Two vans are in the workshop; scans would lead donors to a route that is not running.', by: 'Priyanka Naveen', kind: 'pause' },
  { campaign: 'HAI-MOBILECARE-2026', at: '2026-07-26T09:00', title: 'Campaign activated', detail: 'Launch', by: 'Priyanka Naveen', kind: 'approval' },
  { campaign: 'HAI-ELDERCARE-2026', at: '2026-07-03T09:00', title: 'Campaign activated', detail: 'Launch', by: 'Ritu Anil', kind: 'approval' },
  { campaign: 'HAI-WINTER-2026', at: '2026-10-14T09:30', title: 'Launch scheduled', detail: 'Goes live on 26 Oct 2026', by: 'Ritu Anil', kind: 'approval' },
  { campaign: 'HAI-HELPLINE-2026', at: '2026-10-12T08:00', title: 'Launch scheduled', detail: 'Goes live on 12 Oct 2026', by: 'Ritu Anil', kind: 'approval' }
];

export const DONATIONS: Donation[] = [
  { campaign: 'HAI-PHYSIO-2026', date: '2026-07-14', donor: 'Meera Kulkarni', amount: 60000, channel: 'Offline' },
  { campaign: 'HAI-ELDERCARE-2026', date: '2026-10-16', donor: 'Rahul Sethi', amount: 5000, channel: 'Online' },
  { campaign: 'HAI-ELDERCARE-2026', date: '2026-10-16', donor: 'Anita Rao', amount: 2500, channel: 'UPI' },
  { campaign: 'HAI-ELDERCARE-2026', date: '2026-10-09', donor: 'Kapoor Trust', amount: 50000, channel: 'Bank transfer' },
  { campaign: 'HAI-MOBILECARE-2026', date: '2026-10-02', donor: 'Suresh Iyer', amount: 10000, channel: 'Online' },
  { campaign: 'HAI-HELPLINE-2026', date: '2026-10-12', donor: 'Lakshmi Narayan', amount: 2000, channel: 'UPI' }
];

/* ---------------------------------------------------------------------------- labels + helpers */
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft: 'Draft', submitted: 'Submitted', scheduled: 'Scheduled', active: 'Active',
  paused: 'Paused', closing: 'Closing', closed: 'Closed'
};

export const LIFECYCLE_TONE: Record<Lifecycle, Tone> = {
  draft: 'neutral', submitted: 'info', scheduled: 'purple', active: 'success',
  paused: 'warning', closing: 'warning', closed: 'ink'
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', active: 'Active', 'disable-requested': 'Submitted for disable', disabled: 'Disabled'
};

export const ASSET_STATUS_TONE: Record<AssetStatus, Tone> = {
  draft: 'neutral', submitted: 'info', active: 'success', 'disable-requested': 'info', disabled: 'danger'
};

export type Tone = 'neutral' | 'info' | 'purple' | 'success' | 'warning' | 'danger' | 'ink';

export const MEDIUMS: Medium[] = ['Offline', 'Print', 'Social Media', 'Referral', 'Email', 'WhatsApp'];
export const CATEGORIES: CheckCategory[] = ['Budget', 'Consent', 'Content', 'Payment', 'Template', 'Tracking'];
export const PEOPLE = ['Ritu Anil', 'Priyanka Naveen', 'Aditya Ganesh', 'Arvind Murali', 'Vikram Anand'];
/** The signed-in decision maker (approvals, rejections). */
export const CURRENT_USER = 'Vikram Anand';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Normalises a Date or ISO string to "yyyy-mm-ddThh:mm" (local digits kept as given). */
const toIso = (v: string | Date | null | undefined): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}`;
};

/** "2026-10-18" (or a Date) -> "18 Oct 2026" */
export const fmtDate = (value: string | Date | null | undefined): string => {
  const iso = toIso(value);
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
};

/** "2026-10-11T17:54" (or a Date) -> "05:54 PM" */
export const fmtTime = (value: string | Date | null | undefined): string => {
  const iso = toIso(value);
  if (iso.length < 16) return '';
  const [h, min] = iso.slice(11, 16).split(':').map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** ₹ with Indian digit grouping: 300000 -> "₹3,00,000" */
export const inr = (n: number): string => '₹' + Math.round(n).toLocaleString('en-IN');

/** Whole days between two ISO dates (to - from). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86400000);

/** Today in the workspace (Asia/Calcutta) as yyyy-mm-dd. */
export const todayIso = (): string => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/** Two-letter initials ("Priyanka Naveen" -> "PN"). */
export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
