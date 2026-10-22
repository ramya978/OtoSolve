import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** change these to your real routes */
const ORGS_PATH = '/app/administration/organisations';
const DOMAIN_SUFFIX = '.localhost';

interface OrgForm {
  /* step 1 */
  name: string; legalName: string; type: string; code: string; domain: string; description: string;
  /* step 2 */
  phoneCode: string; phone: string; maxPeople: string; timezone: string; currency: string; language: string;
  twoStep: 'optional' | 'required';
  /* step 3 */
  firstName: string; lastName: string; email: string; username: string; message: string; sendNow: boolean;
}

interface Opt { value: string; label: string; }

const TYPES: Opt[] = [
  { value: '', label: 'Not specified' },
  { value: 'ngo', label: 'Non-profit / NGO' },
  { value: 'trust', label: 'Charitable trust' },
  { value: 'society', label: 'Registered society' },
  { value: 'section8', label: 'Section 8 company' },
  { value: 'corporate', label: 'Corporate / CSR' },
  { value: 'other', label: 'Other' }
];
const PHONE_CODES = ['+91', '+971', '+1', '+44', '+65'];
const TIMEZONES: Opt[] = [
  { value: 'Asia/Kolkata', label: '(+05:30) (UTC+05:30) India Standard Time' },
  { value: 'Asia/Dubai', label: '(+04:00) (UTC+04:00) Gulf Standard Time' },
  { value: 'Asia/Singapore', label: '(+08:00) (UTC+08:00) Singapore Time' },
  { value: 'Asia/Shanghai', label: '(+08:00) (UTC+08:00) China Standard Time' },
  { value: 'Europe/London', label: '(+00:00) (UTC+00:00) Greenwich Mean Time' },
  { value: 'America/New_York', label: '(-05:00) (UTC-05:00) Eastern Time' }
];
const CURRENCIES: Opt[] = [
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'AED', label: 'AED — United Arab Emirates Dirham' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — Pound Sterling' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' }
];
const LANGUAGES: Opt[] = [
  { value: 'en-IN', label: 'English (India) — English' },
  { value: 'en-US', label: 'English (US) — English' },
  { value: 'hi-IN', label: 'Hindi — हिन्दी' },
  { value: 'ta-IN', label: 'Tamil — தமிழ்' }
];

const STEPS = [
  { key: 'organisation', label: 'Organisation', title: 'Organisation details', sub: 'Enter the core information about the organisation.' },
  { key: 'contact', label: 'Contact', title: 'Contact and defaults', sub: 'All optional. The administrator completes the full profile once they activate their account, and the organisation cannot be approved until they have.' },
  { key: 'admin', label: 'Administrator', title: 'First administrator', sub: 'They receive an invitation link, choose their own password, and then complete the organisation’s profile. No password is ever created here or sent by e-mail.' },
  { key: 'review', label: 'Review', title: 'Check before creating', sub: 'Review everything below before the organisation is created.' }
] as const;

/** which form fields belong to which step — used to decide if "Continue" may go on */
const STEP_FIELDS: string[][] = [['name', 'code', 'domain'], [], ['firstName', 'lastName', 'email'], []];

const slug = (s: string): string => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const blank = (): OrgForm => ({
  name: '', legalName: '', type: '', code: '', domain: '', description: '',
  phoneCode: '+91', phone: '', maxPeople: '', timezone: 'Asia/Kolkata', currency: 'INR', language: 'en-IN', twoStep: 'optional',
  firstName: '', lastName: '', email: '', username: '', message: '', sendNow: true
});

const ICONS: Record<string, string> = {
  back: 'M19 12H5 M11 6l-6 6 6 6',
  next: 'M5 12h14 M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 7.5h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  org: 'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20 M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M22 20v-1.5a4 4 0 0 0-3-3.87 M16 3.63a4 4 0 0 1 0 7.75',
  tag: 'M6 3h12v18l-6-4-6 4z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  doc: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6M10 17h6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3.2 3 14.8 0 18 M12 3c-3 3.2-3 14.8 0 18',
  shield: 'M12 3l7.5 3v6c0 4.6-3.1 8.2-7.5 9.2C7.6 20.2 4.5 16.6 4.5 12V6L12 3z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3l2-2h2v-2h2l2.1-2.1A4 4 0 0 1 15 7z M16.5 8.5h.01',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  building: 'M5 21V4h9v17 M14 9h5v12 M3 21h18 M8 8h2M8 12h2M8 16h2'
};

/** Create an organisation — four steps: organisation, contact and defaults, first administrator, review. */
@Component({
  selector: 'app-create-organisation',
  templateUrl: './create-organisation.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './create-organisation.css']
})
export class CreateOrganisation {
  private readonly router = inject(Router);

  readonly steps = STEPS;
  readonly types = TYPES;
  readonly phoneCodes = PHONE_CODES;
  readonly timezones = TIMEZONES;
  readonly currencies = CURRENCIES;
  readonly languages = LANGUAGES;
  readonly suffix = DOMAIN_SUFFIX;

  readonly f = signal<OrgForm>(blank());
  readonly step = signal(0);
  readonly reached = signal(0);
  readonly attempted = signal(false);
  readonly created = signal(false);
  private domainTouched = false;

