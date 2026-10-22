
export interface IamOption {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
  initials?: string;
  disabled?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const initialsOf = (name: string): string => {
  const w = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '·';
};

export const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

export const fmtDateTime = (iso: string): string => `${fmtDate(iso)}, ${fmtTime(iso).toLowerCase()}`;

export const slugCode = (text: string): string =>
  text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export const dayLabel = (iso: string, now: Date = IAM_NOW): string => {
  const d = new Date(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : fmtDate(iso);
};

export const IAM_NOW = new Date('2026-10-20T11:24:00');

export const ORG_NAME = 'HelpAge India';

export type UserStatus = 'active' | 'invited' | 'suspended' | 'draft' | 'deactivated' | 'expired' | 'withdrawn';

export interface IamUser {
  id: string;
  ref: string;
  name: string;
  email: string;
  username: string;
  preferredName: string;
  mobile: string;
  role: string;       
  unit: string;
  department: string;
  designation: string;
  manager: string;
  status: UserStatus;
  invitation: 'Accepted' | 'Pending' | 'Expired';
  mfaEnrolled: boolean;
  dataScope: string;
  accessFrom: string;  
  lastSignIn: string;  
}

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active', invited: 'Invited', suspended: 'Suspended', draft: 'Draft',
  deactivated: 'Deactivated', expired: 'Expired', withdrawn: 'Withdrawn'
};

const donor = (n: number, name: string, mobile = ''): IamUser => {
  const user = name.toLowerCase().replace(/\s+/g, '.');
  return {
    id: 'u' + n, ref: 'USR-' + String(n).padStart(5, '0'), name, email: `${user}@mail.test`, username: user,
    preferredName: '', mobile, role: 'DONOR', unit: '', department: '', designation: '', manager: '',
    status: 'active', invitation: 'Accepted', mfaEnrolled: false, dataScope: 'Whole organisation',
    accessFrom: '2026-10-14', lastSignIn: ''
  };
};

const staff = (n: number, name: string, role: string, unit: string, department: string, designation: string,
               manager: string, mobile: string, lastSignIn = ''): IamUser => {
  const user = name.toLowerCase().replace(/\s+/g, '.');
  return {
    id: 'u' + n, ref: 'USR-' + String(n).padStart(5, '0'), name, email: `${user}@helpageindia.test`, username: user,
    preferredName: '', mobile, role, unit, department, designation, manager,
    status: 'active', invitation: 'Accepted', mfaEnrolled: false, dataScope: 'Whole organisation',
    accessFrom: '2026-10-14', lastSignIn
  };
};

export const USERS: IamUser[] = [];

// -------------------------------------------------------------------------------------
// PERMISSIONS
// -------------------------------------------------------------------------------------
export type PermAction = 'view' | 'create' | 'edit' | 'submit' | 'approve' | 'operate' | 'export';
export const PERM_ACTIONS: PermAction[] = ['view', 'create', 'edit', 'submit', 'approve', 'operate', 'export'];
export const PERM_ACTION_LABEL: Record<PermAction, string> = {
  view: 'View', create: 'Create', edit: 'Edit', submit: 'Submit', approve: 'Approve', operate: 'Operate', export: 'Export'
};

export interface PermArea { key: string; name: string; prefix: string; icon: string; }
/** Filled in place from the server's permission matrix (see IamRolesStore). */
export const PERM_AREAS: PermArea[] = [];

export interface Permission {
  code: string;
  name: string;
  area: string;
  action: PermAction;
  sensitive: boolean;
}

/** Filled in place from the server's permission matrix (see IamRolesStore). */
export const PERMISSIONS: Permission[] = [];

// -------------------------------------------------------------------------------------
// ROLES
// -------------------------------------------------------------------------------------
export type RoleStatus = 'draft' | 'active' | 'inactive';
export const ROLE_STATUS_LABEL: Record<RoleStatus, string> = { draft: 'Draft', active: 'Active', inactive: 'Inactive' };

export interface IamRole {
  code: string;
  name: string;
  purpose: string;
  status: RoleStatus;
  type: string;
  owningFunction: string;
  privileged: boolean;
  builtIn: boolean;
  isDefault: boolean;
  priority: number;
  grants: string[];
  blocks: string[];
  incompatible: string[];
  lastChanged: string;
  all?: boolean;
  /** API identity — set when the role was loaded from the server */
  id?: string;
  version?: number;
  members?: number;
}

/** Roles now come from the API (IamRolesStore). */
export const ROLES: IamRole[] = [];

// -------------------------------------------------------------------------------------
// MENUS
// -------------------------------------------------------------------------------------
export interface MenuItem { code: string; name: string; route: string; permission: string; inUse: boolean; }
export interface MenuGroup { code: string; name: string; icon: string; permission: string; inUse: boolean; module: string; items: MenuItem[]; }

const mi = (name: string, route: string, permission: string, inUse = true): MenuItem =>
  ({ code: slugCode(name), name, route, permission, inUse });

export const MENUS: MenuGroup[] = [
  { code: 'DASHBOARD', name: 'Dashboard', icon: 'grid', permission: '', inUse: true, module: 'Platform', items: [] },
  {
    code: 'DONORS_LEADS', name: 'Donors & Leads', icon: 'heart', permission: 'DON.View', inUse: true, module: 'Donors & Leads', items: [
      mi('Lead Work Queue', '/app/fundraising/relationships/lead-work-queue', 'don.lead-work-queue.view'),
      mi('My Leads', '/app/fundraising/relationships/my-leads', 'don.lead-work-queue.view'),
      mi('All Donors', '/app/fundraising/relationships/donor-list', 'don.donors.view'),
      mi('My Donors', '/app/fundraising/relationships/my-donor-list', 'don.donors.view'),
      mi('Follow-ups', '/app/fundraising/relationships/follow-up-queue', 'don.follow-up-planner.view')
    ]
  },
  {
    code: 'CAMPAIGNS', name: 'Campaigns', icon: 'flag', permission: 'CMP.View', inUse: true, module: 'Campaigns', items: [
      mi('All campaigns', '/app/fundraising/campaigns/register', 'cmp.campaigns.view'),
      mi('Campaign lifecycle', '/app/fundraising/campaigns/lifecycle', 'cmp.campaigns.view')
    ]
  },
  {
    code: 'DONATIONS', name: 'Donations', icon: 'coin', permission: 'DNT.View', inUse: true, module: 'Donations', items: [
      mi('Payments & receipts', '/app/fundraising/donations/payments', 'dnt.donations.view'),
      mi('Chargebacks', '/app/fundraising/donations/chargebacks', 'dnt.chargebacks.view')
    ]
  },
  {
    code: 'COMMUNICATIONS', name: 'Communications', icon: 'chat', permission: 'COM.View', inUse: true, module: 'Communications', items: [
      mi('Communication timeline', '/app/communications/timeline', 'com.timeline.view'),
      mi('Log communication', '/app/communications/log', 'com.log.create'),
      mi('Templates', '/app/communications/templates', 'com.templates.view', false),
      mi('Bulk messages', '/app/communications/bulk', 'com.bulk.send', false),
      mi('Delivery reports', '/app/communications/reports', 'com.reports.view', false)
    ]
  },
  {
    code: 'ORGANISATION', name: 'Organisation', icon: 'home', permission: 'ORG.View', inUse: true, module: 'Platform', items: [
      mi('Organisation profile', '/app/organisation/profile', 'plt.organisations.view'),
      mi('Business units', '/app/organisation/units', 'plt.business-units.view'),
      mi('Departments', '/app/organisation/departments', 'plt.business-units.view'),
      mi('Designations', '/app/organisation/designations', 'plt.business-units.view')
    ]
  },
  {
    code: 'USERS_ACCESS', name: 'Users & Access', icon: 'people', permission: 'IAM.View', inUse: true, module: 'Identity and Access', items: [
      mi('Users', '/app/iam/users', 'iam.users.view'),
      mi('Roles & Permissions', '/app/iam/roles', 'iam.roles.view'),
      mi('Menu configuration', '/app/iam/menus', 'plt.menu-catalogue.view'),
      mi('Access requests', '/app/iam/access-requests', 'iam.access-requests.view'),
      mi('Audit trail', '/app/iam/audit', 'plt.audit.view')
    ]
  },
  {
    code: 'MASTER_DATA', name: 'Master Data', icon: 'database', permission: 'MDM.View', inUse: true, module: 'Platform', items: [
      mi('Funds', '/app/master/funds', 'mdm.funds.view'),
      mi('Payment methods', '/app/master/payment-methods', 'mdm.payment-methods.view'),
      mi('Locations', '/app/master/locations', 'mdm.locations.view'),
      mi('Lead sources', '/app/master/lead-sources', 'mdm.lead-sources.view'),
      mi('Tags', '/app/master/tags', 'mdm.tags.view')
    ]
  },
  {
    code: 'WORKSPACE', name: 'Workspace', icon: 'layout', permission: 'WSP.View', inUse: true, module: 'Platform', items: [
      mi('Template collection', '/app/workspace/templates', 'wsp.templates.view', false),
      mi('Grid & table studio', '/app/workspace/grid-studio', 'wsp.grid.view', false),
      mi('Calendar studio', '/app/workspace/calendar', 'wsp.calendar.view', false),
      mi('Dashboard gallery', '/app/workspace/dashboards', 'wsp.dashboards.view', false)
    ]
  },
  {
    code: 'FINANCE', name: 'Finance', icon: 'wallet', permission: 'FIN.View', inUse: false, module: 'Finance', items: [
      mi('Ledger', '/app/finance/ledger', 'fin.ledger.view', false),
      mi('Fund allocation', '/app/finance/allocation', 'fin.allocation.view', false),
      mi('Reports', '/app/finance/reports', 'fin.reports.view', false)
    ]
  },
  {
    code: 'SUPPLY', name: 'Supply', icon: 'box', permission: 'SUP.View', inUse: false, module: 'Supply', items: [
      mi('Stock', '/app/supply/stock', 'sup.stock.view', false),
      mi('Purchase orders', '/app/supply/purchase-orders', 'sup.orders.view', false),
      mi('Vendors', '/app/supply/vendors', 'sup.vendors.view', false)
    ]
  }
];

export const MENU_MODULES = ['Platform', 'Donors & Leads', 'Campaigns', 'Donations', 'Communications', 'Identity and Access', 'Finance', 'Supply'];

// -------------------------------------------------------------------------------------
// ACCESS REQUESTS
// -------------------------------------------------------------------------------------
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn'
};
export interface AccessRequest {
  ref: string;
  person: string;
  role: string;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  until: string;
}
/** No requests yet in this sample organisation. */
export const ACCESS_REQUESTS: AccessRequest[] = [];

