import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, STATUS_TONE, addDays, hm, niceDate } from '../Attendance/attendance-data.service';
import { AkSelect } from '../Attendance/ak-select';
import { Employee, LABELS } from '../Attendance/attendance';

/* =====================================================================================================
   EMPLOYEE DIRECTORY - one employee list for attendance and shifts.
     filters · today's status, shift and work location per person · month attendance rate
     · profile drawer: last 14 days, month figures, change default work location, open their attendance
   ===================================================================================================== */
@Component({
  selector: 'app-employee-directory',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './employee-directory.html',
  styleUrls: ['../Attendance/attendance-kit.css', './employee-directory.css'],
})
export class EmployeeDirectory {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly tone = STATUS_TONE;
  readonly labels = LABELS;
  readonly hm = hm;
  readonly today = this.data.today;
  readonly month = this.data.today.slice(0, 7);

  readonly search = signal('');
  readonly department = signal('all');
  readonly location = signal('all');
  readonly status = signal('all');
  readonly page = signal(1);
  readonly pageSize = 12;
  readonly openId = signal('');
  readonly newHome = signal('');
  readonly reason = signal('');
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure(); }

  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);
  readonly locOptions = computed(() => [{ value: 'all', label: 'All locations' }, ...this.flow.activeLocations().map(l => ({ value: l, label: l }))]);
  readonly statusOptions = [
    { value: 'all', label: 'Any status today' }, { value: 'in', label: 'At work' }, { value: 'live', label: 'On shift now' },
    { value: 'L', label: 'On leave' }, { value: 'A', label: 'Absent' }, { value: 'U', label: 'Unmarked' },
  ];

  readonly all = computed(() => {
    this.flow.logs(); this.flow.homeLocation();
    return this.data.people().map((e, i) => {
      const v = this.data.day(e.id, this.today);
      return { e, v, home: this.flow.home(e.id, i), shift: this.data.shiftFor(e.id, this.today), rate: this.data.monthStats(e.id, this.month).rate };
    });
  });
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase(), dep = this.department(), loc = this.location(), st = this.status();
    return this.all().filter(x => (dep === 'all' || x.e.department === dep) && (loc === 'all' || x.home === loc)
      && (!q || `${x.e.name} ${x.e.id} ${x.e.role}`.toLowerCase().includes(q))
      && (st === 'all' || (st === 'in' ? ['P', 'HD'].includes(x.v.rec.status) : st === 'live' ? x.v.live : x.v.rec.status === st)));
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => { const p = Math.min(this.page(), this.pages()); return this.filtered().slice((p - 1) * this.pageSize, p * this.pageSize); });
  readonly pageList = computed(() => Array.from({ length: this.pages() }, (_, i) => i + 1));

  readonly kpis = computed(() => {
    const a = this.all();
    return {
      people: a.length, departments: this.data.departments().length,
      atWork: a.filter(x => ['P', 'HD'].includes(x.v.rec.status)).length, live: a.filter(x => x.v.live).length,
      remote: a.filter(x => /remote/i.test(x.home)).length,
      rate: a.length ? Math.round(a.reduce((s, x) => s + x.rate, 0) / a.length) : 0,
    };
  });

  /* drawer */
  readonly profile = computed(() => this.all().find(x => x.e.id === this.openId()) ?? null);
  readonly profileMonth = computed(() => this.openId() ? this.data.monthStats(this.openId(), this.month) : null);
  readonly last14 = computed(() => {
    const id = this.openId(); if (!id) return [];
    return Array.from({ length: 14 }, (_, i) => addDays(this.today, i - 13)).map(d => ({ d, v: this.data.day(id, d), day: niceDate(d, { weekday: 'narrow' }), n: Number(d.slice(-2)) }));
  });

  setFilter(which: 'department' | 'location' | 'status', v: string) { this[which].set(v); this.page.set(1); }
  open(e: Employee) { this.openId.set(e.id); this.newHome.set(this.flow.home(e.id, this.data.personIndex(e.id))); this.reason.set(''); this.error.set(''); }
  close() { this.openId.set(''); }
  saveHome() {
    const p = this.profile(); if (!p) return;
    if (this.newHome() === p.home) return this.error.set('Choose a different location to change it.');
    if (this.reason().trim().length < 3) return this.error.set('Add a short reason for the change.');
    this.flow.setHome([{ employeeId: p.e.id, name: p.e.name, location: this.newHome(), reason: this.reason().trim() }]);
    this.notify(p.e.name + ' now works from ' + this.newHome() + ' by default.');
    this.reason.set('');
  }
  viewAttendance(e: Employee) { this.data.go('myAttendance', { employee: e.id }); }

  exportCsv() {
    this.data.csv('employee-directory.csv', [
      ['Employee ID', 'Employee', 'Department', 'Role', 'Default location', 'Shift today', 'Status today', 'Month attendance %'],
      ...this.filtered().map(x => [x.e.id, x.e.name, x.e.department, x.e.role, x.home, x.shift.name, LABELS[x.v.rec.status], x.rate.toFixed(1)]),
    ]);
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

