import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { ThemeSettingsService, profileImageSrc } from './theme-settings';
import { IamUser, USER_STATUS_LABEL, fmtDate, initialsOf } from '../../../Shared/IAM/iam-data';
import { toIamUser, mergeDetail } from '../../../Shared/IAM/iam-directory.store';
import { UserDirectoryApiService } from '../../../Service/user-directory-api.service';
import { SecurityApiService } from '../../../Service/security-api.service';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { apiErrorMessage, apiFieldErrors } from '../../../Shared/models/api-response.model';
import { UserDetailResponse, UserSecurityResponse } from '../../../Shared/models/iam-contract.model';

export type ProfileTab = 'overview' | 'access' | 'security';

/** One label / value line in the Identity or Organisation card ("null" = Not provided). */
export interface FieldRow {
  label: string;
  value: string | null;
  mono?: boolean;
}

export interface StatCell {
  icon: string;
  label: string;
  value: string;
  note?: string;
  tone?: 'amber';
}

export interface AssignedRole {
  name: string;
  note: string;
  scope: string;
  scopeNote: string;
  permissions: string;
  term: string;
}

export interface AssignmentStep {
  title: string;
  detail: string;
}

/** Security / session rows: right side is either a chip or an action button. */
export interface SecurityRow {
  icon: string;
  title: string;
  detail: string;
  extra?: string;
  chip?: string;
  chipTone?: 'neutral' | 'primary';
  action?: string;
}

/** Header block shown in the hero and the access glance card. */
export interface ProfileHeader {
  name: string;
  initials: string;
  designation: string;
  reference: string;
  organisation: string;
  email: string;
  primaryRole: string;
  primaryRoleNote: string;
  scopeNote: string;
}

const TABS: { id: ProfileTab; label: string; icon: string; count?: number }[] = [
  { id: 'overview', label: 'Overview', icon: 'user' },
  { id: 'access', label: 'Access', icon: 'shield', count: 1 },
  { id: 'security', label: 'Security', icon: 'lock' }
];

const PROTECT_TIPS = ['Use a second verification method', 'Store recovery codes securely', 'Review unfamiliar sessions'];

/** Feather-style 24x24 line paths used by the page. */
const ICON_PATHS: Record<string, string> = {
  appearance: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 2v20 M2 12h20',
  edit: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  pencil: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4 M12 15v3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  building: 'M4 21V5l8-3 8 3v16 M2 21h20 M8 8h1 M15 8h1 M8 12h1 M15 12h1 M10 21v-5h4v5',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  plus: 'M12 5v14 M5 12h14',
  tick: 'M20 6 9 17l-5-5',
  arrow: 'M5 12h14 M12 5l7 7-7 7',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  devices: 'M3 4h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M6 18h7 M9.5 14v4 M18 9h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z'
};

const BLANK: IamUser = {
  id: '', ref: '', name: '', email: '', username: '', preferredName: '', mobile: '', role: '', unit: '', department: '',
  designation: '', manager: '', status: 'active', invitation: 'Accepted', mfaEnrolled: false, dataScope: '', accessFrom: '', lastSignIn: ''
};

const dateOrNull = (iso?: string | null): string | null => (iso ? fmtDate(iso) : null);

