import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CampaignApiService } from '../../Service/campaign-api.service';
import { AuthService } from '../Auth/auth.service';
import { PaymentApiService } from '../../Service/payment-api.service';
import { DonationListItem } from '../models/payment.model';
import { fetchAllPages } from '../services/paging';
import { PeopleDirectoryService } from '../services/people-directory.service';
import { apiErrorMessage } from '../models/api-response.model';
import {
  AttributionListItem, CampaignDetail, CampaignHistoryEntry, CampaignListItem, CampaignReadiness, CampaignReferenceData,
  CampaignStatus, ReadinessCheckCategory, ReadinessCheckListItem, ReadinessPerson, TrackingAssetListItem, TrackingAssetStatus
} from '../models/campaign-contract.model';
import {
  ACTIVITY, ASSETS, CAMPAIGNS, CATEGORIES, CHECKS, PEOPLE, Activity, ActivityKind, AssetStatus, AssetType, CampaignInfo,
  CheckCategory, CheckStatus, Donation, Lifecycle, Medium, ReadinessCheck, TrackingAsset
} from './cw.data';

const EMPTY_CAMPAIGN: CampaignInfo = {
  code: '', name: '', lifecycle: 'draft', owners: [], fund: '', start: '', end: '', location: '', target: 0, raised: 0,
  monthlyRevenue: 0, monthlyRevenuePrev: 0, donors: 0, donations: 0, description: '', updatedAt: ''
};

const LIFECYCLE: Record<CampaignStatus, Lifecycle> = {
  draft: 'draft', submitted: 'submitted', approved: 'scheduled', scheduled: 'scheduled', active: 'active',
  paused: 'paused', closing: 'closing', closed: 'closed', cancelled: 'closed'
};

const ASSET_STATUS: Record<TrackingAssetStatus, AssetStatus> = {
  draft: 'draft', submitted: 'submitted', approved: 'active', active: 'active', disableRequested: 'disable-requested', inactive: 'disabled'
};

const title = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const day = (iso: string | null | undefined): string => (iso ?? '').slice(0, 10);
const minute = (iso: string | null | undefined): string => (iso ?? '').slice(0, 16);

/**
 * CAMPAIGN WORKSPACE STORE - one place for the campaign the user is looking at and every change the
 * campaign pages make (readiness verdicts, launch decisions, pause / resume / close, tracking
 * assets). Backed by the Campaign API; the signals and method names are what the pages already use.
 */
@Injectable({ providedIn: 'root' })
export class CampaignWorkspaceStore {
  private readonly api = inject(CampaignApiService);
  private readonly auth = inject(AuthService);
  private readonly payments = inject(PaymentApiService);
  private readonly directory = inject(PeopleDirectoryService);

  readonly campaigns = signal<CampaignInfo[]>([]);
  readonly checks = signal<ReadinessCheck[]>([]);
  readonly assets = signal<TrackingAsset[]>([]);
  readonly activity = signal<Activity[]>([]);
  private readonly donationList = signal<Donation[]>([]);
  get donations(): Donation[] { return this.donationList(); }

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly reference = signal<CampaignReferenceData | null>(null);

  /** Campaign shown on the campaign pages (picked in the page header). */
  readonly selectedCode = signal('');
  /**
   * The campaign on the page. A code that names no campaign gives an empty one (see `notFound`) -
   * it never quietly becomes the first campaign in the list, which is how a change meant for one
   * campaign landed on another. Only when no code has been asked for does the first one show.
   */
  readonly campaign = computed(() => {
    const code = this.selectedCode();
    const hit = this.campaigns().find((c) => c.code === code);
    return hit ?? (code ? EMPTY_CAMPAIGN : this.campaigns()[0] ?? EMPTY_CAMPAIGN);
  });
  /** True when the campaigns are loaded and the code asked for is not one of them. */
  readonly notFound = computed(() => !this.loading() && this.campaigns().length > 0 && !!this.selectedCode() && !this.findCampaign(this.selectedCode()));

  /** One-line toast shared by the pages. */
  readonly toast = signal<{ text: string; tone: 'ok' | 'warn' | 'danger' } | null>(null);
  private toastTimer = 0;

  get currentUser(): string { return this.auth.user()?.name ?? ''; }

