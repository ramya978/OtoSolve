import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { OrgStore } from '../../../Shared/Organization/org.store';
import { OrganisationApiService } from '../../../Service/organisation-api.service';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { EnumOptionsService } from '../../../Shared/services/enum-options.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage, apiFieldErrors } from '../../../Shared/models/api-response.model';
import { CountryLookup } from '../../../Shared/models/geo-lookup.model';
import { MasterLookup } from '../../../Shared/models/global-master.model';
import { OrganisationDetailResponse } from '../../../Shared/models/iam-contract.model';

type FieldKey =
  | 'name' | 'legalName' | 'type' | 'established' | 'regNo' | 'taxId' | 'pan' | 'gst' | 'about'
  | 'person' | 'email' | 'dial' | 'phone' | 'website'
  | 'timezone' | 'currency' | 'language'
  | 'line1' | 'line2' | 'country' | 'state' | 'city' | 'postcode';

type Form = Record<FieldKey, string>;

/** icons for this page (24x24, currentColor); IAM_ICONS is the fallback */
const ICONS: Record<string, string> = {
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  building: 'M3 21h18 M5 21V10l7-5 7 5v11 M9 21v-6h6v6',
  contact: 'M4 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4z M9 9h6 M9 13h6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  x: 'M18 6 6 18 M6 6l12 12',
  save: 'M5 3h11l4 4v14H5z M8 3v6h7V3 M8 21v-7h8v7',
  verified: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3',
  back: 'M19 12H5 M12 19l-7-7 7-7'
};

/** Organisation — edit page (Workspace Kit). Registered details are locked once the organisation is approved. */
@Component({
  selector: 'app-iam-organisation-edit',
  templateUrl: './organisation-edit.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './organisation-edit.css']
})
export class OrganisationEdit implements OnInit {
  private readonly router = inject(Router);
  private readonly store = inject(OrgStore);
  private readonly api = inject(OrganisationApiService);
  private readonly geo = inject(GeoMasterService);
  private readonly enums = inject(EnumOptionsService);
  private readonly toast = inject(ToastService);

  /** profile page (the edit page lives at <profile>/edit) */
  static readonly PROFILE_PATH = '/app/administration/organisation/details';

  readonly saving = signal(false);
  private readonly detail = signal<OrganisationDetailResponse | null>(null);
  private readonly countryRows = signal<CountryLookup[]>([]);
  private readonly stateRows = signal<MasterLookup[]>([]);
  private readonly cityRows = signal<MasterLookup[]>([]);
  private readonly typeRows = signal<string[]>([]);
  private readonly tzRows = signal<string[]>([]);
  private readonly currencyRows = signal<string[]>([]);
  private readonly languageRows = signal<string[]>([]);

  get org() {
    const d = this.detail();
    const since = d?.createdAtUtc ? new Date(d.createdAtUtc).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
    return { name: d?.name ?? '', verified: d?.status === 'active', code: d?.code ?? '', host: d?.hostName ?? '', type: d?.organisationType ?? '', since };
  }

  /** approved (active) organisations cannot change registered details */
  get locked(): boolean {
    const st = this.detail()?.status;
    return st === 'active' || st === 'approved' || st === 'suspended';
  }
  readonly maxAbout = 1000;

