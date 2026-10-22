import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { ORG, REGISTRATION, CONTACT, ADDRESS, ABOUT } from '../../../Shared/Organization/organisation-profile.data';

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

/** find a value in a { label, value } list by (partial) label */
const pick = (list: { label: string; value: string }[], ...names: string[]): string => {
  const hit = list.find((r) => names.some((n) => r.label.toLowerCase().includes(n.toLowerCase())));
  return hit?.value ?? '';
};

/** Organisation — edit page (Workspace Kit). Registered details are locked once the organisation is approved. */
@Component({
  selector: 'app-iam-organisation-edit',
  templateUrl: './organisation-edit.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './organisation-edit.css']
})
export class OrganisationEdit {
  private readonly router = inject(Router);

  /** profile page (the edit page lives at <profile>/edit) */
  static readonly PROFILE_PATH = '/app/administration/organisation/details';

  readonly org = ORG;

  /** approved (active) organisations cannot change registered details */
  readonly locked = ORG.status === 'active';
  readonly maxAbout = 1000;

  // dropdown options (replace with your lookup data)
  readonly types = ['Non-profit / NGO', 'Company', 'Trust', 'Society', 'Government', 'Education'];
  readonly dialCodes = ['+91', '+1', '+44', '+61', '+65', '+971'];
  readonly timezones = ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Singapore'];
  readonly currencies = ['INR', 'USD', 'EUR', 'GBP', 'SGD'];
  readonly languages = ['en-IN', 'en-US', 'en-GB', 'hi-IN', 'ta-IN'];
  readonly countries = ['India', 'United States', 'United Kingdom', 'Singapore'];
  readonly states = ['Delhi', 'Tamil Nadu', 'Maharashtra', 'Karnataka', 'Kerala'];
  readonly cities = ['New Delhi, Delhi', 'Chennai, Tamil Nadu', 'Mumbai, Maharashtra', 'Bengaluru, Karnataka', 'Madurai, Tamil Nadu'];

  private readonly addr = ADDRESS as unknown as Record<string, string>;

  readonly form = signal<Form>({
    name: ORG.name ?? '',
    legalName: pick(REGISTRATION, 'legal') || ORG.name || '',
    type: ORG.type ?? '',
    established: pick(REGISTRATION, 'established', 'since') || String(ORG.since ?? ''),
    regNo: pick(REGISTRATION, 'registration number', 'reg'),
    taxId: pick(REGISTRATION, 'tax'),
    pan: pick(REGISTRATION, 'pan'),
    gst: pick(REGISTRATION, 'gst'),
    about: ABOUT ?? '',
    person: pick(CONTACT, 'person', 'contact') || ORG.administrator || '',
    email: pick(CONTACT, 'e-mail', 'email'),
    dial: '+91',
    phone: pick(CONTACT, 'telephone', 'phone').replace(/^\+\d+\s*/, ''),
    website: pick(CONTACT, 'website'),
    timezone: pick(CONTACT, 'time zone', 'timezone') || this.timezones[0],
    currency: pick(CONTACT, 'currency') || this.currencies[0],
    language: pick(CONTACT, 'language') || this.languages[0],
    line1: this.addr['line1'] ?? '',
    line2: this.addr['line2'] ?? '',
    country: this.addr['country'] ?? 'India',
    state: this.addr['state'] ?? '',
    city: this.addr['city'] ?? '',
    postcode: this.addr['postcode'] ?? ''
  });

  /** name and address line 1 are required */
  readonly valid = computed(() => !!this.form().name.trim() && !!this.form().line1.trim());

  set(key: FieldKey, value: string): void {
    this.form.update((f) => ({ ...f, [key]: key === 'about' ? value.slice(0, this.maxAbout) : value }));
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
    // TODO: call your save API with this.form(), then go back to the profile
    this.router.navigateByUrl(OrganisationEdit.PROFILE_PATH);
  }
}