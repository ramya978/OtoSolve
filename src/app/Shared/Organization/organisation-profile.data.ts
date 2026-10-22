/** Demo data for the Organisation page (matches the design screenshots). Replace with API data later. */

export type Tone = 'success' | 'warning' | 'info' | 'muted';

export interface OrgSummary {
  name: string;
  verified: boolean;
  code: string;
  host: string;
  type: string;
  since: string;
  people: number;
  seats: number;
  administrator: string;
  lastUpdated: string;
  status: 'draft' | 'submitted' | 'active' | 'rejected';
  statusLabel: string;
}

export interface Row { label: string; value: string; small?: boolean; }

export interface OrgDocument { name: string; kind: string; uploaded: string; size: string; }

export interface WebAddress { address: string; kind: string; primary: boolean; verifiedOn: string; }

export interface HistoryEntry {
  day: string;
  time: string;
  label: string;
  from?: string;
  by: string;
  tone: Tone;
}

export const ORG: OrgSummary = {
  name: 'Smile Foundation',
  verified: true,
  code: 'TEN001',
  host: 'smilefoundation.localhost',
  type: 'Non-profit / NGO',
  since: 'Oct 2026',
  people: 21,
  seats: 50,
  administrator: 'Anjali Prakash',
  lastUpdated: '14 Oct 2026',
  status: 'active',
  statusLabel: 'Active'
};

export const REGISTRATION: Row[] = [
  { label: 'Legal name', value: 'Smile Foundation' },
  { label: 'Type', value: 'Non-profit / NGO' },
  { label: 'Registration no.', value: 'DL-TR-2002-004417' },
  { label: 'Tax ID', value: 'DELS27145C' },
  { label: 'PAN', value: 'AAATS4392K' },
  { label: 'GST', value: '07AAATS4392K1Z5' },
  { label: 'Established', value: '4 Feb 2002' },
  { label: 'Business unit', value: 'NGoPlanet' }
];

export const CONTACT: Row[] = [
  { label: 'Contact person', value: 'Anjali Prakash' },
  { label: 'Telephone', value: '+91 9810452307', small: true },
  { label: 'E-mail', value: 'anjali.prakash@smilefoundationindia.test', small: true },
  { label: 'Website', value: 'https://www.smilefoundationindia.org', small: true },
  { label: 'Time zone', value: 'Asia/Kolkata' },
  { label: 'Currency', value: 'INR' },
  { label: 'Language', value: 'en-IN' }
];

export const ADDRESS = {
  line1: '161 B/4, 3rd Floor, Gulmohar House',
  line2: 'Yusuf Sarai Community Centre',
  city: 'New Delhi, Delhi',
  postcode: '110049',
  country: 'India'
};

export const ABOUT =
  'A national development organisation working for the education, healthcare and livelihood of underprivileged children, their families and communities across India.';

/** no documents were submitted for this organisation */
export const DOCUMENTS: OrgDocument[] = [];

export const WEB_ADDRESSES: WebAddress[] = [
  { address: 'smilefoundation.localhost', kind: 'Subdomain', primary: true, verifiedOn: '14 Oct 2026' }
];

export const HISTORY: HistoryEntry[] = [
  { day: '14 Oct', time: '2026 · 10:03 PM', label: 'Active', from: 'approved', by: 'Vikram Anand', tone: 'success' },
  { day: '14 Oct', time: '2026 · 10:03 PM', label: 'Approved', from: 'submitted', by: 'Vikram Anand', tone: 'success' },
  { day: '14 Oct', time: '2026 · 10:03 PM', label: 'Submitted For Approval', from: 'invitation accepted', by: 'Anjali Prakash', tone: 'warning' },
  { day: '14 Oct', time: '2026 · 10:03 PM', label: 'Invitation Accepted', from: 'invited', by: 'Anjali Prakash', tone: 'info' },
  { day: '14 Oct', time: '2026 · 10:03 PM', label: 'Invitation Sent', by: 'Vikram Anand', tone: 'info' }
];
