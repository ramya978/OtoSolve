import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CwIcon, CW_ICONS } from '../../../Shared/Campaign/cw-icons';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { qrPattern } from '../../../Shared/Campaign/cw-qr';
import { CwSelect, CwOption } from '../../../Shared/Campaign/cw-select';
import { AssetType, todayIso, destinationFor, MEDIUMS, LIFECYCLE_LABEL, daysBetween, TrackingAsset, Medium, fmtDate } from '../../../Shared/Campaign/cw.data';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';


interface AssetDraft {
  campaign: string;
  medium: string;
  type: AssetType | '';
  ownUrl: boolean;
  url: string;
  from: string;
  to: string;
  place: string;
}

@Component({
  selector: 'app-tracking-asset-form',
  imports: [CwSelect],
  templateUrl: './tracking-asset-form.html',
  styleUrls: ['../../../Shared/Campaign/cw-shared.css', './tracking-asset-form.css']
})
export class TrackingAssetForm {
  protected readonly store = inject(CampaignWorkspaceStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly fmtDate = fmtDate;
  protected readonly today = todayIso();

  protected readonly editingRef: string | null;

  protected readonly draft = signal<AssetDraft>({ campaign: '', medium: '', type: '', ownUrl: false, url: '', from: '', to: '', place: '' });
  protected readonly submitted = signal(false);
  protected readonly confirmLeave = signal(false);
  private initial = '';

  constructor() {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    const asset = ref ? this.store.assets().find((a) => a.ref === ref && a.status === 'draft') : undefined;
    this.editingRef = asset?.ref ?? null;
    if (asset) {
      const generated = destinationFor(asset.campaign);
      this.draft.set({
        campaign: asset.campaign, medium: asset.medium, type: asset.type, ownUrl: !!asset.destination && asset.destination !== generated,
        url: asset.destination, from: asset.from, to: asset.to, place: asset.place
      });
    } else {
      const c = this.store.campaign();
      if (this.eligible(c.lifecycle)) this.pickCampaign(c.code);
    }
    this.initial = JSON.stringify(this.draft());
  }

  protected readonly campaignOptions = computed<CwOption[]>(() =>
    this.store.campaigns().filter((c) => this.eligible(c.lifecycle)).map((c) => ({ value: c.code, label: c.name, hint: c.code }))
  );
  protected readonly mediumOptions: CwOption[] = MEDIUMS.map((m) => ({ value: m, label: m }));

  protected readonly campaign = computed(() => this.store.findCampaign(this.draft().campaign) ?? null);
  protected readonly campaignHint = computed(() => {
    const c = this.campaign();
    return c ? `${LIFECYCLE_LABEL[c.lifecycle]} · ${fmtDate(c.start)}` : 'Fills the campaign dates';
  });

  /** The URL the asset will open. */
  protected readonly destination = computed(() => {
    const d = this.draft();
    if (d.ownUrl) return d.url.trim();
    return d.campaign ? destinationFor(d.campaign) : '';
  });

  protected readonly nextRef = computed(() => {
    const d = this.draft();
    if (this.editingRef) return this.editingRef;
    return d.campaign && d.type ? this.store.nextAssetRef(d.campaign, d.type) : '';
  });

  // ---- live window ----
  protected readonly window = computed(() => {
    const d = this.draft();
    if (!d.from || !d.to || d.to < d.from) return null;
    const total = daysBetween(d.from, d.to) + 1;
    const pos = Math.min(100, Math.max(0, (daysBetween(d.from, this.today) / Math.max(1, total - 1)) * 100));
    let state: string;
    let tone: string;
    if (this.today < d.from) { state = `Starts in ${daysBetween(this.today, d.from)} days`; tone = 'tone-info'; }
    else if (this.today > d.to) { state = 'Window has ended'; tone = 'tone-danger'; }
    else { state = `Live now · ${daysBetween(this.today, d.to)} days left`; tone = 'tone-success'; }
    return { total, pos, state, tone };
  });

  protected readonly qrCells = computed(() => qrPattern(this.destination() || this.nextRef()));

  // ---- validation ----
  protected readonly errors = computed(() => {
    const d = this.draft();
    const c = this.campaign();
    const e: Partial<Record<'campaign' | 'medium' | 'type' | 'url' | 'from' | 'to', string>> = {};
    if (!d.campaign) e.campaign = 'Choose the campaign this asset raises money for.';
    if (!d.medium) e.medium = 'Choose where the asset will be used.';
    if (!d.type) e.type = 'Pick a QR code or a landing page.';
    if (d.ownUrl && !/^https?:\/\/\S+\.\S+/i.test(d.url.trim()) && !/^https?:\/\/localhost/i.test(d.url.trim())) {
      e.url = 'Enter a full web address beginning http:// or https://, for example https://ydot.org/donate.';
    }
    if (!d.from) e.from = 'Choose the first live day.';
    if (!d.to) e.to = 'Choose the last live day.';
    else if (d.from && d.to < d.from) e.to = 'The end date must be on or after the start date.';
    else if (c && d.to > c.end) e.to = `The campaign ends on ${fmtDate(c.end)}.`;
    return e;
  });

  protected err(key: 'campaign' | 'medium' | 'type' | 'url' | 'from' | 'to'): string | null {
    const e = this.errors()[key];
    // the URL message shows as soon as a typed URL is wrong, the rest after Submit
    if (key === 'url' && this.draft().url.trim()) return e ?? null;
    return this.submitted() ? e ?? null : null;
  }

  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.initial);

  protected icon(name: CwIcon): string {
    return CW_ICONS[name];
  }

  // ---- editing ----
  protected set<K extends keyof AssetDraft>(key: K, value: AssetDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected text(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected pickCampaign(code: string): void {
    const c = this.store.findCampaign(code);
    // picking a campaign fills its dates (from today when it is already running)
    this.draft.update((d) => ({
      ...d,
      campaign: code,
      from: c ? (c.start < this.today && c.end >= this.today ? this.today : c.start) : d.from,
      to: c ? c.end : d.to
    }));
  }

  protected toggleOwnUrl(e: Event): void {
    const own = (e.target as HTMLInputElement).checked;
    this.draft.update((d) => ({ ...d, ownUrl: own, url: own ? d.url || this.destination() : '' }));
  }

  // ---- actions ----
  protected save(status: 'draft' | 'submitted'): void {
    this.submitted.set(true);
    const e = this.errors();
    // a draft only needs the campaign and the type (to get a reference)
    const blocking = status === 'draft' ? !!(e.campaign || e.type) : Object.keys(e).length > 0;
    if (blocking) return;
    const d = this.draft();
    const asset: TrackingAsset = {
      ref: this.nextRef(),
      campaign: d.campaign,
      type: d.type as AssetType,
      medium: (d.medium || 'Offline') as Medium,
      place: d.place.trim(),
      destination: this.destination(),
      status,
      usage: 0,
      received: 0,
      from: d.from,
      to: d.to,
      approval: status === 'submitted' ? 'Pending' : '—'
    };
    this.store.saveAsset(asset);
    this.initial = JSON.stringify(this.draft());
    this.router.navigate([CW_PATHS.assets]);
  }

  protected cancel(): void {
    if (this.dirty()) this.confirmLeave.set(true);
    else this.leave();
  }

  protected leave(): void {
    this.confirmLeave.set(false);
    this.router.navigate([CW_PATHS.assets]);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.confirmLeave.set(false);
  }

  private eligible(l: string): boolean {
    return l === 'submitted' || l === 'scheduled' || l === 'active' || l === 'paused';
  }
}
