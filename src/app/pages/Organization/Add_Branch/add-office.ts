import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrgStore, ICONS, OFFICES_PATH, Office } from '../../../Shared/Organization/org.store';

interface OfficeForm {
  name: string; code: string; parentId: string; kind: string; description: string;
  managerId: string; email: string; phone: string;
  timezone: string; order: number; active: boolean;
  address1: string; address2: string; country: string; state: string; city: string; postal: string;
}

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Singapore'];
const STATES: Record<string, string[]> = {
  India: ['Andhra Pradesh', 'Delhi', 'Gujarat', 'Karnataka', 'Kerala', 'Maharashtra', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'],
  'United States': ['California', 'Illinois', 'New York', 'Texas', 'Washington']
};

@Component({
  selector: 'app-org-add-office',
  imports: [],
  templateUrl: './add-office.html',
  styleUrls: ['../../../Shared/Organization/org-shared.css', './add-office.css']
})
export class OrgAddOffice {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(OrgStore);

  protected readonly kinds = ['Head office', 'Branch', 'Regional office', 'Warehouse', 'Field office'];
  protected readonly timezones = TIMEZONES;
  protected readonly countries = COUNTRIES;

  private readonly editingId = this.route.snapshot.queryParamMap.get('id');
  private readonly existing = this.editingId ? this.store.offices().find((o) => o.id === this.editingId) ?? null : null;
  protected readonly isEdit = !!this.existing;

  protected readonly f = signal<OfficeForm>(this.initial());
  protected readonly submitted = signal(false);

  protected readonly parentOptions = computed(() => this.store.sortedOffices().filter((o) => o.id !== this.editingId));
  protected readonly stateOptions = computed(() => STATES[this.f().country] ?? []);

  protected readonly errors = computed(() => {
    const f = this.f();
    const code = f.code.trim().toUpperCase();
    const clash = this.store.offices().some((o) => o.code.toUpperCase() === code && o.id !== this.editingId);
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Add an office name';
    if (!code) e['code'] = 'Add a short code';
    else if (clash) e['code'] = 'This code is already used';
    if (!f.kind.trim()) e['kind'] = 'Pick or type a kind';
    if (!f.address1.trim()) e['address1'] = 'Add the building and street';
    if (!f.country) e['country'] = 'Select a country';
    if (f.country && !f.state.trim()) e['state'] = 'Add the state or province';
    if (!f.city.trim()) e['city'] = 'Add the city';
    if (!f.postal.trim()) e['postal'] = 'Add the postal code';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e['email'] = 'Enter a valid e-mail';
    return e;
  });

  protected icon(name: string): string { return ICONS[name] ?? ''; }

  protected set<K extends keyof OfficeForm>(key: K, value: OfficeForm[K]): void {
    this.f.update((s) => ({ ...s, [key]: value }));
  }

  protected setCountry(country: string): void {
    this.f.update((s) => ({ ...s, country, state: '' }));
  }

  protected setOrder(raw: string): void {
    const n = Number(raw);
    this.set('order', Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  }

  protected back(): void { this.router.navigate([OFFICES_PATH]); }

  protected save(): void {
    this.submitted.set(true);
    if (Object.keys(this.errors()).length) {
      setTimeout(() => document.querySelector<HTMLElement>('.og-input.bad')?.focus());
      return;
    }
    const f = this.f();
    const office: Office = {
      id: this.editingId ?? this.store.newId('o'),
      code: f.code.trim().toUpperCase(),
      name: f.name.trim(),
      kind: f.kind.trim(),
      parentId: f.parentId || null,
      managerId: f.managerId || null,
      email: f.email.trim(),
      phone: f.phone.trim(),
      timezone: f.timezone,
      description: f.description.trim(),
      order: f.order,
      active: f.active,
      address1: f.address1.trim(),
      address2: f.address2.trim(),
      country: f.country,
      state: f.state.trim(),
      city: f.city.trim(),
      postal: f.postal.trim()
    };
    this.store.upsertOffice(office);
    this.back();
  }

  private initial(): OfficeForm {
    const o = this.existing;
    return {
      name: o?.name ?? '', code: o?.code ?? '', parentId: o?.parentId ?? '', kind: o?.kind ?? '', description: o?.description ?? '',
      managerId: o?.managerId ?? '', email: o?.email ?? '', phone: o?.phone ?? '',
      timezone: o?.timezone ?? '', order: o?.order ?? this.store.nextOfficeOrder(), active: o?.active ?? true,
      address1: o?.address1 ?? '', address2: o?.address2 ?? '', country: o?.country ?? '', state: o?.state ?? '',
      city: o?.city ?? '', postal: o?.postal ?? ''
    };
  }
}
