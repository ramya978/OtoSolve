import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, addDays, hm, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';
import { AttRecord, Employee, Status, dayKind, key, record, validate } from '../Attendance/attendance';

/* =====================================================================================================
   MISSED PUNCHES & OVERTIME (admin)
     Missed punches : past working days with no check-out, or with nothing recorded at all.
                      Shows if the employee already asked for a correction; HR can fix the day directly.
     Overtime       : days worked beyond the 8-hour target - approve or reject before payroll.
   ===================================================================================================== */
type Tab = 'missed' | 'overtime';
interface Missed { e: Employee; d: string; issue: string; rec: AttRecord; asked: string; }
const MIN_OT = 30;

@Component({
  selector: 'app-attendance-exceptions',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './attendance-exceptions.html',
  styleUrls: ['../Attendance/attendance-kit.css', './attendance-exceptions.css'],
})
export class AttendanceExceptions {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly flow = this.data.flow;
  readonly hm = hm;
  readonly tab = signal<Tab>('missed');
  readonly days = signal(14);
  readonly department = signal('all');
  readonly otFilter = signal<'Pending' | 'Approved' | 'Rejected' | 'All'>('Pending');
  readonly fixing = signal<Missed | null>(null);
  readonly fStatus = signal<Status>('P');
  readonly fIn = signal('09:00');
  readonly fOut = signal('18:00');
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  readonly ranges = [7, 14, 30];
  readonly fixStatuses: { s: Status; l: string }[] = [{ s: 'P', l: 'Present' }, { s: 'HD', l: 'Half day' }, { s: 'L', l: 'Leave' }, { s: 'A', l: 'Absent' }];

  constructor() { void this.data.ensure(); }
  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);

  private readonly dates = computed(() => Array.from({ length: this.days() }, (_, i) => addDays(this.data.today, -(i + 1))).filter(d => dayKind(d) === 'W' && !this.flow.isLocked(d)));
  private readonly people = computed(() => this.data.people().filter(e => this.department() === 'all' || e.department === this.department()));

  readonly missed = computed<Missed[]>(() => {
    this.data.overrides(); this.flow.logs(); this.flow.requests();
    const out: Missed[] = [];
    for (const d of this.dates()) for (const e of this.people()) {
      const v = this.data.day(e.id, d), r = v.rec;
      const noOut = ['P', 'HD'].includes(r.status) && !!r.in && !r.out;
      if (!noOut && r.status !== 'U') continue;
      const req = this.flow.requests().find(x => x.employeeId === e.id && x.date === d && x.type === 'Punch correction' && x.status === 'Pending');
      out.push({ e, d, rec: r, issue: noOut ? 'No check-out' : 'Nothing recorded', asked: req ? req.id : '' });
    }
    return out;
  });

  readonly overtime = computed(() => {
    this.data.overrides(); this.hr.ot();
    const out: { e: Employee; d: string; minutes: number; worked: number; rec: AttRecord; status: 'Pending' | 'Approved' | 'Rejected' }[] = [];
    for (const d of this.dates()) for (const e of this.people()) {
      const v = this.data.day(e.id, d);
      if (v.overtime < MIN_OT) continue;
      const dec = this.hr.otDecision(e.id, d);
      out.push({ e, d, minutes: v.overtime, worked: v.minutes, rec: v.rec, status: dec?.status ?? 'Pending' });
    }
    return out;
  });
  readonly otRows = computed(() => this.overtime().filter(x => this.otFilter() === 'All' || x.status === this.otFilter()));
  readonly otTotals = computed(() => {
    const o = this.overtime(), sum = (s: string) => o.filter(x => x.status === s).reduce((a, x) => a + x.minutes, 0);
    return { pending: o.filter(x => x.status === 'Pending').length, approvedMin: sum('Approved'), pendingMin: sum('Pending'), rejected: o.filter(x => x.status === 'Rejected').length };
  });
  readonly missedTotals = computed(() => { const m = this.missed(); return { all: m.length, noOut: m.filter(x => x.issue === 'No check-out').length, none: m.filter(x => x.issue !== 'No check-out').length, asked: m.filter(x => x.asked).length }; });

  short(d: string) { return niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
  isActive(s: Status) { return s === 'P' || s === 'HD'; }

  fix(m: Missed) {
    this.fixing.set(m); this.error.set('');
    this.fStatus.set(m.issue === 'No check-out' ? m.rec.status : 'P');
    this.fIn.set(m.rec.in || '09:00'); this.fOut.set(m.rec.status === 'HD' ? '13:00' : '18:00');
  }
  setFix(s: Status) { this.fStatus.set(s); if (s === 'HD') { this.fOut.set('13:00'); } if (s === 'P' && this.fOut() <= '13:00') this.fOut.set('18:00'); this.error.set(''); }
  saveFix() {
    const m = this.fixing(); if (!m) return;
    const s = this.fStatus(), active = this.isActive(s);
    const span = active ? ((+this.fOut().slice(0, 2) * 60 + +this.fOut().slice(3)) - (+this.fIn().slice(0, 2) * 60 + +this.fIn().slice(3))) : 0;
    const r = record(s, { in: active ? this.fIn() : '', out: active ? this.fOut() : '', break: s === 'P' && span >= 300 ? 60 : 0, mode: m.rec.mode, note: 'Missed punch fixed by HR' });
    const err = validate(r);
    if (err) return this.error.set(err);
    const res = this.data.writeRecords({ [key(m.d, m.e.id)]: r }, 'Fixed missed punch', m.e.name + ' · ' + m.d);
    if (res) return this.error.set(res);
    if (m.asked) this.flow.decide(m.asked, 'Approved', 'Fixed by HR on the missed-punch page');
    this.fixing.set(null);
    this.notify(m.e.name + ' · ' + this.short(m.d) + ' fixed.');
  }
  markAbsent(m: Missed) {
    const res = this.data.writeRecords({ [key(m.d, m.e.id)]: record('A', { note: 'Marked absent - no punches' }) }, 'Marked absent', m.e.name + ' · ' + m.d);
    this.notify(res || m.e.name + ' marked absent for ' + this.short(m.d) + '.');
  }
  decideOt(x: { e: Employee; d: string; minutes: number }, s: 'Approved' | 'Rejected') { this.hr.decideOt(x.e.id, x.d, x.minutes, s); this.notify(hm(x.minutes) + ' overtime ' + s.toLowerCase() + ' for ' + x.e.name + '.'); }
  approveAllOt() { const list = this.overtime().filter(x => x.status === 'Pending'); list.forEach(x => this.hr.decideOt(x.e.id, x.d, x.minutes, 'Approved')); this.notify(list.length + ' overtime entries approved.'); }

  exportCsv() {
    if (this.tab() === 'missed') this.data.csv('missed-punches.csv', [['Employee ID', 'Employee', 'Date', 'Issue', 'Check-in', 'Correction requested'], ...this.missed().map(m => [m.e.id, m.e.name, m.d, m.issue, m.rec.in, m.asked || 'No'])]);
    else this.data.csv('overtime.csv', [['Employee ID', 'Employee', 'Date', 'Worked', 'Overtime minutes', 'Status'], ...this.overtime().map(x => [x.e.id, x.e.name, x.d, hm(x.worked), x.minutes, x.status])]);
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

