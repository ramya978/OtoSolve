import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IamDateRange, IamRange } from '../../../Shared/IAM/iam-date-range';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  AccessRequest, IAM_NOW, IamOption, REQUEST_STATUS_LABEL, RequestStatus,
  fmtDate, initialsOf
} from '../../../Shared/IAM/iam-data';
import { IamDirectoryStore } from '../../../Shared/IAM/iam-directory.store';
import { IamRolesStore } from '../../../Shared/IAM/iam-roles.store';
import { AccessRequestApiService } from '../../../Service/access-request-api.service';
import { fetchAllPages } from '../../../Shared/services/paging';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { AccessRequestListItemResponse, AccessRequestStatus } from '../../../Shared/models/iam-contract.model';

const STATUS_MAP: Record<AccessRequestStatus, RequestStatus> = {
  draft: 'pending', submitted: 'pending', returned: 'pending', approved: 'approved',
  rejected: 'rejected', withdrawn: 'withdrawn', expired: 'withdrawn'
};


interface RequestDraft {
  person: string;
  role: string;
  from: string;
  until: string;
  reason: string;
}

interface StatusTab { value: '' | RequestStatus; label: string; count: number; }

type Tone = 'success' | 'warning' | 'danger' | 'muted';

@Component({
  selector: 'app-iam-access-requests',
  imports: [IamSelect, IamDateRange],
  templateUrl: './access-requests.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './access-requests.css']
})
export class AccessRequests implements OnInit {
  private readonly api = inject(AccessRequestApiService);
  private readonly usersStore = inject(IamDirectoryStore);
  private readonly rolesStore = inject(IamRolesStore);
  private readonly toast = inject(ToastService);
  private readonly meta = new Map<string, { id: string; version: number }>();

