import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthTokenService } from '../../../Shared/services/auth-token.service';
import { Ticket, TicketRole, TicketStatus } from '../models/ticket.model';
import { nextStatuses } from '../utils/workflow';
import { TICKETS_CONFIG } from '../tickets.config';

/* =====================================================================================================
   ROLE-BASED ACCESS for the Tickets module.

   The screens use this to decide what to OFFER. The API decides what is ALLOWED and re-checks every
   request; hiding a control is a courtesy, not a security boundary (see auth-token.service.ts).
   ===================================================================================================== */

export type TicketAction =
  | 'view' | 'create' | 'edit' | 'delete' | 'assign' | 'assign.self' | 'escalate' | 'close' | 'reopen' | 'cancel'
  | 'comment' | 'note.internal' | 'bulk' | 'export' | 'merge' | 'reports' | 'analytics' | 'sla.view' | 'sla.manage'
  | 'settings' | 'ai';

const ALL: readonly TicketAction[] = [
  'view', 'create', 'edit', 'delete', 'assign', 'assign.self', 'escalate', 'close', 'reopen', 'cancel', 'comment',
  'note.internal', 'bulk', 'export', 'merge', 'reports', 'analytics', 'sla.view', 'sla.manage', 'settings', 'ai',
];

/** The access matrix. Each role's list is everything that role may do. */
export const ROLE_MATRIX: Readonly<Record<TicketRole, readonly TicketAction[]>> = {
  Admin: ALL,
  Manager: ALL.filter((a) => a !== 'delete' && a !== 'settings'),
  Agent: ['view', 'create', 'edit', 'assign.self', 'escalate', 'close', 'reopen', 'comment', 'note.internal', 'export', 'sla.view', 'ai'],
  Customer: ['view', 'create', 'reopen', 'comment'],
};

/** Server permission codes that map onto the roles (svc.tickets.* as used by menu.data.ts). */
export const TICKET_PERMISSION_CODES = {
  manage: 'svc.tickets.manage',
  view: 'svc.tickets.view',
  portal: 'svc.tickets.portal',
} as const;

/** Who the demo API treats the signed-in person as, per role. */
const DEMO_IDENTITY: Readonly<Record<TicketRole, { agentId: string | null; customerId: string | null; teamIds: readonly string[] }>> = {
  Admin: { agentId: 'm2', customerId: null, teamIds: ['t1', 't2', 't3', 't4'] },
  Manager: { agentId: 'm1', customerId: null, teamIds: ['t1', 't2', 't3'] },
  Agent: { agentId: 'a1', customerId: null, teamIds: ['t1'] },
  Customer: { agentId: null, customerId: 'c1', teamIds: [] },
};

const ROLE_KEY = 'otosolve.tickets.preview-role';

@Injectable({ providedIn: 'root' })
export class TicketAccessService {
  private readonly tokens = inject(AuthTokenService);

  /** A role chosen in Settings to preview the module as someone else. Development only. */
  private readonly previewRole = signal<TicketRole | null>(this.readPreview());

  /** The role the signed-in person holds, from their token. */
  readonly tokenRole = computed<TicketRole>(() => {
    if (this.tokens.isSuperAdmin() || this.tokens.isTenantAdmin()) return 'Admin';
    if (this.tokens.hasPermission(TICKET_PERMISSION_CODES.manage)) return 'Manager';
    if (this.tokens.hasPermission(TICKET_PERMISSION_CODES.portal) && !this.tokens.hasPermission(TICKET_PERMISSION_CODES.view)) return 'Customer';
    return 'Agent';
  });

  readonly role = computed<TicketRole>(() => this.previewRole() ?? this.tokenRole());
  readonly isPreviewing = computed(() => this.previewRole() !== null && this.previewRole() !== this.tokenRole());
  readonly canPreview = TICKETS_CONFIG.allowRolePreview;

  readonly agentId = computed(() => DEMO_IDENTITY[this.role()].agentId);
  readonly customerId = computed(() => DEMO_IDENTITY[this.role()].customerId);
  readonly teamIds = computed(() => DEMO_IDENTITY[this.role()].teamIds);
  readonly isStaff = computed(() => this.role() !== 'Customer');
  readonly displayName = computed(() => this.tokens.displayName() || 'You');

  private readonly actions = computed(() => new Set(ROLE_MATRIX[this.role()]));

  can(action: TicketAction): boolean {
    return this.actions().has(action);
  }

  /** Whether this person may change this particular ticket's fields. */
  canEdit(ticket: Ticket): boolean {
    if (!this.can('edit')) return false;
    if (this.role() === 'Admin' || this.role() === 'Manager') return true;
    const me = this.agentId();
    return ticket.assigneeId === me || ticket.assigneeId === null || this.teamIds().includes(ticket.teamId);
  }

  canAssign(ticket: Ticket, assigneeId: string | null): boolean {
    if (this.can('assign')) return true;
    return this.can('assign.self') && this.canEdit(ticket) && assigneeId === this.agentId();
  }

  /** Whether this person may move this ticket to `to`. The workflow map is checked as well. */
  canTransition(ticket: Ticket, to: TicketStatus): boolean {
    if (!nextStatuses(ticket.status).includes(to)) return false;
    const role = this.role();
    if (role === 'Customer') {
      const own = ticket.customerId === this.customerId();
      return own && (to === 'Reopened' || (to === 'Closed' && ticket.status === 'Resolved'));
    }
    if (!this.canEdit(ticket)) return false;
    switch (to) {
      case 'Closed': return this.can('close') && (role !== 'Agent' || ticket.assigneeId === this.agentId());
      case 'Escalated': return this.can('escalate');
      case 'Cancelled': return this.can('cancel');
      case 'Reopened': return this.can('reopen');
      case 'Assigned': return this.can('assign') || this.can('assign.self');
      default: return true;
    }
  }

  allowedTransitions(ticket: Ticket): TicketStatus[] {
    return nextStatuses(ticket.status).filter((s) => this.canTransition(ticket, s));
  }

  setPreviewRole(role: TicketRole | null): void {
    if (!this.canPreview) return;
    this.previewRole.set(role);
    try {
      if (role) sessionStorage.setItem(ROLE_KEY, role);
      else sessionStorage.removeItem(ROLE_KEY);
    } catch { /* storage blocked: the choice lasts until reload */ }
  }

  private readPreview(): TicketRole | null {
    if (!TICKETS_CONFIG.allowRolePreview) return null;
    try {
      const v = sessionStorage.getItem(ROLE_KEY);
      return v === 'Admin' || v === 'Manager' || v === 'Agent' || v === 'Customer' ? v : null;
    } catch {
      return null;
    }
  }
}
