
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

export const USERS: IamUser[] = [
  staff(1, 'Arvind Murali', 'TENANT_ADMIN', 'Head Office - New Delhi', 'Administration', 'Organisation administrator', '', '+91 9810022451'),
  staff(2, 'Ritu Anil', 'CAMPAIGN_MANAGER', 'Head Office - New Delhi', 'Fundraising', 'Campaign manager', 'Arvind Murali', '+91 9810045122'),
  staff(3, 'Priyanka Naveen', 'FUNDRAISING_MANAGER', 'Head Office - New Delhi', 'Fundraising', 'Fundraising manager', 'Arvind Murali', '+91 9811078340'),
  staff(4, 'Aditya Ganesh', 'CAMPAIGN_EXECUTIVE', 'Chennai Regional Office', 'Fundraising', 'Campaign executive', 'Ritu Anil', '+91 9840012876'),
  staff(5, 'Kavya Srinivasan', 'CAMPAIGN_EXECUTIVE', 'Chennai Regional Office', 'Fundraising', 'Campaign executive', 'Ritu Anil', '+91 9840066213'),
  staff(6, 'Rahul Menon', 'FUNDRAISER_EXECUTIVE', 'Mumbai Regional Office', 'Fundraising', 'Fundraiser executive', 'Priyanka Naveen', '+91 9820031459'),
  staff(7, 'Divya Krishnan', 'FUNDRAISER_EXECUTIVE', 'Mumbai Regional Office', 'Fundraising', 'Fundraiser executive', 'Priyanka Naveen', '+91 9820047761'),
  staff(8, 'Sanjay Pillai', 'DONORCARE', 'Chennai Regional Office', 'Donor Care', 'Donor care associate', 'Priyanka Naveen', '+91 9840090318'),
  staff(9, 'Nithya Ramesh', 'DONORCARE', 'Mumbai Regional Office', 'Donor Care', 'Donor care associate', 'Priyanka Naveen', '+91 9820058804'),
  donor(10, 'Ajay Sekar', '+91 9884031275'),
  donor(11, 'Padma Narayanan'),
  donor(12, 'Prakash Subhash'),
  donor(13, 'Ishita Rakesh'),
  donor(14, 'Ramesh Chandran'),
  donor(15, 'Anita Jagdish'),
  donor(16, 'Kiran Manoj'),
  donor(17, 'Vinod Kishore'),
  donor(18, 'Joseph Daniel'),
  donor(19, 'Meena Raghavan'),
  donor(20, 'Suresh Iyer'),
  donor(21, 'Lakshmi Prabhu')
];

// -------------------------------------------------------------------------------------
// PERMISSIONS
// -------------------------------------------------------------------------------------
export type PermAction = 'view' | 'create' | 'edit' | 'submit' | 'approve' | 'operate' | 'export';
export const PERM_ACTIONS: PermAction[] = ['view', 'create', 'edit', 'submit', 'approve', 'operate', 'export'];
export const PERM_ACTION_LABEL: Record<PermAction, string> = {
  view: 'View', create: 'Create', edit: 'Edit', submit: 'Submit', approve: 'Approve', operate: 'Operate', export: 'Export'
};

export interface PermArea { key: string; name: string; prefix: string; icon: string; }
export const PERM_AREAS: PermArea[] = [
  { key: 'campaigns', name: 'Campaigns', prefix: 'cmp', icon: 'flag' },
  { key: 'donors', name: 'Donors & Leads', prefix: 'don', icon: 'heart' },
  { key: 'iam', name: 'Identity and Access', prefix: 'iam', icon: 'shield' },
  { key: 'donations', name: 'Donations', prefix: 'dnt', icon: 'coin' },
  { key: 'platform', name: 'Platform', prefix: 'plt', icon: 'layers' }
];

export interface Permission {
  code: string;
  name: string;
  area: string;
  action: PermAction;
  sensitive: boolean;
}

