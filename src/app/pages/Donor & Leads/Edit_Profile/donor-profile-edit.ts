import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DonorApiService } from '../../../Service/donor-api.service';
import { DonorDetail } from '../../../Shared/models/donor-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

export type DonorType = 'Individual' | 'Organisation' | 'Anonymous';
export type PeField = 'type' | 'firstName' | 'lastName' | 'phone' | 'language' | 'mayContact' | 'owner';
type PeMenu = 'language' | 'owner' | null;

export interface PeProfile {
  type: DonorType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: string;
  mayContact: boolean;
  owner: string;
}

export interface PeChange { key: PeField; label: string; from: string; to: string; }

export const DONOR_TYPES: { key: DonorType; hint: string }[] = [
  { key: 'Individual', hint: 'A person' },
  { key: 'Organisation', hint: 'Company, trust or group' },
  { key: 'Anonymous', hint: 'Name hidden on receipts' }
];

export const PE_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'ur-IN', label: 'Urdu' }
];

/** Owners the caller may assign - filled in place from the API. */
export const PE_OWNERS: { name: string; role: string }[] = [];

const FIELD_LABELS: Record<PeField, string> = {
  type: 'Donor type',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  language: 'Preferred language',
  mayContact: 'Contact permission',
  owner: 'Owner'
};

export const REASON_MIN = 10;

const BLANK: PeProfile = {
  type: 'Individual', firstName: '', lastName: '', email: '', phone: '', language: 'en-IN', mayContact: true, owner: ''
};

const ICONS: Record<string, string> = {
  back: 'M19 12H5 M12 19l-7-7 7-7',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
  x: 'M18 6 6 18 M6 6l12 12',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
  chev: 'M6 9l6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  undo: 'M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  review: 'M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'
};

