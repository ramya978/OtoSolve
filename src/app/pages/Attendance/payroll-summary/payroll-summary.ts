import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, MonthStats, hm } from '../Attendance/attendance-data.service';
import { AkSelect } from '../Attendance/ak-select';
import { PERIODS, datesOf } from '../Attendance/attendance';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';

/* =====================================================================================================
   PAYROLL SUMMARY - payable-day estimates per employee and the month-close checklist.
     payable = present + ½ half-day + paid leave + weekly off + holiday   ·   loss of pay = absent + ½ half-day
     Finalising a month locks it: the register, bulk attendance, field hub and punches stop editing it.
     This is a preview for payroll - not a payslip.
   ===================================================================================================== */
type Row = { id: string; name: string; department: string; initials: string; tone: string; m: MonthStats };

@Component({
  selector: 'app-payroll-summary',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './payroll-summary.html',
  styleUrls: ['../Attendance/attendance-kit.css', './payroll-summary.css'],
})
export class PayrollSummary {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly hr = inject(AttendanceHrStore);
  readonly hm = hm;
  readonly monthKeys = Object.keys(PERIODS);
  readonly month = signal(this.data.today.slice(0, 7));
  readonly department = signal('all');
  readonly search = signal('');
  readonly confirming = signal(false);
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure(); }

  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);
  readonly label = computed(() => PERIODS[this.month()]?.label ?? this.month());
  readonly isCurrent = computed(() => this.month() === this.data.today.slice(0, 7));
  readonly locked = computed(() => this.flow.isLocked(this.month()));

  readonly allRows = computed<Row[]>(() => {
    this.flow.logs(); this.data.overrides();
    this.hr.ot();
    return this.data.people().map(e => { const m = this.data.monthStats(e.id, this.month()); return { id: e.id, name: e.name, department: e.department, initials: e.initials, tone: e.tone, m: { ...m, overtime: this.approvedOt(e.id) } }; });
  });
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase(), dep = this.department();
    return this.allRows().filter(r => (dep === 'all' || r.department === dep) && (!q || `${r.name} ${r.id}`.toLowerCase().includes(q)));
  });
  readonly total = computed(() => this.rows().reduce((t, r) => {
    (['days', 'P', 'HD', 'L', 'A', 'U', 'WO', 'H', 'payable', 'lop', 'minutes', 'overtime'] as const).forEach(k => (t as any)[k] += r.m[k]);
    return t;
  }, { days: 0, P: 0, HD: 0, L: 0, A: 0, U: 0, WO: 0, H: 0, payable: 0, lop: 0, minutes: 0, overtime: 0 }));

  readonly pending = computed(() => this.flow.requests().filter(r => r.status === 'Pending' && r.date.startsWith(this.month())).length);
  readonly unmarked = computed(() => this.allRows().reduce((s, r) => s + r.m.U, 0));
  readonly missing = computed(() => this.allRows().reduce((s, r) => s + r.m.missing, 0));
  readonly checks = computed(() => [
    { ok: !this.isCurrent(), title: this.isCurrent() ? 'Month still running' : 'Month has ended', text: this.isCurrent() ? 'Finalise after the last working day' : 'All days are in the past' },
    { ok: this.unmarked() === 0, title: this.unmarked() + ' unmarked days', text: 'Every working day needs a status' },
    { ok: this.pending() === 0, title: this.pending() + ' pending requests', text: 'Decide corrections, WFH and on-duty first' },
    { ok: this.missing() === 0, title: this.missing() + ' missing punch-outs', text: 'Incomplete days count no hours' },
  ]);
  readonly ready = computed(() => this.checks().every(c => c.ok));

  /** only overtime approved on the Missed punches & overtime page counts for pay */
  approvedOt(id: string) { return datesOf(this.month()).reduce((s, d) => { const o = this.hr.otDecision(id, d); return s + (o?.status === 'Approved' ? o.minutes : 0); }, 0); }
  canMonth(n: number) { const i = this.monthKeys.indexOf(this.month()) + n; return i >= 0 && i < this.monthKeys.length; }
  moveMonth(n: number) { if (this.canMonth(n)) { this.month.set(this.monthKeys[this.monthKeys.indexOf(this.month()) + n]); this.confirming.set(false); } }
  days(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

  finalise() {
    if (this.locked()) { this.flow.setLocked(this.month(), false); this.notify(this.label() + ' reopened. Attendance can be edited again.'); return; }
    if (!this.ready() && !this.confirming()) { this.confirming.set(true); return; }
    this.flow.setLocked(this.month(), true);
    this.confirming.set(false);
    this.notify(this.label() + ' finalised. Attendance for this month is now read only.');
  }

  exportCsv() {
    this.data.csv('payroll-summary-' + this.month() + '.csv', [
      ['Employee ID', 'Employee', 'Department', 'Days', 'Present', 'Half day', 'Paid leave', 'Weekly off', 'Holiday', 'Absent', 'Unmarked', 'Payable days', 'Loss of pay', 'Hours', 'Overtime'],
      ...this.rows().map(r => [r.id, r.name, r.department, r.m.days, r.m.P, r.m.HD, r.m.L, r.m.WO, r.m.H, r.m.A, r.m.U, r.m.payable, r.m.lop, hm(r.m.minutes), hm(r.m.overtime)]),
    ]);
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