/** [name, action, sensitive] per area */
const CATALOG: Record<string, [string, PermAction, boolean][]> = {
  campaigns: [
    ['View campaigns', 'view', false], ['View donation attribution', 'view', false], ['View budget and target plans', 'view', false],
    ['View readiness checklist', 'view', false], ['View tracking assets', 'view', false],
    ['Create campaigns', 'create', false], ['Create tracking assets', 'create', false],
    ['Edit campaigns', 'edit', false], ['Allocate budget and target plans', 'edit', false],
    ['Revise budget and target plans', 'edit', false], ['Edit tracking assets', 'edit', false],
    ['Submit campaigns for approval', 'submit', false], ['Submit budget plans for approval', 'submit', false],
    ['Request an attribution correction', 'submit', false],
    ['Approve campaigns', 'approve', true], ['Approve budget plans', 'approve', true],
    ['Approve campaign closure', 'approve', true], ['Approve campaign readiness', 'approve', true],
    ['Pause campaigns', 'operate', true], ['Resume campaigns', 'operate', true],
    ['Close campaigns', 'operate', true], ['Launch campaigns', 'operate', true],
    ['Export attributed donations', 'export', true], ['Export budget plans', 'export', false]
  ],
  donors: [
    ['View assignment board', 'view', false], ['View consent centre', 'view', false], ['View donors', 'view', false],
    ['View leads', 'view', false], ['View follow-ups', 'view', false],
    ['Create leads', 'create', false], ['Create follow-ups', 'create', false],
    ['Edit donors', 'edit', false], ['Correct consent', 'edit', true],
    ['Assign from board', 'operate', false], ['Reassign from board', 'operate', false], ['Bulk route leads', 'operate', true],
    ['Grant consent', 'operate', true], ['Withdraw consent', 'operate', true],
    ['Export donors', 'export', true], ['Export leads', 'export', true]
  ],
  iam: [
    ['View Access requests', 'view', false], ['View Access reviews', 'view', false], ['View users', 'view', false],
    ['View roles', 'view', false], ['View permissions', 'view', false],
    ['Create Access requests', 'create', false], ['Create users', 'create', true], ['Create roles', 'create', true],
    ['Edit users', 'edit', true], ['Edit roles', 'edit', true],
    ['Submit Access requests', 'submit', false], ['Withdraw Access requests', 'submit', false],
    ['Approve Access requests', 'approve', true], ['Reject Access requests', 'approve', true],
    ['Suspend users', 'operate', true], ['Reset sign-in', 'operate', true],
    ['Export Access requests', 'export', true], ['Export users', 'export', true]
  ],
  donations: [
    ['View donations', 'view', false], ['View chargebacks', 'view', false],
    ['Record an offline donation', 'create', true], ['Correct donations', 'edit', true],
    ['Submit chargeback evidence', 'submit', true], ['Approve refunds', 'approve', true],
    ['Assign chargeback cases', 'operate', false], ['Resolve chargeback cases', 'operate', true],
    ['Reconcile donations', 'operate', true], ['Issue receipts', 'operate', true],
    ['Export donations', 'export', true], ['Export receipts', 'export', false]
  ],
  platform: [
    ['View Audit', 'view', true], ['View Business units', 'view', false], ['View Organisations', 'view', false],
    ['View Menu catalogue', 'view', false], ['Create Business units', 'create', true],
    ['Edit Business units', 'edit', true], ['Edit Organisations', 'edit', true],
    ['Manage settings Business units', 'operate', true], ['Manage Menu catalogue', 'operate', true],
    ['Export Audit', 'export', true]
  ]
};

