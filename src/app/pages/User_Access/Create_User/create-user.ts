import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IamDateRange, IamRange } from '../../../Shared/IAM/iam-date-range';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { LoaderService } from '../../../Shared/services/loader.service';
import {
  IAM_PATHS, IamOption, iamToday,
  fmtDate, initialsOf
} from '../../../Shared/IAM/iam-data';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { EnumOptionsService } from '../../../Shared/services/enum-options.service';
import { IamDirectoryStore } from '../../../Shared/IAM/iam-directory.store';
import { UserAdminApiService } from '../../../Service/user-admin-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage, apiFieldErrors } from '../../../Shared/models/api-response.model';
import { CreateUserRequest } from '../../../Shared/models/iam-contract.model';

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

/** today in the person's own time zone (the real date, not a sample one) */
const today = iamToday();

const EMPTY: UserForm = {
  title: '', firstName: '', lastName: '', displayName: '', preferredName: '', email: '', username: '',
  countryCode: '', mobile: '', employeeNo: '', unit: '', department: '', designation: '', workLocation: '',
  language: '', timeZone: '', role: '', dataScope: '',
  accessFrom: today, accessUntil: '', mfa: '', justification: '', message: ''
};

/** Required fields per section (presence + validity). */
const REQUIRED: Record<Exclude<SectionKey, 'review'>, (keyof UserForm)[]> = {
  identity: ['firstName', 'lastName', 'displayName', 'email', 'username'],
  organisation: ['unit', 'department'],
  access: ['role', 'dataScope', 'mfa', 'justification']
};

const JUSTIFY_MAX = 1000;

/** Profile photo rules (optional field). */
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_MIN_PX = 96;
/** Line icons used only by the photo field (24 × 24, stroke). */
const PHOTO_ICONS: Record<'camera' | 'upload' | 'trash', string> = {
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6'
};

/** What each grantable data scope does, in a sentence (the names come from the server). */
const SCOPE_HINT: Record<string, string> = {
  organisation: 'Everything in this organisation that their role allows.',
  assignment: 'Only what is theirs: campaigns they own, leads and donors assigned to them, donations they took.'
};
/** what the choice shows only if the server's list has not arrived */
const SCOPE_FALLBACK: IamOption[] = [
  { value: 'organisation', label: 'Whole organisation', hint: SCOPE_HINT['organisation'] },
  { value: 'assignment', label: 'Own records only', hint: SCOPE_HINT['assignment'] }
];

/** Create user — single-page record form in the campaign-wizard layout: page heading, record card,
 *  section index with completion on the left, all sections stacked in the middle, guidance on the
 *  right, review + invite at the end. No password is set here; the person sets it from the e-mail. */
@Component({
  selector: 'app-iam-create-user',
  imports: [IamSelect, IamDateRange,PageHeader],
  templateUrl: './create-user.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './create-user.css', '../../../Shared/layout/page-header/page-header.css']
})
export class CreateUser implements OnInit {
  private readonly router = inject(Router);
  private readonly store = inject(IamDirectoryStore);
  private readonly api = inject(UserAdminApiService);
  private readonly toast = inject(ToastService);
  private readonly loaderService = inject(LoaderService);
  private readonly geo = inject(GeoMasterService);
  private readonly enums = inject(EnumOptionsService);
  readonly submitting = signal(false);
  readonly serverError = signal('');