  readonly current = computed(() => STEPS[this.step()]);
  readonly progress = computed(() => Math.round((this.step() / (STEPS.length - 1)) * 100));

  readonly errors = computed(() => {
    const f = this.f();
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Give the organisation a name.';
    if (f.code.trim() && !/^[A-Za-z0-9_-]+$/.test(f.code.trim())) e['code'] = 'Use letters, digits, underscores or hyphens.';
    if (!f.domain.trim()) e['domain'] = 'Choose a web address.';
    else if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(f.domain.trim())) e['domain'] = 'Use lower case letters, digits and hyphens only.';
    if (!f.firstName.trim()) e['firstName'] = 'Add a first name.';
    if (!f.lastName.trim()) e['lastName'] = 'Add a last name.';
    if (!f.email.trim()) e['email'] = 'Add an e-mail address.';
    else if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e['email'] = 'Enter a valid e-mail address.';
    return e;
  });

  /** summary of every step for the review page, with readable labels */
  readonly review = computed(() => {
    const f = this.f();
    const label = (list: Opt[], v: string) => list.find((o) => o.value === v)?.label ?? v;
    const dash = (v: string) => v.trim() || '—';
    return [
      { step: 0, icon: 'org', title: 'Organisation', note: 'The details from the first step.', rows: [
        ['Name', dash(f.name)], ['Registered legal name', dash(f.legalName)], ['Type', label(TYPES, f.type)],
        ['Reference code', f.code.trim() || 'Auto-generated'], ['Web address', f.domain.trim() ? f.domain.trim() + DOMAIN_SUFFIX : '—'],
        ['Description', dash(f.description)]
      ] },
      { step: 1, icon: 'globe', title: 'Contact and regional defaults', note: 'The details from the Contact step.', rows: [
        ['Contact telephone', f.phone.trim() ? `${f.phoneCode} ${f.phone.trim()}` : '—'], ['Maximum people', f.maxPeople.trim() || 'No limit'],
        ['Time zone', label(TIMEZONES, f.timezone)], ['Currency', label(CURRENCIES, f.currency)], ['Language', label(LANGUAGES, f.language)],
        ['Two-step verification', f.twoStep === 'required' ? 'Required' : 'Optional']
      ] },
      { step: 2, icon: 'user', title: 'First administrator', note: 'The details from the Administrator step.', rows: [
        ['First name', dash(f.firstName)], ['Last name', dash(f.lastName)], ['E-mail address', dash(f.email)],
        ['Username', f.username.trim() || (f.email.includes('@') ? f.email.split('@')[0] + ' (from the e-mail)' : '—')],
        ['Message in the invitation', dash(f.message)], ['Send the invitation', f.sendNow ? 'Sent immediately' : 'Later — staged set-up']
      ] }
    ];
  });

  icon(name: string): string { return ICONS[name] ?? ''; }

  set<K extends keyof OrgForm>(key: K, value: OrgForm[K]): void { this.f.update((s) => ({ ...s, [key]: value })); }

  /** typing a name suggests the web address, until the person edits the address themselves */
  onName(value: string): void {
    this.set('name', value);
    if (!this.domainTouched) this.set('domain', slug(value).slice(0, 40));
  }
  onDomain(value: string): void {
    this.domainTouched = true;
    this.set('domain', value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  bad(key: string): boolean { return this.attempted() && !!this.errors()[key]; }
  stepValid(i: number): boolean { return STEP_FIELDS[i].every((k) => !this.errors()[k]); }

  /** a step shows as done once the person has moved past it */
  isDone(i: number): boolean { return i < this.step() || (this.created() && i <= this.step()); }
  canOpen(i: number): boolean { return i <= this.reached() && (i <= this.step() || this.stepValid(this.step())); }

  goTo(i: number): void {
    if (!this.canOpen(i) || i === this.step()) return;
    this.attempted.set(false);
    this.step.set(i);
    this.toTop();
  }

  next(): void {
    this.attempted.set(true);
    if (!this.stepValid(this.step())) {
      setTimeout(() => document.querySelector<HTMLElement>('.oc-input.bad')?.focus());
      return;
    }
    this.attempted.set(false);
    const n = Math.min(this.step() + 1, STEPS.length - 1);
    this.step.set(n);
    this.reached.update((r) => Math.max(r, n));
    this.toTop();
  }

  prev(): void {
    if (this.step() === 0) { this.leave(); return; }
    this.attempted.set(false);
    this.step.update((s) => s - 1);
    this.toTop();
  }

  /** the last step: create the organisation, its roles, its navigation and the administrator together */
  submit(): void {
    /* call your create-organisation endpoint here with this.f(); show the result once it succeeds */
    this.created.set(true);
    this.toTop();
  }

  another(): void {
    this.f.set(blank());
    this.domainTouched = false;
    this.created.set(false);
    this.step.set(0);
    this.reached.set(0);
    this.attempted.set(false);
  }

  leave(): void { this.router.navigate([ORGS_PATH]); }

  private toTop(): void { setTimeout(() => document.querySelector('.oc-page')?.scrollIntoView({ block: 'start' })); }
}
