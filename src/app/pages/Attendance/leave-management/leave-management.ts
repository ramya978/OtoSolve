import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, ChainStep, LeaveRequest, LeaveType, ROLE_LABEL } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';

/* =====================================================================================================
   LEAVE MANAGEMENT (admin)
     Requests : filter by status · approval path per request · approve (one or many) / reject with reason
                HR can approve at any level; approved leave is written into the attendance register.
     Balances : what each employee has left this year, per leave type
     Types    : leave types (yearly quota, paid / unpaid, colour) and permission limits
   ===================================================================================================== */
type Tab = 'requests' | 'balances' | 'types';
type St = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'All';
const COLORS = ['#3d64d8', '#0f766e', '#c2410c', '#7448ac', '#aa3d5b', '#946410', '#0369a1', '#4d7c0f'];

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './leave-management.html',
  styleUrls: ['../Attendance/attendance-kit.css', './leave-management.css'],
})
export class LeaveManagement {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly roleLabel = ROLE_LABEL;
  readonly colors = COLORS;
  readonly statuses: St[] = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'All'];

  readonly tab = signal<Tab>('requests');
  readonly status = signal<St>('Pending');
  readonly search = signal('');
  readonly department = signal('all');
  readonly ticked = signal<Set<string>>(new Set());
  readonly open = signal<LeaveRequest | null>(null);
  readonly note = signal('');
  readonly error = signal('');
  readonly editType = signal<LeaveType | null>(null);
  readonly perMonth = signal(this.hr.permRules().perMonth);
  readonly maxMinutes = signal(this.hr.permRules().maxMinutes);
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure().then(() => this.hr.seedDemo()); }

  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);
  readonly counts = computed(() => { const c: Record<string, number> = { All: this.hr.leaves().length }; this.hr.leaves().forEach(l => c[l.status] = (c[l.status] ?? 0) + 1); return c; });
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase(), st = this.status(), dep = this.department();
    return this.hr.leaves().filter(l => (st === 'All' || l.status === st) && (dep === 'all' || l.department === dep) && (!q || `${l.employeeName} ${l.employeeId} ${l.id}`.toLowerCase().includes(q)))
      .sort((a, b) => a.from.localeCompare(b.from));
  });
  readonly pendingTicked = computed(() => this.rows().filter(r => r.status === 'Pending' && this.ticked().has(r.id)));
  readonly activeTypes = computed(() => this.hr.types().filter(t => t.active && t.quota !== null));
  readonly balances = computed(() => {
    const q = this.search().trim().toLowerCase(), dep = this.department();
    this.hr.leaves();
    return this.data.people().filter(e => (dep === 'all' || e.department === dep) && (!q || `${e.name} ${e.id}`.toLowerCase().includes(q)))
      .map(e => ({ e, cells: this.activeTypes().map(t => ({ t, left: this.hr.balance(e.id, t) ?? 0, used: this.hr.used(e.id, t.id, false), pct: t.quota ? (this.hr.balance(e.id, t) ?? 0) / t.quota * 100 : 0 })) }));
  });

  type(id: string) { return this.hr.type(id); }
  dates(l: LeaveRequest) { return l.from === l.to ? niceDate(l.from, { weekday: 'short', day: 'numeric', month: 'short' }) + (l.half ? ' · ' + (l.half === 'AM' ? 'morning' : 'afternoon') : '') : niceDate(l.from, { day: 'numeric', month: 'short' }) + ' → ' + niceDate(l.to, { day: 'numeric', month: 'short' }); }
  left(l: LeaveRequest) { const t = this.type(l.typeId); if (!t) return '—'; const b = this.hr.balance(l.employeeId, t); return b === null ? 'No limit' : b + ' of ' + t.quota; }
  waiting(l: LeaveRequest) { const s = this.hr.waitingStep(l.chain); return s ? 'Waiting on ' + s.name + (s.who === 'HR' ? '' : ' · ' + ROLE_LABEL[s.role]) : l.status; }
  initials(l: LeaveRequest) { return this.data.person(l.employeeId)?.initials ?? l.employeeName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  tone(l: LeaveRequest) { return this.data.person(l.employeeId)?.tone ?? 'blue'; }
  stepTone(s: ChainStep) { return s.status === 'Approved' ? 'teal' : s.status === 'Rejected' ? 'rose' : s.status === 'Waiting' ? 'blue' : ''; }
  statusTone(s: string) { return s === 'Approved' ? 'teal' : s === 'Rejected' ? 'rose' : s === 'Pending' ? 'amber' : ''; }
  overdue(l: LeaveRequest) { return this.hr.overdue('leave', l); }
  setStatus(s: St) { this.status.set(s); this.ticked.set(new Set()); }
  setTab(t: Tab) { this.tab.set(t); this.search.set(''); }
  tick(id: string, on: boolean) { const s = new Set(this.ticked()); on ? s.add(id) : s.delete(id); this.ticked.set(s); }
  tickAll(on: boolean) { const s = new Set(this.ticked()); this.rows().filter(r => r.status === 'Pending').forEach(r => on ? s.add(r.id) : s.delete(r.id)); this.ticked.set(s); }

  approve(l: LeaveRequest) {
    const err = this.hr.decideLeave(l.id, 'Approved', this.open()?.id === l.id ? this.note() : '', 'HR');
    if (err) { this.error.set(err); this.notify(err); return; }
    this.open.set(null);
    this.notify(l.employeeName + '’s leave approved and written to the register.');
  }
  approveTicked() {
    const list = this.pendingTicked(); let ok = 0;
    list.forEach(l => { if (!this.hr.decideLeave(l.id, 'Approved', '', 'HR')) ok++; });
    this.ticked.set(new Set());
    this.notify(ok + ' leave request' + (ok === 1 ? '' : 's') + ' approved.');
  }
  review(l: LeaveRequest) { this.open.set(l); this.note.set(''); this.error.set(''); }
  reject(l: LeaveRequest) {
    if (this.note().trim().length < 3) { this.error.set('Write a short reason - the employee will see it.'); return; }
    this.hr.decideLeave(l.id, 'Rejected', this.note(), 'HR');
    this.open.set(null);
    this.notify('Leave rejected.');
  }
  cancel(l: LeaveRequest) { this.hr.cancelLeave(l.id, 'HR administrator'); this.open.set(null); this.notify('Leave cancelled and removed from the register.'); }

  /* types */
  newType() { this.editType.set({ id: 'LT-' + Date.now().toString(36).toUpperCase(), name: '', code: '', quota: 6, paid: true, color: COLORS[this.hr.types().length % COLORS.length], active: true }); this.error.set(''); }
  patchType(p: Partial<LeaveType>) { const t = this.editType(); if (t) this.editType.set({ ...t, ...p }); this.error.set(''); }
  saveType() {
    const t = this.editType(); if (!t) return;
    if (t.name.trim().length < 2) return this.error.set('Give the leave type a name.');
    const code = (t.code.trim() || t.name.trim().split(/\s+/).map(w => w[0]).join('')).toUpperCase().slice(0, 4);
    if (this.hr.types().some(x => x.code === code && x.id !== t.id)) return this.error.set('Another leave type already uses the code ' + code + '.');
    this.hr.saveType({ ...t, name: t.name.trim(), code });
    this.editType.set(null);
    this.notify(t.name.trim() + ' saved.');
  }
  savePerm() {
    const per = Math.max(0, Math.round(this.perMonth())), max = Math.max(15, Math.round(this.maxMinutes()));
    this.hr.setPermRules({ perMonth: per, maxMinutes: max });
    this.notify('Permission limits saved: ' + per + ' a month, up to ' + max + ' minutes each.');
  }

  exportCsv() {
    this.data.csv('leave-requests.csv', [['ID', 'Employee', 'Department', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Decided by', 'Note'],
      ...this.rows().map(l => [l.id, l.employeeName, l.department, this.type(l.typeId)?.name ?? '', l.from, l.to, l.days, l.reason, l.status, l.decidedBy ?? '', l.note ?? ''])]);
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

