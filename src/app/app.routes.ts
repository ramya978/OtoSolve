import { inject } from '@angular/core';
import { Route, Router, Routes } from '@angular/router';
import { environment } from '../environments/environment';
import { MENU_DATA, MenuItem } from './Shared/layout/menu.data';
import { MenuPage } from './Shared/layout/menu-page';
import { LC_PATHS } from './pages/Donor & Leads/lead-capture/lc-shared';
import { GRANTS, Grants, authGuard, guestGuard, menuGuard } from './Shared/Auth/auth.guard';

/* =====================================================================================================
   ROUTES

   EVERY PAGE IS LOADED WHEN IT IS FIRST OPENED (NEW-08). Every component used to be imported here,
   so the sign-in page downloaded the whole application: 7.2 MB of JavaScript, 2.2 MB over the
   project's own budget. Each route now names a loader instead.

   EVERY /app PAGE PASSES TWO GUARDS. `authGuard` (somebody is signed in) and `menuGuard` (their own
   menu offers the page - NEW-03). `data.grants` says which menu entries open a page; see grantsFor.

   UNFINISHED MODULES ARE NOT REGISTERED (NEW-04). Attendance runs on sample data kept in the
   browser and has no API; with `environment.features.attendance` off (production) its routes do
   not exist, so its pages cannot be opened and its code is never downloaded.
   ===================================================================================================== */

type Loader = NonNullable<Route['loadComponent']>;

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.children)]);

