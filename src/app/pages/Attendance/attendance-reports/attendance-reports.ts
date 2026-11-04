import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, STATUS_TONE, hm, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';
import { LABELS, PERIODS, datesOf, weekday } from '../Attendance/attendance';

/* =====================================================================================================
   REPORTS (admin) - pick a report, choose the month, view it or export it.
     Attendance : muster roll · late arrivals · absence & unmarked · department summary · punch log
     Time & pay : overtime · leave taken · payroll summary (opens its own page)
   ===================================================================================================== */
type ReportId = 'muster' | 'late' | 'absence' | 'dept' | 'punches' | 'overtime' | 'leave';
interface Col { k: string; label: string; num?: boolean; hide?: 'sm' | 'md' | 'lg'; }
interface ReportDef { id: ReportId | 'payroll'; group: string; name: string; text: string; }

const REPORTS: ReportDef[] = [
  { id: 'muster', group: 'Attendance', name: 'Muster roll', text: 'Everyone × every day of the month, as status codes.' },
  { id: 'late', group: 'Attendance', name: 'Late arrivals', text: 'Each late check-in, how late, against the shift start.' },
  { id: 'absence', group: 'Attendance', name: 'Absence & unmarked', text: 'Absent, unmarked and loss-of-pay days per person.' },
  { id: 'dept', group: 'Attendance', name: 'Department summary', text: 'Attendance rate, leave and hours by department.' },
  { id: 'punches', group: 'Attendance', name: 'Punch log', text: 'Every web and kiosk punch with time and place.' },
  { id: 'overtime', group: 'Time & pay', name: 'Overtime', text: 'Overtime per person - approved, waiting and rejected.' },
  { id: 'leave', group: 'Time & pay', name: 'Leave taken', text: 'Approved leave in the month, by type.' },
  { id: 'payroll', group: 'Time & pay', name: 'Payroll summary', text: 'Payable days, loss of pay and month close.' },
];

@Component({
  selector: 'app-attendance-reports',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './attendance-reports.html',
  styleUrls: ['../Attendance/attendance-kit.css', './attendance-reports.css'],
})
export class AttendanceReports {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly tone = STATUS_TONE;
  readonly groups = [...new Set(REPORTS.map(r => r.group))].map(g => ({ g, list: REPORTS.filter(r => r.group === g) }));
  readonly monthKeys = Object.keys(PERIODS);
  readonly selected = signal<ReportId | null>(null);
  readonly month = signal(this.data.today.slice(0, 7));
  readonly search = signal('');
  readonly department = signal('all');

  constructor() { void this.data.ensure().then(() => this.hr.seedDemo()); }

