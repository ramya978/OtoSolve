/** Types for the Platform page. The page loads its data from the API (NEW-12: the sample constants are gone). */

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
