import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IamDateRange, IamRange } from '../../../Shared/IAM/iam-date-range';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  COUNTRY_CODES, DATA_SCOPES, DEPARTMENTS, IAM_NOW, IAM_PATHS, IamOption, LANGUAGES, ROLES, TIME_ZONES, TITLES, UNITS, USERS,
  fmtDate, initialsOf
} from '../../../Shared/IAM/iam-data';

type SectionKey = 'identity' | 'organisation' | 'access' | 'review';

interface UserForm {
  title: string;
  firstName: string;
  lastName: string;
  displayName: string;
  preferredName: string;
  email: string;
  username: string;
  countryCode: string;
  mobile: string;
  employeeNo: string;
  unit: string;
  department: string;
  designation: string;
  workLocation: string;
  language: string;
  timeZone: string;
  role: string;
  dataScope: string;
  accessFrom: string;
  accessUntil: string;
  mfa: string;
  justification: string;
  message: string;
}

const today = IAM_NOW.toISOString().slice(0, 10);

const EMPTY: UserForm = {
  title: '', firstName: '', lastName: '', displayName: '', preferredName: '', email: '', username: '',
  countryCode: '+91', mobile: '', employeeNo: '', unit: '', department: '', designation: '', workLocation: '',
  language: 'English (India)', timeZone: 'Asia/Kolkata (IST, UTC+05:30)', role: '', dataScope: '',
  accessFrom: today, accessUntil: '', mfa: '', justification: '', message: ''
};

/** Required fields per section (presence + validity). */
const REQUIRED: Record<Exclude<SectionKey, 'review'>, (keyof UserForm)[]> = {
  identity: ['firstName', 'lastName', 'displayName', 'email', 'username'],
  organisation: ['unit', 'department'],
  access: ['role', 'dataScope', 'mfa', 'justification']
};

const JUSTIFY_MAX = 1000;

/** Create user — single-page record form in the campaign-wizard layout: page heading, record card,
 *  section index with completion on the left, all sections stacked in the middle, guidance on the
 *  right, review + invite at the end. No password is set here; the person sets it from the e-mail. */
@Component({
  selector: 'app-iam-create-user',
  imports: [IamSelect, IamDateRange],
  templateUrl: './create-user.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './create-user.css']
})
export class CreateUser {
  private readonly router = inject(Router);

  readonly form = signal<UserForm>({ ...EMPTY });
  /** fields the person has left at least once (errors show after touch or after a submit attempt) */
  readonly touched = signal<Set<string>>(new Set());
  readonly tried = signal(false);
  readonly active = signal<SectionKey>('identity');
  /** display name / username follow the other fields until the person types in them */
  private displayEdited = false;
  private usernameEdited = false;
  readonly status = signal<'editing' | 'draft' | 'sent'>('editing');

  readonly justifyMax = JUSTIFY_MAX;
  readonly today = today;
  readonly fmtDate = fmtDate;
  readonly initials = initialsOf;

  readonly sections: { key: SectionKey; no: string; title: string; sub: string }[] = [
    { key: 'identity', no: '01', title: 'Identity', sub: 'Name, sign-in and contact' },
    { key: 'organisation', no: '02', title: 'Organisation', sub: 'Unit, department and locale' },
    { key: 'access', no: '03', title: 'Access', sub: 'Role, scope, window and reason' },
  ];