  private readonly ids = new Map<string, { id: string; version: number }>();
  private readonly checkMeta = new Map<string, { version: number }>();
  private readonly assetMeta = new Map<string, { id: string; version: number }>();
  private people: ReadinessPerson[] = [];

  /** The user ids behind each campaign's activity lines and requests, kept so the names can be filled in when the directory arrives. */
  private readonly actorIds = new Map<string, (string | null)[]>();
  private readonly requesterIds = new Map<string, { ready: string | null; close: string | null }>();

  constructor() {
    this.load();
    // Names come from the people directory, which loads on its own clock: apply them again when it lands.
    effect(() => { this.directory.all(); this.applyNames(); });
  }

  /** Writes "who did it" onto the activity lines and the readiness / close requests, by name. */
  private applyNames(): void {
    for (const [code, ids] of this.actorIds) {
      let i = 0;
      this.activity.update((all) => all.map((a) => (a.campaign === code ? { ...a, by: ids[i++] ? this.directory.name(ids[i - 1]) : '' } : a)));
    }
    for (const [code, who] of this.requesterIds) {
      const c = this.findCampaign(code);
      if (!c) continue;
      const patch: Partial<CampaignInfo> = {};
      if (c.readinessRequest && who.ready) patch.readinessRequest = { ...c.readinessRequest, by: this.directory.name(who.ready) };
      if (c.closeRequest && who.close) patch.closeRequest = { ...c.closeRequest, by: this.directory.name(who.close) };
      if (Object.keys(patch).length) this.patchCampaign(code, patch, false);
    }
  }

