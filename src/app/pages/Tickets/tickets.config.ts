import { environment } from '../../../environments/environment';

/**
 * Tickets module switches.
 *
 * useMockApi: the WebAPI has no ticket endpoints yet, so the module runs on `MockTicketApi`, which
 *   keeps seeded demo data in this browser's localStorage. Set to false once the endpoints in
 *   `HttpTicketApi` exist; no screen code changes.
 * allowRolePreview: shows "Preview as role" in Settings so Admin, Manager, Agent and Customer views
 *   can be checked without four accounts. Never in production.
 * ticketsBaseUrl: where `HttpTicketApi` sends requests.
 */
export const TICKETS_CONFIG = {
  useMockApi: true,
  allowRolePreview: !environment.production,
  ticketsBaseUrl: `${environment.apiBaseUrl}/tickets`,
  aiBaseUrl: `${environment.apiBaseUrl}/ai/tickets`,
  /** Simulated network delay for the demo API, so loading states are visible. */
  mockLatencyMs: 280,
} as const;
