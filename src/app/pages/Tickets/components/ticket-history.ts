import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { HistoryKind, TicketHistoryEntry } from '../models/ticket.model';
import { dateTime } from '../utils/format';
import { EmptyState } from './feedback';

const KIND_LABEL: Readonly<Record<HistoryKind, string>> = {
  created: 'Created', status: 'Status', assignment: 'Assignment', priority: 'Priority', field: 'Field', comment: 'Reply',
  note: 'Internal note', attachment: 'Attachment', sla: 'SLA', escalation: 'Escalation', merge: 'Merge', watcher: 'Watcher',
};

/** The audit log: every change, who made it, when, and the before / after values. */
@Component({
  selector: 'app-ticket-history',
  standalone: true,
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-chips" style="margin-bottom:12px" role="group" aria-label="Filter the audit log">
      @for (k of kinds(); track k) {
        <button type="button" class="tk-chip" [attr.aria-pressed]="kind() === k" (click)="kind.set(kind() === k ? null : k)">{{ label(k) }}</button>
      }
    </div>
    <div class="tk-table-scroll">
      <div class="tk-table" role="table" aria-label="Audit log" style="--cols: 150px 140px 120px minmax(220px, 1fr); --table-min: 640px">
        <div class="tk-tr is-head" role="row">
          <div class="tk-th" role="columnheader">When</div><div class="tk-th" role="columnheader">Who</div>
          <div class="tk-th" role="columnheader">What</div><div class="tk-th" role="columnheader">Change</div>
        </div>
        @for (h of rows(); track h.id) {
          <div class="tk-tr" role="row">
            <div class="tk-td tk-small tk-num" role="cell">{{ when(h.at) }}</div>
            <div class="tk-td tk-small" role="cell"><strong>{{ h.actorName }}</strong></div>
            <div class="tk-td" role="cell"><span class="tk-tag">{{ label(h.kind) }}</span></div>
            <div class="tk-td tk-small" role="cell" style="white-space:normal">
              @if (h.field && (h.from !== undefined || h.to !== undefined)) {
                <span class="tk-muted">{{ h.field }}:</span> <s class="tk-faint">{{ h.from ?? '—' }}</s> → <strong>{{ h.to ?? '—' }}</strong>
              }
              @if (h.note) { <div class="tk-muted">{{ h.note }}</div> }
            </div>
          </div>
        } @empty {
          <app-empty-state icon="file-text" tone="neutral" [compact]="true" heading="No changes recorded" />
        }
      </div>
    </div>`,
})
export class TicketHistory {
  readonly entries = input.required<readonly TicketHistoryEntry[]>();
  protected readonly kind = signal<HistoryKind | null>(null);
  protected readonly kinds = computed(() => Array.from(new Set(this.entries().map((e) => e.kind))));
  protected readonly rows = computed(() => (this.kind() ? this.entries().filter((e) => e.kind === this.kind()) : this.entries()));
  protected label(k: HistoryKind): string { return KIND_LABEL[k]; }
  protected when(iso: string): string { return dateTime(iso); }
}
