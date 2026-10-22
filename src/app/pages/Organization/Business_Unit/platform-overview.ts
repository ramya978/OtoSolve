import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PLATFORM, STAGES, Stage } from '../../../Shared/Organization/platform.data';

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
export class PlatformOverview {
  private readonly router = inject(Router);

  /** list of all organisations (change to your route) */
  static readonly ORGANISATIONS_PATH = '/app/administration/platform/organisations';

  readonly platform = PLATFORM;
  readonly stages: Stage[] = STAGES;

  readonly tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'organisations', label: 'Organisations' },
    { key: 'onboarding', label: 'Onboarding' }
  ];
  readonly tab = signal<TabKey>('overview');

  readonly total = computed(() => this.stages.reduce((n, s) => n + s.count, 0));
  readonly limitText = PLATFORM.organisationLimit === null ? 'No limit set' : 'Limit ' + PLATFORM.organisationLimit;

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
