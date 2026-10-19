import { Routes } from '@angular/router';
import { MENU_DATA, MenuItem } from './Shared/layout/menu.data';
import { MenuPage } from './Shared/layout/menu-page';
import { PaymentsReceipts } from './pages/Donations/Payment_History/payments-receipts';
import { Profile } from './pages/Auth/Profile/profile';
import { NewCampaign } from './pages/Campaign/Campaign_Wizard/new-campaign';
import { CampaignRegister } from './pages/Campaign/Campaign_Register/campaign-register';
import { LeadWorkQueue } from './pages/Donor & Leads/Lead_Work_Queue/lead-work-queue';
import { Cities } from './pages/Masters/Cities/cities';
import { CityForm } from './pages/Masters/Cities/city-form';
import { Countries } from './pages/Masters/Countries/countries';
import { CountryForm } from './pages/Masters/Countries/country-form';
import { Currencies } from './pages/Masters/Currencies/currencies';
import { CurrencyForm } from './pages/Masters/Currencies/currency-form';
import { StateForm } from './pages/Masters/States/state-form';
import { States } from './pages/Masters/States/states';
import { TimeZoneForm } from './pages/Masters/Time_Zones/time-zone-form';
import { TimeZones } from './pages/Masters/Time_Zones/time-zones';
import { CampaignDetail } from './pages/Campaign/campaign-detail/campaign-detail';
import { CampaignLifecycle } from './pages/Campaign/campaign-lifecycle/campaign-lifecycle';
import { ReadinessChecklist } from './pages/Campaign/readiness-checklist/readiness-checklist';
import { TrackingAssetForm } from './pages/Campaign/tracking-asset-form/tracking-asset-form';
import { TrackingAssets } from './pages/Campaign/tracking-assets/tracking-assets';
import { LeadProfile } from './pages/Donor & Leads/Lead_Profile/lead-profile';
import { LeadCapture } from './pages/Donor & Leads/lead-capture/lead-capture';
import { LeadCaptureBulk } from './pages/Donor & Leads/lead-capture/bulk/lead-capture-bulk';
import { LC_PATHS } from './pages/Donor & Leads/lead-capture/lc-shared';
import { LeadCaptureSingle } from './pages/Donor & Leads/lead-capture/single/lead-capture-single';
import { AllDonors } from './pages/Donor & Leads/All Donors/all-donors';
import { Donor360 } from './pages/Donor & Leads/Donor360/donor-360';
import { DonorProfileEdit } from './pages/Donor & Leads/Edit_Profile/donor-profile-edit';
import { ConsentCentre } from './pages/Donor & Leads/Consent_Preferences/consent-centre';
import { LogCommunication } from './pages/Donor & Leads/Log_communication/log-communication';
import { CommunicationTimeline } from './pages/Donor & Leads/Communication_Timeline/communication-timeline';
import { AssignmentBoard } from './pages/Donor & Leads/Assignment_Board/assignment-board';
import { FollowUpExecution } from './pages/Donor & Leads/FollowUp_Execution/follow-up-execution';
import { FollowUpPlanner } from './pages/Donor & Leads/Follow_Planner/follow-up-planner';
import { FollowUps } from './pages/Donor & Leads/Follow_Ups/follow-ups';
import { NewFollowUp } from './pages/Donor & Leads/New_FollowUp/new-follow-up';

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.children)]);

const REAL_SCREENS: Record<string, unknown> = {
  'app/donations/payment-event-queue': PaymentsReceipts,
  'app/fundraising/campaigns/campaign-wizard': NewCampaign,
  'app/fundraising/campaigns/campaign-register': CampaignRegister,
  'app/fundraising/relationships/lead-work-queue': LeadWorkQueue,
  'app/fundraising/donors/all-donors': AllDonors,
  'app/fundraising/relationships/donor-360': Donor360,
  'app/fundraising/relationships/communication-timeline': CommunicationTimeline,
  'app/fundraising/relationships/follow-up-queue': FollowUps,
  'app/fundraising/relationships/follow-up-planner': FollowUpPlanner,
  'app/fundraising/relationships/follow-up-execution': FollowUpExecution,
  'app/fundraising/relationships/assignment-board': AssignmentBoard
};