  private opts(rows: string[], fallback: string[]): string[] { return rows.length ? rows : fallback; }
  get types(): string[] { return this.opts(this.typeRows(), ['Non-profit / NGO', 'Company', 'Trust', 'Society', 'Government', 'Education']); }
  get dialCodes(): string[] {
    const codes = this.countryRows().map((c) => c.phoneCountryCode ?? '').filter(Boolean).map((c) => (c.startsWith('+') ? c : '+' + c));
    return this.opts([...new Set(codes)], ['+91', '+1', '+44', '+61', '+65', '+971']);
  }
  get timezones(): string[] { return this.opts(this.tzRows(), ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Singapore']); }
  get currencies(): string[] { return this.opts(this.currencyRows(), ['INR', 'USD', 'EUR', 'GBP', 'SGD']); }
  get languages(): string[] { return this.opts(this.languageRows(), ['en-IN', 'en-US', 'en-GB', 'hi-IN', 'ta-IN']); }
  get countries(): string[] { return this.opts(this.countryRows().map((c) => c.name), ['India', 'United States', 'United Kingdom', 'Singapore']); }
  get states(): string[] { return this.stateRows().map((r) => r.name); }
  get cities(): string[] { return this.cityRows().map((r) => r.name); }

  readonly form = signal<Form>({
    name: '', legalName: '', type: '', established: '', regNo: '', taxId: '', pan: '', gst: '', about: '',
    person: '', email: '', dial: '+91', phone: '', website: '', timezone: '', currency: '', language: '',
    line1: '', line2: '', country: '', state: '', city: '', postcode: ''
  });

  ngOnInit(): void {
    this.geo.getCountries().subscribe((c) => { this.countryRows.set(c); this.loadStates(this.form().country, this.form().state); });
    this.geo.getTimeZoneOptions().subscribe((z) => this.tzRows.set(z.map((t) => t.ianaKey)));
    this.geo.getCurrencies().subscribe((c) => this.currencyRows.set(c.map((x) => x.code)));
    this.geo.getLanguageOptions().subscribe((l) => this.languageRows.set(l.map((x) => x.cultureCode)));
    this.enums.organisationTypes().subscribe({ next: (t) => this.typeRows.set(t), error: () => undefined });
    this.store.loadDetail().subscribe({
      next: (d) => { this.detail.set(d); this.form.set(this.toForm(d)); this.loadStates(d.country ?? '', d.state ?? ''); },
      error: (e: unknown) => this.toast.error('Organisation not loaded', apiErrorMessage(e, 'The organisation could not be loaded.'))
    });
  }

  private toForm(d: OrganisationDetailResponse): Form {
    return {
      name: d.name ?? '', legalName: d.legalName ?? d.name ?? '', type: d.organisationType ?? '',
      established: (d.establishedOn ?? '').slice(0, 10), regNo: d.registrationNumber ?? '', taxId: d.taxIdentificationNumber ?? '',
      pan: d.panNumber ?? '', gst: d.gstNumber ?? '', about: d.description ?? '',
      person: d.contactPersonName ?? '', email: d.contactEmail ?? '', dial: d.contactPhoneCountryCode || '+91',
      phone: d.contactPhone ?? '', website: d.websiteUrl ?? '', timezone: d.timeZone ?? '', currency: d.defaultCurrency ?? '',
      language: d.defaultCulture ?? '', line1: d.addressLine1 ?? '', line2: d.addressLine2 ?? '', country: d.country ?? '',
      state: d.state ?? '', city: d.city ?? '', postcode: d.postalCode ?? ''
    };
  }

  /** Loads the state list for a country, then the city list for the chosen state. */
  private loadStates(country: string, state: string): void {
    const c = this.geo.findCountryByName(this.countryRows(), country);
    if (!c) { this.stateRows.set([]); this.cityRows.set([]); return; }
    this.geo.getStates(c.id).subscribe((rows) => { this.stateRows.set(rows); this.loadCities(c.id, state); });
  }

  private loadCities(countryId: string, state: string): void {
    const st = this.geo.findLookupByName(this.stateRows(), state);
    this.geo.getCities(st?.id, countryId).subscribe((rows) => this.cityRows.set(rows));
  }

  /** name and address line 1 are required */
  readonly valid = computed(() => !!this.form().name.trim() && !!this.form().line1.trim());

  set(key: FieldKey, value: string): void {
    this.form.update((f) => ({
      ...f,
      [key]: key === 'about' ? value.slice(0, this.maxAbout) : value,
      ...(key === 'country' ? { state: '', city: '' } : key === 'state' ? { city: '' } : {})
    }));
    if (key === 'country') this.loadStates(value, '');
    if (key === 'state') {
      const c = this.geo.findCountryByName(this.countryRows(), this.form().country);
      if (c) this.loadCities(c.id, value);
    }
  }

  /** option list that always contains the current value */
  withCurrent(list: string[], key: FieldKey): string[] {
    const cur = this.form()[key];
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }

  icon(name: string): string {
    return ICONS[name] ?? IAM_ICONS[name] ?? '';
  }

  cancel(): void {
    this.router.navigateByUrl(OrganisationEdit.PROFILE_PATH);
  }

  save(): void {
    if (!this.valid()) return;
    const d = this.detail();
    if (!d || this.saving()) return;
    const f = this.form();
    const t = (v: string) => v.trim() || null;
    this.saving.set(true);
    this.api.updateMine({
      expectedVersion: d.version,
      name: f.name.trim(), legalName: t(f.legalName), organisationType: t(f.type), establishedOn: t(f.established),
      registrationNumber: t(f.regNo), taxIdentificationNumber: t(f.taxId), panNumber: t(f.pan), gstNumber: t(f.gst),
      description: t(f.about), contactPersonName: t(f.person), contactEmail: t(f.email),
      contactPhoneCountryCode: t(f.dial), contactPhone: t(f.phone), websiteUrl: t(f.website),
      timeZone: t(f.timezone), defaultCurrency: t(f.currency), defaultCulture: t(f.language),
      addressLine1: t(f.line1), addressLine2: t(f.line2), country: t(f.country), state: t(f.state), city: t(f.city),
      postalCode: t(f.postcode)
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Profile saved', 'The organisation profile was updated.');
        this.store.loadDetail().subscribe({ error: () => undefined });
        this.router.navigateByUrl(OrganisationEdit.PROFILE_PATH);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        const fields = apiFieldErrors(e);
        const first = Object.values(fields)[0];
        this.toast.error('Profile not saved', first || apiErrorMessage(e, 'The profile could not be saved.'));
      }
    });
  }
}