import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, AttendanceLink, STATUS_TONE, niceDate } from '../Attendance/attendance-data.service';
import { AkDate } from '../Attendance/ak-date';
import { LABELS } from '../Attendance/attendance';

/* =====================================================================================================
   ATTENDANCE OVERVIEW - the HR landing page: what needs attention today, at a glance.
     attention banner · four day figures · status distribution · location coverage
     · employees needing review · pending requests · quick links to every attendance page
   ===================================================================================================== */
@Component({
  selector: 'app-attendance-overview',
  standalone: true,
  imports: [PageHeader, AkDate],
  templateUrl: './attendance-overview.html',
  styleUrls: ['../Attendance/attendance-kit.css', './attendance-overview.css'],
})
export class AttendanceOverview implements OnDestroy {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly date = signal(this.data.today);
  readonly tick = signal(0);
  private timer = setInterval(() => this.tick.update(n => n + 1), 30000); // keeps live punches fresh
  readonly tone = STATUS_TONE;
  readonly labels = LABELS;

  constructor() { void this.data.ensure(); }
  ngOnDestroy() { clearInterval(this.timer); }

  /** every employee's day on the chosen date */
  readonly rows = computed(() => {
    this.tick();
    const d = this.date();
    return this.data.people().map(e => ({ e, v: this.data.day(e.id, d), location: this.data.location(e.id, d) }));
  });

  readonly stats = computed(() => {
    const r = this.rows(), n = (f: (x: typeof r[number]) => boolean) => r.filter(f).length;
    return {
      total: r.length,
      present: n(x => ['P', 'HD'].includes(x.v.rec.status)),
      live: n(x => x.v.live),
      late: n(x => x.v.late > 0),
      missing: n(x => ['P', 'HD'].includes(x.v.rec.status) && !!x.v.rec.in && !x.v.rec.out && !x.v.live),
      unmarked: n(x => x.v.rec.status === 'U'),
      absent: n(x => x.v.rec.status === 'A'),
      leave: n(x => x.v.rec.status === 'L'),
      remote: n(x => ['P', 'HD'].includes(x.v.rec.status) && x.v.rec.mode === 'Remote'),
      off: n(x => ['WO', 'H', 'F'].includes(x.v.rec.status)),
    };
  });

  readonly distribution = computed(() => {
    const s = this.stats(), total = Math.max(1, s.total);
    return [
      { label: 'Present · office', count: s.present - s.remote, tone: 'teal' },
      { label: 'Present · remote', count: s.remote, tone: 'blue' },
      { label: 'Approved leave', count: s.leave, tone: 'violet' },
      { label: 'Absent', count: s.absent, tone: 'rose' },
      { label: 'Unmarked', count: s.unmarked, tone: '' },
    ].map(x => ({ ...x, pct: x.count / total * 100 }));
  });

  readonly coverage = computed(() => {
    const working = this.rows().filter(x => ['P', 'HD'].includes(x.v.rec.status));
    const names = [...new Set([...this.flow.activeLocations(), ...working.map(x => x.location)])];
    const max = Math.max(1, ...names.map(l => working.filter(x => x.location === l).length));
    return names.map(l => {
      const count = working.filter(x => x.location === l).length;
      return { name: l, count, pct: count / max * 100, type: this.flow.locations().find(x => x.name === l)?.type ?? 'Office' };
    }).sort((a, b) => b.count - a.count);
  });

  readonly review = computed(() => this.rows().filter(x => x.v.rec.status === 'U' || x.v.late > 0 || (!!x.v.rec.in && !x.v.rec.out && !x.v.live))
    .map(x => ({ ...x, issue: x.v.rec.status === 'U' ? 'Not marked' : !x.v.rec.out && x.v.rec.in && !x.v.live ? 'Missing punch-out' : 'Late ' + x.v.late + ' min' }))
    .slice(0, 8));

  readonly pending = computed(() => this.flow.requests().filter(r => r.status === 'Pending').slice(0, 5));

  readonly quick: { link: AttendanceLink; title: string; text: string }[] = [
    { link: 'register', title: 'Daily register', text: 'Mark the day, fix punches, approve requests' },
    { link: 'punchStation', title: 'Punch station', text: 'Shared kiosk for check-in and check-out' },
    { link: 'bulk', title: 'Bulk attendance', text: 'Mark many employees at once, or move locations' },
    { link: 'fieldHub', title: 'Field hub', text: 'Shift, source, project and approval per employee' },
    { link: 'planner', title: 'Shift planner', text: 'Weekly roster and shift assignments' },
    { link: 'payroll', title: 'Payroll summary', text: 'Payable days, loss of pay and month close' },
  ];

  readonly isToday = computed(() => this.date() === this.data.today);
  readonly dateText = computed(() => niceDate(this.date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  readonly minDate = (() => { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return d.toISOString().slice(0, 8) + '01'; })();
  short(d: string) { return niceDate(d); }

  exportCsv() {
    this.data.csv('attendance-overview-' + this.date() + '.csv', [
      ['Employee ID', 'Employee', 'Department', 'Date', 'Status', 'In', 'Out', 'Worked minutes', 'Late minutes', 'Location'],
      ...this.rows().map(x => [x.e.id, x.e.name, x.e.department, this.date(), LABELS[x.v.rec.status], x.v.rec.in, x.v.rec.out, x.v.minutes, x.v.late, x.location]),
    ]);
  }
}