  // ------------------------------------------------------------------ loading
  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      list: fetchAllPages((page, pageSize) => this.api.searchCampaigns({ page, pageSize })),
      assets: fetchAllPages((page, pageSize) => this.api.searchTrackingAssets({ page, pageSize })).pipe(catchError(() => of([] as TrackingAssetListItem[]))),
      reference: this.api.getReferenceData().pipe(catchError(() => of(null))),
      people: this.api.getReadinessAssignableOwners().pipe(catchError(() => of([] as ReadinessPerson[]))),
    }).subscribe({
      next: ({ list, assets, reference, people }) => {
        this.ids.clear();
        this.campaigns.set(list.map((c) => this.toInfo(c)));
        this.assetMeta.clear();
        this.assets.set(assets.map((a) => this.toAsset(a)));
        this.reference.set(reference);
        this.people = people;
        PEOPLE.length = 0;
        PEOPLE.push(...people.map((p) => p.displayName ?? '').filter(Boolean));
        // Only when nothing has been asked for does the first campaign show; a code that matches none stays unmatched.
        if (!this.selectedCode()) this.selectedCode.set(this.campaigns()[0]?.code ?? '');
        const cats = reference?.readinessCategories ?? [];
        if (cats.length) { CATEGORIES.length = 0; CATEGORIES.push(...cats.map((o) => o.label)); }
        this.loading.set(false);
        if (this.selectedCode()) this.select(this.selectedCode());
      },
      error: (e) => {
        this.loadError.set(apiErrorMessage(e, 'Campaigns could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  /** Opens a campaign on the pages and reads everything that hangs off it. */
  select(code: string): void {
    this.selectedCode.set(code);
    const meta = this.ids.get(code);
    if (!meta) return;
    forkJoin({
      detail: this.api.getCampaign(meta.id).pipe(catchError(() => of(null))),
      readiness: this.api.getCampaignReadiness(meta.id).pipe(catchError(() => of(null))),
      history: this.api.getCampaignHistory(meta.id).pipe(catchError(() => of([] as CampaignHistoryEntry[]))),
      // The payments service is where the donations are (the old screen read them from there too).
      gifts: fetchAllPages((page, size) => this.payments.searchDonations({ campaignId: meta.id, page, pageSize: size })).pipe(catchError(() => of(null as DonationListItem[] | null))),
    }).subscribe(({ detail, readiness, history, gifts }) => {
      if (detail) this.mergeDetail(detail);
      if (readiness) this.mergeReadiness(code, readiness);
      this.activity.update((all) => [...all.filter((a) => a.campaign !== code), ...history.map((h) => this.toActivity(code, h))]);
      this.actorIds.set(code, history.map((h) => h.actorUserId));
      this.applyNames();
      const counted = (gifts ?? []).filter((g) => g.status !== 'refunded' && g.status !== 'chargedBack' && g.status !== 'voided');
      this.donationList.update((all) => [
        ...all.filter((d) => d.campaign !== code),
        ...counted.map((g) => this.toDonation(code, g)),
      ]);
      this.patchCampaign(code, this.donationFigures(counted), false);
    });
  }

  private toInfo(c: CampaignListItem): CampaignInfo {
    this.ids.set(c.code, { id: c.id, version: c.version });
    const prev = this.findCampaign(c.code);
    return {
      ...(prev ?? EMPTY_CAMPAIGN),
      id: c.id, version: c.version, code: c.code, name: c.name, lifecycle: LIFECYCLE[c.status] ?? 'draft',
      owners: (c.owners ?? []).map((o) => o.displayName ?? '').filter(Boolean), fund: c.fundOrProgramme,
      start: day(c.startDate), end: day(c.endDate), target: c.targetAmount, raised: c.raisedAmount ?? 0, currency: c.currencyCode ?? prev?.currency ?? '',
      updatedAt: minute(c.updatedAtUtc)
    };
  }

  private mergeDetail(d: CampaignDetail): void {
    this.ids.set(d.code, { id: d.id, version: d.version });
    this.requesterIds.set(d.code, { ready: d.submittedByUserId, close: d.pendingCloseRequest?.requestedByUserId ?? null });
    const location = [d.countryName, d.stateName, d.cityName, d.zipCode].filter(Boolean).join(' · ');
    this.patchCampaign(d.code, {
      id: d.id, version: d.version, lifecycle: LIFECYCLE[d.status] ?? 'draft', description: d.publicDescription || d.purpose,
      location, fund: d.fundOrProgramme, start: day(d.startDate), end: day(d.endDate), target: d.targetAmount, currency: d.currencyCode ?? '',
      readinessRequest: d.status === 'submitted' ? { by: this.directory.name(d.submittedByUserId), at: minute(d.submittedAtUtc) } : undefined,
      closeRequest: d.pendingCloseRequest
        ? { by: this.directory.name(d.pendingCloseRequest.requestedByUserId), at: minute(d.pendingCloseRequest.createdAtUtc), reason: d.pendingCloseRequest.detailedReason ?? '' }
        : undefined,
    }, false);
  }

  private mergeReadiness(code: string, r: CampaignReadiness): void {
    this.checkMeta.clear();
    const mapped = r.items.map((i) => this.toCheck(code, i));
    this.checks.update((all) => [...all.filter((c) => c.campaign !== code), ...mapped]);
  }

  private toCheck(code: string, i: ReadinessCheckListItem): ReadinessCheck {
    this.checkMeta.set(i.id, { version: i.version });
    return {
      id: i.id, campaign: code, name: i.checkName, category: this.categoryLabel(i.category),
      owner: i.owner?.displayName ?? '', due: day(i.dueDate), required: i.requiredForLaunch,
      status: i.status as CheckStatus, description: i.description ?? '', criteria: i.successCriteria, notes: i.notes ?? '',
      verdictNote: i.status === 'pending' ? '' : i.notes ?? ''
    };
  }

  /** The server's display word for a category value ('content' -> 'Content'). */
  private categoryLabel(value: string): CheckCategory {
    const hit = (this.reference()?.readinessCategories ?? []).find((o) => o.value.toLowerCase() === String(value).toLowerCase());
    return hit?.label ?? title(String(value));
  }
  /** The server's value for a display word. */
  private categoryValue(label: string): ReadinessCheckCategory {
    const hit = (this.reference()?.readinessCategories ?? []).find((o) => o.label === label || o.value.toLowerCase() === label.toLowerCase());
    return (hit?.value ?? label.toLowerCase()) as ReadinessCheckCategory;
  }

  private toAsset(a: TrackingAssetListItem): TrackingAsset {
    this.assetMeta.set(a.code, { id: a.id, version: a.version });
    const status = ASSET_STATUS[a.status] ?? 'draft';
    return {
      ref: a.code, campaign: a.campaignCode, type: (a.assetType === 'qrCode' ? 'qr' : 'landing') as AssetType,
      medium: a.channelName as Medium, place: a.placeName ?? '', destination: a.generatedUrl ?? a.destination, status,
      usage: a.usageCount, received: a.totalReceived, from: day(a.activeFrom), to: day(a.activeTo),
      approval: status === 'active' || status === 'disabled' ? 'Approved' : status === 'submitted' ? 'Pending' : '—'
    };
  }

  private toActivity(code: string, h: CampaignHistoryEntry): Activity {
    const action = h.actionCode.split('.').pop() ?? h.actionCode;
    const words = action.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const kind: ActivityKind = /pause/.test(words) ? 'pause' : /resume/.test(words) ? 'resume'
      : /creat/.test(words) ? 'create' : /approv|activat|launch|submit|clos/.test(words) ? 'approval' : 'change';
    return { campaign: code, at: minute(h.occurredAtUtc), title: title(words), detail: h.reason ?? '', by: '', kind };
  }

  private toDonation(code: string, g: DonationListItem): Donation {
    const how = `${g.methodDescription ?? ''} ${g.sourceDescription ?? ''}`.toLowerCase();
    const channel: Donation['channel'] = how.includes('upi') ? 'UPI'
      : /bank|transfer|neft|rtgs|imps/.test(how) ? 'Bank transfer'
      : /offline|cash|cheque|manual/.test(how) ? 'Offline' : 'Online';
    const amount = (g.status === 'partiallyRefunded' ? g.netAmount?.amount : undefined) ?? g.amount?.amount ?? 0;
    return { campaign: code, date: day(g.donatedAtUtc), donor: g.donorName || g.donorEmail || 'Anonymous donor', amount, channel };
  }

  /** The header tiles: all counted gifts, distinct donors, and this month's / last month's money. */
  private donationFigures(list: DonationListItem[]): Partial<CampaignInfo> {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    let current = 0, previous = 0;
    const donors = new Set<string>();
    for (const g of list) {
      const amount = (g.status === 'partiallyRefunded' ? g.netAmount?.amount : undefined) ?? g.amount?.amount ?? 0;
      const key = (g.donorEmail || g.donorName || '').trim().toLowerCase();
      if (key) donors.add(key);
      const when = new Date(g.donatedAtUtc);
      if (Number.isNaN(when.getTime())) continue;
      if (when >= thisStart && when < nextStart) current += amount;
      else if (when >= prevStart && when < thisStart) previous += amount;
    }
    return { donations: list.length, donors: donors.size, monthlyRevenue: current, monthlyRevenuePrev: previous };
  }
  /** Picker options: "Name · CODE". */
  readonly campaignOptions = computed(() => this.campaigns().map((c) => ({ value: c.code, label: c.name, hint: c.code })));

  /** Channel names the tracking asset form offers (the Offline / Print / Email ... choice). */
  channelNames(): string[] {
    return (this.reference()?.channels ?? []).filter((c) => c.isActive).map((c) => c.name);
  }

  // ------------------------------------------------------------------ register actions
  /** Re-reads the register after the wizard saved something. */
  reload(): void { this.load(); }

  /** Duplicates a campaign as a new draft (code auto-suffixed until unique). */
  duplicateCampaign(code: string): string {
    const meta = this.ids.get(code);
    if (!meta) return code;
    let n = 2;
    let next = `${code}-COPY`;
    while (this.findCampaign(next)) next = `${code}-COPY-${n++}`;
    this.api.getCampaign(meta.id).subscribe({
      next: (d) => {
        this.api.createCampaign({
          name: `${d.name} (copy)`, code: next, purpose: d.purpose, fundOrProgramme: d.fundOrProgramme,
          startDate: d.startDate, endDate: d.endDate, campaignAmount: d.campaignAmount, targetAmount: d.targetAmount,
          currencyId: d.currencyId, countryId: d.countryId, ownerIds: d.ownerIds, stateId: d.stateId ?? '', cityId: d.cityId ?? '',
          zipCode: d.zipCode ?? '', channelIds: d.channelIds, lifecycleActivation: d.lifecycleActivation,
          daysBeforeStart: d.daysBeforeStart, reminderTime: d.reminderTime, publicDescription: d.publicDescription ?? '',
          termsAndNotice: d.termsAndNotice ?? '', purposeHtml: d.purposeHtml ?? null,
        }).subscribe({
          next: () => { this.showToast(`${d.name} duplicated as draft.`); this.load(); },
          error: (e) => this.showToast(apiErrorMessage(e, 'The campaign could not be duplicated.'), 'danger'),
        });
      },
      error: (e) => this.showToast(apiErrorMessage(e, 'The campaign could not be read.'), 'danger'),
    });
    return next;
  }

  /** Removes a draft campaign (used by the list-view delete action). `done` gets the server's message on a refusal. */
  removeCampaign(code: string, done?: (error?: string) => void): void {
    const meta = this.ids.get(code);
    const c = this.findCampaign(code);
    if (!meta) { done?.('That campaign is no longer in the list.'); return; }
    this.api.deleteCampaignDraft(meta.id, meta.version).subscribe({
      next: () => { if (c) this.showToast(`${c.name} deleted.`, 'warn'); this.load(); done?.(); },
      error: (e) => { const m = apiErrorMessage(e, 'The draft could not be deleted.'); this.showToast(m, 'danger'); done?.(m); },
    });
  }

  /** List-view Approve: approves a submitted campaign only (it then waits for its start date or for Activate). */
  approveFromList(code: string, done?: (error?: string) => void): void {
    const meta = this.ids.get(code);
    if (!meta) { done?.('That campaign is no longer in the list.'); return; }
    this.api.approveCampaign(meta.id, { expectedVersion: meta.version }).subscribe({
      next: () => { this.load(); done?.(); },
      error: (e) => { this.load(); done?.(apiErrorMessage(e, 'The campaign could not be approved.')); },
    });
  }

  /** List-view Activate: switches an approved / scheduled campaign on. */
  activateFromList(code: string, done?: (error?: string) => void): void {
    const meta = this.ids.get(code);
    if (!meta) { done?.('That campaign is no longer in the list.'); return; }
    this.api.activateCampaign(meta.id, { expectedVersion: meta.version }).subscribe({
      next: () => { this.load(); done?.(); },
      error: (e) => { this.load(); done?.(apiErrorMessage(e, 'The campaign could not be activated.')); },
    });
  }

  /** Kept for the register's list → detail flow; the campaign is already loaded from the API. */
  ensureCampaign(_info: CampaignInfo): void { /* loaded from the API */ }

  // ------------------------------------------------------------------ readiness
  checksFor(code: string): ReadinessCheck[] {
    return this.checks().filter((c) => c.campaign === code);
  }

  private personId(name: string): string | null {
    return this.people.find((p) => p.displayName === name)?.userId ?? null;
  }

  setCheckStatus(id: string, status: CheckStatus, note = ''): void {
    const chk = this.checks().find((c) => c.id === id);
    const meta = this.checkMeta.get(id);
    if (!chk || !meta) return;
    if (status === 'pending') {
      this.showToast('A recorded verdict cannot be reopened. Edit the check instead.', 'warn');
      return;
    }
    const call = status === 'passed'
      ? this.api.passReadinessCheck(id, { expectedVersion: meta.version, notes: note || null })
      : this.api.failReadinessCheck(id, { expectedVersion: meta.version, notes: note || null });
    call.subscribe({
      next: () => { this.showToast(`${chk.name} marked ${status}.`, status === 'failed' ? 'danger' : 'ok'); this.select(chk.campaign); },
      error: (e) => this.showToast(apiErrorMessage(e, 'The verdict was not saved.'), 'danger'),
    });
  }

  saveCheck(check: ReadinessCheck): void {
    const existing = this.checkMeta.get(check.id);
    const campaignId = this.ids.get(check.campaign)?.id;
    if (!campaignId) return;
    const body = {
      checkName: check.name, category: this.categoryValue(check.category), successCriteria: check.criteria,
      description: check.description || null, requiredForLaunch: check.required, ownerUserId: this.personId(check.owner),
      dueDate: check.due || null, notes: check.notes || null,
    };
    const call = existing
      ? this.api.updateReadinessCheck(check.id, { ...body, expectedVersion: existing.version })
      : this.api.addReadinessCheck(campaignId, body);
    call.subscribe({
      next: () => { this.showToast(existing ? `${check.name} was saved.` : `${check.name} was added to the checklist.`); this.select(check.campaign); },
      error: (e) => this.showToast(apiErrorMessage(e, 'The check was not saved.'), 'danger'),
    });
  }

  removeCheck(id: string): void {
    const chk = this.checks().find((c) => c.id === id);
    const meta = this.checkMeta.get(id);
    if (!chk || !meta) return;
    this.api.deleteReadinessCheck(id, { expectedVersion: meta.version }).subscribe({
      next: () => { this.showToast(`${chk.name} was removed.`, 'warn'); this.select(chk.campaign); },
      error: (e) => this.showToast(apiErrorMessage(e, 'The check was not removed.'), 'danger'),
    });
  }

  /** The server assigns the id; this only has to be unique while the form is open. */
  newCheckId(code: string): string {
    return `${code}-chk-new-${Date.now().toString(36)}`;
  }

  approveLaunch(code: string): void {
    const c = this.findCampaign(code);
    const meta = this.ids.get(code);
    if (!c || !meta) return;
    this.api.approveCampaign(meta.id, { expectedVersion: meta.version }).subscribe({
      next: () => this.api.getCampaign(meta.id).subscribe({
        next: (d) => {
          this.mergeDetail(d);
          const goesLiveNow = c.start <= new Date().toISOString().slice(0, 10);
          if (d.status === 'approved' && goesLiveNow) {
            this.api.activateCampaign(d.id, { expectedVersion: d.version }).subscribe({
              next: () => { this.showToast(`${c.name} is now active.`); this.load(); },
              error: (e) => { this.showToast(apiErrorMessage(e, 'The campaign was approved but could not be activated.'), 'danger'); this.load(); },
            });
          } else {
            this.showToast(d.status === 'active' ? `${c.name} is now active.` : `${c.name} is scheduled to launch.`);
            this.load();
          }
        },
        error: () => this.load(),
      }),
      error: (e) => this.showToast(apiErrorMessage(e, 'The launch could not be approved.'), 'danger'),
    });
  }

  rejectLaunch(code: string, reason: string): void {
    const c = this.findCampaign(code);
    const meta = this.ids.get(code);
    if (!c || !meta) return;
    this.api.returnCampaignToDraft(meta.id, { expectedVersion: meta.version, reason }).subscribe({
      next: () => { this.showToast(`Launch rejected - ${c.name} is back in draft.`, 'danger'); this.load(); },
      error: (e) => this.showToast(apiErrorMessage(e, 'The launch could not be rejected.'), 'danger'),
    });
  }

  // ------------------------------------------------------------------ pause · resume · close
  private lifecycle(code: string, run: (id: string, version: number) => ReturnType<CampaignApiService['pauseCampaign']>, done: string, tone: 'ok' | 'warn' | 'danger' = 'ok'): void {
    const meta = this.ids.get(code);
    if (!meta) return;
    run(meta.id, meta.version).subscribe({
      next: () => { this.showToast(done, tone); this.load(); },
      error: (e) => { this.showToast(apiErrorMessage(e, 'That change was refused.'), 'danger'); this.load(); },
    });
  }

  pause(code: string, reason: string): void {
    this.lifecycle(code, (id, v) => this.api.pauseCampaign(id, {
      expectedVersion: v, reasonCategory: 'Paused by a campaign manager', detailedReason: reason,
      communicationImpact: 'Donor forms and tracking assets stop taking donations while the campaign is paused.',
    }), 'Campaign paused - donor forms and tracking assets stop taking donations.', 'warn');
  }

  resume(code: string, reason: string): void {
    this.lifecycle(code, (id, v) => this.api.resumeCampaign(id, { expectedVersion: v, reasonCategory: 'Resumed', detailedReason: reason }), 'Campaign resumed.');
  }

  requestClose(code: string, reason: string): void {
    this.lifecycle(code, (id, v) => this.api.requestCampaignClose(id, {
      expectedVersion: v, reasonCategory: 'Close requested', detailedReason: reason, closureSummary: reason,
    }), 'Close requested - waiting for approval.', 'warn');
  }

  approveClose(code: string): void {
    this.lifecycle(code, (id, v) => this.api.approveCampaignClose(id, { expectedVersion: v }), 'Campaign closed.');
  }

  rejectClose(code: string, reason: string): void {
    this.lifecycle(code, (id, v) => this.api.rejectCampaignClose(id, {
      expectedVersion: v, reasonCategory: 'Close request rejected', detailedReason: reason,
    }), 'Close rejected - the campaign stays active.', 'danger');
  }

  // ------------------------------------------------------------------ tracking assets
  private pick(list: { id: string; name: string }[] | undefined, name: string): string {
    const items = list ?? [];
    return (items.find((i) => i.name.toLowerCase() === name.toLowerCase()) ?? items.find((i) => name.toLowerCase().includes(i.name.toLowerCase())) ?? items[0])?.id ?? '';
  }

  /** Adds a new asset, or replaces the draft with the same reference. */
  saveAsset(asset: TrackingAsset): void {
    const ref = this.reference();
    const campaignId = this.ids.get(asset.campaign)?.id;
    if (!ref || !campaignId) { this.showToast('Campaign reference data is not loaded yet.', 'danger'); return; }
    const existing = this.assetMeta.get(asset.ref);
    const status: TrackingAssetStatus = asset.status === 'draft' ? 'draft' : 'submitted';
    const channelId = this.pick(ref.channels, asset.medium);
    const common = {
      assetType: (asset.type === 'qr' ? 'qrCode' : 'landingPage') as 'qrCode' | 'landingPage',
      channelId, destination: asset.destination, sourceId: this.pick(ref.sources, asset.medium), mediumId: this.pick(ref.mediums, asset.medium),
      activeFrom: new Date(asset.from + 'T00:00:00').toISOString(), activeTo: new Date(asset.to + 'T23:59:59').toISOString(),
      places: asset.place ? [{ placeName: asset.place, destination: asset.destination }] : null,
    };
    const call = existing
      ? this.api.updateTrackingAsset(existing.id, { ...common, expectedVersion: existing.version })
      : this.api.createTrackingAsset({ ...common, campaignId, status });
    call.subscribe({
      next: (saved) => {
        const finish = (): void => { this.showToast(asset.status === 'draft' ? `${saved.code} saved as draft.` : `${saved.code} submitted for approval.`); this.load(); };
        if (existing && status === 'submitted') {
          this.api.submitTrackingAsset(saved.id, { expectedVersion: saved.version }).subscribe({ next: finish, error: (e) => this.showToast(apiErrorMessage(e, 'The asset was saved but not submitted.'), 'danger') });
        } else {
          finish();
        }
      },
      error: (e) => this.showToast(apiErrorMessage(e, 'The tracking asset was not saved.'), 'danger'),
    });
  }

  setAssetStatus(ref: string, status: AssetStatus): void {
    const meta = this.assetMeta.get(ref);
    if (!meta) return;
    const body = { expectedVersion: meta.version };
    const done = (text: string, tone: 'ok' | 'warn' = 'ok'): void => { this.showToast(text, tone); this.load(); };
    const fail = (e: unknown): void => this.showToast(apiErrorMessage(e, 'That change was refused.'), 'danger');
    if (status === 'active') {
      this.api.approveTrackingAsset(meta.id, body).subscribe({
        next: () => this.api.searchTrackingAssets({ search: ref, page: 1, pageSize: 5 }).subscribe({
          next: (page) => {
            const fresh = page.items.find((a) => a.code === ref);
            if (!fresh || fresh.status !== 'approved') { done(`${ref} approved.`); return; }
            this.api.activateTrackingAsset(meta.id, { expectedVersion: fresh.version }).subscribe({ next: () => done(`${ref} approved and live.`), error: fail });
          },
          error: () => done(`${ref} approved.`),
        }),
        error: fail,
      });
    } else if (status === 'disabled') {
      this.api.deactivateTrackingAsset(meta.id, body).subscribe({ next: () => done(`${ref} disabled.`, 'warn'), error: fail });
    } else if (status === 'disable-requested') {
      this.api.requestDisableTrackingAsset(meta.id, body).subscribe({ next: () => done(`${ref} submitted for disable.`), error: fail });
    } else if (status === 'submitted') {
      this.api.submitTrackingAsset(meta.id, body).subscribe({ next: () => done(`${ref} submitted.`), error: fail });
    }
  }

  /** Preview of the reference the server will assign: HAI-ELDERCARE-2026-QR-015 */
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

  private patchCampaign(code: string, patch: Partial<CampaignInfo>, stamp = true): void {
    this.campaigns.update((list) => list.map((c) => (c.code === code ? { ...c, ...patch, ...(stamp ? { updatedAt: this.now() } : {}) } : c)));
  }

  /** Local (Asia/Calcutta) time as yyyy-mm-ddThh:mm. */
  private now(): string {
    return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16);
  }
}

export type { Lifecycle };
void [ACTIVITY, ASSETS, CAMPAIGNS, CHECKS];
