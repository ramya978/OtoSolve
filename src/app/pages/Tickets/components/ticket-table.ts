import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import { SortField, SortSpec, Ticket } from '../models/ticket.model';
import { TicketService } from '../services/ticket.service';
import { StatusBadge } from './status-badge';
import { PriorityBadge } from './priority-badge';
import { SlaIndicator } from './sla-indicator';
import { shortDate, relativeTime } from '../utils/format';

export type ColumnKey = 'id' | 'subject' | 'customer' | 'priority' | 'status' | 'assignee' | 'category' | 'sla' | 'created' | 'updated';

export interface ColumnDef {
  readonly key: ColumnKey;
  readonly label: string;
  readonly sort: SortField;
  readonly width: string;
  /** Hidden on phones even when chosen. */
  readonly hideSm?: boolean;
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: 'id', label: 'Ticket ID', sort: 'number', width: '100px' },
  { key: 'subject', label: 'Subject', sort: 'subject', width: 'minmax(240px, 2.4fr)' },
  { key: 'customer', label: 'Customer', sort: 'customer', width: 'minmax(160px, 1.2fr)' },
  { key: 'priority', label: 'Priority', sort: 'priority', width: '110px' },
  { key: 'status', label: 'Status', sort: 'status', width: '160px' },
  { key: 'assignee', label: 'Assignee', sort: 'assignee', width: 'minmax(150px, 1fr)' },
  { key: 'category', label: 'Category', sort: 'category', width: '130px', hideSm: true },
  { key: 'sla', label: 'SLA', sort: 'sla', width: '160px' },
  { key: 'created', label: 'Created', sort: 'createdAt', width: '112px', hideSm: true },
  { key: 'updated', label: 'Updated', sort: 'updatedAt', width: '112px', hideSm: true },
];

export const DEFAULT_COLUMNS: readonly ColumnKey[] = COLUMNS.map((c) => c.key);

/**
 * The ticket grid. Rows are CSS-grid divs with table roles, so the same markup can be paged or
 * virtual-scrolled, and collapses to stacked cards on phones.
 */
