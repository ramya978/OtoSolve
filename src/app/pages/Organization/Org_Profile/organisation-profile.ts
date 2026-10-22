import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { OrgSummary, Row, OrgDocument, WebAddress, HistoryEntry, Tone } from '../../../Shared/Organization/organisation-profile.data';
import { OrgStore } from '../../../Shared/Organization/org.store';
import { OrganisationApiService } from '../../../Service/organisation-api.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { OrganisationDetailResponse, TenantStatus } from '../../../Shared/models/iam-contract.model';

const dmy = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const STATUS_TONE: Partial<Record<TenantStatus, Tone>> = {
  active: 'success', approved: 'success', invited: 'info', invitationAccepted: 'info', submitted: 'warning',
  underReview: 'warning', resubmitted: 'warning', rejected: 'warning', suspended: 'warning'
};
const spaced = (v: string): string => v.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

type TabKey = 'profile' | 'documents' | 'review' | 'web' | 'history';

interface TabDef { key: TabKey; label: string; }

interface Check {
  no: string;
  title: string;
  detail: string;
  state: 'ok' | 'warn';
  /** tab where the user can fix it */
  tab?: TabKey;
  /** button label shown when the check is not ready */
  action?: string;
}

/** icons this page needs that may not exist in IAM_ICONS (24x24, drawn with currentColor); IAM_ICONS is the fallback */
const ICONS: Record<string, string> = {
  docAlert: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v4 M12 17.5h.01',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  verified: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14 M5 12h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'
};

/** Organisation — Workspace Kit layout: heading, summary strip, and one card with tabs
 *  (Profile, Documents, Review & submit, Web addresses, History). */
