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
  /** ISO code of the campaign's currency (from the API). */
  currency?: string;
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
  /** API identity - set when the campaign was loaded from the server */
  id?: string;
  version?: number;
}

export type CheckStatus = 'pending' | 'passed' | 'failed';
/** A readiness category's display word - the server's own list (reference data), so it is not fixed here. */
export type CheckCategory = string;

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
export const CAMPAIGNS: CampaignInfo[] = [];

/* ---------------------------------------------------------------------------- readiness */
export const CHECKS: ReadinessCheck[] = [];

/* ---------------------------------------------------------------------------- tracking assets */
const DONOR_FORM = `${typeof location !== 'undefined' ? location.origin : ''}/auth/donor-form`;
export const destinationFor = (code: string): string => `${DONOR_FORM}?campaignCode=${code}`;

export const ASSETS: TrackingAsset[] = [];

/* ---------------------------------------------------------------------------- activity + donations */
export const ACTIVITY: Activity[] = [];

export const DONATIONS: Donation[] = [];

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
/** The readiness categories, filled in place by the workspace store from the API's reference data. */
export const CATEGORIES: CheckCategory[] = [];
/** Names that can own a readiness check - filled in place by the workspace store from the API. */
export const PEOPLE: string[] = [];
/** The signed-in decision maker (approvals, rejections). */
export const CURRENT_USER = '';

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
/**
 * The session's Organisation as AuthTokenService keeps it (sessionStorage 'ydot.tenant'). Read here
 * because these helpers are plain functions the templates call without injection.
 */
const tenantDefaults = (): { timeZone?: string | null; defaultCurrency?: string | null } => {
  try {
    return (JSON.parse(sessionStorage.getItem('ydot.tenant') ?? 'null') as { timeZone?: string | null; defaultCurrency?: string | null } | null) ?? {};
  } catch {
    return {};
  }
};

/**
 * Money in the Organisation's own currency (NEW-10). This always printed ₹, whatever currency the
 * Organisation works in. Indian digit grouping is kept; the symbol follows the currency.
 */
export const inr = (n: number): string => {
  const currency = (tenantDefaults().defaultCurrency ?? '').trim().toUpperCase() || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(n));
  } catch {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
};

/** Whole days between two ISO dates (to - from). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86400000);

/** Today in the workspace (Asia/Calcutta) as yyyy-mm-dd. */
/**
 * Today as yyyy-mm-dd in the Organisation's time zone (NEW-10). This added a fixed 330 minutes,
 * which is India's offset and wrong for any Organisation elsewhere. Falls back to the browser's
 * own day when the Organisation's zone is not known.
 */
export const todayIso = (): string => {
  const parts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  const zone = tenantDefaults().timeZone?.trim() || undefined;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...parts, timeZone: zone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', parts).format(new Date());
  }
};

/** Two-letter initials ("Priyanka Naveen" -> "PN"). */
export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
