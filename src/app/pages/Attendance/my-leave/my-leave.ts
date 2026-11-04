import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, addDays, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, ChainStep, LeaveRequest, ROLE_LABEL } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';

/* =====================================================================================================
   MY LEAVE (employee)
     balances per leave type · apply (type, full / half day, dates, reason) with live day count and
     balance after · my requests with their approval path · teammates away soon · next holidays
   ===================================================================================================== */
@Component({
  selector: 'app-my-leave',
  standalone: true,
  imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './my-leave.html',
  styleUrls: ['../Attendance/attendance-kit.css', './my-leave.css'],
})
export class MyLeave {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly roleLabel = ROLE_LABEL;
  readonly typeId = signal('LT-CL');
  readonly half = signal<'' | 'AM' | 'PM'>('');
  readonly from = signal(addDays(this.data.today, 1));
  readonly to = signal(addDays(this.data.today, 1));
  readonly reason = signal('');
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  readonly minDate = addDays(this.data.today, -30);
  readonly maxDate = addDays(this.data.today, 180);

  constructor() { void this.data.ensure().then(() => this.hr.seedDemo()); }

  readonly me = computed(() => this.data.person(this.hr.meId()));
  readonly peopleOptions = computed(() => this.data.people().map(p => ({ value: p.id, label: p.name, hint: p.department })));
  readonly balances = computed(() => {
    const me = this.me(); if (!me) return [];
    this.hr.leaves();
    return this.hr.types().filter(t => t.active).map(t => {
      const used = this.hr.used(me.id, t.id, false), pending = this.hr.used(me.id, t.id) - used, left = this.hr.balance(me.id, t);
      return { t, used, pending, left, pct: t.quota ? (left ?? 0) / t.quota * 100 : 100 };
    });
  });
  readonly typeOptions = computed(() => this.balances().map(b => ({ value: b.t.id, label: b.t.name, hint: b.left === null ? 'No limit' + (b.t.paid ? '' : ' · unpaid') : b.left + ' day' + (b.left === 1 ? '' : 's') + ' left' })));
  readonly days = computed(() => this.hr.leaveDays(this.from(), this.half() ? this.from() : this.to(), this.half()));
  readonly after = computed(() => { const b = this.balances().find(x => x.t.id === this.typeId()); return b?.left === null || !b ? null : b.left - this.days(); });
  readonly mine = computed(() => { const me = this.me(); return me ? this.hr.leaves().filter(l => l.employeeId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []; });
  readonly teamAway = computed(() => {
    const me = this.me(); if (!me) return [];
    const T = this.data.today, end = addDays(T, 21);
    return this.hr.leaves().filter(l => l.status === 'Approved' && l.department === me.department && l.employeeId !== me.id && l.to >= T && l.from <= end).sort((a, b) => a.from.localeCompare(b.from)).slice(0, 6);
  });
  readonly nextHolidays = computed(() => this.hr.holidays().filter(h => h.date >= this.data.today && !h.optional).slice(0, 4));

  short(d: string) { return niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
  dates(l: LeaveRequest) { return l.from === l.to ? this.short(l.from) + (l.half ? ' · ' + (l.half === 'AM' ? 'morning' : 'afternoon') : '') : this.short(l.from) + ' → ' + this.short(l.to); }
  statusTone(s: string) { return s === 'Approved' ? 'teal' : s === 'Rejected' ? 'rose' : s === 'Pending' ? 'amber' : ''; }
  stepTone(s: ChainStep) { return s.status === 'Approved' ? 'teal' : s.status === 'Rejected' ? 'rose' : s.status === 'Waiting' ? 'blue' : ''; }
  where(l: LeaveRequest) { const s = this.hr.waitingStep(l.chain); return l.status === 'Pending' && s ? 'Waiting on ' + s.name : l.status + (l.decidedBy ? ' by ' + l.decidedBy : ''); }
  canCancel(l: LeaveRequest) { return l.status === 'Pending' || (l.status === 'Approved' && l.from > this.data.today); }

  setFrom(d: string) { this.from.set(d); if (this.to() < d || this.half()) this.to.set(d); this.error.set(''); }
  setHalf(h: '' | 'AM' | 'PM') { this.half.set(h); if (h) this.to.set(this.from()); this.error.set(''); }
  apply() {
    const me = this.me(); if (!me) return;
    const err = this.hr.applyLeave(me, this.typeId(), this.from(), this.half() ? this.from() : this.to(), this.half(), this.reason());
    if (err) return this.error.set(err);
    this.reason.set('');
    this.notify('Leave request sent to ' + (this.mine()[0]?.chain[0]?.name ?? 'your manager') + '.');
  }
  cancel(l: LeaveRequest) { const me = this.me(); if (!me) return; this.hr.cancelLeave(l.id, me.name); this.notify('Leave ' + l.id + ' cancelled.'); }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}
