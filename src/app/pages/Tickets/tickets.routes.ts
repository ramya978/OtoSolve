import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { TicketsShell } from './shell/tickets-shell';
import { TicketApi } from './data/ticket-api';
import { MockTicketApi } from './data/mock-ticket-api';
import { HttpTicketApi } from './data/http-ticket-api';
import { AiProvider, AiService, GatewayAiProvider, HeuristicAiProvider } from './services/ai.service';
import { EmailChannel, QueuedEmailChannel, TicketNotificationService } from './services/notification.service';
import { TicketService } from './services/ticket.service';
import { SlaService } from './services/sla.service';
import { AnalyticsService } from './services/analytics.service';
import { DashboardService } from './services/dashboard.service';
import { TicketAccessService, TicketAction } from './services/ticket-access.service';
import { TICKETS_CONFIG } from './tickets.config';

/** Opens a page only for roles that hold `action`; others land on the ticket list. */
const can = (action: TicketAction): CanActivateFn => () =>
  inject(TicketAccessService).can(action) || inject(Router).createUrlTree(['/app/tickets/list']);

/** The dashboard is for staff; customers start on their own tickets. */
const staffHome: CanActivateFn = () =>
  inject(TicketAccessService).isStaff() || inject(Router).createUrlTree(['/app/tickets/mine']);

/**
 * Tickets module routes, loaded lazily from app.routes.ts. Every page is its own chunk.
 * Services are provided here, so they live with the module and see the chosen TicketApi.
 * Static paths come before ':id' so "board", "sla" and friends are never read as ticket ids.
 */
export const TICKETS_ROUTES: Routes = [
  {
    path: '',
    component: TicketsShell,
    providers: [
      { provide: TicketApi, useClass: TICKETS_CONFIG.useMockApi ? MockTicketApi : HttpTicketApi },
      { provide: AiProvider, useClass: TICKETS_CONFIG.useMockApi ? HeuristicAiProvider : GatewayAiProvider },
      { provide: EmailChannel, useClass: QueuedEmailChannel },
      TicketService,
      TicketNotificationService,
      SlaService,
      AnalyticsService,
      DashboardService,
      AiService,
    ],
    children: [
      { path: '', pathMatch: 'full', canActivate: [staffHome], title: 'Tickets', loadComponent: () => import('./dashboard/dashboard').then((m) => m.TicketsDashboard) },
      { path: 'list', title: 'All tickets', loadComponent: () => import('./ticket-list/ticket-list').then((m) => m.TicketList) },
      { path: 'mine', title: 'My tickets', data: { view: 'mine' }, loadComponent: () => import('./ticket-list/ticket-list').then((m) => m.TicketList) },
      { path: 'queue', pathMatch: 'full', redirectTo: 'list' },
      { path: 'new', title: 'New ticket', canActivate: [can('create')], loadComponent: () => import('./ticket-create/ticket-create').then((m) => m.TicketCreate) },
      { path: 'board', title: 'Ticket board', canActivate: [staffHome], loadComponent: () => import('./kanban-board/kanban-board').then((m) => m.KanbanBoard) },
      { path: 'analytics', title: 'Ticket analytics', canActivate: [can('analytics')], loadComponent: () => import('./analytics/analytics').then((m) => m.TicketAnalytics) },
      { path: 'sla', title: 'SLA monitor', canActivate: [can('sla.view')], loadComponent: () => import('./sla-monitor/sla-monitor').then((m) => m.SlaMonitor) },
      { path: 'reports', title: 'Ticket reports', canActivate: [can('reports')], loadComponent: () => import('./reports/reports').then((m) => m.TicketReports) },
      { path: 'settings', title: 'Ticket settings', loadComponent: () => import('./settings/settings').then((m) => m.TicketSettings) },
      { path: ':id', title: 'Ticket', loadComponent: () => import('./ticket-details/ticket-details').then((m) => m.TicketDetails) },
      { path: ':id/edit', title: 'Edit ticket', loadComponent: () => import('./ticket-edit/ticket-edit').then((m) => m.TicketEdit) },
    ],
  },
];
