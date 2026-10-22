import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrgStore, ICONS, OFFICES_PATH, Office } from '../../../Shared/Organization/org.store';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { CountryLookup } from '../../../Shared/models/geo-lookup.model';
import { MasterLookup } from '../../../Shared/models/global-master.model';

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
export class OrgAddOffice implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(OrgStore);
  private readonly geo = inject(GeoMasterService);
  private readonly toast = inject(ToastService);
  protected readonly saving = signal(false);
  private readonly countryRows = signal<CountryLookup[]>([]);
  private readonly stateRows = signal<MasterLookup[]>([]);

  protected readonly kinds = ['Head office', 'Branch', 'Regional office', 'Warehouse', 'Field office'];
  protected readonly tzRows = signal<string[]>(TIMEZONES);
  protected get timezones(): string[] {
    const cur = this.f().timezone;
    const list = this.tzRows();
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }
  protected get countries(): string[] {
    const names = this.countryRows().map((c) => c.name);
    const cur = this.f().country;
    const list = names.length ? names : COUNTRIES;
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }

  private readonly editingId = this.route.snapshot.queryParamMap.get('id');
  private existing: Office | null = null;
  protected readonly isEdit = !!this.editingId;

  protected readonly f = signal<OfficeForm>(this.initial());
  protected readonly submitted = signal(false);

  protected readonly parentOptions = computed(() => this.store.sortedOffices().filter((o) => o.id !== this.editingId));
  protected readonly stateOptions = computed(() => {
    const rows = this.stateRows().map((r) => r.name);
    const list = rows.length ? rows : (STATES[this.f().country] ?? []);
    const cur = this.f().state;
    return cur && list.length && !list.includes(cur) ? [cur, ...list] : list;
  });

  ngOnInit(): void {
    this.geo.getCountries().subscribe((c) => { this.countryRows.set(c); this.loadStates(this.f().country); });
    this.geo.getTimeZoneOptions().subscribe((z) => { if (z.length) this.tzRows.set(z.map((t) => t.ianaKey)); });
    this.store.loadStructure().subscribe({
      next: () => {
        this.existing = this.editingId ? this.store.offices().find((o) => o.id === this.editingId) ?? null : null;
        if (this.editingId && !this.existing) this.toast.error('Office not found', 'That office no longer exists.');
        this.f.set(this.initial());
        this.loadStates(this.f().country);
      },
      error: (e: unknown) => this.toast.error('Offices not loaded', apiErrorMessage(e, 'The offices could not be loaded.'))
    });
  }

  private loadStates(country: string): void {
    const row = this.geo.findCountryByName(this.countryRows(), country);
    if (!row) { this.stateRows.set([]); return; }
    this.geo.getStates(row.id).subscribe((s) => this.stateRows.set(s));
  }

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
    this.loadStates(country);
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
      id: this.editingId ?? '',
      version: this.existing?.version,
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
    if (this.saving()) return;
    this.saving.set(true);
    this.store.saveOffice(office, !this.existing).subscribe({
      next: (row) => {
        this.saving.set(false);
        this.toast.success(this.existing ? 'Office saved' : 'Office created', row.name);
        this.back();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error('Office not saved', apiErrorMessage(e, 'The office could not be saved.'));
      }
    });
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
