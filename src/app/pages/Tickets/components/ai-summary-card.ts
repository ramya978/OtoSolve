import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AiSummary } from '../services/ai.service';
import { TkIcon } from './icon';

/** The AI ticket summary: one-line headline, key facts, and the suggested next step. */
@Component({
  selector: 'app-ai-summary-card',
  standalone: true,
  imports: [TkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (summary(); as s) {
      <p style="font-weight:700;line-height:1.45">{{ s.headline }}</p>
      <ul style="margin:10px 0 0;padding-left:18px;display:grid;gap:4px;color:var(--text-secondary);font-size:13px">
        @for (b of s.bullets; track $index) { <li>{{ b }}</li> }
      </ul>
      <div class="tk-alert" data-tone="primary" style="margin-top:12px"><tk-icon name="zap" /><div class="body"><strong>Next step</strong>{{ s.nextStep }}</div></div>
    } @else {
      <div style="display:grid;gap:8px"><span class="tk-skel is-text" style="width:90%"></span><span class="tk-skel is-text" style="width:75%"></span><span class="tk-skel is-text" style="width:60%"></span></div>
    }`,
})
export class AiSummaryCard {
  readonly summary = input<AiSummary | null>(null);
}
