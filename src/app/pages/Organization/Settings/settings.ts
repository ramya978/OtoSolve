import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { OrgStore, Security, ICONS } from '../../../Shared/Organization/org.store';
import { OrganisationApiService } from '../../../Service/organisation-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

type NumKey = 'maxFailed' | 'lockoutMin' | 'idleMin' | 'minLength' | 'expireDays';

interface Setting { key: NumKey; label: string; hint: string; unit: string; min: number; max: number; icon: string; }
interface Group { title: string; desc: string; items: Setting[]; }

const GROUPS: Group[] = [
  {
    title: 'Sign-in protection',
    desc: 'Lock out repeated failures and sign out idle sessions.',
    items: [
      { key: 'maxFailed', label: 'Failed sign-ins before lockout', hint: 'Between 3 and 5', unit: 'tries', min: 3, max: 5, icon: 'shield' },
      { key: 'lockoutMin', label: 'Lockout duration', hint: 'Between 15 and 1440', unit: 'min', min: 15, max: 1440, icon: 'lock' },
      { key: 'idleMin', label: 'Idle sign-out', hint: 'Between 5 and 30', unit: 'min', min: 5, max: 30, icon: 'timer' }
    ]
  },
  {
    title: 'Passwords',
    desc: 'Length and rotation for every account.',
    items: [
      { key: 'minLength', label: 'Minimum password length', hint: 'Between 10 and 64', unit: 'chars', min: 10, max: 64, icon: 'length' },
      { key: 'expireDays', label: 'Password expires after', hint: '0 means passwords never expire', unit: 'days', min: 0, max: 365, icon: 'calendar' }
    ]
  }
];

@Component({
  selector: 'app-org-settings',
  imports: [],
  templateUrl: './settings.html',
  styleUrls: ['../../../Shared/Organization/org-shared.css', './settings.css']
})
export class OrgSettings implements OnInit {
  protected readonly store = inject(OrgStore);
  private readonly api = inject(OrganisationApiService);
  private readonly toast = inject(ToastService);
  protected get org() { return this.store.org; }
  protected readonly saving = signal(false);

  constructor() {
    // Show the saved values as soon as the organisation record arrives.
    effect(() => { const s = this.store.security(); this.values.set({ ...s }); });
  }

  ngOnInit(): void {
    this.store.loadDetail().subscribe({
      error: (e: unknown) => this.toast.error('Settings not loaded', apiErrorMessage(e, 'The security settings could not be loaded.'))
    });
  }
  protected readonly groups = GROUPS;

  protected readonly values = signal<Security>({ ...this.store.security() });
  protected readonly saved = signal(false);
  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  protected icon(name: string): string { return ICONS[name] ?? ''; }

  protected setTwoStep(mode: 'optional' | 'required'): void {
    this.values.update((v) => ({ ...v, twoStep: mode }));
  }

  protected setValue(s: Setting, raw: string | number): void {
    const n = Math.round(Number(raw));
    const clamped = Number.isFinite(n) ? Math.min(s.max, Math.max(s.min, n)) : s.min;
    this.values.update((v) => ({ ...v, [s.key]: clamped }));
  }

  protected bump(s: Setting, delta: number): void {
    this.setValue(s, this.values()[s.key] + delta);
  }

  protected save(): void {
    const d = this.store.detail();
    if (!d || this.saving()) return;
    const v = this.values();
    this.saving.set(true);
    this.api.updateMySettings({
      defaultMfaRequirement: v.twoStep,
      maximumFailedAccessAttempts: v.maxFailed,
      lockoutDurationMinutes: v.lockoutMin,
      passwordMinimumLength: v.minLength,
      passwordExpiryDays: v.expireDays,
      sessionIdleTimeoutMinutes: v.idleMin,
      expectedVersion: d.version
    }).subscribe({
      next: () => {
        this.store.loadDetail().subscribe({ error: () => undefined });
        this.saving.set(false);
        this.saved.set(true);
        if (this.savedTimer) clearTimeout(this.savedTimer);
        this.savedTimer = setTimeout(() => this.saved.set(false), 2200);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error('Settings not saved', apiErrorMessage(e, 'The security settings could not be saved.'));
      }
    });
  }

  protected gateways(): void {
    /* payment gateways page is wired later */
  }
}
