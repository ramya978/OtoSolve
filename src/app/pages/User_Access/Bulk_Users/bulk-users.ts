import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { initialsOf, ME, IAM_NOW, IamOption, ROLES, USERS, USER_STATUS_LABEL, IamUser, UserStatus, IAM_PATHS, fmtDate } from '../../../Shared/IAM/iam-data';
import { IAM_ICONS } from '../../../Shared/IAM/iam-icons';
import { IamSelect } from '../../../Shared/IAM/iam-select';



type ActionKey =
  | 'invite' | 'activate' | 'suspend' | 'lift' | 'deactivate' | 'addRole' | 'removeRole'
  | 'resetPassword' | 'signOut' | 'resetMfa' | 'extend' | 'export';

type Extra = 'reason' | 'role' | 'date' | null;

interface BulkAction {
  key: ActionKey;
  group: 'Account access' | 'Roles, security & data';
  label: string;
  hint: string;
  icon: string;
  extra: Extra;
  risky?: boolean;
}

interface Outcome { ok: boolean; text: string; }

const ACTIONS: BulkAction[] = [
  { key: 'invite', group: 'Account access', label: 'Send invitations', hint: 'E-mail an activation link to each person.', icon: 'mail', extra: null },
  { key: 'activate', group: 'Account access', label: 'Activate', hint: 'Bring accounts into use.', icon: 'checkCircle', extra: null },
  { key: 'suspend', group: 'Account access', label: 'Suspend', hint: 'Pause access and end every live session.', icon: 'ban', extra: 'reason', risky: true },
  { key: 'lift', group: 'Account access', label: 'Lift suspension', hint: 'Let people sign in again.', icon: 'lock', extra: null },
  { key: 'deactivate', group: 'Account access', label: 'Deactivate', hint: 'End access permanently. Nothing is deleted.', icon: 'xCircle', extra: 'reason', risky: true },
  { key: 'signOut', group: 'Account access', label: 'Sign out everywhere', hint: 'End every session on every device.', icon: 'external', extra: null },
  { key: 'addRole', group: 'Roles, security & data', label: 'Add a role', hint: 'Grant one role to everybody selected.', icon: 'personPlus', extra: 'role' },
  { key: 'removeRole', group: 'Roles, security & data', label: 'Remove a role', hint: 'Take one role away from everybody selected.', icon: 'person', extra: 'role', risky: true },
  { key: 'extend', group: 'Roles, security & data', label: 'Extend access', hint: 'Move the end of the access window.', icon: 'clock', extra: 'date' },
  { key: 'resetPassword', group: 'Roles, security & data', label: 'Send a password reset', hint: 'E-mail a reset link. No password is generated.', icon: 'key', extra: null },
  { key: 'resetMfa', group: 'Roles, security & data', label: 'Reset two-step verification', hint: 'Clear enrolled factors so they are set up again.', icon: 'shieldCheck', extra: null },
  { key: 'export', group: 'Roles, security & data', label: 'Export', hint: 'Download the selection as a file.', icon: 'download', extra: null }
];

const SAMPLE_IDS = ['u5', 'u7', 'u11', 'u16'];

@Component({
  selector: 'app-iam-bulk-users-table',
  imports: [IamSelect],
  templateUrl: './bulk-users.html',
  styleUrls: ['../../../Shared/IAM/iam-shared.css', './bulk-users.css']
})
export class BulkUsers {
  private readonly router = inject(Router);

  readonly actions = ACTIONS;
  readonly groups = ['Account access', 'Roles, security & data'] as const;
  readonly initials = initialsOf;
  readonly fmtDate = fmtDate; 
  readonly me = ME;
  readonly today = fmtDate(IAM_NOW.toISOString().slice(0, 10));
  readonly selectedIds = signal<string[]>(this.passedIds());

  readonly action = signal<ActionKey>('invite');
  readonly reason = signal('');
  readonly role = signal('');
  readonly endDate = signal('');
  readonly justification = signal('');
  readonly tried = signal(false);
  readonly previewOpen = signal(false);
  readonly panelOpen = signal(false);
  readonly submitted = signal<string>('');
  readonly actionOptions: IamOption[] = ACTIONS.map((a) => ({ value: a.key, label: a.label, hint: a.hint, icon: a.icon }));

