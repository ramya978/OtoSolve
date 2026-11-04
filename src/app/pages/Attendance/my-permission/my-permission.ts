import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, addDays, hm, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';
import { FlowRequest, toMin } from '../Attendance/attendance-flow.store';
import { AkSelect } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';

/* =====================================================================================================
   MY PERMISSION (employee) - short time off during the day.
     monthly allowance (set by HR in Leave → Leave types) · ask: arrive late / leave early / step out
     · history with approval path · withdraw while pending
   ===================================================================================================== */
type Kind = 'late' | 'early' | 'out';

@Component({
  selector: 'app-my-permission',
  standalone: true,
  imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './my-permission.html',
  styleUrls: ['../Attendance/attendance-kit.css', './my-permission.css'],
})
export class MyPermission {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly hm = hm;
  readonly kind = signal<Kind>('late');
  readonly date = signal(this.data.today);
  readonly from = signal('09:00');
  readonly to = signal('10:00');
  readonly reason = signal('');
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  readonly kinds: { k: Kind; label: string; text: string }[] = [
    { k: 'late', label: 'Arrive late', text: 'Start later than your shift' },
    { k: 'early', label: 'Leave early', text: 'Finish before your shift ends' },
    { k: 'out', label: 'Step out', text: 'A break in between' },
  ];

  constructor() { void this.data.ensure().then(() => this.setKind('late')); }

  readonly me = computed(() => this.data.person(this.hr.meId()));
  readonly peopleOptions = computed(() => this.data.people().map(p => ({ value: p.id, label: p.name, hint: p.department })));
  readonly shift = computed(() => { const me = this.me(); return me ? this.data.shiftFor(me.id, this.date()) : null; });
  readonly rules = computed(() => this.hr.permRules());
  readonly meter = computed(() => Array.from({ length: Math.min(20, this.rules().perMonth) }, (_, i) => i));
  readonly used = computed(() => { const me = this.me(); this.data.flow.requests(); return me ? this.hr.permissionUsed(me.id, this.date().slice(0, 7)) : 0; });
  readonly minutes = computed(() => Math.max(0, (toMin(this.to()) ?? 0) - (toMin(this.from()) ?? 0)));
  readonly mine = computed(() => { const me = this.me(); return me ? this.data.flow.requests().filter(r => r.employeeId === me.id && r.type === 'Permission').sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []; });
  readonly monthName = computed(() => niceDate(this.date(), { month: 'long' }));

  setKind(k: Kind) {
    this.kind.set(k); this.error.set('');
    const s = this.shift(), start = s?.start ?? '09:00', end = s?.end ?? '18:00', sm = toMin(start) ?? 540, em = toMin(end) ?? 1080;
    const t = (n: number) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
    if (k === 'late') { this.from.set(start); this.to.set(t(sm + 60)); }
    else if (k === 'early') { this.from.set(t(em - 60)); this.to.set(end); }
    else { this.from.set(t(sm + 180)); this.to.set(t(sm + 240)); }
  }
  setDate(d: string) { this.date.set(d); this.setKind(this.kind()); }

  send() {
    const me = this.me(); if (!me) return;
    const r = this.rules(), m = this.minutes();
    if (!m) return this.error.set('The end time must be after the start time.');
    if (m > r.maxMinutes) return this.error.set('A permission can be at most ' + hm(r.maxMinutes) + '. Apply for a half day instead.');
    if (this.used() >= r.perMonth) return this.error.set('You have used all ' + r.perMonth + ' permissions for ' + this.monthName() + '.');
    if (this.reason().trim().length < 3) return this.error.set('Write a short reason.');
    if (this.mine().some(x => x.date === this.date() && x.status === 'Pending')) return this.error.set('You already have a pending permission on this day.');
    const req = this.hr.raiseRequest({ employeeId: me.id, employeeName: me.name, department: me.department, type: 'Permission', date: this.date(), from: this.from(), to: this.to(), location: this.data.location(me.id, this.date()), reason: (this.kinds.find(k => k.k === this.kind())!.label + ': ' + this.reason().trim()).slice(0, 240) });
    this.reason.set(''); this.error.set('');
    this.notify(req.id + ' sent to ' + (this.hr.waitingStep(this.hr.requestChain(this.data.flow.requests().find(x => x.id === req.id)!))?.name ?? 'HR') + '.');
  }
  withdraw(r: FlowRequest) { const me = this.me(); if (!me) return; this.data.flow.withdraw(r.id, me.name); this.notify('Permission withdrawn.'); }
  where(r: FlowRequest) { const s = this.hr.waitingStep(this.hr.requestChain(r)); return r.status === 'Pending' && s ? 'Waiting on ' + s.name : r.status + (r.decidedBy ? ' by ' + r.decidedBy : ''); }
  statusTone(s: string) { return s === 'Approved' ? 'teal' : s === 'Rejected' ? 'rose' : s === 'Pending' ? 'amber' : ''; }
  short(d: string) { return niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
  dur(r: FlowRequest) { return hm(Math.max(0, (toMin(r.to) ?? 0) - (toMin(r.from) ?? 0))); }
  readonly maxDate = addDays(this.data.today, 30);
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}