  // ---------------------------------------------------------------- options
  readonly titleOptions: IamOption[] = TITLES.map((t) => ({ value: t, label: t }));
  readonly codeOptions: IamOption[] = COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code, hint: c.country }));
  readonly unitOptions: IamOption[] = UNITS.map((u) => ({ value: u, label: u, icon: 'unit' }));
  readonly deptOptions: IamOption[] = DEPARTMENTS.map((d) => ({ value: d, label: d, icon: 'building' }));
  readonly languageOptions: IamOption[] = LANGUAGES.map((l) => ({ value: l, label: l }));
  readonly zoneOptions: IamOption[] = TIME_ZONES.map((z) => ({ value: z, label: z }));
  readonly roleOptions: IamOption[] = ROLES.filter((r) => r.status === 'active').map((r) => ({
    value: r.code, label: r.name, hint: r.code + (r.privileged ? ' · Privileged' : ''), initials: initialsOf(r.name)
  }));
  readonly scopeOptions: IamOption[] = DATA_SCOPES.map((s) => ({ value: s.value, label: s.label, hint: s.hint }));
  readonly mfaOptions: IamOption[] = [
    { value: 'required', label: 'Required', hint: 'They set up a second factor during activation', icon: 'shieldCheck' },
    { value: 'optional', label: 'Optional (organisation default)', hint: 'They may add one later', icon: 'shield' }
  ];

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  // ---------------------------------------------------------------- editing
  set<K extends keyof UserForm>(key: K, value: UserForm[K]): void {
    this.form.update((f) => {
      const next = { ...f, [key]: value };
      if ((key === 'firstName' || key === 'lastName') && !this.displayEdited) {
        next.displayName = [next.firstName.trim(), next.lastName.trim()].filter(Boolean).join(' ');
      }
      if (key === 'email' && !this.usernameEdited) {
        next.username = String(value).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
      }
      return next;
    });
    if (key === 'displayName') this.displayEdited = true;
    if (key === 'username') this.usernameEdited = true;
    if (this.status() !== 'editing') this.status.set('editing');
  }

  touch(key: keyof UserForm): void {
    if (this.touched().has(key)) return;
    const n = new Set(this.touched());
    n.add(key);
    this.touched.set(n);
  }

  setWindow(r: IamRange): void {
    this.form.update((f) => ({ ...f, accessFrom: r.start || today, accessUntil: r.end }));
  }

  // ---------------------------------------------------------------- validation
  readonly errors = computed<Partial<Record<keyof UserForm, string>>>(() => {
    const f = this.form();
    const e: Partial<Record<keyof UserForm, string>> = {};
    if (!f.firstName.trim()) e.firstName = 'First name is required.';
    if (!f.lastName.trim()) e.lastName = 'Last name is required.';
    if (!f.displayName.trim()) e.displayName = 'Display name is required.';
    if (!f.email.trim()) e.email = 'Login e-mail is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid e-mail address.';
    else if (USERS.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())) e.email = 'Someone already signs in with this e-mail.';
    if (!f.username.trim()) e.username = 'Username is required.';
    else if (!/^[a-z0-9._-]{3,}$/.test(f.username.trim())) e.username = 'Use 3 or more lower-case letters, digits, dots, - or _.';
    else if (USERS.some((u) => u.username === f.username.trim())) e.username = 'This username is taken.';
    if (f.mobile && !/^\d{6,12}$/.test(f.mobile.replace(/\s/g, ''))) e.mobile = 'Use 6–12 digits, without the country code.';
    if (!f.unit) e.unit = 'Choose an organisation unit.';
    if (!f.department) e.department = 'Choose a department.';
    if (!f.role) e.role = 'Choose the primary role.';
    if (!f.dataScope) e.dataScope = 'Choose a data scope.';
    if (!f.mfa) e.mfa = 'Choose whether two-step verification is required.';
    if (f.justification.trim().length < 10) e.justification = 'Explain why in at least 10 characters.';
    return e;
  });

  /** show an error after the field was left or after a create attempt */
  err(key: keyof UserForm): string {
    return this.tried() || this.touched().has(key) ? this.errors()[key] ?? '' : '';
  }

  private filled(key: keyof UserForm): boolean {
    return !!String(this.form()[key]).trim() && !this.errors()[key];
  }

  done(section: SectionKey): number {
    return section === 'review' ? 0 : REQUIRED[section].filter((k) => this.filled(k)).length;
  }

  needed(section: SectionKey): number {
    return section === 'review' ? 0 : REQUIRED[section].length;
  }

  readonly requiredTotal = REQUIRED.identity.length + REQUIRED.organisation.length + REQUIRED.access.length;
  readonly requiredDone = computed(() => this.done('identity') + this.done('organisation') + this.done('access'));
  readonly ready = computed(() => this.requiredDone() === this.requiredTotal);
  readonly percent = computed(() => Math.round((this.requiredDone() / this.requiredTotal) * 100));

  // ---------------------------------------------------------------- review helpers
  readonly roleName = computed(() => ROLES.find((r) => r.code === this.form().role)?.name ?? '');
  readonly rolePrivileged = computed(() => !!ROLES.find((r) => r.code === this.form().role)?.privileged);
  readonly scopeName = computed(() => DATA_SCOPES.find((s) => s.value === this.form().dataScope)?.label ?? '');
  readonly mfaName = computed(() => this.mfaOptions.find((m) => m.value === this.form().mfa)?.label ?? '');
  readonly fullMobile = computed(() => (this.form().mobile ? `${this.form().countryCode} ${this.form().mobile}` : ''));

  // ---------------------------------------------------------------- navigation
  go(key: SectionKey): void {
    this.active.set(key);
    document.getElementById('cu-' + key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  back(): void {
    this.router.navigate([IAM_PATHS.users]);
  }

  saveDraft(): void {
    this.status.set('draft');
  }

  create(): void {
    this.tried.set(true);
    if (!this.ready()) {
      const first = (['identity', 'organisation', 'access'] as SectionKey[]).find((s) => this.done(s) < this.needed(s));
      if (first) this.go(first);
      return;
    }
    // hand the record to your API here (invite e-mail is sent server-side)
    this.status.set('sent');
  }

  startAnother(): void {
    this.form.set({ ...EMPTY });
    this.touched.set(new Set());
    this.tried.set(false);
    this.displayEdited = false;
    this.usernameEdited = false;
    this.status.set('editing');
    this.go('identity');
  }
}