  readonly roleOptions: IamOption[] = ROLES.map((r) => ({ value: r.code, label: r.name, hint: r.code, initials: initialsOf(r.name) }));

  readonly dateOptions: IamOption[] = [30, 90, 180, 365].map((d) => {
    const iso = this.addDays(d);
    return { value: iso, label: fmtDate(iso), hint: d === 365 ? 'In one year' : 'In ' + d + ' days', icon: 'calendar' };
  }).concat([{ value: IAM_NOW.getFullYear() + '-12-31', label: fmtDate(IAM_NOW.getFullYear() + '-12-31'), hint: 'End of this year', icon: 'calendar' }]);

  readonly addOptions = computed<IamOption[]>(() =>
    USERS.filter((u) => !this.selectedIds().includes(u.id))
      .map((u) => ({ value: u.id, label: u.name, hint: u.ref + ' · ' + USER_STATUS_LABEL[u.status], initials: initialsOf(u.name) })));

  readonly current = computed(() => ACTIONS.find((a) => a.key === this.action()) ?? ACTIONS[0]);
  readonly people = computed(() => this.selectedIds().map((id) => USERS.find((u) => u.id === id)).filter((u): u is IamUser => !!u));

  readonly statusLine = computed(() => this.statusCounts().filter((s) => s.value).map((s) => s.value + ' ' + s.label.toLowerCase()).join(' · ') || 'Nobody selected');

  readonly statusCounts = computed(() => {
    const list = this.people();
    const n = (s: UserStatus[]) => list.filter((u) => s.includes(u.status)).length;
    return [
      { label: 'Active', value: n(['active']), tone: 'success' },
      { label: 'Invited', value: n(['invited', 'draft']), tone: 'info' },
      { label: 'Suspended', value: n(['suspended']), tone: 'warning' },
      { label: 'Ended', value: n(['deactivated', 'expired', 'withdrawn']), tone: 'muted' }
    ];
  });

  readonly changing = computed(() => this.people().filter((u) => this.outcome(u).ok));
  readonly skipping = computed(() => this.people().filter((u) => !this.outcome(u).ok));

  readonly affected = computed(() => this.changing().length);
  readonly excluded = computed(() => this.people().length - this.affected());

  readonly extraLabel = computed(() => {
    switch (this.current().extra) {
      case 'role': return this.role() ? this.roleName(this.role()) : 'Not chosen';
      case 'date': return this.endDate() ? fmtDate(this.endDate()) : 'Not chosen';
      case 'reason': return this.reason().trim() ? 'Given' : 'Not given';
      default: return '';
    }
  });

  readonly errors = computed(() => {
    const a = this.current();
    const j = this.justification().trim().length;
    return {
      people: !this.people().length ? 'Add at least one person.' : !this.affected() ? 'Nobody selected can take this action.' : '',
      reason: a.extra === 'reason' && this.reason().trim().length < 10 ? 'Give a reason of at least 10 characters.' : '',
      role: a.extra === 'role' && !this.role() ? 'Choose a role.' : '',
      date: a.extra === 'date' && !this.endDate() ? 'Choose the new end date.' : '',
      justification: j < 10 ? 'Explain the need in at least 10 characters.' : j > 1000 ? 'Keep it under 1000 characters.' : ''
    };
  });

  readonly ready = computed(() => !Object.values(this.errors()).some(Boolean));
  readonly missing = computed(() => Object.values(this.errors()).filter(Boolean).length);

  icon(name: string): string {
    return IAM_ICONS[name] ?? '';
  }

  actionsIn(group: string): BulkAction[] {
    return ACTIONS.filter((a) => a.group === group);
  }

  statusLabel(s: UserStatus): string {
    return USER_STATUS_LABEL[s];
  }

  statusTone(s: UserStatus): string {
    return s === 'active' ? 'success' : s === 'invited' || s === 'draft' ? 'info' : s === 'suspended' ? 'warning' : 'muted';
  }

  roleName(code: string): string {
    return ROLES.find((r) => r.code === code)?.name ?? code;
  }

  outcome(u: IamUser): Outcome {
    return this.outcomeFor(u, this.action());
  }