@Component({
  selector: 'app-profile',
  imports: [NgTemplateOutlet],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private readonly theme = inject(ThemeSettingsService);
  private readonly router = inject(Router);
  private readonly users = inject(UserDirectoryApiService);
  private readonly security = inject(SecurityApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly geo = inject(GeoMasterService);

  /** Person opened from the Users drawer's "Full profile" button; null means the signed-in account. */
  private readonly passed: IamUser | null =
    (this.router.getCurrentNavigation()?.extras.state as { user?: IamUser } | null | undefined)?.user ?? null;
  private readonly isSelf = !this.passed;

  private readonly detail = signal<UserDetailResponse | null>(null);
  private readonly sec = signal<UserSecurityResponse | null>(null);
  readonly loadError = signal('');

  ngOnInit(): void {
    this.loadData();
    this.geo.getTimeZoneOptions().subscribe({ next: (z) => this.tzList.set(z.map((t) => t.ianaKey)), error: () => undefined });
    this.geo.getLanguageOptions().subscribe({ next: (l) => this.langList.set(l.map((x) => x.cultureCode)), error: () => undefined });
  }

  private loadData(): void {
    const detail$ = this.passed ? this.users.getUser(this.passed.id) : this.users.getMyProfile();
    detail$.subscribe({
      next: (d) => {
        this.detail.set(d);
        if (!this.isSelf && d.id) this.security.getUserSecurity(d.id).subscribe({ next: (x) => this.sec.set(x), error: () => undefined });
      },
      error: () => this.loadError.set('The profile could not be loaded.'),
    });
    if (this.isSelf) this.security.getMySecurity().subscribe({ next: (x) => this.sec.set(x), error: () => undefined });
  }

  // ---------- edit profile ----------
  readonly editOpen = signal(false);
  readonly saving = signal(false);
  readonly editTried = signal(false);
  readonly serverErrors = signal<Record<string, string>>({});
  readonly editReason = signal('');
  readonly form = signal({
    title: '', displayName: '', preferredName: '', mobileCountryCode: '', mobileNumber: '',
    designation: '', workLocation: '', preferredCulture: '', timeZone: ''
  });
  private readonly tzList = signal<string[]>([]);
  private readonly langList = signal<string[]>([]);

  /** Options always include the stored value, so opening the dialog never drops it. */
  get timeZones(): string[] { const c = this.form().timeZone; const l = this.tzList(); return c && !l.includes(c) ? [c, ...l] : l; }
  get languages(): string[] { const c = this.form().preferredCulture; const l = this.langList(); return c && !l.includes(c) ? [c, ...l] : l; }

  readonly formErrors = computed(() => {
    const f = this.form();
    const e: Record<string, string> = {};
    if (f.displayName.trim().length < 2) e['displayName'] = 'Enter your display name.';
    const code = f.mobileCountryCode.trim();
    if (f.mobileNumber.trim() && !/^\+?\d{1,4}$/.test(code)) e['mobileNumber'] = 'Add the country code for this number, for example +91.';
    if (f.mobileNumber.trim() && !/^\d{6,15}$/.test(f.mobileNumber.replace(/[\s-]/g, ''))) e['mobileNumber'] = 'Enter a valid mobile number.';
    if (this.editReason().trim().length < 10) e['reason'] = 'Give a reason of at least 10 characters.';
    return { ...e, ...this.serverErrors() };
  });

  protected openEdit(): void {
    const d = this.detail();
    if (!d) { this.toast.show('Profile not ready', 'The profile is still loading. Try again in a moment.', 'info'); return; }
    this.form.set({
      title: d.title ?? '', displayName: d.displayName ?? '', preferredName: d.preferredName ?? '',
      mobileCountryCode: d.mobileCountryCode ?? '', mobileNumber: d.mobileNumber ?? '', designation: d.designation ?? '',
      workLocation: d.workLocation ?? '', preferredCulture: d.preferredCulture ?? '', timeZone: d.timeZone ?? ''
    });
    this.editReason.set('');
    this.editTried.set(false);
    this.serverErrors.set({});
    this.editOpen.set(true);
    setTimeout(() => document.querySelector<HTMLElement>('.pf-dlg input')?.focus());
  }

  protected closeEdit(): void { if (!this.saving()) this.editOpen.set(false); }

  protected setField(key: keyof ReturnType<typeof this.form>, value: string): void {
    this.serverErrors.set({});
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void { if (this.editOpen()) this.closeEdit(); }

  protected saveEdit(): void {
    this.editTried.set(true);
    const d = this.detail();
    if (!d?.id || this.saving()) return;
    if (Object.keys(this.formErrors()).length) {
      this.toast.show('Check the highlighted fields', 'Please correct the fields marked below.', 'warning');
      return;
    }
    const f = this.form();
    const number = f.mobileNumber.trim();
    // Optional text goes as '' when emptied (never null): null means "leave alone", '' means "clear".
    const common = {
      expectedVersion: d.version ?? 0,
      displayName: f.displayName.trim(), title: f.title.trim(), preferredName: f.preferredName.trim(),
      mobileCountryCode: number ? f.mobileCountryCode.trim() : '', mobileNumber: number,
      designation: f.designation.trim(), workLocation: f.workLocation.trim(),
      preferredCulture: f.preferredCulture.trim(), timeZone: f.timeZone.trim(), reason: this.editReason().trim()
    };
    this.saving.set(true);
    // Own record: PUT /my-profile (no permission or organisation needed). Somebody else's: PUT /users/{id}.
    const request = this.isSelf
      ? this.users.updateMyProfile(common)
      : this.users.updateUser(d.id, {
          ...common, firstName: d.firstName, middleName: d.middleName, lastName: d.lastName, employeeNumber: d.employeeNumber,
          organisationUnitId: d.organisationUnitId ?? null, departmentId: d.departmentId ?? null, managerUserId: d.managerUserId ?? null
        });
    request.subscribe({
      next: (outcome) => {
        this.saving.set(false);
        this.editOpen.set(false);
        this.toast.show('Profile updated', outcome?.message ?? 'The changes have been saved.', 'success');
        this.loadData();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        const fields = apiFieldErrors(e);
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(fields)) mapped[k.charAt(0).toLowerCase() + k.slice(1)] = v;
        this.serverErrors.set(mapped);
        this.toast.show('Could not save the changes', Object.values(mapped).join(' ') || apiErrorMessage(e, 'The profile could not be saved.'), 'error');
      }
    });
  }

  private readonly userC = computed<IamUser>(() => {
    const d = this.detail();
    const base = this.passed ?? BLANK;
    if (!d) {
      const me = this.auth.user();
      return this.passed ? base : { ...BLANK, name: me?.name ?? '', email: me?.email ?? '' };
    }
    const list = toIamUser({
      id: d.id, code: d.code, displayName: d.displayName, preferredName: d.preferredName, email: d.email, username: d.username,
      status: d.status, departmentName: d.departmentName, organisationUnitName: d.organisationUnitName, designation: d.designation,
      roleNames: (d.roles ?? []).map((r) => r.roleName ?? ''), mfaEnabled: d.mfaEnabled, lastLoginAtUtc: d.lastLoginAtUtc,
    });
    return {
      ...mergeDetail(list, d),
      dataScope: d.dataScopes?.[0]?.displayLabel ?? d.dataScopes?.[0]?.scopeTypeDisplay ?? 'Whole organisation',
      invitation: d.hasPendingInvitation ? 'Pending' : 'Accepted',
    };
  });
  /** Template reads `viewed` for the reference line and the "sample" suffixes. */
  get viewed(): IamUser { return this.userC(); }

  private readonly orgName = computed(() => this.auth.user()?.org ?? '');
  private readonly roleList = computed(() => this.detail()?.roles ?? []);

  private readonly profileC = computed<ProfileHeader>(() => {
    const u = this.userC();
    return {
      name: u.name, initials: initialsOf(u.name || ' '), designation: u.designation || '—', reference: u.ref,
      organisation: this.orgName(), email: u.email, primaryRole: u.role || '—', primaryRoleNote: u.dataScope,
      scopeNote: u.dataScope.toLowerCase()
    };
  });
  get profile(): ProfileHeader { return this.profileC(); }

  get heroStatus(): string { return USER_STATUS_LABEL[this.userC().status]; }
  get heroTone(): string { return this.userC().status === 'active' ? 'green' : ''; }
  protected readonly tabs = TABS;

  private readonly statsC = computed<StatCell[]>(() => {
    const u = this.userC();
    const fields = this.allFieldsC();
    const filled = fields.filter((f) => f.value !== null).length;
    const n = this.roleList().length;
    return [
      { icon: 'user', label: 'Profile completeness', value: `${filled} of ${fields.length} fields` },
      { icon: 'shield', label: 'Assigned roles', value: `${n} ${n === 1 ? 'role' : 'roles'}` },
      { icon: 'lock', label: 'Two-step verification', value: u.mfaEnrolled ? 'Enrolled' : 'Not enrolled', tone: u.mfaEnrolled ? undefined : 'amber' },
      { icon: 'clock', label: 'Last sign-in', value: u.lastSignIn ? fmtDate(u.lastSignIn) : 'Never signed in' }
    ];
  });
  get stats(): StatCell[] { return this.statsC(); }

  private readonly identityLeftC = computed<FieldRow[]>(() => {
    const u = this.userC(); const d = this.detail();
    return [
      { label: 'Display name', value: u.name || null },
      { label: 'Preferred name', value: u.preferredName || null },
      { label: 'Employee ID', value: d?.employeeNumber || null },
      { label: 'Username', value: u.username || null, mono: true }
    ];
  });
  private readonly identityRightC = computed<FieldRow[]>(() => {
    const u = this.userC(); const d = this.detail();
    return [
      { label: 'Contact email', value: u.email || null },
      { label: 'Mobile number', value: u.mobile || null },
      { label: 'Language', value: d?.preferredCulture || null },
      { label: 'Time zone', value: d?.timeZone || null }
    ];
  });
  private readonly orgLeftC = computed<FieldRow[]>(() => {
    const u = this.userC();
    return [
      { label: 'Organisation', value: this.orgName() || null },
      { label: 'Business unit', value: u.unit || null },
      { label: 'Department', value: u.department || null }
    ];
  });
  private readonly orgRightC = computed<FieldRow[]>(() => {
    const u = this.userC(); const d = this.detail();
    return [
      { label: 'Designation', value: u.designation || null },
      { label: 'Reports to', value: u.manager || null },
      { label: 'Joined on', value: dateOrNull(d?.joinedOn) }
    ];
  });
  get identityLeft(): FieldRow[] { return this.identityLeftC(); }
  get identityRight(): FieldRow[] { return this.identityRightC(); }
  get orgLeft(): FieldRow[] { return this.orgLeftC(); }
  get orgRight(): FieldRow[] { return this.orgRightC(); }

  private readonly assignedRolesC = computed<AssignedRole[]>(() => {
    const scope = this.userC().dataScope;
    return this.roleList().map((r) => ({
      name: r.roleName ?? r.roleCode ?? '',
      note: r.isPrimary ? 'Primary assignment' : 'Additional assignment',
      scope: this.orgName(),
      scopeNote: scope,
      permissions: r.permissionCount !== undefined ? `${r.permissionCount} permissions` : 'Not loaded',
      term: r.effectiveToUtc ? 'Until ' + fmtDate(r.effectiveToUtc) : 'Permanent'
    }));
  });
  protected get assignedRoles(): AssignedRole[] { return this.assignedRolesC(); }

  private readonly assignmentStepsC = computed<AssignmentStep[]>(() => {
    const u = this.userC();
    const first = this.roleList()[0];
    return [
      { title: 'Granted by an administrator', detail: first?.assignedByName ? `${u.role} assigned by ${first.assignedByName}.` : `${u.role || 'Role'} assigned by an administrator.` },
      { title: 'Scope of this assignment', detail: `${u.dataScope || 'Whole organisation'} scope · ${u.unit || this.orgName()}.` },
      { title: u.invitation === 'Accepted' ? 'Invitation accepted' : `Invitation ${u.invitation.toLowerCase()}`, detail: u.accessFrom ? `Access from ${fmtDate(u.accessFrom)}.` : 'Access window not set.' }
    ];
  });
  protected get assignmentSteps(): AssignmentStep[] { return this.assignmentStepsC(); }

  private readonly signInRowsC = computed<SecurityRow[]>(() => {
    const u = this.userC(); const s = this.sec();
    return [
      { icon: 'mail', title: 'Sign-in email', detail: u.email, chip: 'Managed identity' },
      { icon: 'shield', title: 'Two-step verification', detail: u.mfaEnrolled ? 'Enrolled · a second factor protects every sign-in.' : 'Not enrolled · a second verification method adds protection at sign-in.', action: 'View setup steps' },
      { icon: 'lock', title: 'Password', detail: s?.passwordChangedAtUtc ? 'Last changed ' + fmtDate(s.passwordChangedAtUtc) : 'Password age has not been loaded.', action: 'View password flow' },
      { icon: 'shield', title: 'Lockout state', detail: s ? (s.isLockedOut ? 'Locked out' + (s.lockoutReason ? ' · ' + s.lockoutReason : '') : `${s.accessFailedCount ?? 0} failed sign-ins · ${s.attemptsRemaining ?? 0} attempts left`) : 'The account lockout status is currently unavailable.', chip: s ? (s.isLockedOut ? 'Locked' : 'Clear') : 'Not loaded' }
    ];
  });
  protected get signInRows(): SecurityRow[] { return this.signInRowsC(); }

  private readonly sessionRowsC = computed<SecurityRow[]>(() =>
    (this.sec()?.activeSessions ?? []).map((x) => ({
      icon: 'devices', title: x.deviceName || [x.browser, x.operatingSystem].filter(Boolean).join(' · ') || 'Session',
      detail: [x.operatingSystem, x.browser].filter(Boolean).join(' · '),
      extra: x.issuedAtUtc ? 'Started ' + fmtDate(x.issuedAtUtc) : undefined,
      ...(x.isCurrent ? { chip: 'Current', chipTone: 'primary' as const } : { action: 'View revoke flow' })
    })));
  protected get sessionRows(): SecurityRow[] { return this.sessionRowsC(); }
  protected readonly protectTips = PROTECT_TIPS;

  /** Opens the shared Appearance studio popup (the app shell hosts it, so it opens on any page). */
  protected openStudio(): void {
    this.theme.studioOpen.set(true);
  }

  /** Selected avatar image src, or null when initials are used. */
  protected readonly avatarSrc = computed<string | null>(
    () => (this.isSelf ? profileImageSrc(this.theme.prefs().profileImage) : null)
  );

  /** Same avatar as a CSS background value. */
  protected readonly avatarBg = computed<string | null>(() => {
    const src = this.avatarSrc();
    return src ? `url("${src}") center / cover no-repeat` : null;
  });

  /** Every profile field, used for the "Complete your profile" card. */
  private readonly allFieldsC = computed<FieldRow[]>(() =>
    [...this.identityLeftC(), ...this.identityRightC(), ...this.orgLeftC(), ...this.orgRightC()]);

  protected readonly completeness = computed(() => {
    const all = this.allFieldsC();
    const total = all.length;
    const missing = all.filter((f) => f.value === null).map((f) => f.label);
    const filled = total - missing.length;
    return {
      filled,
      total,
      percent: Math.round((filled / total) * 100),
      shown: missing.slice(0, 4),
      more: Math.max(missing.length - 4, 0)
    };
  });

  readonly tab = signal<ProfileTab>('overview');

  readonly roleQuery = signal('');

  readonly visibleRoles = computed(() => {
    const q = this.roleQuery().trim().toLowerCase();
    return this.assignedRolesC().filter((r) => !q || [r.name, r.note, r.scope, r.scopeNote].some((v) => v.toLowerCase().includes(q)));
  });

  setTab(tab: ProfileTab): void {
    this.tab.set(tab);
  }

  setRoleQuery(value: string): void {
    this.roleQuery.set(value);
  }

  /** Left and right columns zipped into rows, so both sides share one row height. */
  pairs(left: FieldRow[], right: FieldRow[]): [FieldRow | null, FieldRow | null][] {
    const n = Math.max(left.length, right.length);
    return Array.from({ length: n }, (_, i) => [left[i] ?? null, right[i] ?? null]);
  }

  iconPath(name: string): string {
    return ICON_PATHS[name] ?? '';
  }
}