@Component({
  selector: 'app-donor-profile-edit',
  standalone: true,
  imports:[PageHeader],
  templateUrl: './donor-profile-edit.html',
  styleUrl: './donor-profile-edit.css'
})
export class DonorProfileEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DonorApiService);
  private detail: DonorDetail | null = null;
  private readonly ownerIds = new Map<string, string>();
  protected readonly loading = signal(false);

  protected readonly profilePath = '/app/fundraising/relationships/donor-360';
  protected readonly types = DONOR_TYPES;
  protected readonly languages = PE_LANGUAGES;
  protected readonly reasonMin = REASON_MIN;

  protected readonly code = this.route.snapshot.queryParamMap.get('ref') ?? '';
  private readonly statusSig = signal('');
  private readonly updatedSig = signal('');
  protected get status(): string { return this.statusSig(); }
  protected get updated(): string { return this.updatedSig(); }

  protected readonly original = signal<PeProfile>({ ...BLANK });
  /** Values being edited. */
  protected readonly form = signal<PeProfile>({ ...BLANK });

  protected readonly reason = signal('');
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly menu = signal<PeMenu>(null);
  protected readonly ownerQuery = signal('');
  protected readonly confirmLeave = signal(false);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loading.set(true);
    forkJoin([
      this.api.searchDonors({ search: this.code, pageSize: 10 }),
      this.api.getAssignableOwners()
    ]).subscribe({
      next: ([page, owners]) => {
        PE_OWNERS.length = 0;
        this.ownerIds.clear();
        for (const o of owners) { PE_OWNERS.push({ name: o.label, role: o.description ?? '' }); this.ownerIds.set(o.label, o.value); }
        const hit = page.items.find((x) => x.displayCode === this.code) ?? page.items[0];
        if (!hit) { this.loading.set(false); this.flash('That donor could not be found.'); return; }
        this.api.getDonor(hit.id).subscribe({
          next: (d) => { this.apply(d); this.loading.set(false); },
          error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); }
        });
      },
      error: (e: unknown) => { this.loading.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  private apply(d: DonorDetail): void {
    this.detail = d;
    const org = d.donorType === 'Organisation';
    const p: PeProfile = {
      type: (['Individual', 'Organisation', 'Anonymous'].includes(d.donorType) ? d.donorType : 'Individual') as DonorType,
      firstName: org ? (d.organisationName ?? d.displayName) : (d.firstName ?? ''),
      lastName: org ? '' : (d.lastName ?? ''),
      email: d.primaryEmail ?? '',
      phone: d.primaryPhone ?? '',
      language: d.preferredLanguage || 'en-IN',
      mayContact: !d.doNotContact,
      owner: d.relationshipOwnerName ?? ''
    };
    this.statusSig.set(d.status);
    this.updatedSig.set(new Date(d.updatedAtUtc ?? d.createdAtUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
    this.original.set(p);
    this.form.set({ ...p });
  }

  /* ---------- derived ---------- */
  protected readonly fullName = computed(() => {
    const f = this.original();
    return `${f.firstName} ${f.lastName}`.trim();
  });
  protected readonly initials = computed(() =>
    this.fullName().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  );

  protected readonly changes = computed<PeChange[]>(() => {
    const a = this.original();
    const b = this.form();
    const keys: PeField[] = ['type', 'firstName', 'lastName', 'phone', 'language', 'mayContact', 'owner'];
    return keys
      .filter((k) => this.norm(a[k]) !== this.norm(b[k]))
      .map((k) => ({ key: k, label: FIELD_LABELS[k], from: this.show(k, a[k]), to: this.show(k, b[k]) }));
  });
  protected readonly dirty = computed(() => this.changes().length > 0);
  protected readonly changeSummary = computed(() => this.changes().map((c) => c.label).join(', '));

  protected readonly errors = computed(() => {
    const f = this.form();
    const e: Partial<Record<PeField | 'reason', string>> = {};
    if (!f.firstName.trim()) e.firstName = f.type === 'Organisation' ? 'Enter the organisation name.' : 'Enter a first name.';
    const digits = f.phone.replace(/[\s-]/g, '');
    if (digits && !/^\+?\d{8,15}$/.test(digits)) e.phone = 'Use 8–15 digits, with an optional + prefix.';
    if (this.reason().trim().length < REASON_MIN) e.reason = `Write at least ${REASON_MIN} characters.`;
    return e;
  });
  protected readonly reasonLen = computed(() => this.reason().trim().length);
  protected readonly canSave = computed(() => this.dirty() && !Object.keys(this.errors()).length && !this.saving());

  protected readonly languageLabel = computed(() => this.langName(this.form().language));
  protected readonly ownerOptions = computed(() => {
    const q = this.ownerQuery().trim().toLowerCase();
    return PE_OWNERS.filter((o) => !q || o.name.toLowerCase().includes(q) || o.role.toLowerCase().includes(q));
  });
  protected readonly ownerRole = computed(() => PE_OWNERS.find((o) => o.name === this.form().owner)?.role ?? '');

  /** Section → number of edited fields in it (for the small counter next to each section title). */
  protected readonly sectionEdits = computed(() => {
    const c = new Set(this.changes().map((x) => x.key));
    const n = (keys: PeField[]) => keys.filter((k) => c.has(k)).length;
    return {
      identity: n(['type', 'firstName', 'lastName']),
      contact: n(['phone', 'language', 'mayContact']),
      owner: n(['owner'])
    };
  });

  /* ---------- helpers ---------- */
  icon(n: string): string { return ICONS[n] ?? ''; }
  isEdited(k: PeField): boolean { return this.changes().some((c) => c.key === k); }
  showError(k: PeField | 'reason'): string {
    const m = this.errors()[k];
    if (!m) return '';
    if (k === 'reason') return this.tried() ? m : '';
    return this.tried() || this.isEdited(k as PeField) ? m : '';
  }
  langName(code: string): string { return PE_LANGUAGES.find((l) => l.code === code)?.label ?? code; }
  ownerInitials(name: string): string { return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(); }

  private norm(v: unknown): string { return typeof v === 'string' ? v.trim() : String(v); }
  private show(k: PeField, v: unknown): string {
    if (k === 'language') return this.langName(String(v));
    if (k === 'mayContact') return v ? 'May be contacted' : 'Do not contact';
    const s = String(v).trim();
    return s || '—';
  }

  /* ---------- editing ---------- */
  set<K extends keyof PeProfile>(k: K, v: PeProfile[K]): void {
    this.form.update((f) => ({ ...f, [k]: v }));
  }
  text(k: 'firstName' | 'lastName' | 'phone', e: Event): void {
    this.set(k, (e.target as HTMLInputElement).value);
  }
  setReason(e: Event): void { this.reason.set((e.target as HTMLTextAreaElement).value); }

  toggleMenu(m: Exclude<PeMenu, null>, e: Event): void {
    e.stopPropagation();
    this.ownerQuery.set('');
    this.menu.set(this.menu() === m ? null : m);
  }
  pickLanguage(code: string): void { this.set('language', code); this.menu.set(null); }
  pickOwner(name: string): void { this.set('owner', name); this.menu.set(null); }
  setOwnerQuery(e: Event): void { this.ownerQuery.set((e.target as HTMLInputElement).value); }

  /* ---------- leave / save ---------- */
  back(): void {
    if (this.dirty() && !this.saving()) { this.confirmLeave.set(true); return; }
    this.leave();
  }
  leave(): void {
    this.confirmLeave.set(false);
    this.router.navigate([this.profilePath], { queryParams: { ref: this.code } });
  }

  save(): void {
    this.tried.set(true);
    if (!this.canSave()) {
      if (!this.dirty()) this.flash('Nothing has changed yet.');
      return;
    }
    this.saving.set(true);
    const f = this.form();
    const org = f.type === 'Organisation';
    const ownerChanged = this.changes().some((c) => c.key === 'owner');
    this.api.correctDonor(this.detail!.id, {
      donorType: f.type,
      firstName: org ? null : f.firstName.trim(),
      lastName: org ? null : f.lastName.trim(),
      organisationName: org ? f.firstName.trim() : null,
      primaryPhone: f.phone.trim() || null,
      preferredLanguage: f.language,
      doNotContact: !f.mayContact,
      ...(ownerChanged && this.ownerIds.get(f.owner)
        ? { relationshipOwnerUserId: this.ownerIds.get(f.owner)!, relationshipOwnerName: f.owner } : {}),
      correctionReason: this.reason().trim(),
      expectedVersion: this.detail!.version
    }).subscribe({
      next: (d) => {
        this.apply(d);
        this.reason.set('');
        this.tried.set(false);
        this.saving.set(false);
        this.flash('Profile saved. The correction is in the audit trail.');
      },
      error: (e: unknown) => { this.saving.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menu()) { this.menu.set(null); return; }
    if (this.confirmLeave()) this.confirmLeave.set(false);
  }
}