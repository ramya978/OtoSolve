import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CW_ICONS, CwIcon } from './cw-icons';
import { CW_PATHS } from './cw-paths';
import { CwSelect } from './cw-select';
import { CampaignWorkspaceStore } from './cw.store';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, fmtDate, fmtTime } from './cw.data';

@Component({
  selector: 'cw-page-head',
  imports: [RouterLink, RouterLinkActive, CwSelect],
  templateUrl: './cw-page-head.html',
  styleUrls: ['./cw-shared.css', './cw-page-head.css']
})
export class CwPageHead {
  protected readonly store = inject(CampaignWorkspaceStore);

  readonly section = input<string>('');


  protected icon(name: CwIcon): string {
    return CW_ICONS[name];
  }

  protected lifecycleLabel(): string {
    return LIFECYCLE_LABEL[this.store.campaign().lifecycle];
  }

  protected lifecycleTone(): string {
    return LIFECYCLE_TONE[this.store.campaign().lifecycle];
  }

  protected updated(): string {
    const at = this.store.campaign().updatedAt;
    return `${fmtDate(at)}, ${fmtTime(at)}`;
  }
}