/* ---------- loaders ---------- */
const L = {
  // Auth and public
  Login: () => import('./pages/Auth/Login/login').then((m) => m.Login),
  ActivateAccount: () => import('./pages/Auth/Account_Activate/activate-account').then((m) => m.ActivateAccount),
  DonorForm: () => import('./pages/Auth/donorform/donorform').then((m) => m.DonorForm),
  MfaChallenge: () => import('./pages/Auth/Recovery/mfa-challenge').then((m) => m.MfaChallenge),
  ForgotPassword: () => import('./pages/Auth/Recovery/forgot-password').then((m) => m.ForgotPassword),
  ResetPassword: () => import('./pages/Auth/Recovery/reset-password').then((m) => m.ResetPassword),
  Reauthenticate: () => import('./pages/Auth/Recovery/reauthenticate').then((m) => m.Reauthenticate),
  PaymentResult: () => import('./pages/Donations/Payment_Result/payment-result').then((m) => m.PaymentResultComponent),
  Profile: () => import('./pages/Auth/Profile/profile').then((m) => m.Profile),
  Forbidden: () => import('./pages/Errors/forbidden').then((m) => m.Forbidden),
  Dashboard: () => import('./pages/Dashboard/dashboard').then((m) => m.Dashboard),

  // Donations
  PaymentsReceipts: () => import('./pages/Donations/Payment_History/payments-receipts').then((m) => m.PaymentsReceipts),
  NewDonation: () => import('./pages/Donations/New Donation/new-donation').then((m) => m.NewDonation),

  // Campaigns
  NewCampaign: () => import('./pages/Campaign/Campaign_Wizard/new-campaign').then((m) => m.NewCampaign),
  CampaignRegister: () => import('./pages/Campaign/Campaign_Register/campaign-register').then((m) => m.CampaignRegister),
  CampaignDetail: () => import('./pages/Campaign/campaign-detail/campaign-detail').then((m) => m.CampaignDetail),
  CampaignLifecycle: () => import('./pages/Campaign/campaign-lifecycle/campaign-lifecycle').then((m) => m.CampaignLifecycle),
  ReadinessChecklist: () => import('./pages/Campaign/readiness-checklist/readiness-checklist').then((m) => m.ReadinessChecklist),
  TrackingAssetForm: () => import('./pages/Campaign/tracking-asset-form/tracking-asset-form').then((m) => m.TrackingAssetForm),
  TrackingAssets: () => import('./pages/Campaign/tracking-assets/tracking-assets').then((m) => m.TrackingAssets),

  // Donors & leads
  LeadWorkQueue: () => import('./pages/Donor & Leads/Lead_Work_Queue/lead-work-queue').then((m) => m.LeadWorkQueue),
  LeadProfile: () => import('./pages/Donor & Leads/Lead_Profile/lead-profile').then((m) => m.LeadProfile),
  LeadCapture: () => import('./pages/Donor & Leads/lead-capture/lead-capture').then((m) => m.LeadCapture),
  LeadCaptureSingle: () => import('./pages/Donor & Leads/lead-capture/single/lead-capture-single').then((m) => m.LeadCaptureSingle),
  LeadCaptureBulk: () => import('./pages/Donor & Leads/lead-capture/bulk/lead-capture-bulk').then((m) => m.LeadCaptureBulk),
  AllDonors: () => import('./pages/Donor & Leads/All Donors/all-donors').then((m) => m.AllDonors),
  Donor360: () => import('./pages/Donor & Leads/Donor360/donor-360').then((m) => m.Donor360),
  DonorProfileEdit: () => import('./pages/Donor & Leads/Edit_Profile/donor-profile-edit').then((m) => m.DonorProfileEdit),
  ConsentCentre: () => import('./pages/Donor & Leads/Consent_Preferences/consent-centre').then((m) => m.ConsentCentre),
  LogCommunication: () => import('./pages/Donor & Leads/Log_communication/log-communication').then((m) => m.LogCommunication),
  CommunicationTimeline: () => import('./pages/Donor & Leads/Communication_Timeline/communication-timeline').then((m) => m.CommunicationTimeline),
  AssignmentBoard: () => import('./pages/Donor & Leads/Assignment_Board/assignment-board').then((m) => m.AssignmentBoard),
  FollowUpExecution: () => import('./pages/Donor & Leads/FollowUp_Execution/follow-up-execution').then((m) => m.FollowUpExecution),
  FollowUpPlanner: () => import('./pages/Donor & Leads/Follow_Planner/follow-up-planner').then((m) => m.FollowUpPlanner),
  FollowUps: () => import('./pages/Donor & Leads/Follow_Ups/follow-ups').then((m) => m.FollowUps),
  NewFollowUp: () => import('./pages/Donor & Leads/New_FollowUp/new-follow-up').then((m) => m.NewFollowUp),

  // Users & access
  Users: () => import('./pages/User_Access/Users/users').then((m) => m.Users),
  RolesPermissions: () => import('./pages/User_Access/Roles_Permissions/roles-permissions').then((m) => m.RolesPermissions),
  MenuConfiguration: () => import('./pages/User_Access/Menu_Configuration/menu-configuration').then((m) => m.MenuConfiguration),
  AccessRequests: () => import('./pages/User_Access/Access_Requests/access-requests').then((m) => m.AccessRequests),
  AuditTrail: () => import('./pages/User_Access/Audit_Trail/audit-trail').then((m) => m.AuditTrail),
  MySecurity: () => import('./pages/User_Access/My_Security/my-security').then((m) => m.MySecurity),
  CreateUser: () => import('./pages/User_Access/Create_User/create-user').then((m) => m.CreateUser),
  BulkUsers: () => import('./pages/User_Access/Bulk_Users/bulk-users').then((m) => m.BulkUsers),

  // Organisation and platform
  PlatformOverview: () => import('./pages/Organization/Business_Unit/platform-overview').then((m) => m.PlatformOverview),
  CreateOrganisation: () => import('./pages/Organization/Create_Org/create-organisation').then((m) => m.CreateOrganisation),
  MenuCatalogue: () => import('./pages/Organization/Menu_Catalogue/menu-catalogue').then((m) => m.MenuCatalogue),
  Organisations: () => import('./pages/Organization/Org_List/organisations').then((m) => m.Organisations),
  OrganisationProfile: () => import('./pages/Organization/Org_Profile/organisation-profile').then((m) => m.OrganisationProfile),
  PermissionCatalogue: () => import('./pages/Organization/Permission_Catalogue/permission-catalogue').then((m) => m.PermissionCatalogue),
  OrganisationEdit: () => import('./pages/Organization/Edit_Profile/organisation-edit').then((m) => m.OrganisationEdit),
  OrgAddOffice: () => import('./pages/Organization/Add_Branch/add-office').then((m) => m.OrgAddOffice),
  OrgBranches: () => import('./pages/Organization/Branch/branches').then((m) => m.OrgBranches),
  OrgDepartments: () => import('./pages/Organization/Department/departments').then((m) => m.OrgDepartments),
  OrgSettings: () => import('./pages/Organization/Settings/settings').then((m) => m.OrgSettings),

  // Communications
  WhatsappMessages: () => import('./pages/Communications/Whatsapp-Messages/whatsapp-messages').then((m) => m.WhatsappMessages),
  NumberVerification: () => import('./pages/Communications/Number-Verification/number-verification').then((m) => m.NumberVerification),

  // Masters
  Cities: () => import('./pages/Masters/Cities/cities').then((m) => m.Cities),
  CityForm: () => import('./pages/Masters/Cities/city-form').then((m) => m.CityForm),
  Countries: () => import('./pages/Masters/Countries/countries').then((m) => m.Countries),
  CountryForm: () => import('./pages/Masters/Countries/country-form').then((m) => m.CountryForm),
  Currencies: () => import('./pages/Masters/Currencies/currencies').then((m) => m.Currencies),
  CurrencyForm: () => import('./pages/Masters/Currencies/currency-form').then((m) => m.CurrencyForm),
  States: () => import('./pages/Masters/States/states').then((m) => m.States),
  StateForm: () => import('./pages/Masters/States/state-form').then((m) => m.StateForm),
  TimeZones: () => import('./pages/Masters/Time_Zones/time-zones').then((m) => m.TimeZones),
  TimeZoneForm: () => import('./pages/Masters/Time_Zones/time-zone-form').then((m) => m.TimeZoneForm),
} satisfies Record<string, Loader>;


