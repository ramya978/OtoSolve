import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketAccessService, ROLE_MATRIX, TicketAction } from '../services/ticket-access.service';
import { EVENT_LABELS, TicketEventKind, TicketNotificationService, ChannelPrefs } from '../services/notification.service';
import { SlaService } from '../services/sla.service';
import { TicketService } from '../services/ticket.service';
import { TicketApi, errorMessage } from '../data/ticket-api';
import { MockTicketApi } from '../data/mock-ticket-api';
import { ToastService } from '../../../Shared/services/toast.service';
import { TICKET_ROLES, TicketRole } from '../models/ticket.model';
import { SlaPolicy } from '../models/sla.model';
import { TICKETS_CONFIG } from '../tickets.config';
import { PriorityBadge } from '../components/priority-badge';
import { ConfirmDialog } from '../components/dialogs';
import { TkIcon } from '../components/icon';
import { dateTime } from '../utils/format';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

const ACTION_LABELS: readonly { action: TicketAction; label: string }[] = [
  { action: 'create', label: 'Create' }, { action: 'edit', label: 'Edit' }, { action: 'delete', label: 'Delete' },
  { action: 'assign', label: 'Assign others' }, { action: 'escalate', label: 'Escalate' }, { action: 'close', label: 'Close' },
  { action: 'note.internal', label: 'Internal notes' }, { action: 'bulk', label: 'Bulk actions' }, { action: 'export', label: 'Export' },
  { action: 'reports', label: 'Reports' }, { action: 'sla.manage', label: 'SLA targets' }, { action: 'ai', label: 'AI assistant' },
];

