import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlatformRecord, Stage } from '../../../Shared/Organization/platform.data';
import { OrganisationApiService } from '../../../Service/organisation-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { BusinessUnitResponse, OrganisationStatisticsResponse } from '../../../Shared/models/iam-contract.model';

type TabKey = 'overview' | 'organisations' | 'onboarding';
interface TabDef { key: TabKey; label: string; }

/** icons for this page (24x24, currentColor) */
const ICONS: Record<string, string> = {
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  building: 'M3 21h18 M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17 M10 7h1 M13 7h1 M10 11h1 M13 11h1 M10 15h4v6'
};

/** Platform — Workspace Kit layout: heading, summary strip, and one card with tabs
 *  (Overview, Organisations, Onboarding). */
@Component({
  selector: 'app-org-platform',
  templateUrl: './platform-overview.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './platform-overview.css']
})
export class PlatformOverview implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(OrganisationApiService);
  private readonly toast = inject(ToastService);
  private readonly bu = signal<BusinessUnitResponse | null>(null);
  private readonly stats = signal<OrganisationStatisticsResponse | null>(null);

  /** list of all organisations (change to your route) */
  static readonly ORGANISATIONS_PATH = '/app/administration/organisation/directory';

  ngOnInit(): void {
    this.api.getBusinessUnit().subscribe({
      next: (b) => this.bu.set(b),
      error: (e: unknown) => this.toast.error('Platform not loaded', apiErrorMessage(e, 'The platform record could not be loaded.'))
    });
    this.api.getStatistics().subscribe({
      next: (st) => this.stats.set(st),
      error: (e: unknown) => this.toast.error('Counts not loaded', apiErrorMessage(e, 'The organisation counts could not be loaded.'))
    });
  }

  get platform(): PlatformRecord {
    const b = this.bu();
    return {
      name: b?.name ?? '', reference: b?.code ?? '', legalName: b?.legalName || b?.name || '', rootDomain: b?.rootDomain ?? '',
      contact: b?.contactEmail ?? '', support: b?.supportEmail ?? '',
      defaults: [b?.timeZone, b?.defaultCurrency, b?.defaultCulture].filter(Boolean).join(' · '),
      about: b?.description ?? '', status: b?.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : '',
      organisationLimit: b?.maximumTenants ?? null
    };
  }

  get stages(): Stage[] {
    const st = this.stats();
    return [
      { key: 'active', label: 'Active', hint: 'Currently active', count: st?.active ?? 0, tone: 'success' },
      { key: 'review', label: 'Awaiting review', hint: 'Under review', count: st?.awaitingReview ?? 0, tone: 'warning' },
      { key: 'onboarding', label: 'Still onboarding', hint: 'Still onboarding', count: st?.onboarding ?? 0, tone: 'info' },
      { key: 'rejected', label: 'Rejected', hint: 'Rejected', count: st?.rejected ?? 0, tone: 'danger' },
      { key: 'suspended', label: 'Suspended', hint: 'Temporarily suspended', count: st?.suspended ?? 0, tone: 'danger' },
      { key: 'archived', label: 'Archived', hint: 'Archived', count: st?.archived ?? 0, tone: 'muted' }
    ];
  }

  readonly tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'organisations', label: 'Organisations' },
    { key: 'onboarding', label: 'Onboarding' }
  ];
  readonly tab = signal<TabKey>('overview');

  readonly total = computed(() => this.stats()?.total ?? this.stages.reduce((n, s) => n + s.count, 0));
  get limitText(): string { const l = this.platform.organisationLimit; return l === null ? 'No limit set' : 'Limit ' + l; }

  count(key: string): number { return this.stages.find((s) => s.key === key)?.count ?? 0; }

  /** share of all organisations, as a rounded percentage */
  share(s: Stage): number {
    const t = this.total();
    return t ? Math.round((s.count / t) * 100) : 0;
  }

  icon(name: string): string { return ICONS[name] ?? ''; }

  tabCount(key: TabKey): number | null { return key === 'organisations' ? this.total() : null; }

  select(key: TabKey): void { this.tab.set(key); }

  seeAll(): void { this.router.navigateByUrl(PlatformOverview.ORGANISATIONS_PATH); }
}