/** Attendance: registered only while `environment.features.attendance` is on (NEW-04). */
const ATTENDANCE: Record<string, Loader> = {
  'app/attendance': () => import('./pages/Attendance/Attendance/attendance').then((m) => m.Attendance),
  'app/shift-planner': () => import('./pages/Attendance/shift-planner/shift-planner').then((m) => m.ShiftPlannerComponent),
  'app/shift-templates': () => import('./pages/Attendance/shift-templates/shift-templates').then((m) => m.ShiftTemplatesComponent),
  'app/permission-desk': () => import('./pages/Attendance/permission-desk/permission-desk').then((m) => m.PermissionDeskComponent),
  'app/attendance-policies': () => import('./pages/Attendance/attendance-policies/attendance-policies').then((m) => m.AttendancePoliciesComponent),
  'app/individual-attendance': () => import('./pages/Attendance/Individual_attendance/user_attendance').then((m) => m.IndividualAttendance),
  'app/bulk-attendance': () => import('./pages/Attendance/bulk-attendance/bulk-attendance').then((m) => m.BulkAttendance),
  // paths match ATTENDANCE_LINKS in attendance-data.service.ts
  'app/attendance/overview': () => import('./pages/Attendance/attendance-overview/attendance-overview').then((m) => m.AttendanceOverview),
  'app/attendance/punch-station': () => import('./pages/Attendance/punch-station/punch-station').then((m) => m.PunchStation),
  'app/attendance/field-hub': () => import('./pages/Attendance/attendance-field-hub/attendance-field-hub').then((m) => m.AttendanceFieldHub),
  'app/attendance/exceptions': () => import('./pages/Attendance/attendance-exceptions/attendance-exceptions').then((m) => m.AttendanceExceptions),
  'app/attendance/team-approvals': () => import('./pages/Attendance/team-approvals/team-approvals').then((m) => m.TeamApprovals),
  'app/attendance/leave': () => import('./pages/Attendance/leave-management/leave-management').then((m) => m.LeaveManagement),
  'app/attendance/holidays': () => import('./pages/Attendance/holiday-calendar/holiday-calendar').then((m) => m.HolidayCalendar),
  'app/attendance/company-calendar': () => import('./pages/Attendance/holiday-calendar/holiday-calendar').then((m) => m.CompanyCalendar),
  'app/attendance/approval-flow': () => import('./pages/Attendance/approval-flow/approval-flow').then((m) => m.ApprovalFlow),
  'app/attendance/geo-fencing': () => import('./pages/Attendance/geo-fencing/geo-fencing').then((m) => m.GeoFencing),
  'app/attendance/devices': () => import('./pages/Attendance/punch-devices/punch-devices').then((m) => m.PunchDevices),
  'app/attendance/locations': () => import('./pages/Attendance/work-locations/work-locations').then((m) => m.WorkLocations),
  'app/attendance/employees': () => import('./pages/Attendance/employee-directory/employee-directory').then((m) => m.EmployeeDirectory),
  'app/attendance/reports': () => import('./pages/Attendance/attendance-reports/attendance-reports').then((m) => m.AttendanceReports),
  'app/attendance/payroll': () => import('./pages/Attendance/payroll-summary/payroll-summary').then((m) => m.PayrollSummary),
  'app/attendance/audit': () => import('./pages/Attendance/attendance-audit/attendance-audit').then((m) => m.AttendanceAudit),
  'app/attendance/my-leave': () => import('./pages/Attendance/my-leave/my-leave').then((m) => m.MyLeave),
  'app/attendance/my-permission': () => import('./pages/Attendance/my-permission/my-permission').then((m) => m.MyPermission),
};
const ATTENDANCE_ON = environment.features.attendance;
/** Tickets: one lazy entry (pages/Tickets/tickets.routes.ts), registered while the feature is on (NEW-04). */
const TICKETS_ON = environment.features.tickets;
const isTickets = (path: string) => path === 'app/tickets' || path.startsWith('app/tickets/');
const isAttendance = (path: string) => Object.prototype.hasOwnProperty.call(ATTENDANCE, path);