@Component({
  selector: 'app-ticket-settings',
  standalone: true,
  imports: [PageHeader, FormsModule, PriorityBadge, ConfirmDialog, TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-page">
      <app-page-header breadcrumb="Workspace / Tickets" breadcrumbRoute="/app/tickets" heading="Ticket settings"
        description="Notifications, service levels and access for the Tickets module. Light and dark mode follow your OtoSolve appearance settings." />

      <div class="tk-grid">
        <section class="tk-card is-pad span-12" aria-labelledby="s-role">
          <h2 class="tk-card-title" id="s-role">Your access</h2>
          <p class="tk-card-sub" style="margin:4px 0 14px">You are signed in as <strong>{{ access.displayName() }}</strong> with the <strong>{{ access.tokenRole() }}</strong> role for Tickets.</p>
          @if (access.canPreview) {
            <label class="tk-field"><span class="tk-label">Preview the module as</span>
              <div class="tk-seg" role="group" aria-label="Preview role">
                @for (r of roles; track r) { <button type="button" [attr.aria-pressed]="access.role() === r" (click)="preview(r)">{{ r }}</button> }
              </div>
              <span class="tk-hint">Development only. The demo API scopes data to the chosen role, so you can check every view.</span>
            </label>
          }
        </section>

        <section class="tk-card is-clip span-12" aria-labelledby="s-matrix">
          <header class="tk-card-head"><h2 class="tk-card-title" id="s-matrix">Access matrix</h2><span class="tk-card-sub">What each role can do. The API enforces the same rules.</span></header>
          <div class="tk-table-scroll">
            <div class="tk-table" role="table" aria-label="Access matrix" [style.--cols]="'140px repeat(' + actions.length + ', minmax(76px, 1fr))'" style="--table-min: 1100px">
              <div class="tk-tr is-head" role="row"><div class="tk-th" role="columnheader">Role</div>@for (a of actions; track a.action) { <div class="tk-th" role="columnheader" style="white-space:normal">{{ a.label }}</div> }</div>
              @for (r of roles; track r) {
                <div class="tk-tr" role="row" [class.is-selected]="access.role() === r">
                  <div class="tk-td" role="cell"><strong>{{ r }}</strong></div>
                  @for (a of actions; track a.action) {
                    <div class="tk-td" role="cell">@if (has(r, a.action)) { <span class="tk-badge is-sm" data-tone="success"><tk-icon name="check" /><span class="tk-sr-only">Yes</span></span> } @else { <span class="tk-faint" aria-label="No">—</span> }</div>
                  }
                </div>
              }
            </div>
          </div>
          <p class="tk-card-foot">Agents can edit, close and take tickets in their own team; customers see only their own tickets and never internal notes.</p>
        </section>

        <section class="tk-card is-clip span-7" aria-labelledby="s-notify">
          <header class="tk-card-head"><h2 class="tk-card-title" id="s-notify">Notifications</h2><span class="tk-card-sub">Choose where each event reaches you</span></header>
          <div class="tk-table-scroll">
            <div class="tk-table" role="table" aria-label="Notification channels" style="--cols: minmax(160px, 1.5fr) repeat(3, 100px); --table-min: 480px">
              <div class="tk-tr is-head" role="row"><div class="tk-th" role="columnheader">Event</div><div class="tk-th" role="columnheader">Header bell</div><div class="tk-th" role="columnheader">Toast</div><div class="tk-th" role="columnheader">E-mail</div></div>
              @for (e of events; track e) {
                <div class="tk-tr" role="row">
                  <div class="tk-td" role="cell"><strong>{{ eventLabel(e) }}</strong></div>
                  @for (ch of channels; track ch) {
                    <div class="tk-td" role="cell">
                      <label class="tk-switch"><input type="checkbox" [checked]="notify.prefs()[e][ch]" (change)="notify.setPref(e, ch, $any($event.target).checked)" [attr.aria-label]="eventLabel(e) + ' by ' + ch" /><span class="track"></span></label>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </section>

        <section class="tk-card is-pad span-5" aria-labelledby="s-outbox">
          <h2 class="tk-card-title" id="s-outbox">E-mail outbox</h2>
          <p class="tk-card-sub" style="margin:4px 0 12px">E-mail is integration-ready: messages are queued here until the WebAPI's notification endpoint is connected. The browser never sends mail itself.</p>
          @for (m of notify.outbox().slice(0, 6); track m.id) {
            <div style="padding:8px 0;border-top:1px solid var(--border-color)"><strong class="tk-small" style="display:block">{{ m.subject }}</strong><span class="tk-faint tk-small">To {{ m.to }} · {{ when(m.queuedAt) }}</span></div>
          } @empty { <p class="tk-faint tk-small">Nothing queued yet. Assign a ticket or let an SLA warning fire to see one.</p> }
        </section>

        <section class="tk-card is-clip span-12" id="sla" aria-labelledby="s-sla">
          <header class="tk-card-head">
            <div style="flex:1"><h2 class="tk-card-title" id="s-sla">SLA targets</h2><p class="tk-card-sub">Hours of elapsed time. A ticket turns amber at 75% of its target and red when it passes it.</p></div>
            @if (access.can('sla.manage')) {
              <button type="button" class="tk-btn is-ghost" (click)="resetPolicies()">Reset</button>
              <button type="button" class="tk-btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()" (click)="savePolicies()"><tk-icon name="save" />Save targets</button>
            }
          </header>
          <div class="tk-table-scroll">
            <div class="tk-table" role="table" aria-label="SLA targets" style="--cols: 140px 1fr 1fr; --table-min: 480px">
              <div class="tk-tr is-head" role="row"><div class="tk-th" role="columnheader">Priority</div><div class="tk-th" role="columnheader">First response (hours)</div><div class="tk-th" role="columnheader">Resolution (hours)</div></div>
              @for (p of draft(); track p.priority; let i = $index) {
                <div class="tk-tr" role="row">
                  <div class="tk-td" role="cell"><app-priority-badge [priority]="p.priority" /></div>
                  <div class="tk-td" role="cell"><input class="tk-input is-sm" type="number" min="0.25" step="0.25" style="max-width:140px" [disabled]="!access.can('sla.manage')"
                       [ngModel]="p.firstResponseMins / 60" (ngModelChange)="setHours(i, 'firstResponseMins', $event)" [attr.aria-label]="p.priority + ' first response hours'" /></div>
                  <div class="tk-td" role="cell"><input class="tk-input is-sm" type="number" min="0.5" step="0.5" style="max-width:140px" [disabled]="!access.can('sla.manage')"
                       [ngModel]="p.resolutionMins / 60" (ngModelChange)="setHours(i, 'resolutionMins', $event)" [attr.aria-label]="p.priority + ' resolution hours'" /></div>
                </div>
              }
            </div>
          </div>
          @if (slaError()) { <p class="tk-card-foot tk-error" role="alert">{{ slaError() }}</p> }
          @if (!access.can('sla.manage')) { <p class="tk-card-foot">Only managers and admins can change targets.</p> }
        </section>

        <section class="tk-card is-pad span-6" aria-labelledby="s-views">
          <h2 class="tk-card-title" id="s-views">Saved views</h2>
          @for (f of tickets.savedFilters(); track f.id) {
            <div class="tk-row" style="padding:8px 0;border-top:1px solid var(--border-color)"><strong class="tk-small" style="flex:1">{{ f.name }}</strong><span class="tk-faint tk-small">{{ when(f.createdAt) }}</span>
              <button type="button" class="tk-btn is-ghost is-icon is-sm" (click)="tickets.deleteFilter(f.id)" [attr.aria-label]="'Delete ' + f.name"><tk-icon name="trash" /></button></div>
          } @empty { <p class="tk-faint tk-small" style="margin-top:8px">Save a filtered list from All tickets → Saved views.</p> }
        </section>

        @if (isDemo) {
          <section class="tk-card is-pad span-6" aria-labelledby="s-demo">
            <h2 class="tk-card-title" id="s-demo">Demo data</h2>
            <p class="tk-card-sub" style="margin:4px 0 12px">The module runs on sample tickets stored in this browser until the ticket API is connected (tickets.config.ts → useMockApi).</p>
            <button type="button" class="tk-btn is-danger" (click)="confirmReset.set(true)"><tk-icon name="refresh" />Reset demo data</button>
          </section>
        }
      </div>
    </div>

    @if (confirmReset()) {
      <app-confirm-dialog heading="Reset demo data?" message="Every ticket, reply and change made in this browser is replaced with the original sample data." confirmLabel="Reset" (confirm)="resetDemo()" (cancel)="confirmReset.set(false)" />
    }`,
})
export class TicketSettings {
  protected readonly access = inject(TicketAccessService);
  protected readonly notify = inject(TicketNotificationService);
  protected readonly tickets = inject(TicketService);
  private readonly sla = inject(SlaService);
  private readonly api = inject(TicketApi);
  private readonly toast = inject(ToastService);

  protected readonly roles = TICKET_ROLES;
  protected readonly actions = ACTION_LABELS;
  protected readonly events = Object.keys(EVENT_LABELS) as TicketEventKind[];
  protected readonly channels: readonly (keyof ChannelPrefs)[] = ['inApp', 'toast', 'email'];
  protected readonly isDemo = TICKETS_CONFIG.useMockApi && this.api instanceof MockTicketApi;
  protected readonly confirmReset = signal(false);
  protected readonly saving = signal(false);
  protected readonly slaError = signal('');
  private readonly edits = signal<readonly SlaPolicy[] | null>(null);
  protected readonly draft = computed(() => this.edits() ?? this.sla.policies());

  protected has(role: TicketRole, action: TicketAction): boolean { return ROLE_MATRIX[role].includes(action); }
  protected eventLabel(e: TicketEventKind): string { return EVENT_LABELS[e]; }
  protected when(iso: string): string { return dateTime(iso); }

  protected preview(role: TicketRole): void {
    this.access.setPreviewRole(role === this.access.tokenRole() ? null : role);
    this.toast.show('Preview role', role === this.access.tokenRole() ? 'Back to your own role.' : `Showing Tickets as ${role}.`, 'info', 2500);
  }

  protected setHours(i: number, field: 'firstResponseMins' | 'resolutionMins', hours: number): void {
    const list = [...this.draft()];
    list[i] = { ...list[i], [field]: Math.round(Number(hours) * 60) };
    this.edits.set(list);
  }

  protected resetPolicies(): void { this.edits.set(null); this.slaError.set(''); }

  protected savePolicies(): void {
    this.saving.set(true);
    this.slaError.set('');
    this.sla.save(this.draft()).subscribe({
      next: () => { this.saving.set(false); this.edits.set(null); this.tickets.revision.update((n) => n + 1); this.toast.show('SLA targets saved', 'Clocks use the new targets from now on.', 'success'); },
      error: (err) => { this.saving.set(false); this.slaError.set(errorMessage(err)); },
    });
  }

  protected resetDemo(): void {
    if (this.api instanceof MockTicketApi) this.api.resetDemoData();
    this.confirmReset.set(false);
    this.sla.reload();
    this.tickets.revision.update((n) => n + 1);
    this.toast.show('Demo data reset', 'The sample tickets are back.', 'success');
  }
}
