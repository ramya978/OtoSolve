import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TkIcon } from './icon';
import { Tone } from '../models/ticket.model';

/**
 * Placeholders shaped like the content they stand in for, so the page does not jump when data
 * arrives.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-busy': 'true', role: 'status' },
  template: `
    <span class="tk-sr-only">Loading…</span>
    @switch (variant()) {
      @case ('kpis') {
        <div class="tk-kpis">
          @for (i of range(); track i) {
            <div class="tk-card is-pad" style="display:grid;gap:10px"><span class="tk-skel is-text" style="width:55%"></span><span class="tk-skel is-num"></span><span class="tk-skel is-text" style="width:70%"></span></div>
          }
        </div>
      }
      @case ('chart') {
        <div style="display:flex;align-items:flex-end;gap:10px;height:200px;padding:8px 4px">
          @for (h of bars; track $index) { <span class="tk-skel" [style.height.%]="h" style="flex:1"></span> }
        </div>
      }
      @case ('cards') {
        <div style="display:grid;gap:10px">
          @for (i of range(); track i) {
            <div class="tk-card is-solid is-pad" style="display:grid;gap:8px;padding:12px"><span class="tk-skel is-text" style="width:30%"></span><span class="tk-skel is-text" style="width:90%"></span><span class="tk-skel is-text" style="width:60%"></span></div>
          }
        </div>
      }
      @case ('detail') {
        <div style="display:grid;gap:14px;padding:20px">
          <span class="tk-skel is-title"></span>
          @for (i of range(); track i) { <span class="tk-skel is-text" [style.width.%]="90 - i * 9"></span> }
        </div>
      }
      @default {
        <div style="display:grid">
          @for (i of range(); track i) {
            <div style="display:grid;grid-template-columns:28px 2fr 1fr 1fr 1fr;gap:16px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border-color)">
              <span class="tk-skel is-circle" style="width:26px;height:26px"></span>
              <span style="display:grid;gap:6px"><span class="tk-skel is-text" style="width:40%"></span><span class="tk-skel is-text" style="width:80%"></span></span>
              <span class="tk-skel is-text"></span><span class="tk-skel is-text" style="width:70%"></span><span class="tk-skel is-text" style="width:50%"></span>
            </div>
          }
        </div>
      }
    }`,
})
export class Skeleton {
  readonly variant = input<'table' | 'kpis' | 'chart' | 'cards' | 'detail'>('table');
  readonly rows = input(6);
  protected readonly bars = [45, 70, 55, 85, 60, 95, 50, 75];
  protected range(): number[] { return Array.from({ length: this.rows() }, (_, i) => i); }
}

/** Empty, error and success states: what happened, and what to do next. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tk-empty" [class.is-compact]="compact()" [attr.data-tone]="tone()" [attr.role]="tone() === 'danger' ? 'alert' : null">
      <div class="tk-empty-art"><tk-icon [name]="icon()" /></div>
      <h3>{{ heading() }}</h3>
      @if (message()) { <p>{{ message() }}</p> }
      <div class="tk-actions">
        <ng-content />
        @if (retryLabel()) { <button type="button" class="tk-btn is-sm" (click)="retry.emit()"><tk-icon name="refresh" />{{ retryLabel() }}</button> }
      </div>
    </div>`,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly heading = input.required<string>();
  readonly message = input('');
  readonly tone = input<Tone>('primary');
  readonly compact = input(false);
  /** Shows a retry button when set (error states). */
  readonly retryLabel = input('');
  readonly retry = output<void>();
}