/** Pages the server menu names, by route. Anything else in the menu shows MenuPage. */
const REAL_SCREENS: Record<string, Loader> = {
  'app/donations/payment-event-queue': L.PaymentsReceipts,
  'app/donations/public-donation-initiation': L.NewDonation,
  'app/fundraising/campaigns/campaign-wizard': L.NewCampaign,
  'app/fundraising/campaigns/campaign-register': L.CampaignRegister,
  'app/fundraising/relationships/lead-work-queue': L.LeadWorkQueue,
  'app/fundraising/donors/all-donors': L.AllDonors,
  'app/fundraising/relationships/donor-360': L.Donor360,
  'app/fundraising/relationships/communication-timeline': L.CommunicationTimeline,
  'app/fundraising/relationships/follow-up-queue': L.FollowUps,
  'app/fundraising/relationships/follow-up-planner': L.FollowUpPlanner,
  'app/fundraising/relationships/follow-up-execution': L.FollowUpExecution,
  'app/fundraising/relationships/assignment-board': L.AssignmentBoard,
  'app/administration/organisation/details': L.OrganisationProfile,
  'app/platform/business-unit': L.PlatformOverview,
  'app/platform/permission-catalogue': L.PermissionCatalogue,
  'app/platform/menu-catalogue': L.MenuCatalogue,
  'app/administration/organisation/directory': L.Organisations,
  'app/administration/organisation/setup-wizard': L.CreateOrganisation,
  'app/platform/audit': L.AuditTrail,

  // Users & Access (IAM)
  'app/administration/access/user-directory': L.Users,
  'app/administration/access/create-user': L.CreateUser,
  'app/administration/access/role-and-permission-catalogue': L.RolesPermissions,
  'app/administration/access/menu-configuration': L.MenuConfiguration,
  'app/administration/access/access-request-and-approval': L.AccessRequests,
  'app/administration/audit': L.AuditTrail,
  'app/administration/access/my-security': L.MySecurity,
  'app/administration/access/my-security/mfa-enrol': L.MySecurity,
  'app/administration/users/bulk-actions': L.BulkUsers,

  ...(ATTENDANCE_ON ? ATTENDANCE : {}),
};

/* ---------- which menu entries open which page (NEW-03) ---------- */

/** Menu pages of the Donors & Leads module. Any of them opens the module's inner pages. */
const DONORS_AND_LEADS = [
  '/app/fundraising/relationships/lead-work-queue',
  '/app/fundraising/relationships/my-leads',
  '/app/fundraising/relationships/donor-list',
  '/app/fundraising/relationships/my-donor-list',
  '/app/fundraising/relationships/follow-up-queue',
];
/** Menu pages of the Campaigns module. */
const CAMPAIGNS = ['/app/fundraising/campaigns/campaign-register', '/app/fundraising/campaigns/tracking-asset-manager'];
/** Open to everybody signed in: their own start page, profile and security settings. */
const ALWAYS = new Set([
  'app/dashboard', 'app/forbidden', 'app/auth/profile', 'app/auth/user-profile',
  'app/administration/access/my-security', 'app/administration/access/my-security/mfa-enrol',
]);