  fitCount(key: ActionKey): number {
    return this.people().filter((u) => this.outcomeFor(u, key, key !== this.action()).ok).length;
  }

  outcomeFor(u: IamUser, key: ActionKey, loose = false): Outcome {
    const role = loose ? '' : this.role();
    const s = u.status;
    const live = s === 'active';
    const ended = s === 'deactivated' || s === 'expired' || s === 'withdrawn';
    switch (key) {
      case 'invite':
        return s === 'invited' || s === 'draft' || s === 'expired' ? { ok: true, text: 'Gets an activation link' } : { ok: false, text: live ? 'Skipped — already active' : 'Skipped — ' + this.statusLabel(s).toLowerCase() };
      case 'activate':
        return live ? { ok: false, text: 'Skipped — already active' } : s === 'withdrawn' ? { ok: false, text: 'Skipped — withdrawn' } : { ok: true, text: 'Becomes active' };
      case 'suspend':
        return live ? { ok: true, text: 'Suspended, sessions ended' } : { ok: false, text: 'Skipped — not active' };
      case 'lift':
        return s === 'suspended' ? { ok: true, text: 'Can sign in again' } : { ok: false, text: 'Skipped — not suspended' };
      case 'deactivate':
        return ended ? { ok: false, text: 'Skipped — access already ended' } : { ok: true, text: 'Access ends' };
      case 'addRole':
        if (!role) return { ok: true, text: 'Gets the chosen role' };
        return u.role === role ? { ok: false, text: 'Skipped — already holds it' } : { ok: true, text: 'Gets ' + this.roleName(role) };
      case 'removeRole':
        if (!role) return { ok: true, text: 'Loses the chosen role' };
        return u.role === role ? { ok: true, text: 'Loses ' + this.roleName(role) } : { ok: false, text: 'Skipped — does not hold it' };
      case 'extend':
        return ended ? { ok: false, text: 'Skipped — access already ended' } : { ok: true, text: this.endDate() ? 'Access until ' + fmtDate(this.endDate()) : 'Access window moves' };
      case 'resetPassword':
        return live ? { ok: true, text: 'Gets a reset link' } : { ok: false, text: 'Skipped — not active' };
      case 'signOut':
        return live ? { ok: true, text: 'Every session ends' } : { ok: false, text: 'Skipped — not active' };
      case 'resetMfa':
        return u.mfaEnrolled ? { ok: true, text: 'Sets up two-step again' } : { ok: false, text: 'Skipped — not enrolled' };
      default:
        return { ok: true, text: 'Included in the file' };
    }
  }

  pick(a: BulkAction): void {
    this.action.set(a.key);
    this.reason.set('');
    this.role.set('');
    this.endDate.set('');
    this.submitted.set('');
  }

  pickKey(key: string): void {
    const a = ACTIONS.find((x) => x.key === key);
    if (a) this.pick(a);
  }

  addPerson(id: string): void {
    if (id && !this.selectedIds().includes(id)) this.selectedIds.update((l) => [...l, id]);
  }

  removePerson(id: string): void {
    this.selectedIds.update((l) => l.filter((x) => x !== id));
  }

  removeSkipped(): void {
    const keep = this.people().filter((u) => this.outcome(u).ok).map((u) => u.id);
    this.selectedIds.set(keep);
  }

  submit(): void {
    this.tried.set(true);
    if (!this.ready()) return;
    this.submitted.set('BLK-' + String(Date.now()).slice(-6));
  }

  cancel(): void {
    this.router.navigate([IAM_PATHS.users]);
  }

  startAgain(): void {
    this.submitted.set('');
    this.tried.set(false);
    this.justification.set('');
    this.reason.set('');
  }

  private passedIds(): string[] {
    const state = (typeof history !== 'undefined' ? history.state : null) as { userIds?: string[] } | null;
    return state?.userIds?.length ? [...state.userIds] : [...SAMPLE_IDS];
  }

  private addDays(n: number): string {
    const d = new Date(IAM_NOW);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  openPanel(key?: string): void {
    if (key) this.pickKey(key);
    this.tried.set(false);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.previewOpen()) this.previewOpen.set(false);
    else this.panelOpen.set(false);
  }
}
