import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ToastService } from '../../../Shared/services/toast.service';
import { NotificationService as AppNotificationService } from '../../../Service/notification.service';
import { TicketApi } from '../data/ticket-api';
import { EMPTY_QUERY, Ticket } from '../models/ticket.model';
import { TicketAccessService } from './ticket-access.service';
import { computeSla, describeClock } from '../utils/sla';
import { SlaPolicy } from '../models/sla.model';
import { environment } from '../../../../environments/environment';

/* =====================================================================================================
   TICKET NOTIFICATIONS

   Five events: assigned, status changed, SLA warning, resolved, new comment. Each event can reach
   three channels, chosen per event in Settings: the application header bell, a toast, and e-mail.

   E-MAIL IS INTEGRATION-READY, NOT SENT FROM THE BROWSER. The browser never holds mail credentials
   (see environment.ts). `EmailChannel` is the seam: `QueuedEmailChannel` keeps the messages it would
   send in an outbox you can inspect in Settings; `HttpEmailChannel` posts them to the WebAPI, which
   does the sending once that endpoint exists.
   ===================================================================================================== */

export type TicketEventKind = 'assigned' | 'status' | 'sla-warning' | 'resolved' | 'comment';

export const EVENT_LABELS: Readonly<Record<TicketEventKind, string>> = {
  assigned: 'Ticket assigned',
  status: 'Status changed',
  'sla-warning': 'SLA warning',
  resolved: 'Ticket resolved',
  comment: 'New comment',
};

export interface ChannelPrefs {
  inApp: boolean;
  toast: boolean;
  email: boolean;
}

export type NotificationPrefs = Record<TicketEventKind, ChannelPrefs>;

const DEFAULT_PREFS: NotificationPrefs = {
  assigned: { inApp: true, toast: true, email: true },
  status: { inApp: true, toast: false, email: false },
  'sla-warning': { inApp: true, toast: true, email: true },
  resolved: { inApp: true, toast: true, email: false },
  comment: { inApp: true, toast: false, email: false },
};

export interface EmailMessage {
  readonly id: string;
  readonly event: TicketEventKind;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly queuedAt: string;
}

/** Where e-mail notifications go. Replace the provider to change delivery; nothing else changes. */
export abstract class EmailChannel {
  abstract send(message: EmailMessage): Observable<void>;
  readonly outbox = signal<readonly EmailMessage[]>([]);
}

/** Keeps messages in an outbox (shown in Settings) instead of sending them. */
@Injectable()
export class QueuedEmailChannel extends EmailChannel {
  send(message: EmailMessage): Observable<void> {
    this.outbox.update((list) => [message, ...list].slice(0, 50));
    return of(undefined);
  }
}

/** Posts messages to the WebAPI, which sends them. Use once POST /notifications/email exists. */
@Injectable()
export class HttpEmailChannel extends EmailChannel {
  private readonly http = inject(HttpClient);
  send(message: EmailMessage): Observable<void> {
    this.outbox.update((list) => [message, ...list].slice(0, 50));
    return this.http.post<void>(`${environment.apiBaseUrl}/notifications/email`, message);
  }
}

const PREFS_KEY = 'otosolve.tickets.notification-prefs';
const SEEN_KEY = 'otosolve.tickets.sla-alerted';

function read<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: () => Storage, key: string, value: unknown): void {
  try { storage().setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

@Injectable()
export class TicketNotificationService {
  private readonly toast = inject(ToastService);
  private readonly email = inject(EmailChannel);
  private readonly api = inject(TicketApi);
  private readonly access = inject(TicketAccessService);

  /** The application's header bell: Tickets events appear there with everything else. */
  private readonly bell = inject(AppNotificationService);
  readonly prefs = signal<NotificationPrefs>({ ...DEFAULT_PREFS, ...read(() => localStorage, PREFS_KEY, {}) });
  readonly outbox = this.email.outbox;

  private readonly alerted = new Set<string>(read<string[]>(() => sessionStorage, SEEN_KEY, []));
  private watchTimer: ReturnType<typeof setInterval> | null = null;

  emit(kind: TicketEventKind, title: string, body: string, ticket: Pick<Ticket, 'id' | 'number' | 'subject'> | null, recipient?: string): void {
    const pref = this.prefs()[kind];
    if (pref.inApp) this.bell.notifyCurrentUser(title, body);
    if (pref.toast) {
      this.toast.show(title, body, kind === 'sla-warning' ? 'warning' : kind === 'resolved' ? 'success' : 'info', 4500);
    }
    if (pref.email && recipient) {
      this.email.send({
        id: `e-${Date.now().toString(36)}`, event: kind, to: recipient,
        subject: ticket ? `[${ticket.number}] ${title}` : title,
        body: `${body}${ticket ? `\n\n${ticket.subject}` : ''}`, queuedAt: new Date().toISOString(),
      }).subscribe({ error: () => this.toast.show('E-mail not sent', 'The notification e-mail could not be queued.', 'warning') });
    }
  }

  setPref(kind: TicketEventKind, channel: keyof ChannelPrefs, value: boolean): void {
    this.prefs.update((p) => ({ ...p, [kind]: { ...p[kind], [channel]: value } }));
    write(() => localStorage, PREFS_KEY, this.prefs());
  }

  /**
   * Checks for tickets that turned amber or red, once a minute while the module is open.
   * Agents hear about their own tickets; managers and admins about everything they can see.
   * A server would push these; polling is what the demo can do.
   */
  startSlaWatch(policies: () => readonly SlaPolicy[], destroyRef: DestroyRef): void {
    if (this.watchTimer || !this.access.isStaff()) return;
    const check = () => {
      this.api.list({ ...EMPTY_QUERY, slaStates: ['warning', 'breached'], pageSize: 300, sort: [{ field: 'sla', dir: 'asc' }] })
        .subscribe({
          next: (page) => {
            const me = this.access.agentId();
            const mine = this.access.role() === 'Agent' ? page.items.filter((t) => t.assigneeId === me) : page.items;
            const fresh = mine
              .map((t) => ({ t, sla: computeSla(t, policies()) }))
              .filter(({ t, sla }) => !this.alerted.has(`${t.id}:${sla.light}`));
            if (!fresh.length) return;
            fresh.forEach(({ t, sla }) => this.alerted.add(`${t.id}:${sla.light}`));
            write(() => sessionStorage, SEEN_KEY, [...this.alerted]);
            if (fresh.length > 3) {
              const red = fresh.filter((f) => f.sla.light === 'red').length;
              this.emit('sla-warning', 'SLA attention needed',
                `${fresh.length - red} ticket${fresh.length - red === 1 ? '' : 's'} at risk and ${red} breached. Open SLA Monitor to act on them.`, null);
            } else {
              fresh.forEach(({ t, sla }) => this.emit('sla-warning', sla.light === 'red' ? `${t.number} breached its SLA` : `${t.number} is close to its SLA`,
                `${describeClock(sla.headline)} · ${t.priority} priority`, t));
            }
          },
          error: () => undefined,
        });
    };
    check();
    this.watchTimer = setInterval(check, 60_000);
    destroyRef.onDestroy(() => {
      if (this.watchTimer) clearInterval(this.watchTimer);
      this.watchTimer = null;
    });
  }
}
