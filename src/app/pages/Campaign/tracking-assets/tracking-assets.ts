import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CwIcon, CW_ICONS } from '../../../Shared/Campaign/cw-icons';
import { CwPageHead } from '../../../Shared/Campaign/cw-page-head';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { qrPattern } from '../../../Shared/Campaign/cw-qr';
import { CwSelect, CwOption } from '../../../Shared/Campaign/cw-select';
import { ASSET_STATUS_LABEL, ASSET_STATUS_TONE, AssetStatus, TrackingAsset, todayIso, daysBetween, fmtDate, inr } from '../../../Shared/Campaign/cw.data';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';


type Scope = 'campaign' | 'all';
type RowAction = 'edit' | 'approve' | 'approveDisable' | 'requestDisable' | null;
/** A page number, or null for the "..." gap. */
type PageItem = number | null;

@Component({
  selector: 'app-tracking-assets',
  imports: [CwPageHead, CwSelect, RouterLink],
  templateUrl: './tracking-assets.html',
  styleUrls: ['../../../Shared/Campaign/cw-shared.css', './tracking-assets.css']
})
export class TrackingAssets {
  protected readonly store = inject(CampaignWorkspaceStore);
  private readonly router = inject(Router);
  protected readonly c = this.store.campaign;
  protected readonly paths = CW_PATHS;
  protected readonly fmtDate = fmtDate;
  protected readonly inr = inr;
  protected readonly statusLabel = ASSET_STATUS_LABEL;
  protected readonly statusTone = ASSET_STATUS_TONE;

  // ---- filters ----
  protected readonly scope = signal<Scope>('all');
  protected readonly query = signal('');
  protected readonly type = signal('');
  protected readonly status = signal('');

  // ---- pagination ----
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly pageSizes = [10, 25, 50];
  protected readonly rowsOpen = signal(false);

  protected readonly typeOptions: CwOption[] = [
    { value: '', label: 'All types' },
    { value: 'qr', label: 'QR Code' },
    { value: 'landing', label: 'Landing Page' }
  ];

  protected readonly statusOptions: CwOption[] = [
    { value: '', label: 'All statuses' },
    ...(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => ({ value: s, label: ASSET_STATUS_LABEL[s] }))
  ];

  private readonly scoped = computed(() =>
    this.scope() === 'all' ? this.store.assets() : this.store.assets().filter((a) => a.campaign === this.c().code)
  );

