import { Routes } from '@angular/router';
import { MENU_DATA, MenuItem } from './Shared/layout/menu.data';
import { MenuPage } from './Shared/layout/menu-page';
import { PaymentsReceipts } from './pages/Donations/Payment_History/payments-receipts';
import { Profile } from './pages/Auth/Profile/profile';
import { NewCampaign } from './pages/Campaign/Campaign_Wizard/new-campaign';
import { CampaignRegister } from './pages/Campaign/Campaign_Register/campaign-register';
import { LeadProfile } from './pages/Donor & Leads/Lead_Work_Queue/Lead_Profile/lead-profile';
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

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.children)]);

const REAL_SCREENS: Record<string, unknown> = {
  'app/donations/payment-event-queue': PaymentsReceipts,
  'app/fundraising/campaigns/campaign-wizard': NewCampaign,
  'app/fundraising/campaigns/campaign-register': CampaignRegister
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