import { Injectable, computed, signal } from '@angular/core';
import {
  ACTIVITY, ASSETS, CAMPAIGNS, CHECKS, CURRENT_USER, Activity, ActivityKind, AssetStatus, CampaignInfo,
  CheckStatus, DONATIONS, Lifecycle, ReadinessCheck, TrackingAsset, newChecklist
} from './cw.data';

/**
 * CAMPAIGN WORKSPACE STORE - one place for the campaign the user is looking at and every change the
 * four campaign pages make (readiness verdicts, launch decisions, pause / resume / close, tracking
 * assets). In-memory for now; swap the method bodies for API calls when the backend is ready.
 */
@Injectable({ providedIn: 'root' })
export class CampaignWorkspaceStore {
  readonly campaigns = signal<CampaignInfo[]>(CAMPAIGNS.map((c) => ({ ...c })));
  readonly checks = signal<ReadinessCheck[]>(CHECKS.map((c) => ({ ...c })));
  readonly assets = signal<TrackingAsset[]>(ASSETS.map((a) => ({ ...a })));
  readonly activity = signal<Activity[]>(ACTIVITY.map((a) => ({ ...a })));
  readonly donations = DONATIONS;

  /** Campaign shown on the campaign pages (picked in the page header). */
  readonly selectedCode = signal('HAI-PHYSIO-2026');
  readonly campaign = computed(() => this.campaigns().find((c) => c.code === this.selectedCode()) ?? this.campaigns()[0]);

  /** One-line toast shared by the pages. */
  readonly toast = signal<{ text: string; tone: 'ok' | 'warn' | 'danger' } | null>(null);
  private toastTimer = 0;

  readonly currentUser = CURRENT_USER;

  select(code: string): void {
    this.selectedCode.set(code);
    // a campaign without a checklist gets the standard one the first time it is opened
    if (!this.checks().some((c) => c.campaign === code)) {
      // a campaign that already launched cleared its checklist; one still in draft starts with it open
      const launched = !['draft', 'submitted'].includes(this.findCampaign(code)?.lifecycle ?? 'draft');
      const list = newChecklist(code).map((c) => (launched ? { ...c, status: 'passed' as const, verdictBy: 'Vikram Anand' } : c));
      this.checks.update((all) => [...all, ...list]);
    }
  }

  /** Picker options: "Name · CODE". */
  readonly campaignOptions = computed(() => this.campaigns().map((c) => ({ value: c.code, label: c.name, hint: c.code })));

  /** Adds a campaign created in the wizard (full-page create flow). In edit mode
      (same code) it patches the existing record instead of duplicating it. */
  createCampaign(info: CampaignInfo): void {
    if (this.findCampaign(info.code)) {
      this.campaigns.update((list) =>
        list.map((c) => (c.code === info.code ? { ...c, ...info, updatedAt: this.now() } : c))
      );
      this.select(info.code);
      this.log(info.code, 'Campaign updated', `${info.name} · saved`, 'change');
      this.showToast(`${info.name} saved.`);
      return;
    }
    this.campaigns.update((list) => [info, ...list]);
    this.select(info.code);
    this.log(info.code, 'Campaign created', `${info.name} · draft`, 'create');
    this.showToast(`${info.name} created as draft.`);
  }

  /** Duplicates a campaign as a new draft (code auto-suffixed until unique). */
  duplicateCampaign(code: string): string {
    const src = this.findCampaign(code);
    if (!src) return code;
    let n = 2;
    let next = `${src.code}-COPY`;
    while (this.findCampaign(next)) next = `${src.code}-COPY-${n++}`;
    const copy: CampaignInfo = {
      ...src, code: next, name: `${src.name} (copy)`, lifecycle: 'draft',
      raised: 0, monthlyRevenue: 0, monthlyRevenuePrev: 0, donors: 0, donations: 0,
      readinessRequest: undefined, closeRequest: undefined, updatedAt: this.now()
    };
    this.campaigns.update((list) => [copy, ...list]);
    this.select(next);
    this.log(next, 'Campaign duplicated', `Copied from ${src.code}`, 'create');
    this.showToast(`${copy.name} duplicated as draft.`);
    return next;
  }

  /** Removes a draft campaign (used by the list-view delete action). */
  removeCampaign(code: string): void {
    const c = this.findCampaign(code);
    this.campaigns.update((list) => list.filter((x) => x.code !== code));
    this.checks.update((list) => list.filter((x) => x.campaign !== code));
    if (c) this.showToast(`${c.name} deleted.`, 'warn');
    const first = this.campaigns()[0];
    if (first) this.select(first.code);
  }

  /** Makes sure every register row also exists in the workspace store (list → detail flow). */
  ensureCampaign(info: CampaignInfo): void {
    if (!this.findCampaign(info.code)) {
      this.campaigns.update((list) => [...list, info]);
    }
  }

  // ------------------------------------------------------------------ readiness
  checksFor(code: string): ReadinessCheck[] {
    return this.checks().filter((c) => c.campaign === code);
  }

  setCheckStatus(id: string, status: CheckStatus, note = ''): void {
    this.checks.update((list) => list.map((c) => (c.id === id ? { ...c, status, verdictBy: status === 'pending' ? undefined : CURRENT_USER, verdictNote: note } : c)));
    const chk = this.checks().find((c) => c.id === id);
    if (chk) this.showToast(`${chk.name} marked ${status}.`, status === 'failed' ? 'danger' : 'ok');
  }