@Component({
  selector: 'app-iam-organisation',
  templateUrl: './organisation-profile.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './organisation-profile.css']
})
export class OrganisationProfile implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(OrgStore);
  private readonly api = inject(OrganisationApiService);
  private readonly toast = inject(ToastService);

  readonly loading = this.store.loading;
  readonly sending = signal(false);
  private readonly d = computed<OrganisationDetailResponse | null>(() => this.store.detail());

  ngOnInit(): void {
    this.store.loadDetail(this.route.snapshot.queryParamMap.get('id')).subscribe({
      error: (e: unknown) => this.toast.error('Organisation not loaded', apiErrorMessage(e, 'The organisation could not be loaded.'))
    });
  }

  get org(): OrgSummary {
    const d = this.d();
    return {
      name: d?.name ?? '', verified: d?.status === 'active', code: d?.code ?? '', host: d?.hostName ?? '',
      type: d?.organisationType ?? '', since: dmy(d?.createdAtUtc), people: d?.userCount ?? 0, seats: d?.maximumUsers ?? 0,
      administrator: d?.primaryAdmin?.displayName ?? d?.contactPersonName ?? '', lastUpdated: dmy(d?.updatedAtUtc ?? d?.createdAtUtc),
      status: this.status(), statusLabel: this.statusLabel()
    };
  }

  get registration(): Row[] {
    const d = this.d();
    return [
      { label: 'Legal name', value: d?.legalName || d?.name || '' },
      { label: 'Type', value: d?.organisationType ?? '' },
      { label: 'Registration no.', value: d?.registrationNumber ?? '' },
      { label: 'Tax ID', value: d?.taxIdentificationNumber ?? '' },
      { label: 'PAN', value: d?.panNumber ?? '' },
      { label: 'GST', value: d?.gstNumber ?? '' },
      { label: 'Established', value: dmy(d?.establishedOn) },
      { label: 'Business unit', value: d?.businessUnitName ?? '' }
    ].map((r) => ({ ...r, value: r.value || '—' }));
  }

  get contact(): Row[] {
    const d = this.d();
    const phone = [d?.contactPhoneCountryCode, d?.contactPhone].filter(Boolean).join(' ');
    return [
      { label: 'Contact person', value: d?.contactPersonName ?? '' },
      { label: 'Telephone', value: phone, small: true },
      { label: 'E-mail', value: d?.contactEmail ?? '', small: true },
      { label: 'Website', value: d?.websiteUrl ?? '', small: true },
      { label: 'Time zone', value: d?.timeZone ?? '' },
      { label: 'Currency', value: d?.defaultCurrency ?? '' },
      { label: 'Language', value: d?.defaultCulture ?? '' }
    ].map((r) => ({ ...r, value: r.value || '—' }));
  }

  get address() {
    const d = this.d();
    return {
      line1: d?.addressLine1 ?? '', line2: d?.addressLine2 ?? '',
      city: [d?.city, d?.state].filter(Boolean).join(', '), postcode: d?.postalCode ?? '', country: d?.country ?? ''
    };
  }

  get about(): string { return this.d()?.description ?? ''; }

  get documents(): OrgDocument[] {
    return (this.d()?.documents ?? []).map((x) => ({
      name: x.fileName ?? '', kind: x.documentTypeDisplay || spaced(x.documentType ?? ''),
      uploaded: dmy(x.uploadedAtUtc), size: x.fileSizeBytes ? Math.max(1, Math.round(x.fileSizeBytes / 1024)) + ' KB' : ''
    }));
  }

  get webAddresses(): WebAddress[] {
    return (this.d()?.domains ?? []).filter((x) => x.isActive !== false).map((x) => ({
      address: x.hostName ?? '', kind: spaced(x.domainType ?? ''), primary: x.isPrimary === true, verifiedOn: x.isVerified ? dmy(x.verifiedAtUtc) || 'Verified' : ''
    }));
  }

  get history(): HistoryEntry[] {
    return [...(this.d()?.timeline ?? [])]
      .sort((a, b) => (b.occurredAtUtc ?? '').localeCompare(a.occurredAtUtc ?? ''))
      .map((t) => {
        const at = t.occurredAtUtc ? new Date(t.occurredAtUtc) : null;
        return {
          day: at ? at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
          time: at ? at.getFullYear() + ' · ' + at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
          label: t.toStatusDisplay || spaced(t.toStatus ?? ''),
          from: t.fromStatus ? spaced(t.fromStatus).toLowerCase() : undefined,
          by: t.actorDisplayName ?? '',
          tone: STATUS_TONE[t.toStatus as TenantStatus] ?? 'muted'
        };
      });
  }

  readonly tabs: TabDef[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'documents', label: 'Documents' },
    { key: 'review', label: 'Review & submit' },
    { key: 'web', label: 'Web addresses' },
    { key: 'history', label: 'History' }
  ];

  readonly tab = signal<TabKey>('profile');

  /** reviewer note (max 500) */
  readonly maxNote = 500;
  readonly note = signal('');
  readonly sent = signal(false);

  readonly status = computed<'draft' | 'submitted' | 'active' | 'rejected'>(() => {
    const t = this.d()?.status;
    if (t === 'active') return 'active';
    if (t === 'rejected') return 'rejected';
    if (t === 'submitted' || t === 'underReview' || t === 'resubmitted' || t === 'approved') return 'submitted';
    return 'draft';
  });
  readonly statusLabel = computed(() => (this.sent() ? 'Submitted' : this.d()?.statusDisplay || spaced(this.d()?.status ?? '')));
  readonly statusTone = computed(() => {
    if (this.sent()) return 'warning';
    const s = this.status();
    return s === 'active' ? 'success' : s === 'submitted' ? 'warning' : s === 'rejected' ? 'danger' : 'muted';
  });

  /** only a draft or a rejected organisation can be sent for approval */
  readonly canSend = computed(() => !this.sent() && (this.status() === 'draft' || this.status() === 'rejected'));

  get verifiedAddresses(): number { return this.webAddresses.filter((w) => !!w.verifiedOn).length; }

  readonly checks = computed<Check[]>(() => [
    this.d()?.isProfileComplete === false
      ? { no: '01', title: 'Profile details', detail: (this.d()?.outstandingProfileFields?.length ?? 0) + ' required fields missing', state: 'warn', tab: 'profile', action: 'Edit profile' }
      : { no: '01', title: 'Profile details', detail: 'All required fields are filled', state: 'ok' },
    this.documents.length
      ? { no: '02', title: 'Supporting documents', detail: this.documents.length + ' uploaded', state: 'ok' }
      : { no: '02', title: 'Supporting documents', detail: 'None uploaded yet', state: 'warn', tab: 'documents', action: 'View documents' },
    this.webAddresses.length
      ? { no: '03', title: 'Web address', detail: this.webAddresses[0].address, state: 'ok' }
      : { no: '03', title: 'Web address', detail: 'Not added yet', state: 'warn', tab: 'web', action: 'Add address' }
  ]);

  /** readiness: every check counts (current status is shown separately) */
  readonly readyTotal = computed(() => this.checks().length);
  readonly readyDone = computed(() => this.checks().filter((c) => c.state === 'ok').length);
  readonly readyPct = computed(() => Math.round((this.readyDone() / this.readyTotal()) * 100));

  icon(name: string): string {
    return ICONS[name] ?? IAM_ICONS[name] ?? '';
  }

  /** small number shown next to a tab */
  tabCount(key: TabKey): number | null {
    switch (key) {
      case 'documents': return this.documents.length;
      case 'web': return this.webAddresses.length;
      case 'history': return this.history.length;
      default: return null;
    }
  }

  select(key: TabKey): void {
    this.tab.set(key);
  }

  setNote(value: string): void {
    this.note.set(value.slice(0, this.maxNote));
  }

  send(): void {
    const d = this.d();
    if (!this.canSend() || !d || this.sending()) return;
    this.sending.set(true);
    this.api.submitMine({ expectedVersion: d.version, notes: this.note().trim() || undefined }).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
        this.store.loadDetail(this.route.snapshot.queryParamMap.get('id')).subscribe({ error: () => undefined });
      },
      error: (e: unknown) => {
        this.sending.set(false);
        this.toast.error('Not submitted', apiErrorMessage(e, 'The organisation could not be sent for approval.'));
      }
    });
  }

  /** open the edit page */
  edit(): void {
    this.router.navigateByUrl('/app/administration/organisation/details/edit');
  }
}