@Component({
  selector: 'app-ticket-table',
  standalone: true,
  imports: [ScrollingModule, NgTemplateOutlet, StatusBadge, PriorityBadge, SlaIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-table-scroll">
      <div class="tk-table is-adaptive" role="table" [attr.aria-label]="label()" [attr.aria-rowcount]="total()" [style.--cols]="gridCols()" [style.--table-min]="minWidth()">
        <div class="tk-tr is-head" role="row">
          @if (selectable()) {
            <div class="tk-th" role="columnheader">
              <label class="tk-check"><input type="checkbox" [checked]="allSelected()" [indeterminate]="someSelected()" (change)="toggleAll.emit()" aria-label="Select all tickets on this page" /></label>
            </div>
          }
          @for (c of cols(); track c.key) {
            <div class="tk-th" role="columnheader" [attr.aria-sort]="ariaSort(c.sort)">
              <button type="button" class="tk-sort" (click)="onSort(c.sort, $event)" [attr.aria-sort]="ariaSort(c.sort)" title="Sort. Shift-click to add a second sort.">
                {{ c.label }}<span class="arrow">{{ arrow(c.sort) }}</span>
                @if (sortOrder(c.sort) > 0 && sort().length > 1) { <span class="order">{{ sortOrder(c.sort) }}</span> }
              </button>
            </div>
          }
        </div>

        @if (virtual()) {
          <cdk-virtual-scroll-viewport [itemSize]="rowHeight" [style.height.px]="viewportHeight()" [minBufferPx]="600" [maxBufferPx]="1200" (scrolledIndexChange)="onScrolled($event)">
            <div *cdkVirtualFor="let t of rows(); trackBy: trackById" class="tk-tr is-row" role="row" [class.is-selected]="selected().has(t.id)" [style.height.px]="rowHeight" (click)="open.emit(t)">
              <ng-container *ngTemplateOutlet="cells; context: { $implicit: t }" />
            </div>
          </cdk-virtual-scroll-viewport>
        } @else {
          @for (t of rows(); track t.id) {
            <div class="tk-tr is-row" role="row" [class.is-selected]="selected().has(t.id)" (click)="open.emit(t)">
              <ng-container *ngTemplateOutlet="cells; context: { $implicit: t }" />
            </div>
          }
        }
      </div>
    </div>

    <ng-template #cells let-t>
      @if (selectable()) {
        <div class="tk-td" role="cell" data-col="select" (click)="$event.stopPropagation()">
          <label class="tk-check"><input type="checkbox" [checked]="selected().has(t.id)" (change)="toggle.emit(t.id)" [attr.aria-label]="'Select ' + t.number" /></label>
        </div>
      }
      @for (c of cols(); track c.key) {
        @switch (c.key) {
          @case ('id') { <div class="tk-td" role="cell" data-col="id" data-label="ID"><span class="tk-mono" style="color:var(--primary-color);font-weight:700">{{ t.number }}</span></div> }
          @case ('subject') {
            <div class="tk-td" role="cell" data-col="ticket">
              <div class="tk-ticket-cell">
                <a class="subj" [href]="'/app/tickets/' + t.id" (click)="$event.preventDefault()">{{ t.subject }}</a>
                <span class="meta">{{ t.type }} · {{ t.channel }}@if (t.commentCount > 1) { · {{ t.commentCount }} messages }</span>
              </div>
            </div>
          }
          @case ('customer') {
            <div class="tk-td" role="cell" data-col="customer" data-label="Customer">
              @if (tickets.customer(t.customerId); as cu) {
                <div class="tk-person"><span class="tk-avatar is-sm" data-tone="info">{{ cu.initials }}</span><div class="who"><strong>{{ cu.name }}</strong><small>{{ cu.organisation }}</small></div></div>
              }
            </div>
          }
          @case ('priority') { <div class="tk-td" role="cell" data-col="priority" data-label="Priority"><app-priority-badge [priority]="t.priority" /></div> }
          @case ('status') { <div class="tk-td" role="cell" data-col="status" data-label="Status"><app-status-badge [status]="t.status" size="sm" /></div> }
          @case ('assignee') {
            <div class="tk-td" role="cell" data-col="assignee" data-label="Assignee">
              @if (tickets.agent(t.assigneeId); as a) {
                <div class="tk-person"><span class="tk-avatar is-sm" data-tone="primary">{{ a.initials }}</span><div class="who"><strong>{{ a.name }}</strong></div></div>
              } @else { <span class="tk-faint">Unassigned</span> }
            </div>
          }
          @case ('category') { <div class="tk-td" role="cell" data-col="category" data-label="Category" [class.hide-sm]="c.hideSm"><span class="tk-tag">{{ t.category }}</span></div> }
          @case ('sla') { <div class="tk-td" role="cell" data-col="sla" data-label="SLA"><app-sla-indicator [ticket]="t" /></div> }
          @case ('created') { <div class="tk-td" role="cell" data-col="created" data-label="Created" [class.hide-sm]="c.hideSm"><span class="tk-small" [title]="t.createdAt">{{ date(t.createdAt) }}</span></div> }
          @case ('updated') { <div class="tk-td" role="cell" data-col="updated" data-label="Updated" [class.hide-sm]="c.hideSm"><span class="tk-small tk-muted" [title]="t.updatedAt">{{ ago(t.updatedAt) }}</span></div> }
        }
      }
    </ng-template>`,
})
export class TicketTable {
  protected readonly tickets = inject(TicketService);

  readonly rows = input.required<readonly Ticket[]>();
  readonly total = input(0);
  readonly columns = input<readonly ColumnKey[]>(DEFAULT_COLUMNS);
  readonly sort = input<readonly SortSpec[]>([]);
  readonly selected = input<ReadonlySet<string>>(new Set());
  readonly selectable = input(false);
  readonly virtual = input(false);
  readonly viewportHeight = input(620);
  readonly label = input('Tickets');

  readonly sortChange = output<SortSpec[]>();
  readonly toggle = output<string>();
  readonly toggleAll = output<void>();
  readonly open = output<Ticket>();
  /** Emitted when a virtual list is scrolled close to its end (infinite scroll). */
  readonly nearEnd = output<void>();

  protected readonly rowHeight = 58;
  protected readonly cols = computed(() => COLUMNS.filter((c) => this.columns().includes(c.key)));
  protected readonly gridCols = computed(() => [...(this.selectable() ? ['44px'] : []), ...this.cols().map((c) => c.width)].join(' '));
  protected readonly minWidth = computed(() => `${Math.max(640, this.cols().length * 120 + (this.selectable() ? 44 : 0))}px`);
  protected readonly allSelected = computed(() => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)));
  protected readonly someSelected = computed(() => !this.allSelected() && this.rows().some((r) => this.selected().has(r.id)));

  protected trackById = (_: number, t: Ticket) => t.id;
  protected date(iso: string): string { return shortDate(iso); }
  protected ago(iso: string): string { return relativeTime(iso); }

  protected sortOrder(field: SortField): number { return this.sort().findIndex((s) => s.field === field) + 1; }
  protected ariaSort(field: SortField): 'ascending' | 'descending' | 'none' {
    const s = this.sort().find((x) => x.field === field);
    return s ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected arrow(field: SortField): string {
    const s = this.sort().find((x) => x.field === field);
    return s ? (s.dir === 'asc' ? '▲' : '▼') : '↕';
  }

  /** Click: sort by this column (asc → desc → off). Shift-click: add or cycle it as a further sort. */
  protected onSort(field: SortField, e: MouseEvent): void {
    const current = this.sort();
    const existing = current.find((s) => s.field === field);
    const nextDir = !existing ? 'asc' : existing.dir === 'asc' ? 'desc' : null;
    if (e.shiftKey) {
      const others = current.filter((s) => s.field !== field);
      this.sortChange.emit(nextDir ? [...others, { field, dir: nextDir }] : others);
    } else {
      this.sortChange.emit(nextDir ? [{ field, dir: nextDir }] : []);
    }
  }

  protected onScrolled(index: number): void {
    const visible = Math.ceil(this.viewportHeight() / this.rowHeight);
    if (index + visible >= this.rows().length - 10) this.nearEnd.emit();
  }
}