// -------------------------------------------------------------------------------------
// AUDIT TRAIL
// -------------------------------------------------------------------------------------
export type AuditOutcome = 'succeeded' | 'denied' | 'failed';
export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  code: string;
  by: string;
  byRole: string;
  on: string;
  onType: string;   // record type
  outcome: AuditOutcome;
  icon: string;
}

const ev = (id: number, at: string, action: string, code: string, on: string, onType: string, icon: string): AuditEvent =>
  ({ id: 'e' + id, at, action, code, by: 'Vikram Anand', byRole: 'Platform administrator', on, onType, outcome: 'succeeded', icon });

export const AUDIT_EVENTS: AuditEvent[] = [];

// -------------------------------------------------------------------------------------
// MY SECURITY (signed-in account)
// -------------------------------------------------------------------------------------
export const ME = {
  name: 'Vikram Anand',
  username: 'vikram.anand',
  email: 'vikram.anand@ngoplanet.test',
  passwordChanged: '2026-10-14T22:03:00',
  mfaRequirement: 'Optional · not set up',
  failedSignIns: 0,
  attemptsLeft: 5,
  recoveryCodesLeft: 0
};

export interface IamSession { id: string; device: string; detail: string; lastActive: string; current: boolean; }
export const SESSIONS: IamSession[] = [];

