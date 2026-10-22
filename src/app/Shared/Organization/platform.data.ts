/** Sample data for the Platform page. Replace with your API / real data source. */

export type Tone = 'success' | 'warning' | 'info' | 'danger' | 'muted';

export interface PlatformRecord {
  name: string;
  reference: string;
  legalName: string;
  rootDomain: string;
  contact: string;
  support: string;
  defaults: string;
  about: string;
  status: string;
  /** maximum organisations allowed, null = no limit set */
  organisationLimit: number | null;
}

export interface Stage {
  key: string;
  label: string;
  /** short wording used in the summary strip */
  hint: string;
  count: number;
  tone: Tone;
}

export const PLATFORM: PlatformRecord = {
  name: 'NGoPlanet',
  reference: 'BU001',
  legalName: 'NGoPlanet',
  rootDomain: 'localhost',
  contact: 'rajat.sivan@gmail.com',
  support: 'rajat.sivan@gmail.com',
  defaults: 'Asia/Kolkata · INR · en-IN',
  about: 'Root business unit for the YDot platform.',
  status: 'Active',
  organisationLimit: null
};

export const STAGES: Stage[] = [
  { key: 'active', label: 'Active', hint: 'Currently active', count: 2, tone: 'success' },
  { key: 'review', label: 'Awaiting review', hint: 'Under review', count: 0, tone: 'warning' },
  { key: 'onboarding', label: 'Still onboarding', hint: 'Still onboarding', count: 2, tone: 'info' },
  { key: 'rejected', label: 'Rejected', hint: 'Rejected', count: 0, tone: 'danger' },
  { key: 'suspended', label: 'Suspended', hint: 'Temporarily suspended', count: 0, tone: 'danger' },
  { key: 'archived', label: 'Archived', hint: 'Archived', count: 0, tone: 'muted' }
];