  saveCheck(check: ReadinessCheck): void {
    const exists = this.checks().some((c) => c.id === check.id);
    this.checks.update((list) => (exists ? list.map((c) => (c.id === check.id ? check : c)) : [...list, check]));
    this.showToast(exists ? `${check.name} was saved.` : `${check.name} was added to the checklist.`);
  }

  removeCheck(id: string): void {
    const chk = this.checks().find((c) => c.id === id);
    this.checks.update((list) => list.filter((c) => c.id !== id));
    if (chk) this.showToast(`${chk.name} was removed.`, 'warn');
  }

  newCheckId(code: string): string {
    return `${code}-chk-${Date.now().toString(36)}`;
  }

  approveLaunch(code: string): void {
    const c = this.findCampaign(code);
    if (!c) return;
    const goesLiveNow = c.start <= new Date().toISOString().slice(0, 10);
    this.patchCampaign(code, { lifecycle: goesLiveNow ? 'active' : 'scheduled', readinessRequest: undefined });
    this.log(code, goesLiveNow ? 'Campaign activated' : 'Launch scheduled', goesLiveNow ? 'Launch' : `Goes live on ${c.start}`, 'approval');
    this.showToast(goesLiveNow ? `${c.name} is now active.` : `${c.name} is scheduled to launch.`);
  }

  rejectLaunch(code: string, reason: string): void {
    const c = this.findCampaign(code);
    if (!c) return;
    this.patchCampaign(code, { lifecycle: 'draft', readinessRequest: undefined });
    this.log(code, 'Launch rejected', reason, 'change');
    this.showToast(`Launch rejected - ${c.name} is back in draft.`, 'danger');
  }

  // ------------------------------------------------------------------ pause · resume · close
  pause(code: string, reason: string): void {
    this.patchCampaign(code, { lifecycle: 'paused' });
    this.log(code, 'Campaign paused', reason, 'pause');
    this.showToast('Campaign paused - donor forms and tracking assets stop taking donations.', 'warn');
  }

  resume(code: string, reason: string): void {
    this.patchCampaign(code, { lifecycle: 'active' });
    this.log(code, 'Campaign resumed', reason, 'resume');
    this.showToast('Campaign resumed.');
  }

  requestClose(code: string, reason: string): void {
    this.patchCampaign(code, { lifecycle: 'closing', closeRequest: { by: CURRENT_USER, at: this.now(), reason } });
    this.log(code, 'Campaign close requested', reason, 'change');
    this.showToast('Close requested - waiting for approval.', 'warn');
  }

  approveClose(code: string): void {
    this.patchCampaign(code, { lifecycle: 'closed', closeRequest: undefined });
    this.log(code, 'Campaign closed', 'Close approved', 'approval');
    this.showToast('Campaign closed.');
  }

  rejectClose(code: string, reason: string): void {
    this.patchCampaign(code, { lifecycle: 'active', closeRequest: undefined });
    this.log(code, 'Close rejected', reason, 'change');
    this.showToast('Close rejected - the campaign stays active.', 'danger');
  }

  // ------------------------------------------------------------------ tracking assets
  /** Adds a new asset, or replaces the draft with the same reference. */
  saveAsset(asset: TrackingAsset): void {
    const exists = this.assets().some((a) => a.ref === asset.ref);
    this.assets.update((list) => (exists ? list.map((a) => (a.ref === asset.ref ? asset : a)) : [asset, ...list]));
    this.showToast(asset.status === 'draft' ? `${asset.ref} saved as draft.` : `${asset.ref} submitted for approval.`);
  }

  setAssetStatus(ref: string, status: AssetStatus): void {
    this.assets.update((list) => list.map((a) => (a.ref === ref ? { ...a, status, approval: status === 'active' || status === 'disabled' ? 'Approved' : a.approval } : a)));
    const label: Partial<Record<AssetStatus, string>> = { active: 'approved and live', disabled: 'disabled', 'disable-requested': 'submitted for disable', submitted: 'submitted' };
    this.showToast(`${ref} ${label[status] ?? status}.`, status === 'disabled' ? 'warn' : 'ok');
  }

  /** Next reference for a campaign + type: HAI-ELDERCARE-2026-QR-015 */
  nextAssetRef(code: string, type: 'qr' | 'landing'): string {
    const tag = type === 'qr' ? 'QR' : 'LP';
    const used = this.assets()
      .filter((a) => a.campaign === code)
      .map((a) => Number(a.ref.split('-').pop()) || 0);
    const n = (used.length ? Math.max(...used) : 0) + 1;
    return `${code}-${tag}-${String(n).padStart(3, '0')}`;
  }

  // ------------------------------------------------------------------ helpers
  findCampaign(code: string): CampaignInfo | undefined {
    return this.campaigns().find((c) => c.code === code);
  }

  activityFor(code: string): Activity[] {
    return this.activity().filter((a) => a.campaign === code).sort((a, b) => b.at.localeCompare(a.at));
  }

  showToast(text: string, tone: 'ok' | 'warn' | 'danger' = 'ok'): void {
    this.toast.set({ text, tone });
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 3800);
  }

  private patchCampaign(code: string, patch: Partial<CampaignInfo>): void {
    this.campaigns.update((list) => list.map((c) => (c.code === code ? { ...c, ...patch, updatedAt: this.now() } : c)));
  }

  private log(code: string, title: string, detail: string, kind: ActivityKind): void {
    this.activity.update((list) => [{ campaign: code, at: this.now(), title, detail, by: CURRENT_USER, kind }, ...list]);
  }

  /** Local (Asia/Calcutta) time as yyyy-mm-ddThh:mm. */
  private now(): string {
    return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16);
  }
}

export type { Lifecycle };