export interface SecurityActivity { id: string; title: string; detail: string; at: string; }
export const SECURITY_ACTIVITY: SecurityActivity[] = [];

export const IAM_PATHS = {
  users: '/app/administration/access/user-directory',
  createUser: '/app/administration/access/create-user',
  bulkUsers: '/app/administration/users/bulk-actions'
};

export const TITLES = ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Mx'];

export const COUNTRY_CODES: { code: string; country: string }[] = [
  { code: '+91', country: 'India' }, { code: '+977', country: 'Nepal' }, { code: '+94', country: 'Sri Lanka' },
  { code: '+880', country: 'Bangladesh' }, { code: '+971', country: 'United Arab Emirates' }, { code: '+65', country: 'Singapore' },
  { code: '+44', country: 'United Kingdom' }, { code: '+1', country: 'United States / Canada' }, { code: '+61', country: 'Australia' }
];


export const UNITS = ['Head Office - New Delhi', 'Chennai Regional Office', 'Mumbai Regional Office', 'Kolkata Regional Office', 'Bengaluru Regional Office'];

export const DEPARTMENTS = ['Administration', 'Fundraising', 'Campaigns and Communications', 'Donor Care', 'Programmes', 'Finance', 'Volunteers'];

export const LANGUAGES = ['English (India)', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali'];

export const TIME_ZONES = ['Asia/Kolkata (IST, UTC+05:30)', 'Asia/Kathmandu (UTC+05:45)', 'Asia/Dhaka (UTC+06:00)', 'Asia/Dubai (UTC+04:00)', 'Europe/London (UTC+00:00)'];

export const DATA_SCOPES: { value: string; label: string; hint: string }[] = [
  { value: 'org', label: 'Whole organisation', hint: 'Every unit and department' },
  { value: 'unit', label: 'Own organisation unit', hint: 'Only records of the chosen unit' },
  { value: 'dept', label: 'Own department', hint: 'Only records of the chosen department' },
  { value: 'own', label: 'Own records only', hint: 'Records the person owns or is assigned' }
];
