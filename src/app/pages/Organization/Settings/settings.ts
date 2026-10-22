import { Component, inject, signal } from '@angular/core';
import { OrgStore, Security, ICONS } from '../../../Shared/Organization/org.store';

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
export class OrgSettings {
  protected readonly store = inject(OrgStore);
  protected readonly org = this.store.org;
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
    this.store.security.set({ ...this.values() });
    this.saved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), 2200);
  }

  protected gateways(): void {
    /* payment gateways page is wired later */
  }
}