  ngOnInit(): void {
    this.loaderService.startLoading();
    this.store.load();
    // Titles, dialling prefixes, languages and time zones come from the server catalogues, not from lists in this file.
    this.enums.getAll().subscribe({
      next: (e) => {
        this.titleList.set((e.personTitles ?? []).map((o) => String(o.value ?? '')).filter(Boolean));
        const scopes = (e.dataScopeTypes ?? []).filter((o) => SCOPE_HINT[String(o.value ?? '').toLowerCase()]);
        if (scopes.length) {
          this.scopeList.set(scopes.map((o) => {
            const value = String(o.value ?? '');
            return { value, label: o.label ?? value, hint: SCOPE_HINT[value.toLowerCase()] };
          }));
        }
      },
      error: () => undefined
    });
    this.geo.getCountries().subscribe({
      next: (list) => {
        const seen = new Set<string>();
        const out: IamOption[] = [];
        for (const c of list) {
          const raw = c.phoneCountryCode ?? '';
          if (!raw) continue;
          const code = raw.startsWith('+') ? raw : '+' + raw;
          if (seen.has(code)) continue;
          seen.add(code);
          out.push({ value: code, label: code, hint: c.name ?? '' });
        }
        this.codeList.set(out);
        // the form used to open on +91; keep that default only when the catalogue offers it
        if (!this.form().countryCode && seen.has('+91')) this.form.update((f) => ({ ...f, countryCode: f.countryCode || '+91' }));
      },
      error: () => undefined
    });
    this.geo.getLanguageOptions().subscribe({
      next: (list) => {
        this.langList.set(list.map((l) => ({ value: l.cultureCode ?? '', label: l.displayLabel ?? l.cultureCode ?? '' })).filter((o) => o.value));
        if (!this.form().language && list.some((l) => l.cultureCode === 'en-IN')) this.form.update((f) => ({ ...f, language: f.language || 'en-IN' }));
      },
      error: () => undefined
    });
    this.geo.getTimeZoneOptions().subscribe({
      next: (list) => {
        this.zoneList.set(list.map((z) => ({ value: z.ianaKey ?? '', label: z.name ?? z.ianaKey ?? '' })).filter((o) => o.value));
        const home = list.find((z) => z.ianaKey === 'Asia/Kolkata') ?? list.find((z) => z.ianaKey === 'Asia/Calcutta');
        if (home && !this.form().timeZone) this.form.update((f) => ({ ...f, timeZone: f.timeZone || (home.ianaKey ?? '') }));
      },
      error: () => undefined
    });

    // When store.loading goes false, data has arrived (or errored)
    effect(() => {
      if (!this.store.loading()) {
        this.loaderService.dataReceived();
      }
    });
  }

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
  private readonly titleList = signal<string[]>([]);
  private readonly codeList = signal<IamOption[]>([]);
  private readonly langList = signal<IamOption[]>([]);
  private readonly zoneList = signal<IamOption[]>([]);
  get titleOptions(): IamOption[] { return this.titleList().map((t) => ({ value: t, label: t })); }
  get codeOptions(): IamOption[] { return this.codeList(); }
  private readonly unitOptionsC = computed<IamOption[]>(() => this.store.units().map((u) => ({ value: u.id ?? '', label: u.name ?? '', icon: 'unit' })));
  private readonly deptOptionsC = computed<IamOption[]>(() => this.store.departments().map((d) => ({ value: d.id ?? '', label: d.name ?? '', icon: 'building' })));
  get languageOptions(): IamOption[] { return this.langList(); }
  get zoneOptions(): IamOption[] { return this.zoneList(); }
  private readonly roleOptionsC = computed<IamOption[]>(() => this.store.roles().filter((r) => r.isActive !== false).map((r) => ({
    value: r.id ?? '', label: r.name ?? '', hint: r.code ?? '', initials: initialsOf(r.name ?? '')
  })));
  private readonly scopeList = signal<IamOption[]>([]);
  get scopeOptions(): IamOption[] { return this.scopeList().length ? this.scopeList() : SCOPE_FALLBACK; }
  readonly mfaOptions: IamOption[] = [
    { value: 'required', label: 'Required', hint: 'They set up a second factor during activation', icon: 'shieldCheck' },
    { value: 'optional', label: 'Optional (organisation default)', hint: 'They may add one later', icon: 'shield' }
  ];

  get unitOptions(): IamOption[] { return this.unitOptionsC(); }
  get deptOptions(): IamOption[] { return this.deptOptionsC(); }
  get roleOptions(): IamOption[] { return this.roleOptionsC(); }

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  // ---------------------------------------------------------------- profile photo (optional)
  /** The chosen photo as a data URL (null = none), with its file name, size and pixel size. */
  readonly photo = signal<string | null>(null);
  readonly photoName = signal('');
  readonly photoSize = signal(0);
  readonly photoDims = signal<{ w: number; h: number } | null>(null);
  readonly photoDrag = signal(false);
  readonly photoError = signal('');