  protected readonly kpis = computed(() => {
    const list = this.scoped();
    const active = list.filter((a) => a.status === 'active');
    const usage = list.reduce((s, a) => s + a.usage, 0);
    const liveUsage = active.reduce((s, a) => s + a.usage, 0);
    const types = new Set(list.map((a) => a.type)).size;
    return {
      total: list.length,
      types,
      drafts: list.filter((a) => a.status === 'draft').length,
      active: active.length,
      activePct: list.length ? Math.round((active.length / list.length) * 100) : 0,
      usage,
      livePct: usage ? Math.round((liveUsage / usage) * 100) : 0,
      pending: list.filter((a) => a.status === 'submitted' || a.status === 'disable-requested').length,
      // breakdowns shown on the right of the KPI cards
      qr: list.filter((a) => a.type === 'qr').length,
      landing: list.filter((a) => a.type === 'landing').length,
      approvals: list.filter((a) => a.status === 'submitted').length,
      disables: list.filter((a) => a.status === 'disable-requested').length
    };
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.scoped()
      .filter((a) => !this.type() || a.type === this.type())
      .filter((a) => !this.status() || a.status === this.status())
      .filter((a) => !q || [a.ref, a.destination, a.place, this.campaignName(a.campaign)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.ref.localeCompare(b.ref));
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  /** current page, never past the last page (e.g. after a status change shrinks the list) */
  protected readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));
  protected readonly rows = computed(() => {
    const size = this.pageSize();
    const start = (this.safePage() - 1) * size;
    return this.filtered().slice(start, start + size);
  });

  /** 1 2 ... 10 style pager: first, last, and the pages around the current one. */
protected readonly pages = computed<PageItem[]>(() => {
  const total = this.totalPages();
  const cur = this.safePage();
  if (total <= 4) return Array.from({ length: total }, (_, i) => i + 1);

  const out: PageItem[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push(null);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push(null);
  out.push(total);
  return out;
});

protected prevPage(): void { this.goPage(this.safePage() - 1); }
protected nextPage(): void { this.goPage(this.safePage() + 1); }


  protected readonly from = computed(() => (this.filtered().length ? (this.safePage() - 1) * this.pageSize() + 1 : 0));
  protected readonly to = computed(() => Math.min(this.safePage() * this.pageSize(), this.filtered().length));

  // ---- drawer ----
  protected readonly openRef = signal<string | null>(null);
  protected readonly open = computed(() => this.store.assets().find((a) => a.ref === this.openRef()) ?? null);
  protected readonly copied = signal(false);

  /** QR-style preview of the encoded link (see shared/cw-qr.ts). */
  protected readonly qrCells = computed(() => {
    const a = this.open();
    return a ? qrPattern(a.destination || a.ref) : [];
  });

  protected icon(name: CwIcon): string {
    return CW_ICONS[name];
  }

  protected campaignName(code: string): string {
    return this.store.findCampaign(code)?.name ?? code;
  }

  protected shortUrl(url: string): string {
    return url.replace(/^https?:\/\//, '');
  }

  protected rowAction(a: TrackingAsset): RowAction {
    return a.status === 'draft' ? 'edit'
      : a.status === 'submitted' ? 'approve'
      : a.status === 'disable-requested' ? 'approveDisable'
      : a.status === 'active' ? 'requestDisable' : null;
  }

  protected actionLabel(act: RowAction): string {
    return act === 'edit' ? 'Edit draft' : act === 'approve' ? 'Approve' : act === 'approveDisable' ? 'Approve disable' : 'Request disable';
  }

  /** One clear icon per action: pencil, tick, lock, cross. */
  protected actionIcon(act: RowAction): CwIcon {
    return act === 'edit' ? 'edit' : act === 'approve' ? 'check' : act === 'approveDisable' ? 'lock' : 'xCircle';
  }

  protected doAction(a: TrackingAsset, act: RowAction): void {
    if (act === 'edit') this.router.navigate([CW_PATHS.assetNew], { queryParams: { ref: a.ref } });
    else if (act === 'approve') this.store.setAssetStatus(a.ref, 'active');
    else if (act === 'approveDisable') this.store.setAssetStatus(a.ref, 'disabled');
    else if (act === 'requestDisable') this.store.setAssetStatus(a.ref, 'disable-requested');
  }

  protected liveText(a: TrackingAsset): string {
    const today = todayIso();
    if (today < a.from) return `Starts in ${daysBetween(today, a.from)} days`;
    if (today > a.to) return `Ended ${daysBetween(a.to, today)} days ago`;
    return `${daysBetween(today, a.to)} days left`;
  }

  // ---- filters ----
  protected setQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected setScope(s: Scope): void {
    this.scope.set(s);
    this.page.set(1);
  }

  protected setType(v: string): void {
    this.type.set(v);
    this.page.set(1);
  }

  protected setStatus(v: string): void {
    this.status.set(v);
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.type.set('');
    this.status.set('');
    this.page.set(1);
  }

  // ---- pagination actions ----
  protected goPage(p: number): void {
    this.page.set(Math.min(this.totalPages(), Math.max(1, p)));
  }

  protected toggleRows(e: Event): void {
    e.stopPropagation();
    this.rowsOpen.set(!this.rowsOpen());
  }

  protected setPageSize(n: number): void {
    this.pageSize.set(n);
    this.page.set(1);
    this.rowsOpen.set(false);
  }

  // ---- drawer actions ----
  protected openAsset(a: TrackingAsset): void {
    this.copied.set(false);
    this.openRef.set(a.ref);
  }

  protected copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(true);
      this.store.showToast('Link copied to the clipboard.');
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected share(a: TrackingAsset): void {
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (nav.share) nav.share({ title: a.ref, url: a.destination }).catch(() => undefined);
    else this.copy(a.destination);
  }

  protected openLink(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  /** click anywhere else closes the "Rows" menu */
  @HostListener('document:click')
  protected onDocClick(): void {
    if (this.rowsOpen()) this.rowsOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.rowsOpen()) { this.rowsOpen.set(false); return; }
    this.openRef.set(null);
  }
}