  readonly def = computed(() => REPORTS.find(r => r.id === this.selected()) ?? null);
  readonly label = computed(() => PERIODS[this.month()]?.label ?? this.month());
  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);
  readonly people = computed(() => {
    const q = this.search().trim().toLowerCase(), dep = this.department();
    return this.data.people().filter(e => (dep === 'all' || e.department === dep) && (!q || `${e.name} ${e.id}`.toLowerCase().includes(q)));
  });
  /** past days of the month */
  readonly days = computed(() => datesOf(this.month()).filter(d => d <= this.data.today));

  readonly muster = computed(() => {
    if (this.selected() !== 'muster') return [];
    this.data.overrides();
    return this.people().map(e => ({ e, cells: this.days().map(d => this.data.day(e.id, d).rec.status), s: this.data.monthStats(e.id, this.month()) }));
  });

  /** generic tables for every other report */
  readonly table = computed<{ cols: Col[]; rows: Record<string, string | number>[] }>(() => {
    const id = this.selected(), m = this.month(), people = this.people();
    this.data.overrides(); this.hr.ot(); this.hr.leaves();
    switch (id) {
      case 'late': {
        const rows: Record<string, string | number>[] = [];
        for (const d of this.days()) for (const e of people) { const v = this.data.day(e.id, d); if (v.late) rows.push({ Employee: e.name, Department: e.department, Day: niceDate(d), 'Checked in': v.rec.in, 'Shift starts': this.data.shiftFor(e.id, d).start, 'Late by': v.late + ' min' }); }
        return { cols: [{ k: 'Employee', label: 'Employee' }, { k: 'Department', label: 'Department', hide: 'md' }, { k: 'Day', label: 'Day' }, { k: 'Checked in', label: 'Checked in', hide: 'sm' }, { k: 'Shift starts', label: 'Shift starts', hide: 'lg' }, { k: 'Late by', label: 'Late by', num: true }], rows };
      }
      case 'absence': {
        const rows = people.map(e => { const s = this.data.monthStats(e.id, m); return { Employee: e.name, Department: e.department, Absent: s.A, Unmarked: s.U, 'Half days': s.HD, 'Loss of pay': s.lop }; }).filter(r => r.Absent || r.Unmarked || r['Loss of pay']);
        return { cols: [{ k: 'Employee', label: 'Employee' }, { k: 'Department', label: 'Department', hide: 'md' }, { k: 'Absent', label: 'Absent', num: true }, { k: 'Unmarked', label: 'Unmarked', num: true }, { k: 'Half days', label: 'Half days', num: true, hide: 'sm' }, { k: 'Loss of pay', label: 'Loss of pay', num: true }], rows };
      }
      case 'dept': {
        const rows = this.data.departments().map(dep => {
          const es = people.filter(e => e.department === dep); if (!es.length) return null;
          const st = es.map(e => this.data.monthStats(e.id, m));
          const sum = (k: 'P' | 'HD' | 'L' | 'A' | 'minutes') => st.reduce((a, s) => a + s[k], 0);
          const rate = st.reduce((a, s) => a + s.rate, 0) / st.length;
          return { Department: dep, People: es.length, 'Attendance %': rate.toFixed(1) + '%', 'Present days': sum('P') + sum('HD') / 2, Leave: sum('L'), Absent: sum('A'), Hours: hm(sum('minutes')) };
        }).filter((x): x is NonNullable<typeof x> => !!x);
        return { cols: [{ k: 'Department', label: 'Department' }, { k: 'People', label: 'People', num: true }, { k: 'Attendance %', label: 'Attendance', num: true }, { k: 'Present days', label: 'Present days', num: true, hide: 'sm' }, { k: 'Leave', label: 'Leave', num: true, hide: 'sm' }, { k: 'Absent', label: 'Absent', num: true }, { k: 'Hours', label: 'Hours', num: true, hide: 'md' }], rows };
      }
      case 'punches': {
        const ids = new Set(people.map(e => e.id)), byId = new Map(people.map(e => [e.id, e]));
        const word = { in: 'Punched in', 'break-start': 'Break started', 'break-end': 'Break ended', out: 'Punched out' } as Record<string, string>;
        const rows = Object.values(this.data.flow.logs()).filter(l => l.date.startsWith(m) && ids.has(l.employeeId))
          .flatMap(l => l.punches.map(p => ({ Employee: byId.get(l.employeeId)!.name, Day: niceDate(l.date), Time: p.at, What: word[p.kind], Where: p.location, _s: l.date + p.at })))
          .sort((a, b) => b._s.localeCompare(a._s)).map(({ _s, ...r }) => r);
        return { cols: [{ k: 'Employee', label: 'Employee' }, { k: 'Day', label: 'Day' }, { k: 'Time', label: 'Time', num: true }, { k: 'What', label: 'Punch' }, { k: 'Where', label: 'Where', hide: 'sm' }], rows };
      }
      case 'overtime': {
        const rows = people.map(e => {
          let total = 0, ok = 0, wait = 0, no = 0;
          for (const d of this.days()) { const v = this.data.day(e.id, d); if (v.overtime < 30) continue; total += v.overtime; const s = this.hr.otDecision(e.id, d)?.status; if (s === 'Approved') ok += v.overtime; else if (s === 'Rejected') no += v.overtime; else wait += v.overtime; }
          return { Employee: e.name, Department: e.department, Overtime: hm(total), Approved: hm(ok), Waiting: hm(wait), Rejected: hm(no), _t: total };
        }).filter(r => r._t).map(({ _t, ...r }) => r);
        return { cols: [{ k: 'Employee', label: 'Employee' }, { k: 'Department', label: 'Department', hide: 'md' }, { k: 'Overtime', label: 'Overtime', num: true }, { k: 'Approved', label: 'Approved', num: true }, { k: 'Waiting', label: 'Waiting', num: true, hide: 'sm' }, { k: 'Rejected', label: 'Rejected', num: true, hide: 'sm' }], rows };
      }
      case 'leave': {
        const ids = new Set(people.map(e => e.id)), first = m + '-01', last = datesOf(m).pop()!;
        const rows = this.hr.leaves().filter(l => l.status === 'Approved' && ids.has(l.employeeId) && l.from <= last && l.to >= first)
          .map(l => ({ Employee: l.employeeName, Department: l.department, Type: this.hr.type(l.typeId)?.name ?? '', From: niceDate(l.from), To: niceDate(l.to), Days: l.days, Paid: this.hr.type(l.typeId)?.paid ? 'Paid' : 'Unpaid' }));
        return { cols: [{ k: 'Employee', label: 'Employee' }, { k: 'Department', label: 'Department', hide: 'md' }, { k: 'Type', label: 'Type' }, { k: 'From', label: 'From', hide: 'sm' }, { k: 'To', label: 'To', hide: 'sm' }, { k: 'Days', label: 'Days', num: true }, { k: 'Paid', label: 'Pay', hide: 'lg' }], rows };
      }
      default: return { cols: [], rows: [] };
    }
  });

  open(r: ReportDef) { if (r.id === 'payroll') { this.data.go('payroll'); return; } this.selected.set(r.id as ReportId); this.search.set(''); }
  canMonth(n: number) { const i = this.monthKeys.indexOf(this.month()) + n; return i >= 0 && i < this.monthKeys.length; }
  moveMonth(n: number) { if (this.canMonth(n)) this.month.set(this.monthKeys[this.monthKeys.indexOf(this.month()) + n]); }
  dayNo(d: string) { return Number(d.slice(-2)); }
  dayLetter(d: string) { return 'SMTWTFS'[weekday(d)]; }
  isOff(d: string) { return [0, 6].includes(weekday(d)); }
  code(s: string) { return s === 'L' ? 'PL' : s === 'WO' ? '·' : s; }
  cellTitle(name: string, d: string, s: string) { return name + ' · ' + niceDate(d) + ' · ' + (LABELS as Record<string, string>)[s]; }

  exportCsv() {
    const name = (this.def()?.name ?? 'report').toLowerCase().replace(/[^a-z]+/g, '-') + '-' + this.month() + '.csv';
    if (this.selected() === 'muster') {
      this.data.csv(name, [['Employee ID', 'Employee', 'Department', ...this.days().map(d => d.slice(-2)), 'Present', 'Absent', 'Leave', 'Rate %'],
        ...this.muster().map(r => [r.e.id, r.e.name, r.e.department, ...r.cells, r.s.P + r.s.HD / 2, r.s.A, r.s.L, r.s.rate.toFixed(1)])]);
      return;
    }
    const t = this.table();
    this.data.csv(name, [t.cols.map(c => c.label), ...t.rows.map(r => t.cols.map(c => r[c.k]))]);
  }
}
