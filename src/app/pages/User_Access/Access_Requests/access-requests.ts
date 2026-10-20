import { Component, HostListener, computed, signal } from '@angular/core';
import { IamSelect } from '../../../Shared/IAM/iam-select';
import { IamDateRange, IamRange } from '../../../Shared/IAM/iam-date-range';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import {
  ACCESS_REQUESTS, AccessRequest, IAM_NOW, IamOption, REQUEST_STATUS_LABEL, ROLES, RequestStatus, USERS,
  fmtDate, initialsOf
} from '../../../Shared/IAM/iam-data';
import { SEED_USERS, SEED_ROLES, SEED_REQUESTS } from '../../../Shared/IAM/access-requests.seed';


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
export class AccessRequests {
  private readonly allUsers = [...USERS, ...SEED_USERS.filter((s) => !USERS.some((u) => u.name === s.name))];
  private readonly allRoles = [...ROLES, ...SEED_ROLES.filter((s) => !ROLES.some((r) => r.code === s.code))];

  readonly requests = signal<AccessRequest[]>(ACCESS_REQUESTS.length ? [...ACCESS_REQUESTS] : [...SEED_REQUESTS]);
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
  readonly roleName = (code: string): string => this.allRoles.find((r) => r.code === code)?.name ?? code;

  readonly tone = (s: RequestStatus): Tone =>
    s === 'approved' ? 'success' : s === 'pending' ? 'warning' : s === 'rejected' ? 'danger' : 'muted';

  readonly personOptions: IamOption[] = this.allUsers.map((u) => ({ value: u.name, label: u.name, hint: u.email, initials: initialsOf(u.name) }));
  readonly roleOptions: IamOption[] = this.allRoles.map((r) => ({
    value: r.code, label: r.name, hint: r.privileged ? r.code + ' · Privileged' : r.code, initials: initialsOf(r.name)
  }));

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
    return !!this.allRoles.find((r) => r.code === code)?.privileged;
  }

  personOf(name: string) {
    return this.allUsers.find((u) => u.name === name);
  }

  stage(r: AccessRequest): number {
    return r.status === 'pending' ? 1 : 2;
  }

  decide(r: AccessRequest, status: RequestStatus): void {
    this.requests.update((list) => list.map((x) => (x.ref === r.ref ? { ...x, status } : x)));
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
    if (e.person || e.role || e.reason) return;
    const d = this.draft();
    const ref = 'ACR-' + String(this.requests().length + 1).padStart(4, '0');
    this.requests.update((list) => [{
      ref, person: d.person, role: d.role, reason: d.reason.trim(), status: 'pending',
      createdAt: IAM_NOW.toISOString(), until: d.until
    }, ...list]);
    this.status.set('');
    this.selectedRef.set(ref);
    this.drawer.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.drawer.set(false);
  }
}