  readonly requests = signal<AccessRequest[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly query = signal('');
  readonly status = signal<'' | RequestStatus>('');
  readonly selectedRef = signal('');

  readonly drawer = signal(false);
  readonly draft = signal<RequestDraft>({ person: '', role: '', from: '', until: '', reason: '' });
  readonly tried = signal(false);

  readonly today = IAM_NOW.toISOString().slice(0, 10);
  readonly fmtDate = fmtDate;
  readonly initials = initialsOf;
  readonly statusLabel = (s: RequestStatus): string => (REQUEST_STATUS_LABEL as Record<string, string>)[s] ?? s;
  readonly roleName = (code: string): string => code;

  readonly tone = (s: RequestStatus): Tone =>
    s === 'approved' ? 'success' : s === 'pending' ? 'warning' : s === 'rejected' ? 'danger' : 'muted';

  private readonly personOptionsC = computed<IamOption[]>(() =>
    this.usersStore.users().map((u) => ({ value: u.id, label: u.name, hint: u.email, initials: initialsOf(u.name) })));
  get personOptions(): IamOption[] { return this.personOptionsC(); }
  private readonly roleOptionsC = computed<IamOption[]>(() =>
    this.rolesStore.roles().map((r) => ({
      value: r.id ?? '', label: r.name, hint: r.privileged ? r.code + ' · Privileged' : r.code, initials: initialsOf(r.name)
    })));
  get roleOptions(): IamOption[] { return this.roleOptionsC(); }

  constructor() {
    // the reason is only on the detail record: fetch it when a request is opened
    effect(() => {
      const r = this.selected();
      const m = r ? this.meta.get(r.ref) : undefined;
      if (r && m && !r.reason) {
        this.api.get(m.id).subscribe({
          next: (d) => this.requests.update((l) => l.map((x) => (x.ref === r.ref ? { ...x, reason: d.businessJustification ?? '' } : x))),
          error: () => undefined,
        });
      }
    });
  }

  ngOnInit(): void {
    if (!this.usersStore.users().length) this.usersStore.load();
    if (!this.rolesStore.roles().length) this.rolesStore.load();
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set('');
    fetchAllPages((page, pageSize) => this.api.search({ page, pageSize })).subscribe({
      next: (items) => {
        this.meta.clear();
        this.requests.set(items.map((i) => this.toRequest(i)));
        this.loading.set(false);
      },
      error: (e) => {
        this.loadError.set(apiErrorMessage(e, 'Access requests could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  private toRequest(i: AccessRequestListItemResponse): AccessRequest {
    const ref = i.requestNumber ?? i.id ?? '';
    this.meta.set(ref, { id: i.id ?? '', version: i.version ?? 0 });
    return {
      ref, person: i.requestedForName ?? '', role: i.roleName ?? i.permissionName ?? i.permissionCode ?? '', reason: '',
      status: STATUS_MAP[i.status ?? 'submitted'] ?? 'pending',
      createdAt: i.submittedAtUtc ?? i.accessStartsAtUtc ?? '', until: i.accessEndsAtUtc ?? ''
    };
  }

  // ---- widgets ----
  private readonly searched = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.requests().filter((r) =>
      !q || (r.ref + ' ' + r.person + ' ' + this.roleName(r.role) + ' ' + r.reason).toLowerCase().includes(q));
  });

  readonly filtered = computed(() => this.searched().filter((r) => !this.status() || r.status === this.status()));
  readonly selected = computed(() => this.filtered().find((r) => r.ref === this.selectedRef()) ?? this.filtered()[0] ?? null);

  readonly tabs = computed<StatusTab[]>(() => {
    const list = this.searched();
    const count = (s: RequestStatus) => list.filter((r) => r.status === s).length;
    return [
      { value: '', label: 'All', count: list.length },
      { value: 'pending', label: 'Pending', count: count('pending') },
      { value: 'approved', label: 'Approved', count: count('approved') },
      { value: 'rejected', label: 'Rejected', count: count('rejected') },
      { value: 'withdrawn', label: 'Withdrawn', count: count('withdrawn') }
    ] as StatusTab[];
  });

  readonly approved = computed(() => this.filtered().filter((r) => r.status === 'approved').length);
  readonly pending = computed(() => this.filtered().filter((r) => r.status === 'pending').length);
  readonly privilegedPending = computed(() => this.filtered().filter((r) => r.status === 'pending' && this.isPrivileged(r.role)).length);
  readonly people = computed(() => new Set(this.filtered().map((r) => r.person)).size);
  readonly mostActive = computed(() => {
    const by = new Map<string, number>();
    for (const r of this.filtered()) by.set(r.person, (by.get(r.person) ?? 0) + 1);
    let best = '';
    let n = 0;
    by.forEach((v, k) => { if (v > n) { best = k; n = v; } });
    return { name: best, count: n };
  });

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  isPrivileged(code: string): boolean {
    return !!this.rolesStore.roles().find((r) => r.name === code)?.privileged;
  }

  personOf(name: string) {
    return this.usersStore.users().find((u) => u.name === name);
  }

  stage(r: AccessRequest): number {
    return r.status === 'pending' ? 1 : 2;
  }

  decide(r: AccessRequest, status: RequestStatus): void {
    const m = this.meta.get(r.ref);
    if (!m || this.saving()) return;
    this.saving.set(true);
    const call = status === 'approved'
      ? this.api.approve(m.id, m.version, 'Approved from the access requests queue')
      : status === 'rejected'
        ? this.api.reject(m.id, m.version, 'Rejected from the access requests queue')
        : this.api.withdraw(m.id, { expectedVersion: m.version, reason: 'Withdrawn from the access requests queue' });
    call.subscribe({
      next: (o) => {
        this.saving.set(false);
        this.toast.show('Request ' + status, o.message ?? r.ref, 'success');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.show('Not saved', apiErrorMessage(e, 'The decision could not be saved.'), 'error');
      },
    });
  }

  // ---- create drawer ----
  openCreate(): void {
    this.draft.set({ person: '', role: '', from: this.today, until: '', reason: '' });
    this.tried.set(false);
    this.drawer.set(true);
  }

  close(): void {
    this.drawer.set(false);
  }

  patch<K extends keyof RequestDraft>(key: K, value: RequestDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  setWindow(r: IamRange): void {
    this.draft.update((d) => ({ ...d, from: r.start, until: r.end }));
  }

  readonly errors = computed(() => {
    const d = this.draft();
    return {
      person: d.person ? '' : 'Choose the person who needs access.',
      role: d.role ? '' : 'Choose the role being requested.',
      reason: d.reason.trim().length >= 10 ? '' : 'Explain why in at least 10 characters.'
    };
  });

  submit(): void {
    this.tried.set(true);
    const e = this.errors();
    if (e.person || e.role || e.reason || this.saving()) return;
    const d = this.draft();
    this.saving.set(true);
    this.api.create({
      requestedForUserId: d.person, requestType: 'roleAssignment', roleId: d.role,
      businessJustification: d.reason.trim(), scopeType: 'organisation',
      accessStartsAtUtc: d.from ? new Date(d.from).toISOString() : null,
      accessEndsAtUtc: d.until ? new Date(d.until).toISOString() : null,
      submitImmediately: true,
    }).subscribe({
      next: (o) => {
        this.saving.set(false);
        this.toast.show('Request submitted', o.message ?? 'The request is waiting for a decision.', 'success');
        this.status.set('');
        this.drawer.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.show('Not submitted', apiErrorMessage(err, 'The request could not be submitted.'), 'error');
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.drawer.set(false);
  }
}