/**
 * The menu entries that open a page.
 * A menu page needs its own entry; a page reached from inside a module (a detail, an edit form, a
 * planner) needs any of that module's menu pages; a page nobody's menu names is closed.
 */
function grantsFor(rawPath: string): Grants {
  const path = rawPath.replace(/\/:[^/]+/g, '');
  const own = '/' + path;
  // Tickets runs on demo data and the server menu does not list it yet; inside the module,
  // TicketAccessService decides what each role sees, and the API will re-check every request.
  if (ALWAYS.has(path) || isAttendance(path) || isTickets(path)) return 'any';
  if (/^app\/fundraising\/(relationships|donors|Lead)\//.test(path)) {
    return DONORS_AND_LEADS.includes(own) ? [own] : DONORS_AND_LEADS;
  }
  if (path.startsWith('app/fundraising/campaigns/')) return CAMPAIGNS.includes(own) ? [own] : CAMPAIGNS;
  if (path === 'app/administration/access/create-user' || path === 'app/administration/users/bulk-actions') {
    return ['/app/administration/access/user-directory'];
  }
  const master = /^app\/masters\/([a-z]+)/.exec(path);
  if (master) return [`/app/masters/${master[1]}`];
  // An Organisation's own details: its administrator's menu page, and the page the Platform
  // Admin reviews an applicant on (opened from the directory or the approval queue).
  if (path === 'app/administration/organisation/details') {
    return ['/app/administration/organisation/details', '/app/administration/organisation/directory',
      '/app/administration/organisation/registration-verification'];
  }
  if (path.startsWith('app/administration/organisation/details/')) return ['/app/administration/organisation/details'];
  if (path.startsWith('app/administration/organisation/units/')) return ['/app/administration/organisation/units'];
  return [own];
}

