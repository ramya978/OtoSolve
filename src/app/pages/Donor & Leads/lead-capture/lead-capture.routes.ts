import { Routes } from '@angular/router';
import { LeadCapture } from './lead-capture';
import { LeadCaptureSingle } from './single/lead-capture-single';
import { LeadCaptureBulk } from './bulk/lead-capture-bulk';
import { LC_PATHS } from './lc-shared';

/**
 * Lead capture routes.
 * Hook into the app routes, e.g.:
 *   { path: 'fundraising/relationships/lead-capture',
 *     loadChildren: () => import('./pages/Leads/lead-capture/lead-capture.routes').then((m) => m.LEAD_CAPTURE_ROUTES) }
 *
 *   /lead-capture          -> /lead-capture/single
 *   /lead-capture/single   -> one person, typed in
 *   /lead-capture/bulk     -> CSV / XLSX upload, three steps
 */
export const LEAD_CAPTURE_ROUTES: Routes = [
  {
    path: '',
    component: LeadCapture,
    children: [
      { path: '', pathMatch: 'full', redirectTo: LC_PATHS.single },
      { path: LC_PATHS.single, component: LeadCaptureSingle, title: 'Lead capture · Single lead' },
      { path: LC_PATHS.bulk, component: LeadCaptureBulk, title: 'Lead capture · Bulk upload' },
      { path: '**', redirectTo: LC_PATHS.single },
    ],
  },
];