  /** Initials shown in the round preview until a photo is chosen. */
  readonly photoInitials = computed(() => {
    const f = this.form();
    const name = f.displayName.trim() || [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(' ');
    return name ? initialsOf(name) : '';
  });

  /** "84 KB · 600 × 600 px" under the file name. */
  readonly photoMeta = computed(() => {
    const d = this.photoDims();
    const bytes = this.photoSize();
    const size = !bytes ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return [size, d ? `${d.w} × ${d.h} px` : ''].filter(Boolean).join(' · ');
  });

  photoIcon(name: 'camera' | 'upload' | 'trash'): string {
    return PHOTO_ICONS[name];
  }

  onPhotoPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again after Remove
    if (file) this.readPhoto(file);
  }

  onPhotoDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.photoDrag.set(true);
  }

  onPhotoDragLeave(event: DragEvent): void {
    const to = event.relatedTarget as Node | null;
    if (!to || !(event.currentTarget as HTMLElement).contains(to)) this.photoDrag.set(false);
  }

  onPhotoDrop(event: DragEvent): void {
    event.preventDefault();
    this.photoDrag.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.readPhoto(file);
  }

  removePhoto(): void {
    this.photo.set(null);
    this.photoName.set('');
    this.photoSize.set(0);
    this.photoDims.set(null);
    this.photoError.set('');
  }

  private readPhoto(file: File): void {
    if (!PHOTO_TYPES.includes(file.type)) { this.photoError.set('Use a PNG, JPG or WebP image.'); return; }
    if (file.size > PHOTO_MAX_BYTES) { this.photoError.set('This image is larger than 2 MB. Choose a smaller one.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w < PHOTO_MIN_PX || h < PHOTO_MIN_PX) {
          this.photoError.set(`This image is only ${w} × ${h} px. Use at least ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px.`);
          return;
        }
        this.photoError.set('');
        this.photo.set(url);
        this.photoName.set(file.name);
        this.photoSize.set(file.size);
        this.photoDims.set({ w, h });
        if (this.status() !== 'editing') this.status.set('editing');
      };
      img.onerror = () => this.photoError.set('This file could not be read as an image.');
      img.src = url;
    };
    reader.onerror = () => this.photoError.set('This file could not be read. Try another one.');
    reader.readAsDataURL(file);
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

  // ---- is the e-mail / username free? Asked of the server (check-identity), which sees every account, not just the loaded page ----
  private readonly identity = signal<{ email: string; username: string; emailTaken: boolean; usernameTaken: boolean; message: string } | null>(null);
  readonly identityChecking = signal(false);

  private checkIdentity(): void {
    const f = this.form();
    const email = f.email.trim().toLowerCase();
    const username = f.username.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !username) return;
    this.identityChecking.set(true);
    this.api.checkIdentity({ email: email || undefined, username: username || undefined }).subscribe({
      next: (r) => {
        this.identityChecking.set(false);
        this.identity.set({
          email, username, emailTaken: r.emailAvailable === false, usernameTaken: r.usernameAvailable === false, message: r.message ?? ''
        });
      },
      // A failed check must not block the form: the server checks again when the account is created.
      error: () => { this.identityChecking.set(false); this.identity.set(null); }
    });
  }

  touch(key: keyof UserForm): void {
    if (key === 'email' || key === 'username') this.checkIdentity();
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
    else if (this.identity()?.emailTaken && this.identity()?.email === f.email.trim().toLowerCase()) e.email = 'Someone already signs in with this e-mail.';
    if (!f.username.trim()) e.username = 'Username is required.';
    else if (!/^[a-z0-9._-]{3,}$/.test(f.username.trim())) e.username = 'Use 3 or more lower-case letters, digits, dots, - or _.';
    else if (this.identity()?.usernameTaken && this.identity()?.username === f.username.trim().toLowerCase()) e.username = 'This username is taken.';
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
  readonly roleName = computed(() => this.store.roles().find((r) => r.id === this.form().role)?.name ?? '');
  readonly rolePrivileged = computed(() => false);
  readonly scopeName = computed(() => (this.scopeList().length ? this.scopeList() : SCOPE_FALLBACK).find((s) => s.value === this.form().dataScope)?.label ?? '');
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
    this.tried.set(true);
    const e = this.errors();
    if (e.firstName || e.lastName || e.displayName || e.email || e.username) { this.go('identity'); return; }
    this.submit(false);
  }

  create(): void {
    this.tried.set(true);
    if (!this.ready()) {
      const first = (['identity', 'organisation', 'access'] as SectionKey[]).find((s) => this.done(s) < this.needed(s));
      if (first) this.go(first);
      return;
    }
    this.submit(true);
  }

  private submit(sendInvitation: boolean): void {
    const f = this.form();
    // profileImage: the optional photo as a data URL - rename / remove to match your user API
    const request: CreateUserRequest & { profileImage?: string | null } = {
      title: f.title.trim() || null,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      displayName: f.displayName.trim(),
      preferredName: f.preferredName.trim() || null,
      email: f.email.trim().toLowerCase(),
      username: f.username.trim().toLowerCase() || null,
      employeeNumber: f.employeeNo.trim() || null,
      mobileCountryCode: f.mobile ? f.countryCode : null,
      mobileNumber: f.mobile ? f.mobile.replace(/\s/g, '') : null,
      organisationUnitId: f.unit || null,
      departmentId: f.department || null,
      designation: f.designation.trim() || null,
      workLocation: f.workLocation.trim() || null,
      preferredCulture: f.language || null,
      timeZone: f.timeZone || null,
      accessStartsAtUtc: f.accessFrom ? new Date(f.accessFrom).toISOString() : null,
      accessEndsAtUtc: f.accessUntil ? new Date(f.accessUntil).toISOString() : null,
      mfaRequirement: f.mfa === 'required' ? 'required' : 'inherited',
      roleIds: f.role ? [f.role] : [],
      dataScopes: f.dataScope.toLowerCase() === 'assignment' ? [{ scopeType: 'assignment', scopeValue: '' }] : [],
      justification: f.justification.trim() || null,
      credentialSetupMethod: 'invitationLink',
      sendInvitation,
      invitationMessage: f.message.trim() || null,
      profileImage: this.photo(),
    };
    this.submitting.set(true);
    this.serverError.set('');
    this.api.createUser(request).subscribe({
      next: (user) => {
        this.submitting.set(false);
        this.status.set(sendInvitation ? 'sent' : 'draft');
        const delivered = user.invitationSent === true;
        this.toast.show(
          'Account created',
          !sendInvitation ? `${user.displayName} was saved as a draft.`
            : delivered ? `${user.displayName} has been e-mailed an invitation link.`
            : user.deliveryMessage || `${user.displayName} was created, but the invitation e-mail could not be sent.`,
          delivered || !sendInvitation ? 'success' : 'warning');
        this.loaderService.startLoading();
        this.store.load();
      },
      error: (e) => {
        this.submitting.set(false);
        const msg = apiErrorMessage(e, 'The account could not be created.');
        this.serverError.set(msg);
        this.toast.show('Could not create', msg, 'error');
        void apiFieldErrors;
      },
    });
  }

  /** The opening choices, once the catalogues are in. */
  private defaults(): Pick<UserForm, 'countryCode' | 'language' | 'timeZone'> {
    const has = (list: IamOption[], v: string) => list.some((o) => o.value === v);
    const zone = ['Asia/Kolkata', 'Asia/Calcutta'].find((z) => has(this.zoneList(), z)) ?? '';
    return {
      countryCode: has(this.codeList(), '+91') ? '+91' : '',
      language: has(this.langList(), 'en-IN') ? 'en-IN' : '',
      timeZone: zone
    };
  }

  startAnother(): void {
    this.form.set({ ...EMPTY, ...this.defaults() });
    this.removePhoto();
    this.touched.set(new Set());
    this.tried.set(false);
    this.displayEdited = false;
    this.usernameEdited = false;
    this.status.set('editing');
    this.go('identity');
  }
}