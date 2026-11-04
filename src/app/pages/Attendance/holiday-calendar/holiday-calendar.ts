import { Component, Input, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, addDays, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, Holiday } from '../Attendance/attendance-hr.store';
import { AkDate } from '../Attendance/ak-date';
import { AkSelect } from '../Attendance/ak-select';

/* =====================================================================================================
   HOLIDAY CALENDAR (admin) / COMPANY CALENDAR (employee)
     month grid with holidays, weekly offs and approved leave · the year's holiday list · who is away soon
     Admin can add, edit and remove holidays; they become "Holiday" on every attendance page.
     The employee page is the same view, read only (CompanyCalendar below).
   ===================================================================================================== */
const TYPES: Holiday['type'][] = ['National', 'Festival', 'Company'];

@Component({
  selector: 'app-holiday-calendar',
  standalone: true,
  imports: [PageHeader, AkDate, AkSelect],
  templateUrl: './holiday-calendar.html',
  styleUrls: ['../Attendance/attendance-kit.css', './holiday-calendar.css'],
})
export class HolidayCalendar {
  /** 'admin' edits holidays; 'employee' is read only and shows the viewer's own leave */
  @Input() mode: 'admin' | 'employee' = 'admin';
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly types = TYPES;
  readonly week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly month = signal(this.data.today.slice(0, 7));
  readonly editing = signal<{ original: string; h: Holiday } | null>(null);
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure().then(() => this.hr.seedDemo()); }

  get admin() { return this.mode === 'admin'; }
  readonly peopleOptions = computed(() => this.data.people().map(p => ({ value: p.id, label: p.name, hint: p.department })));
  readonly title = computed(() => new Date(this.month() + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));

  readonly grid = computed(() => {
    const first = new Date(this.month() + '-01T12:00:00'), lead = (first.getDay() + 6) % 7;
    const start = addDays(this.month() + '-01', -lead), me = this.hr.meId(), leaves = this.hr.leaves().filter(l => l.status === 'Approved');
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i), w = new Date(d + 'T12:00:00').getDay();
      const away = leaves.filter(l => l.from <= d && l.to >= d);
      return {
        d, n: Number(d.slice(-2)), out: d.slice(0, 7) !== this.month(), off: w === 0 || w === 6, today: d === this.data.today,
        holiday: this.hr.holidayOn(d), away: away.length, dots: Array.from({ length: Math.min(4, away.length) }, (_, j) => j), mine: !this.admin && away.some(l => l.employeeId === me),
      };
    });
  });
  readonly yearList = computed(() => {
    const y = this.month().slice(0, 4);
    return this.hr.holidays().filter(h => h.date.startsWith(y)).map(h => ({ ...h, past: h.date < this.data.today, day: niceDate(h.date, { weekday: 'short' }) }));
  });
  readonly nextHoliday = computed(() => this.hr.holidays().find(h => h.date >= this.data.today) ?? null);
  readonly awaySoon = computed(() => {
    const T = this.data.today, end = addDays(T, 21);
    return this.hr.leaves().filter(l => l.status === 'Approved' && l.to >= T && l.from <= end).sort((a, b) => a.from.localeCompare(b.from)).slice(0, 8);
  });
  readonly counts = computed(() => { const l = this.yearList(); return { total: l.length, left: l.filter(h => !h.past).length, optional: l.filter(h => h.optional).length }; });

  short(d: string) { return niceDate(d, { day: 'numeric', month: 'short' }); }
  long(d: string) { return niceDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  moveMonth(n: number) { const d = new Date(this.month() + '-01T12:00:00'); d.setMonth(d.getMonth() + n); this.month.set(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  typeTone(t: string) { return t === 'National' ? 'blue' : t === 'Festival' ? 'amber' : 'violet'; }

  dayClick(c: { d: string; holiday: Holiday | null }) {
    if (!this.admin) return;
    this.edit(c.holiday ?? { date: c.d, name: '', type: 'Company', optional: false }, c.holiday ? c.d : '');
  }
  add() { this.edit({ date: this.nextFree(), name: '', type: 'Company', optional: false }, ''); }
  private nextFree() { let d = this.data.today; while (this.hr.holidayOn(d)) d = addDays(d, 1); return d; }
  edit(h: Holiday, original: string) { this.editing.set({ original, h: { ...h } }); this.error.set(''); }
  patch(p: Partial<Holiday>) { const e = this.editing(); if (e) this.editing.set({ ...e, h: { ...e.h, ...p } }); this.error.set(''); }
  save() {
    const e = this.editing(); if (!e) return;
    if (e.h.name.trim().length < 2) return this.error.set('Give the holiday a name.');
    if (e.h.date !== e.original && this.hr.holidayOn(e.h.date)) return this.error.set(niceDate(e.h.date) + ' is already a holiday.');
    if (this.data.flow.isLocked(e.h.date)) return this.error.set('That month is finalised in Payroll summary.');
    this.hr.saveHoliday({ ...e.h, name: e.h.name.trim() }, e.original);
    this.month.set(e.h.date.slice(0, 7));
    this.editing.set(null);
    this.notify(e.h.name.trim() + ' saved. It now shows as a holiday on every attendance page.');
  }
  remove() {
    const e = this.editing(); if (!e?.original) return;
    this.hr.removeHoliday(e.original);
    this.editing.set(null);
    this.notify('Holiday removed.');
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

/** Employee view: the same calendar, read only, with the viewer's own leave marked. */
@Component({
  selector: 'app-company-calendar',
  standalone: true,
  imports: [PageHeader, AkDate, AkSelect],
  templateUrl: './holiday-calendar.html',
  styleUrls: ['../Attendance/attendance-kit.css', './holiday-calendar.css'],
})
export class CompanyCalendar extends HolidayCalendar {
  override mode: 'admin' | 'employee' = 'employee';
}

