import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { OrgSummary, Row, WebAddress, HistoryEntry, Tone } from '../../../Shared/Organization/organisation-profile.data';
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
const monthYear = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};
const STATUS_TONE: Partial<Record<TenantStatus, Tone>> = {
  active: 'success', approved: 'success', invited: 'info', invitationAccepted: 'info', submitted: 'warning',
  underReview: 'warning', resubmitted: 'warning', rejected: 'warning', suspended: 'warning'
};
const spaced = (v: string): string => v.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
const extOf = (name: string): string => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** first 8 hex characters of the file's SHA-256 (empty when the browser cannot hash) */
const checksum = async (f: File): Promise<string> => {
  try {
    if (!globalThis.crypto?.subtle) return '';
    const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
    return Array.from(new Uint8Array(buf).slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
};

type TabKey = 'profile' | 'documents' | 'review' | 'web' | 'history';

interface TabDef { key: TabKey; label: string; icon: string; }

interface Check {
  no: string;
  title: string;
  detail: string;
  state: 'ok' | 'warn' | 'info';
  /** what the button on the row does */
  act?: 'edit' | 'upload' | 'web';
  action?: string;
  actionIcon?: string;
}

type SubStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

interface SubFile {
  id: string;
  name: string;
  ext: string;
  size: number;
  checksum: string;
  by: string;
  isImage: boolean;
  /** object URL for files added in this session (view / download) */
  url?: string;
}

/** one document set: a type, a title and its files */
interface Submission {
  id: string;
  type: string;
  title: string;
  note: string;
  status: SubStatus;
  files: SubFile[];
  by: string;
  submittedAt?: string;
  /** created on this page (not yet stored on the server) */
  local: boolean;
}

const ALL_TABS: TabDef[] = [
  { key: 'profile', label: 'Profile', icon: 'profile' },
  { key: 'documents', label: 'Documents', icon: 'paperclip' },
  { key: 'review', label: 'Review & submit', icon: 'send' },
  { key: 'web', label: 'Web addresses', icon: 'globe' },
  { key: 'history', label: 'History', icon: 'history' }
];

const ACCEPT = ['doc', 'docx', 'jpeg', 'jpg', 'pdf', 'png', 'webp', 'xls', 'xlsx'];
const IMAGE = ['jpeg', 'jpg', 'png', 'webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const DOC_TYPES = [
  'Registration certificate', 'Trust deed / MoA', 'PAN card', 'GST certificate',
  '12A certificate', '80G certificate', 'Address proof', 'Bank proof', 'Other'
];

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
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  profile: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  paperclip: 'm21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.3l7.9-8',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
  hash: 'M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18',
  building: 'M3 21h18 M5 21V7l7-4 7 4v14 M9 10h1 M14 10h1 M9 14h1 M14 14h1 M10 21v-3h4v3',
  calendar: 'M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16v-5 M12 8h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  list: 'M4 6l1.5 1.5L8 5 M4 13l1.5 1.5L8 12 M11 6h9 M11 13h9 M11 19h9 M5 19h1',
  upload: 'M12 15V3 M7 8l5-5 5 5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  cloud: 'M12 13v8 M8 17l4-4 4 4 M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3',
  folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14 M10 11v6 M14 11v6',
  x: 'M18 6 6 18 M6 6l12 12',
  chevron: 'm6 9 6 6 6-6'
};

/** Organisation — heading with facts, then one card: tabs (Profile, Documents, Review & submit,
 *  Web addresses, History) with people / administrator / last updated on the right.
 *  Review & submit is hidden once the organisation is active. */
@Component({
  selector: 'app-iam-organisation',
  templateUrl: './organisation-profile.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './organisation-profile.css']
})
export class OrganisationProfile implements OnInit, OnDestroy {
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

  ngOnDestroy(): void {
    for (const s of this.localSubs()) this.revoke(s.files);
    this.revoke(this.cFiles());
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

  /** "Oct 2026" for the heading */
  get sinceMonth(): string { return monthYear(this.d()?.createdAtUtc); }

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

  // ---------------- status ----------------
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

  // ---------------- tabs ----------------
  /** Review & submit is not needed once the organisation is active */
  readonly tabs = computed<TabDef[]>(() => ALL_TABS.filter((t) => t.key !== 'review' || this.status() !== 'active'));

  private readonly tab = signal<TabKey>('profile');

  /** the tab on screen (falls back to Profile if the picked tab is hidden) */
  readonly current = computed<TabKey>(() => (this.tabs().some((t) => t.key === this.tab()) ? this.tab() : 'profile'));

  /** small number shown next to a tab (documents only, hidden when 0) */
  tabCount(key: TabKey): number | null {
    return key === 'documents' && this.submissions().length ? this.submissions().length : null;
  }

  select(key: TabKey): void {
    this.tab.set(key);
  }

  // ---------------- documents ----------------
  readonly docTypes = DOC_TYPES;
  readonly acceptAttr = ACCEPT.map((e) => '.' + e).join(',');
  readonly acceptLabel = ACCEPT.map((e) => e.toUpperCase()).join(', ');

  /** documents already stored on the server, grouped by type into sets */
  private readonly serverSubs = computed<Submission[]>(() => {
    const s = this.status();
    const status: SubStatus = s === 'active' ? 'approved' : s === 'rejected' ? 'rejected' : 'submitted';
    const groups = new Map<string, Submission>();
    for (const x of this.d()?.documents ?? []) {
      const type = x.documentTypeDisplay || spaced(x.documentType ?? '') || 'Document';
      let set = groups.get(type);
      if (!set) {
        set = { id: 'srv-' + type, type, title: type, note: '', status, files: [], by: '', submittedAt: undefined, local: false };
        groups.set(type, set);
      }
      const name = x.fileName ?? '';
      const ext = extOf(name);
      set.files.push({ id: set.id + '-' + set.files.length, name, ext, size: x.fileSizeBytes ?? 0, checksum: '', by: '', isImage: IMAGE.includes(ext) });
      const at = x.uploadedAtUtc ?? undefined;
      if (at && (!set.submittedAt || at > set.submittedAt)) set.submittedAt = at;
    }
    return [...groups.values()];
  });

  /** sets started on this page */
  readonly localSubs = signal<Submission[]>([]);

  readonly submissions = computed<Submission[]>(() => [...this.localSubs(), ...this.serverSubs()]);
  readonly awaiting = computed(() => this.submissions().filter((s) => s.status === 'submitted').length);

  // new submission: one panel — pick a type, add files, send
  readonly composeOpen = signal(false);
  readonly cType = signal('');
  readonly cTitle = signal('');
  readonly cNote = signal('');
  readonly cFiles = signal<SubFile[]>([]);
  readonly cTouched = signal(false);
  readonly dragOver = signal(false);

  /** uploading is closed once the organisation is active */
  readonly canUpload = computed(() => this.status() !== 'active');

  readonly composeReady = computed(() => !!this.cType() && this.cFiles().length > 0);

  /** what is still missing before the set can be sent, or a short "ready" line */
  readonly composeHint = computed(() => {
    const noType = !this.cType();
    const noFiles = !this.cFiles().length;
    if (noType && noFiles) return 'Pick a document type and add at least one file.';
    if (noType) return 'Pick a document type.';
    if (noFiles) return 'Add at least one file.';
    const n = this.cFiles().length;
    return n + (n === 1 ? ' file' : ' files') + ' ready · ' + this.fmtSize(this.cFiles().reduce((s, f) => s + f.size, 0));
  });

  openCompose(): void {
    if (!this.canUpload()) return;
    this.resetCompose();
    this.composeOpen.set(true);
  }

  cancelCompose(): void {
    this.revoke(this.cFiles());
    this.resetCompose();
    this.composeOpen.set(false);
  }

  private resetCompose(): void {
    this.cType.set('');
    this.cTitle.set('');
    this.cNote.set('');
    this.cFiles.set([]);
    this.cTouched.set(false);
    this.dragOver.set(false);
  }

  /** from Review & submit: go to Documents with the upload panel open */
  openUpload(): void {
    this.select('documents');
    if (this.canUpload() && !this.composeOpen()) this.openCompose();
  }

  onPick(input: HTMLInputElement): void {
    this.addFiles(input.files);
    input.value = '';
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    this.addFiles(e.dataTransfer?.files ?? null);
  }

  async addFiles(list: FileList | null): Promise<void> {
    if (!list?.length) return;
    const bad: string[] = [];
    const good: SubFile[] = [];
    for (const f of Array.from(list)) {
      const ext = extOf(f.name);
      if (!ACCEPT.includes(ext)) { bad.push(f.name + ' (type not allowed)'); continue; }
      if (f.size > MAX_BYTES) { bad.push(f.name + ' (over 5 MB)'); continue; }
      good.push({
        id: uid(), name: f.name, ext, size: f.size, checksum: await checksum(f), by: 'You',
        isImage: IMAGE.includes(ext), url: URL.createObjectURL(f)
      });
    }
    if (good.length) this.cFiles.update((l) => [...l, ...good]);
    if (bad.length) this.toast.error('Some files were not added', bad.join(', '));
  }

  removeFile(f: SubFile): void {
    this.revoke([f]);
    this.cFiles.update((l) => l.filter((x) => x.id !== f.id));
  }

  viewFile(f: SubFile): void {
    if (f.url) window.open(f.url, '_blank', 'noopener');
  }

  downloadFile(f: SubFile): void {
    if (!f.url) return;
    const a = document.createElement('a');
    a.href = f.url;
    a.download = f.name;
    a.click();
  }

  /** send the panel's files as one set */
  submitCompose(): void {
    this.cTouched.set(true);
    if (!this.canUpload() || !this.composeReady()) return;
    const type = this.cType();
    // TODO: upload the files and submit this set through the documents API
    this.localSubs.update((list) => [{
      id: uid(), type, title: this.cTitle().trim() || type, note: this.cNote().trim(), status: 'submitted',
      files: this.cFiles(), by: 'You', submittedAt: new Date().toISOString(), local: true
    }, ...list]);
    this.cFiles.set([]); // the files now belong to the set, so their links stay open
    this.resetCompose();
    this.composeOpen.set(false);
  }

  subStatusLabel(s: SubStatus): string {
    return { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' }[s];
  }

  totalSize(s: Submission): number {
    return s.files.reduce((n, f) => n + f.size, 0);
  }

  exts(s: Submission): string {
    return [...new Set(s.files.map((f) => f.ext.toUpperCase()).filter(Boolean))].join(', ');
  }

  fmtSize(b: number): string {
    if (!b) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  fmtWhen(iso: string): string {
    const d = new Date(iso);
    return isNaN(+d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }

  private revoke(files: SubFile[]): void {
    for (const f of files) if (f.url) URL.revokeObjectURL(f.url);
  }

  // ---------------- review & submit ----------------
  /** reviewer note (max 500) */
  readonly maxNote = 500;
  readonly note = signal('');

  readonly checks = computed<Check[]>(() => {
    const d = this.d();
    const subs = this.submissions();
    const sentSets = subs.filter((s) => s.status !== 'draft' && s.files.length);
    const files = sentSets.reduce((n, s) => n + s.files.length, 0);
    const missing = d?.outstandingProfileFields?.length ?? 0;
    const web = this.webAddresses;
    return [
      d?.isProfileComplete === false
        ? { no: '01', title: 'Profile details', detail: missing + ' required field' + (missing === 1 ? '' : 's') + ' missing', state: 'warn', act: 'edit', action: 'Edit', actionIcon: 'edit' }
        : { no: '01', title: 'Profile details', detail: 'Complete', state: 'ok' },
      sentSets.length
        ? { no: '02', title: 'Supporting documents', detail: files + ' file' + (files === 1 ? '' : 's') + ' in ' + sentSets.length + ' set' + (sentSets.length === 1 ? '' : 's'), state: 'ok' }
        : { no: '02', title: 'Supporting documents', detail: 'None uploaded yet', state: 'warn', act: 'upload', action: 'Upload', actionIcon: 'upload' },
      web.length
        ? { no: '03', title: 'Web address', detail: web[0].address, state: 'ok' }
        : { no: '03', title: 'Web address', detail: 'Not added yet', state: 'warn', act: 'web', action: 'Add address', actionIcon: 'plus' },
      { no: '04', title: 'Current status', detail: this.statusLabel(), state: 'info' }
    ];
  });

  /** rows that still need attention */
  readonly pending = computed(() => this.checks().filter((c) => c.state === 'warn').length);

  runCheck(c: Check): void {
    switch (c.act) {
      case 'edit': this.edit(); break;
      case 'upload': this.openUpload(); break;
      case 'web': this.select('web'); break;
    }
  }

  icon(name: string): string {
    return ICONS[name] ?? IAM_ICONS[name] ?? '';
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