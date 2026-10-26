import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CwPageHead } from '../../../Shared/Campaign/cw-page-head';
import { CW_ICONS, CwIcon } from '../../../Shared/Campaign/cw-icons';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';
import { LIFECYCLE_LABEL, Lifecycle, daysBetween, fmtDate, fmtTime, todayIso } from '../../../Shared/Campaign/cw.data';
import { formatMoney } from '../../../Shared/services/money-format';

type LifeAction = 'pause' | 'resume' | 'requestClose' | 'approveClose' | 'rejectClose';

interface ActionDef {
  key: LifeAction;
  title: string;
  text: string;
  icon: CwIcon;
  tone: string;
  to: Lifecycle;
  needsReason: boolean;
  confirm: string;
  danger: boolean;
  button: 'w-btn w-btn-primary' | 'w-btn w-btn-danger' | 'w-btn';
}

const ACTIONS: Record<LifeAction, ActionDef> = {
  pause: { key: 'pause', title: 'Pause campaign', text: 'Donor forms and tracking assets stop taking donations until the campaign is resumed. Nothing is deleted.', icon: 'pause', tone: 'tone-warning', to: 'paused', needsReason: true, confirm: 'Pause campaign', danger: false, button: 'w-btn w-btn-primary' },
  resume: { key: 'resume', title: 'Resume campaign', text: 'Donor forms and live tracking assets start taking donations again.', icon: 'play', tone: 'tone-success', to: 'active', needsReason: true, confirm: 'Resume campaign', danger: false, button: 'w-btn w-btn-primary' },
  requestClose: { key: 'requestClose', title: 'Request close', text: 'Asks a Campaign Manager to close the campaign. It keeps running until the close is approved.', icon: 'xCircle', tone: 'tone-danger', to: 'closing', needsReason: true, confirm: 'Request close', danger: true, button: 'w-btn w-btn-danger' },
  approveClose: { key: 'approveClose', title: 'Approve close', text: 'Closes the campaign for good: donor forms stop, tracking assets are disabled and the totals are final.', icon: 'lock', tone: 'tone-danger', to: 'closed', needsReason: false, confirm: 'Approve close', danger: true, button: 'w-btn w-btn-danger' },
  rejectClose: { key: 'rejectClose', title: 'Reject close', text: 'Turns the close request down; the campaign stays active.', icon: 'undo', tone: 'tone-info', to: 'active', needsReason: true, confirm: 'Reject close', danger: true, button: 'w-btn' }
};

const STEPS: Lifecycle[] = ['draft', 'submitted', 'scheduled', 'active', 'closing', 'closed'];

@Component({
  selector: 'app-campaign-lifecycle',
  imports: [CwPageHead, RouterLink],
  templateUrl: './campaign-lifecycle.html',
  styleUrls: ['../../../Shared/Campaign/cw-shared.css', './campaign-lifecycle.css']
})
export class CampaignLifecycle {
  protected readonly store = inject(CampaignWorkspaceStore);
  protected readonly c = this.store.campaign;
  protected readonly paths = CW_PATHS;
  protected readonly fmtDate = fmtDate;
  protected readonly fmtTime = fmtTime;
  protected readonly inr = (n: number): string => formatMoney(n, this.c().currency, { style: 'whole' });
  protected readonly steps = STEPS;
  protected readonly label = LIFECYCLE_LABEL;

  protected readonly actions = computed<ActionDef[]>(() => {
    const l = this.c().lifecycle;
    if (l === 'active') return [ACTIONS.pause, ACTIONS.requestClose];
    if (l === 'paused') return [ACTIONS.resume, ACTIONS.requestClose];
    if (l === 'closing') return [ACTIONS.approveClose, ACTIONS.rejectClose];
    return [];
  });

  /** Why nothing can be done yet (for states without actions). */
  protected readonly noActionText = computed(() => {
    const l = this.c().lifecycle;
    if (l === 'closed') return 'This campaign is closed. Its totals are final and it can no longer take donations.';
    if (l === 'scheduled') return `This campaign goes live on ${fmtDate(this.c().start)}. Pause and close become available once it is active.`;
    return 'This campaign has not launched yet. Clear the readiness checklist and approve the launch first.';
  });

  protected readonly stepIndex = computed(() => STEPS.indexOf(this.c().lifecycle === 'paused' ? 'active' : this.c().lifecycle));

  protected readonly liveAssets = computed(() => this.store.assets().filter((a) => a.campaign === this.c().code && a.status === 'active').length);
  protected readonly raisedPct = computed(() => (this.c().target ? Math.min(100, Math.round((this.c().raised / this.c().target) * 100)) : 0));
  protected readonly daysLeft = computed(() => daysBetween(todayIso(), this.c().end));

  protected readonly history = computed(() =>
    this.store.activityFor(this.c().code).filter((a) => /paus|resum|clos|activat|launch|schedul/i.test(a.title))
  );

  /** Tabs design: which tab is open. */
  protected readonly tab = signal<'actions' | 'history' | 'journey'>('actions');

  // ---- confirmation ----
  protected readonly pending = signal<ActionDef | null>(null);
  protected readonly reason = signal('');
  protected readonly touched = signal(false);

  protected icon(name: CwIcon): string {
    return CW_ICONS[name];
  }

  /** Icon inside each history circle, by activity kind. */
  protected historyIcon(kind: string): CwIcon {
    return kind === 'pause' ? 'pause' : kind === 'resume' ? 'play' : kind === 'approval' ? 'checkCircle' : kind === 'create' ? 'plus' : 'edit';
  }

  protected start(a: ActionDef): void {
    this.reason.set('');
    this.touched.set(false);
    this.pending.set(a);
  }

  protected reasonError(): string | null {
    const a = this.pending();
    return a?.needsReason && this.reason().trim().length < 10 ? 'Give a reason of at least 10 characters.' : null;
  }

  protected setReason(e: Event): void {
    this.reason.set((e.target as HTMLTextAreaElement).value);
  }

  protected confirm(): void {
    const a = this.pending();
    if (!a) return;
    this.touched.set(true);
    if (this.reasonError()) return;
    const code = this.c().code;
    const r = this.reason().trim();
    if (a.key === 'pause') this.store.pause(code, r);
    else if (a.key === 'resume') this.store.resume(code, r);
    else if (a.key === 'requestClose') this.store.requestClose(code, r);
    else if (a.key === 'approveClose') this.store.approveClose(code);
    else this.store.rejectClose(code, r);
    this.pending.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.pending.set(null);
  }
}