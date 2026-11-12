import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { Agent } from '../models/ticket.model';
import { TkIcon } from './icon';

/** Button that opens a searchable list of agents with their availability and open load. */
@Component({
  selector: 'app-assignee-picker',
  standalone: true,
  imports: [TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tk-popover', '(document:click)': 'onDocClick($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    <button type="button" [class]="buttonClass()" (click)="toggle()" [attr.aria-expanded]="open()" aria-haspopup="listbox" [disabled]="disabled()">
      @if (current(); as c) {
        <span class="tk-avatar is-sm" data-tone="primary">{{ c.initials }}</span>{{ compact() ? '' : c.name }}
      } @else {
        <span class="tk-avatar is-sm is-empty"><tk-icon name="user" /></span>{{ compact() ? '' : placeholder() }}
      }
      @if (!compact()) { <tk-icon name="chevron-down" /> }
    </button>
    @if (open()) {
      <div class="tk-menu" [class.is-left]="alignLeft()" role="listbox" aria-label="Choose assignee" style="width:280px">
        <div style="padding:4px 4px 6px"><input class="tk-input is-sm" placeholder="Search people" [value]="term()" (input)="term.set($any($event.target).value)" aria-label="Search people" /></div>
        @if (meId()) { <button type="button" (click)="choose(meId())"><tk-icon name="user" />Assign to me</button> }
        @if (allowUnassign() && value()) { <button type="button" (click)="choose(null)"><tk-icon name="x" />Unassign</button> }
        <hr />
        @for (a of filtered(); track a.id) {
          <button type="button" role="option" [attr.aria-selected]="a.id === value()" [disabled]="!a.available || !canPick(a.id)" (click)="choose(a.id)">
            <span class="tk-avatar is-sm" data-tone="primary">{{ a.initials }}</span>
            <span style="min-width:0"><span style="display:block">{{ a.name }}</span><span class="tk-faint" style="font-size:11.5px">{{ a.available ? (loads().get(a.id) ?? 0) + ' open of ' + a.capacity : 'Unavailable' }}</span></span>
            @if (a.id === value()) { <small><tk-icon name="check" /></small> }
          </button>
        } @empty {
          <p class="tk-faint tk-small" style="padding:8px 10px">No one matches “{{ term() }}”.</p>
        }
      </div>
    }`,
})
export class AssigneePicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly agents = input.required<readonly Agent[]>();
  readonly value = input<string | null>(null);
  readonly meId = input<string | null>(null);
  /** Open-ticket count per agent id. */
  readonly loads = input<ReadonlyMap<string, number>>(new Map());
  /** When false, only `meId` can be picked (agents without the assign permission). */
  readonly canAssignOthers = input(true);
  readonly allowUnassign = input(true);
  readonly compact = input(false);
  readonly disabled = input(false);
  readonly alignLeft = input(false);
  readonly placeholder = input('Unassigned');
  readonly buttonClass = input('tk-btn is-sm');
  readonly pick = output<string | null>();

  protected readonly open = signal(false);
  protected readonly term = signal('');
  protected readonly current = computed(() => this.agents().find((a) => a.id === this.value()) ?? null);
  protected readonly filtered = computed(() => {
    const t = this.term().trim().toLowerCase();
    return this.agents().filter((a) => !t || a.name.toLowerCase().includes(t));
  });

  protected canPick(id: string): boolean { return this.canAssignOthers() || id === this.meId(); }
  protected toggle(): void { this.open.update((v) => !v); }
  protected choose(id: string | null): void {
    this.open.set(false);
    if (id !== this.value()) this.pick.emit(id);
  }
  protected onDocClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