const menuRoutes: Routes = flatten(MENU_DATA)
  .filter((item) => !!item.route)
  .map((item) => item.route!.replace(/^\//, ''))
  // Attendance's menu entries disappear with its routes when the module is switched off.
  .filter((path) => ATTENDANCE_ON || !isAttendance(path))
  // The Tickets module routes its own pages.
  .filter((path) => !isTickets(path))
  .map((path) => {
    const item = flatten(MENU_DATA).find((i) => i.route?.replace(/^\//, '') === path)!;
    const screen: Loader | undefined = REAL_SCREENS[path];
    return {
      path,
      loadComponent: screen ?? (() => MenuPage),
      title: item.name,
      // A screen that is not built yet opens only where a server menu names it explicitly - never
      // because it shares a module with a page the person can use.
      data: { name: item.name, route: item.route, ...(screen === undefined ? { [GRANTS]: ['/' + path] } : {}) }
    };
  });

const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  { path: 'app/dashboard', loadComponent: L.Dashboard },
  { path: 'app/forbidden', loadComponent: L.Forbidden, title: 'No access' },
  // Attendance (static route)
  ...(ATTENDANCE_ON
    ? [{ path: 'app/attendance', loadComponent: ATTENDANCE['app/attendance'], title: 'Attendance', data: { name: 'Attendance', route: '/app/attendance' } }]
    : []),
  // Tickets: the module's own router handles every /app/tickets/... page.
  ...(TICKETS_ON
    ? [{ path: 'app/tickets', loadChildren: () => import('./pages/Tickets/tickets.routes').then((m) => m.TICKETS_ROUTES), data: { name: 'Tickets', route: '/app/tickets' } }]
    : []),
  // Campaign Routes
  {
    path: 'app/fundraising/campaigns/campaign-detail/:code',
    loadComponent: L.CampaignDetail,
    title: 'Campaign Detail',
    data: { name: 'Campaign Detail', route: '/app/fundraising/campaigns/campaign-detail' }
  },
  {
    path: 'app/fundraising/campaigns/campaign-detail',
    loadComponent: L.CampaignDetail,
    title: 'Campaign Detail',
    data: { name: 'Campaign Detail', route: '/app/fundraising/campaigns/campaign-detail' }
  },
  {
    path: 'app/fundraising/campaigns/campaign-readiness-checklist',
    loadComponent: L.ReadinessChecklist,
    title: 'Readiness Checklist',
    data: { name: 'Readiness Checklist', route: '/app/fundraising/campaigns/campaign-readiness-checklist' }
  },
  {
    path: 'app/fundraising/campaigns/pause-resume-and-close-campaign',
    loadComponent: L.CampaignLifecycle,
    title: 'Pause, Resume & Close',
    data: { name: 'Pause, Resume & Close', route: '/app/fundraising/campaigns/pause-resume-and-close-campaign' }
  },
  {
    path: 'app/fundraising/campaigns/tracking-asset-manager',
    loadComponent: L.TrackingAssets,
    title: 'Tracking Asset Manager',
    data: { name: 'Tracking Asset Manager', route: '/app/fundraising/campaigns/tracking-asset-manager' }
  },
  {
    path: 'app/fundraising/campaigns/tracking-asset-manager/new',
    loadComponent: L.TrackingAssetForm,
    title: 'Create tracking asset',
    data: { name: 'Tracking Asset Manager', route: '/app/fundraising/campaigns/tracking-asset-manager' }
  },
  {
    path: 'app/whatsapp/wati',
    loadComponent: L.WhatsappMessages,
    title: 'check number',
    data: { name: 'check number', route: '/app/whatsapp/wati' }
  },
  {
    path: 'app/whatsapp/check-number',
    loadComponent: L.NumberVerification,
    title: 'check number',
    data: { name: 'check number', route: '/app/whatsapp/check-number' }
  },
  // The menu the server sends names these routes. The donor list is the same screen under
  // two names; My Leads / My Donors are the queue / donor list told to show only what the
  // signed-in user owns.
  { path: 'app/fundraising/relationships/donor-list', loadComponent: L.AllDonors, title: 'All Donors', data: { name: 'All Donors', route: '/app/fundraising/relationships/donor-list' } },
  { path: 'app/fundraising/relationships/my-donor-list', loadComponent: L.AllDonors, title: 'My Donors', data: { name: 'My Donors', route: '/app/fundraising/relationships/my-donor-list', mine: true } },
  { path: 'app/fundraising/relationships/my-leads', loadComponent: L.LeadWorkQueue, title: 'My Leads', data: { name: 'My Leads', route: '/app/fundraising/relationships/my-leads', mine: true } },

  // Donor & leads - Lead Capture shell (heading + Single/Bulk switch) with child routes
  {
    path: 'app/fundraising/relationships/lead-capture',
    loadComponent: L.LeadCapture,
    title: 'Lead capture',
    data: { name: 'Lead Capture', route: '/app/fundraising/relationships/lead-capture' },
    children: [
      { path: '', pathMatch: 'full', redirectTo: LC_PATHS.single },
      { path: LC_PATHS.single, loadComponent: L.LeadCaptureSingle, title: 'Lead capture · Single lead' },
      { path: LC_PATHS.bulk, loadComponent: L.LeadCaptureBulk, title: 'Lead capture · Bulk upload' },
      { path: '**', redirectTo: LC_PATHS.single },
    ],
  },
  // Donor 360 -> Edit profile (same path as editPath in donor-360.ts)
  {
    path: 'app/fundraising/relationships/donor-360/edit',
    loadComponent: L.DonorProfileEdit,
    title: 'Edit profile',
    data: { name: 'Donor 360', route: '/app/fundraising/relationships/donor-360' }
  },
  {
    path: 'app/fundraising/relationships/consent-and-preference-centre',
    loadComponent: L.ConsentCentre,
    title: 'Consent and preference centre',
    data: { name: 'Consent and preference centre', route: '/app/fundraising/relationships/consent-and-preference-centre' }
  },

  // Communication timeline (list) + Log communication (form) - two-way nav
  {
    path: 'app/fundraising/relationships/communication-timeline/log',
    loadComponent: L.LogCommunication,
    title: 'Log communication',
    data: { name: 'Communication Timeline', route: '/app/fundraising/relationships/communication-timeline' }
  },

  // Follow-ups: queue -> new (pick person) -> plan (?ref=) · queue -> execute (?id=) · assignment board
  {
    path: 'app/fundraising/relationships/follow-up-queue',
    loadComponent: L.FollowUps,
    title: 'Follow-ups',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/follow-up-queue/new',
    loadComponent: L.NewFollowUp,
    title: 'New follow-up',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/follow-up-queue/plan',
    loadComponent: L.FollowUpPlanner,
    title: 'Plan follow-up',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/follow-up-queue/execute',
    loadComponent: L.FollowUpExecution,
    title: 'Follow-up execution',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/assignment-board',
    loadComponent: L.AssignmentBoard,
    title: 'Assignment board',
    data: { name: 'Assignment board', route: '/app/fundraising/relationships/assignment-board' }
  },

  // Users & Access (IAM) - same paths as the sidebar menu (Users & Access group)
  {
    path: 'app/administration/access/user-directory',
    loadComponent: L.Users,
    title: 'Users',
    data: { name: 'Users', route: '/app/administration/access/user-directory' }
  },
  {
    path: 'app/administration/access/create-user',
    loadComponent: L.CreateUser,
    title: 'Invite user',
    data: { name: 'Invite user', route: '/app/administration/access/create-user' }
  },
  {
    path: 'app/administration/access/role-and-permission-catalogue',
    loadComponent: L.RolesPermissions,
    title: 'Roles & Permissions',
    data: { name: 'Roles & Permissions', route: '/app/administration/access/role-and-permission-catalogue' }
  },
  {
    path: 'app/administration/access/menu-configuration',
    loadComponent: L.MenuConfiguration,
    title: 'Menu Configuration',
    data: { name: 'Menu Configuration', route: '/app/administration/access/menu-configuration' }
  },
  {
    path: 'app/administration/access/access-request-and-approval',
    loadComponent: L.AccessRequests,
    title: 'Access Requests',
    data: { name: 'Access Requests', route: '/app/administration/access/access-request-and-approval' }
  },
  {
    path: 'app/administration/audit',
    loadComponent: L.AuditTrail,
    title: 'Audit Trail',
    data: { name: 'Audit Trail', route: '/app/administration/audit' }
  },
  {
    path: 'app/administration/access/my-security',
    loadComponent: L.MySecurity,
    title: 'My Security',
    data: { name: 'My Security', route: '/app/administration/access/my-security' }
  },
  {
    path: 'app/administration/access/my-security/mfa-enrol',
    loadComponent: L.MySecurity,
    title: 'MFA Enrolment',
    data: { name: 'My Security', route: '/app/administration/access/my-security' }
  },

  // Organization
  // The Platform Admin's Approval Queue: the directory, filtered to organisations awaiting review
  // (NEW-17). The review e-mail links to /registration-verification/<id>: that organisation's page.
  {
    path: 'app/administration/organisation/registration-verification',
    loadComponent: L.Organisations,
    title: 'Approval queue',
    data: { name: 'Approval Queue', route: '/app/administration/organisation/registration-verification', status: 'review' }
  },
  {
    path: 'app/administration/organisation/registration-verification/:id',
    redirectTo: ({ params }) => inject(Router).createUrlTree(
      ['/app/administration/organisation/details'], { queryParams: { id: params['id'] } }),
  },
  {
    path: 'app/administration/organisation/details/edit',
    loadComponent: L.OrganisationEdit,
    title: 'Edit organisation profile',
    data: { name: 'Organisation', route: '/app/administration/organisation/details' }
  },
  {
    path: 'app/administration/organisation/departments',
    loadComponent: L.OrgDepartments,
    title: 'organisation department',
    data: { name: 'Organisation', route: '/app/administration/organisation/departments' }
  },
  {
    path: 'app/administration/organisation/units',
    loadComponent: L.OrgBranches,
    title: 'organisation branch',
    data: { name: 'Organisation', route: '/app/administration/organisation/units' }
  },
  {
    path: 'app/administration/organisation/settings',
    loadComponent: L.OrgSettings,
    title: 'Organisation settings',
    data: { name: 'Organisation', route: '/app/administration/organisation/settings' }
  },
  {
    path: 'app/administration/organisation/units/new',
    loadComponent: L.OrgAddOffice,
    title: 'Add office',
    data: { name: 'Add Office', route: '/app/administration/organisation/units/new' }
  },

  // Masters
  { path: 'app/masters/country', loadComponent: L.Countries, title: 'Countries' },
  { path: 'app/masters/country/new', loadComponent: L.CountryForm, title: 'New country' },
  { path: 'app/masters/country/:id/edit', loadComponent: L.CountryForm, title: 'Edit country' },

  { path: 'app/masters/state', loadComponent: L.States, title: 'States' },
  { path: 'app/masters/state/new', loadComponent: L.StateForm, title: 'New state' },
  { path: 'app/masters/state/:id/edit', loadComponent: L.StateForm, title: 'Edit state' },

  { path: 'app/masters/city', loadComponent: L.Cities, title: 'Cities' },
  { path: 'app/masters/city/new', loadComponent: L.CityForm, title: 'New city' },
  { path: 'app/masters/city/:id/edit', loadComponent: L.CityForm, title: 'Edit city' },

  { path: 'app/masters/currency', loadComponent: L.Currencies, title: 'Currencies' },
  { path: 'app/masters/currency/new', loadComponent: L.CurrencyForm, title: 'New currency' },
  { path: 'app/masters/currency/:id/edit', loadComponent: L.CurrencyForm, title: 'Edit currency' },

  { path: 'app/masters/timezone', loadComponent: L.TimeZones, title: 'Time Zones' },
  { path: 'app/masters/timezone/new', loadComponent: L.TimeZoneForm, title: 'New time zone' },
  { path: 'app/masters/timezone/:id/edit', loadComponent: L.TimeZoneForm, title: 'Edit time zone' },
  { path: 'app/auth/profile', loadComponent: L.Profile, title: 'Profile', data: { name: 'Profile', route: '/app/auth/profile' } },
  { path: 'app/auth/user-profile', loadComponent: L.Profile, title: 'Profile', data: { name: 'User Profile', route: '/app/auth/user-profile' } },

  { path: 'app/fundraising/Lead/Lead-view', loadComponent: L.LeadProfile, title: 'Lead_Profile', data: { name: 'Lead_Profile', route: '/app/fundraising/Lead/Lead-view' } },
  ...menuRoutes
];

/**
 * Public sign-in screen first, then every workspace page behind the guards -
 * without a session any /app/** URL lands on /login (with a `returnUrl` back), and
 * a page the person's menu does not offer lands on /app/forbidden.
 * Unknown URLs fall back to the dashboard, which the guard protects as well.
 */
export const routes: Routes = [
  { path: 'login', loadComponent: L.Login, canActivate: [guestGuard], title: 'Sign in' },
  { path: 'auth/account-activate', loadComponent: L.ActivateAccount, title: 'Activate' },
  // The invitation e-mail links to /auth/invitation?token=... (and /auth/invitation/:token for links already out).
  { path: 'auth/invitation', loadComponent: L.ActivateAccount, title: 'Activate' },
  { path: 'auth/invitation/:token', loadComponent: L.ActivateAccount, title: 'Activate' },

  // Account recovery and second-factor screens. Public: they are reached mid sign-in or from an
  // e-mailed link, before (or without) a full session.
  { path: 'auth/sign-in', redirectTo: 'login', pathMatch: 'full' },
  { path: 'auth/donorform', loadComponent: L.DonorForm, title: 'Donor &amp; Payment Details' },
  // Donation links built elsewhere in the app point at /auth/donor-form.
  { path: 'auth/donor-form', loadComponent: L.DonorForm, title: 'Donor &amp; Payment Details' },
  { path: 'Donor-form', redirectTo: 'auth/donor-form', pathMatch: 'full' },
  { path: 'auth/mfa', loadComponent: L.MfaChallenge, canActivate: [guestGuard], title: 'Verify it\'s you' },
  { path: 'auth/forgot-password', loadComponent: L.ForgotPassword, canActivate: [guestGuard], title: 'Forgot password' },
  { path: 'auth/reset-password', loadComponent: L.ResetPassword, title: 'Set a new password' },
  { path: 'auth/reset-password/:token', loadComponent: L.ResetPassword, title: 'Set a new password' },
  { path: 'auth/reauthenticate', loadComponent: L.Reauthenticate, title: 'Confirm it\'s you' },
  // Where the payment gateway sends the donor back to. Public: the server verifies the payment.
  { path: 'give/result', loadComponent: L.PaymentResult, title: 'Payment result' },
  ...APP_ROUTES.map((route) =>
    route.redirectTo === undefined
      ? {
          ...route,
          canActivate: [...(route.canActivate ?? []), authGuard, menuGuard],
          data: { ...route.data, [GRANTS]: (route.data?.[GRANTS] as Grants | undefined) ?? grantsFor(route.path ?? '') }
        }
      : route
  ),
  { path: '**', redirectTo: 'app/dashboard' }
];