export const PERMISSIONS: Permission[] = PERM_AREAS.flatMap((a) =>
  CATALOG[a.key].map(([name, action, sensitive]) => ({
    code: `${a.prefix}.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name, area: a.key, action, sensitive
  }))
);

const pick = (fn: (p: Permission) => boolean): string[] => PERMISSIONS.filter(fn).map((p) => p.code);
const named = (...names: string[]): string[] => PERMISSIONS.filter((p) => names.includes(p.name)).map((p) => p.code);

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
}

export const ROLES: IamRole[] = [
  {
    code: 'TENANT_ADMIN', name: 'Organisation Admin', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: 'Runs the organisation workspace: people, roles, menus, settings and audit. Holds every permission in this organisation.',
    privileged: true, builtIn: true, isDefault: false, priority: 100, all: true,
    grants: PERMISSIONS.map((p) => p.code), blocks: [], incompatible: [], lastChanged: ''
  },
  {
    code: 'CAMPAIGN_MANAGER', name: 'Campaign Manager', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: "Owns the organisation's campaigns: plans and prepares them, approves, pauses, resumes and closes them, and decides tracking assets, readiness and budgets. Never approves a campaign they created or submitted.",
    privileged: true, builtIn: true, isDefault: false, priority: 80,
    grants: [
      ...pick((p) => p.area === 'campaigns' && ['view', 'approve', 'operate', 'export'].includes(p.action)),
      ...named('View donations', 'View Access requests', 'Create Access requests', 'Submit Access requests', 'Withdraw Access requests')
    ],
    blocks: [], incompatible: [], lastChanged: ''
  },
  {
    code: 'FUNDRAISING_MANAGER', name: 'Fundraising Manager', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: 'Leads fundraising across donors, leads and donations: routes work to the team, approves refunds and keeps consent and receipts in order.',
    privileged: true, builtIn: true, isDefault: false, priority: 75,
    grants: [
      ...pick((p) => p.area === 'donors' || p.area === 'donations'),
      ...pick((p) => p.area === 'campaigns' && (p.action === 'view' || p.action === 'export')),
      ...named('View Access requests', 'Create Access requests', 'Submit Access requests')
    ],
    blocks: [], incompatible: [], lastChanged: ''
  },
  {
    code: 'CAMPAIGN_EXECUTIVE', name: 'Campaign Executive', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: 'Prepares campaigns day to day: creates and edits campaigns, tracking assets and budget drafts, then submits them for approval.',
    privileged: false, builtIn: true, isDefault: true, priority: 60,
    grants: [
      ...pick((p) => p.area === 'campaigns' && ['view', 'create', 'edit', 'submit'].includes(p.action)),
      ...named('View donors', 'View leads', 'View donations', 'View Access requests', 'Create Access requests', 'Submit Access requests')
    ],
    blocks: [], incompatible: [], lastChanged: ''
  },
  {
    code: 'FUNDRAISER_EXECUTIVE', name: 'Fundraiser Executive', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: 'Works leads and donors: captures leads, follows up, records offline donations and keeps donor details current.',
    privileged: false, builtIn: true, isDefault: false, priority: 55,
    grants: [
      ...pick((p) => p.area === 'donors' && !p.sensitive),
      ...named('View campaigns', 'View donations', 'Record an offline donation', 'View Access requests', 'Create Access requests', 'Submit Access requests')
    ],
    blocks: [], incompatible: [], lastChanged: ''
  },
  {
    code: 'DONORCARE', name: 'DonorCare', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: 'Looks after donors after they give: consent requests, receipts and chargeback cases.',
    privileged: false, builtIn: true, isDefault: false, priority: 50,
    grants: named('View donors', 'View consent centre', 'Grant consent', 'Withdraw consent', 'Correct consent', 'View donations',
      'View chargebacks', 'Assign chargeback cases', 'Submit chargeback evidence', 'Issue receipts', 'View Access requests',
      'Create Access requests', 'Submit Access requests'),
    blocks: [], incompatible: [], lastChanged: ''
  },
  {
    code: 'DONOR', name: 'Donor', status: 'active', type: 'Organisation', owningFunction: '',
    purpose: 'Self-service access for donors: sees the campaigns they support and their own donations and receipts.',
    privileged: false, builtIn: true, isDefault: false, priority: 10,
    grants: named('View campaigns', 'View donations', 'Export receipts', 'View consent centre', 'Grant consent', 'Withdraw consent'),
    blocks: [], incompatible: [], lastChanged: ''
  }
];

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

export const AUDIT_EVENTS: AuditEvent[] = [
  ev(21, '2026-10-20T11:22:00', 'User contact viewed', 'iam.user.contact.viewed', 'Padma Narayanan', 'User', 'personPlus'),
  ev(20, '2026-10-20T11:20:40', 'User contact viewed', 'iam.user.contact.viewed', 'Ajay Sekar', 'User', 'personPlus'),
  ev(19, '2026-10-20T11:20:20', 'User contact viewed', 'iam.user.contact.viewed', 'Prakash Subhash', 'User', 'personPlus'),
  ev(18, '2026-10-20T11:20:05', 'User contact viewed', 'iam.user.contact.viewed', 'Padma Narayanan', 'User', 'personPlus'),
  ev(17, '2026-10-20T11:19:00', 'Tenant selected', 'iam.auth.tenant.selected', 'HelpAge India', 'Tenant', 'fingerprint'),
  ev(16, '2026-10-19T08:10:00', 'Tenant selected', 'iam.auth.tenant.selected', 'HelpAge India', 'Tenant', 'fingerprint'),
  ev(15, '2026-10-19T07:58:00', 'Role viewed', 'iam.role.viewed', 'Campaign Manager', 'Role', 'role'),
  ev(14, '2026-10-19T13:05:00', 'Menu catalogue viewed', 'plt.menu.catalogue.viewed', 'Donors & Leads', 'Menu', 'layout'),
  ev(13, '2026-10-18T20:15:00', 'User created', 'iam.user.created', 'Ajay Sekar', 'User', 'personPlus'),
  ev(12, '2026-10-18T19:40:00', 'User created', 'iam.user.created', 'Joseph Daniel', 'User', 'personPlus'),
  ev(11, '2026-10-17T21:30:00', 'Role viewed', 'iam.role.viewed', 'Fundraising Manager', 'Role', 'role'),
  ev(10, '2026-10-17T19:05:00', 'Tenant selected', 'iam.auth.tenant.selected', 'HelpAge India', 'Tenant', 'fingerprint'),
  ev(9, '2026-10-16T18:20:00', 'User created', 'iam.user.created', 'Vinod Kishore', 'User', 'personPlus'),
  ev(8, '2026-10-16T13:45:00', 'Business unit viewed', 'plt.business-unit.viewed', 'Head Office - New Delhi', 'Business unit', 'unit'),
  ev(7, '2026-10-15T22:10:00', 'User created', 'iam.user.created', 'Kiran Manoj', 'User', 'personPlus'),
  ev(6, '2026-10-15T20:30:00', 'Role assigned', 'iam.user.role.assigned', 'Arvind Murali', 'User', 'role'),
  ev(5, '2026-10-14T23:05:00', 'Password changed', 'iam.auth.password.changed', 'Vikram Anand', 'User', 'lock'),
  ev(4, '2026-10-14T22:03:00', 'Tenant selected', 'iam.auth.tenant.selected', 'HelpAge India', 'Tenant', 'fingerprint'),
  ev(3, '2026-10-12T19:50:00', 'Organisation created', 'plt.organisation.created', 'HelpAge India', 'Tenant', 'building'),
  ev(2, '2026-10-11T06:40:00', 'Role viewed', 'iam.role.viewed', 'Organisation Admin', 'Role', 'role'),
  ev(1, '2026-10-11T07:15:00', 'Menu catalogue viewed', 'plt.menu.catalogue.viewed', 'Users & Access', 'Menu', 'layout')
];

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
export const SESSIONS: IamSession[] = [
  { id: 's1', device: 'Chrome on Windows', detail: 'Chrome on Windows · 172.18.0.1', lastActive: '2026-10-20T11:24:00', current: true },
  { id: 's2', device: 'Chrome on Windows', detail: 'Chrome on Windows · 172.18.0.1', lastActive: '2026-10-20T11:19:00', current: false }
];

export interface SecurityActivity { id: string; title: string; detail: string; at: string; }
export const SECURITY_ACTIVITY: SecurityActivity[] = [
  '2026-10-20T11:20:00', '2026-10-20T10:06:00', '2026-10-19T09:05:00', '2026-10-18T17:29:00', '2026-10-17T15:42:00',
  '2026-10-17T14:51:00', '2026-10-16T10:13:00', '2026-10-15T09:16:00', '2026-10-14T22:03:00'
].map((at, i) => ({ id: 'a' + i, title: 'Signed in', detail: 'Chrome on Windows · from 172.18.0.1', at }));

// -------------------------------------------------------------------------------------
// ROUTES + CREATE-USER OPTIONS
// -------------------------------------------------------------------------------------
/** Routes of the Users & Access screens (same paths as the sidebar menu). */
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
