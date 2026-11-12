import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  Agent, QuickView, SavedFilter, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TicketQuery,
} from '../models/ticket.model';
import { TkIcon } from './icon';

type ListKey = 'statuses' | 'priorities' | 'categories' | 'assigneeIds' | 'slaStates';

const QUICK_VIEWS: readonly { key: QuickView; label: string; staffOnly?: boolean }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My tickets' },
  { key: 'unassigned', label: 'Unassigned', staffOnly: true },
  { key: 'due-today', label: 'Due today', staffOnly: true },
  { key: 'breached', label: 'Breached', staffOnly: true },
  { key: 'escalated', label: 'Escalated', staffOnly: true },
  { key: 'waiting', label: 'Waiting' },
];

const SLA_OPTIONS = [
  { value: 'on-track', label: 'On track' },
  { value: 'warning', label: 'Warning' },
  { value: 'breached', label: 'Breached' },
  { value: 'paused', label: 'Paused' },
] as const;

/**
 * Global search, quick views, multi-select filters (status, priority, category, assignee, SLA,
 * created date) and saved views. Emits partial query changes; the page owns the query.
 */
@Component({
  selector: 'app-ticket-filter',
  standalone: true,
  imports: [TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocClick($event)' },
  template: `
    <div class="tk-row" style="gap:10px">
      <label class="tk-search">
        <tk-icon name="search" />
        <span class="tk-sr-only">Search tickets</span>
        <input #search class="tk-input" type="search" placeholder="Search ID, subject, customer, email or tag" [value]="query().search"
               (input)="search$.next($any($event.target).value)" (keydown.escape)="search.value = ''; search$.next('')" />
        @if (!query().search) { <kbd aria-hidden="true">/</kbd> }
      </label>
      <button type="button" class="tk-btn" [attr.aria-expanded]="panel()" (click)="panel.set(!panel())">
        <tk-icon name="filter" />Filters @if (activeCount()) { <span class="tk-count" data-tone="primary">{{ activeCount() }}</span> }
      </button>
      <div class="tk-popover">
        <button type="button" class="tk-btn" [attr.aria-expanded]="savedOpen()" (click)="savedOpen.set(!savedOpen())"><tk-icon name="save" />Saved views</button>
        @if (savedOpen()) {
          <div class="tk-menu" style="width:300px" role="menu">
            <div class="tk-menu-label">Your views</div>
            @for (f of saved(); track f.id) {
              <div class="tk-row" style="gap:0;flex-wrap:nowrap">
                <button type="button" role="menuitem" (click)="applySaved.emit(f); savedOpen.set(false)" style="flex:1"><tk-icon name="eye" />{{ f.name }}</button>
                <button type="button" class="tk-btn is-ghost is-icon is-sm" style="width:30px" (click)="deleteSaved.emit(f.id)" [attr.aria-label]="'Delete view ' + f.name"><tk-icon name="trash" /></button>
              </div>
            } @empty { <p class="tk-faint tk-small" style="padding:4px 10px 8px">No saved views yet. Filter the list, then save it here.</p> }
            <hr />
            <div style="padding:6px;display:flex;gap:6px">
              <input #name class="tk-input is-sm" placeholder="Name this view" aria-label="View name" (keydown.enter)="save(name.value); name.value = ''" />
              <button type="button" class="tk-btn btn-primary is-sm" (click)="save(name.value); name.value = ''">Save</button>
            </div>
          </div>
        }
      </div>
      <ng-content />
    </div>

    <div class="tk-chips" style="margin-top:12px" role="group" aria-label="Quick views">
      @for (v of views(); track v.key) {
        <button type="button" class="tk-chip" [attr.aria-pressed]="query().view === v.key" (click)="changed.emit({ view: v.key, page: 1 })">{{ v.label }}</button>
      }
    </div>

    @if (activeChips().length) {
      <div class="tk-chips" style="margin-top:10px" aria-label="Active filters">
        @for (c of activeChips(); track c.id) {
          <button type="button" class="tk-chip" aria-pressed="true" (click)="remove(c.key, c.value)" [attr.aria-label]="'Remove filter ' + c.label">{{ c.label }}<span class="x" aria-hidden="true">×</span></button>
        }
        <button type="button" class="tk-link-btn" (click)="clear()">Clear all</button>
      </div>
    }

    @if (panel()) {
      <div class="tk-card is-solid tk-rise" style="margin-top:12px;padding:16px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        @for (g of groups(); track g.key) {
          <fieldset style="border:0;padding:0;margin:0;min-width:0">
            <legend class="tk-section-title" style="margin-bottom:8px">{{ g.label }}</legend>
            <div style="display:grid;gap:2px;max-height:210px;overflow:auto">
              @for (o of g.options; track o.value) {
                <label class="tk-check"><input type="checkbox" [checked]="has(g.key, o.value)" (change)="toggle(g.key, o.value)" />{{ o.label }}</label>
              }
            </div>
          </fieldset>
        }
        <fieldset style="border:0;padding:0;margin:0">
          <legend class="tk-section-title" style="margin-bottom:8px">Created</legend>
          <div style="display:grid;gap:8px">
            <label class="tk-field"><span class="tk-label">From</span><input class="tk-input is-sm" type="date" [value]="query().createdFrom ?? ''" (change)="changed.emit({ createdFrom: $any($event.target).value || null, page: 1 })" /></label>
            <label class="tk-field"><span class="tk-label">To</span><input class="tk-input is-sm" type="date" [value]="query().createdTo ?? ''" (change)="changed.emit({ createdTo: $any($event.target).value || null, page: 1 })" /></label>
          </div>
        </fieldset>
      </div>
    }`,
})
export class TicketFilter {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly query = input.required<TicketQuery>();
  readonly agents = input<readonly Agent[]>([]);
  readonly saved = input<readonly SavedFilter[]>([]);
  readonly staff = input(true);
  readonly changed = output<Partial<TicketQuery>>();
  readonly saveView = output<string>();
  readonly applySaved = output<SavedFilter>();
  readonly deleteSaved = output<string>();

  protected readonly panel = signal(false);
  protected readonly savedOpen = signal(false);
  protected readonly search$ = new Subject<string>();

  protected readonly views = computed(() => QUICK_VIEWS.filter((v) => this.staff() || !v.staffOnly));

  protected readonly groups = computed(() => [
    { key: 'statuses' as ListKey, label: 'Status', options: TICKET_STATUSES.map((s) => ({ value: s, label: s })) },
    { key: 'priorities' as ListKey, label: 'Priority', options: TICKET_PRIORITIES.map((s) => ({ value: s, label: s })) },
    { key: 'categories' as ListKey, label: 'Category', options: TICKET_CATEGORIES.map((s) => ({ value: s, label: s })) },
    ...(this.staff() ? [{ key: 'assigneeIds' as ListKey, label: 'Assignee', options: [{ value: 'unassigned', label: 'Unassigned' }, ...this.agents().map((a) => ({ value: a.id, label: a.name }))] }] : []),
    { key: 'slaStates' as ListKey, label: 'SLA', options: SLA_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })) },
  ]);

  protected readonly activeCount = computed(() => {
    const q = this.query();
    return q.statuses.length + q.priorities.length + q.categories.length + q.assigneeIds.length + q.slaStates.length + (q.createdFrom ? 1 : 0) + (q.createdTo ? 1 : 0);
  });

  protected readonly activeChips = computed(() => {
    const q = this.query();
    const agent = (id: string) => (id === 'unassigned' ? 'Unassigned' : this.agents().find((a) => a.id === id)?.name ?? id);
    const sla = (s: string) => SLA_OPTIONS.find((o) => o.value === s)?.label ?? s;
    return [
      ...q.statuses.map((v) => ({ key: 'statuses' as const, value: v as string, label: `Status: ${v}` })),
      ...q.priorities.map((v) => ({ key: 'priorities' as const, value: v as string, label: `Priority: ${v}` })),
      ...q.categories.map((v) => ({ key: 'categories' as const, value: v as string, label: `Category: ${v}` })),
      ...q.assigneeIds.map((v) => ({ key: 'assigneeIds' as const, value: v, label: `Assignee: ${agent(v)}` })),
      ...q.slaStates.map((v) => ({ key: 'slaStates' as const, value: v as string, label: `SLA: ${sla(v)}` })),
      ...(q.createdFrom ? [{ key: 'createdFrom' as const, value: q.createdFrom, label: `From ${q.createdFrom}` }] : []),
      ...(q.createdTo ? [{ key: 'createdTo' as const, value: q.createdTo, label: `To ${q.createdTo}` }] : []),
    ].map((c) => ({ ...c, id: `${c.key}:${c.value}` }));
  });

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((search) => this.changed.emit({ search, page: 1 }));
  }

  protected has(key: ListKey, value: string): boolean {
    return (this.query()[key] as readonly string[]).includes(value);
  }

  protected toggle(key: ListKey, value: string): void {
    const list = this.query()[key] as readonly string[];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    this.changed.emit({ [key]: next, page: 1 } as Partial<TicketQuery>);
  }

  protected remove(key: ListKey | 'createdFrom' | 'createdTo', value: string): void {
    if (key === 'createdFrom' || key === 'createdTo') this.changed.emit({ [key]: null, page: 1 });
    else this.toggle(key, value);
  }

  protected clear(): void {
    this.changed.emit({ statuses: [], priorities: [], categories: [], assigneeIds: [], slaStates: [], createdFrom: null, createdTo: null, page: 1 });
  }

  protected save(name: string): void {
    if (!name.trim()) return;
    this.saveView.emit(name.trim());
    this.savedOpen.set(false);
  }

  protected onDocClick(e: MouseEvent): void {
    if (this.savedOpen() && !this.host.nativeElement.querySelector('.tk-popover')?.contains(e.target as Node)) this.savedOpen.set(false);
  }
}