const menuRoutes: Routes = flatten(MENU_DATA)
  .filter((item) => !!item.route)
  .map((item) => ({
    path: item.route!.replace(/^\//, ''),
    component: (REAL_SCREENS[item.route!.replace(/^\//, '')] as typeof MenuPage) ?? MenuPage,
    title: item.name,
    data: { name: item.name, route: item.route }
  }));

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },

  // Campaign Routes
  {
    path: 'app/fundraising/campaigns/campaign-detail/:code',
    component: CampaignDetail,
    title: 'Campaign Detail',
    data: { name: 'Campaign Detail', route: '/app/fundraising/campaigns/campaign-detail' }
  },
  {
    path: 'app/fundraising/campaigns/campaign-detail',
    component: CampaignDetail,
    title: 'Campaign Detail',
    data: { name: 'Campaign Detail', route: '/app/fundraising/campaigns/campaign-detail' }
  },
  {
    path: 'app/fundraising/campaigns/campaign-readiness-checklist',
    component: ReadinessChecklist,
    title: 'Readiness Checklist',
    data: { name: 'Readiness Checklist', route: '/app/fundraising/campaigns/campaign-readiness-checklist' }
  },
  {
    path: 'app/fundraising/campaigns/pause-resume-and-close-campaign',
    component: CampaignLifecycle,
    title: 'Pause, Resume & Close',
    data: { name: 'Pause, Resume & Close', route: '/app/fundraising/campaigns/pause-resume-and-close-campaign' }
  },
  {
    path: 'app/fundraising/campaigns/tracking-asset-manager',
    component: TrackingAssets,
    title: 'Tracking Asset Manager',
    data: { name: 'Tracking Asset Manager', route: '/app/fundraising/campaigns/tracking-asset-manager' }
  },
  {
    path: 'app/fundraising/campaigns/tracking-asset-manager/new',
    component: TrackingAssetForm,
    title: 'Create tracking asset',
    data: { name: 'Tracking Asset Manager', route: '/app/fundraising/campaigns/tracking-asset-manager' }
  },

  // Donor & leads - Lead Capture shell (heading + Single/Bulk switch) with child routes
  {
    path: 'app/fundraising/relationships/lead-capture',
    component: LeadCapture,
    title: 'Lead capture',
    data: { name: 'Lead Capture', route: '/app/fundraising/relationships/lead-capture' },
    children: [
      { path: '', pathMatch: 'full', redirectTo: LC_PATHS.single },
      { path: LC_PATHS.single, component: LeadCaptureSingle, title: 'Lead capture · Single lead' },
      { path: LC_PATHS.bulk, component: LeadCaptureBulk, title: 'Lead capture · Bulk upload' },
      { path: '**', redirectTo: LC_PATHS.single },
    ],
  },
  // Donor 360 → Edit profile (same path as editPath in donor-360.ts)
  {
    path: 'app/fundraising/relationships/donor-360/edit',
    component: DonorProfileEdit,
    title: 'Edit profile',
    data: { name: 'Donor 360', route: '/app/fundraising/relationships/donor-360' }
  },
  {
    path: 'app/fundraising/relationships/consent-and-preference-centre',
    component: ConsentCentre,
    title: 'Consent and preference centre',
    data: { name: 'Consent and preference centre', route: '/app/fundraising/relationships/consent-and-preference-centre' }
  },

  // Communication timeline (list) + Log communication (form) - two-way nav
  {
    path: 'app/fundraising/relationships/communication-timeline/log',
    component: LogCommunication,
    title: 'Log communication',
    data: { name: 'Communication Timeline', route: '/app/fundraising/relationships/communication-timeline' }
  },

  // Follow-ups: queue → new (pick person) → plan (?ref=) · queue ▶ → execute (?id=) · assignment board
  {
    path: 'app/fundraising/relationships/follow-up-queue',
    component: FollowUps,
    title: 'Follow-ups',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/follow-up-queue/new',
    component: NewFollowUp,
    title: 'New follow-up',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/follow-up-queue/plan',
    component: FollowUpPlanner,
    title: 'Plan follow-up',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/follow-up-queue/execute',
    component: FollowUpExecution,
    title: 'Follow-up execution',
    data: { name: 'Follow-ups', route: '/app/fundraising/relationships/follow-up-queue' }
  },
  {
    path: 'app/fundraising/relationships/assignment-board',
    component: AssignmentBoard,
    title: 'Assignment board',
    data: { name: 'Assignment board', route: '/app/fundraising/relationships/assignment-board' }
  },

  // Masters
  { path: 'app/masters/country', component: Countries, title: 'Countries' },
  { path: 'app/masters/country/new', component: CountryForm, title: 'New country' },
  { path: 'app/masters/country/:id/edit', component: CountryForm, title: 'Edit country' },

  { path: 'app/masters/state', component: States, title: 'States' },
  { path: 'app/masters/state/new', component: StateForm, title: 'New state' },
  { path: 'app/masters/state/:id/edit', component: StateForm, title: 'Edit state' },

  { path: 'app/masters/city', component: Cities, title: 'Cities' },
  { path: 'app/masters/city/new', component: CityForm, title: 'New city' },
  { path: 'app/masters/city/:id/edit', component: CityForm, title: 'Edit city' },

  { path: 'app/masters/currency', component: Currencies, title: 'Currencies' },
  { path: 'app/masters/currency/new', component: CurrencyForm, title: 'New currency' },
  { path: 'app/masters/currency/:id/edit', component: CurrencyForm, title: 'Edit currency' },

  { path: 'app/masters/timezone', component: TimeZones, title: 'Time Zones' },
  { path: 'app/masters/timezone/new', component: TimeZoneForm, title: 'New time zone' },
  { path: 'app/masters/timezone/:id/edit', component: TimeZoneForm, title: 'Edit time zone' },
  { path: 'app/auth/profile', component: Profile, title: 'Profile', data: { name: 'Profile', route: '/app/auth/profile' } },
  { path: 'app/fundraising/Lead/Lead-view', component: LeadProfile, title: 'Lead_Profile', data: { name: 'Lead_Profile', route: '/app/fundraising/Lead/Lead-view' } },
  ...menuRoutes
];