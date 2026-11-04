import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AttRecord, Employee, LABELS, STORAGE_KEY, Status, apiList, datesOf, dayKind, depDisplay, employeeDemoRecord, key,
  lateMinutes, mapUser, netMinutes, readRegisterOverrides, record, todayIso, validate,
} from './attendance';
import { AttendanceFlowStore, FlowRequest, SHIFT, punchRecord, summarize, toMin } from './attendance-flow.store';
import './attendance-font'; // Public Sans, the reference typeface
import { IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { UserDirectoryApiService } from '../../../Service/user-directory-api.service';

/* =====================================================================================================
   ATTENDANCE DATA - one place for what every attendance page needs:
     directory (Users + Departments API, loaded once) · one day's record from the best source
     (register save → employee punches → sample) · shift of the day · month totals · saving records.
   The routes below are where the pages link to each other; change them to match your app routes.
   ===================================================================================================== */

export const ATTENDANCE_LINKS = {
  overview: '/app/attendance/overview',
  register: '/app/attendance',
  myAttendance: '/app/individual-attendance',
  punchStation: '/app/attendance/punch-station',
  bulk: '/app/bulk-attendance',
  fieldHub: '/app/attendance/field-hub',
  directory: '/app/attendance/employees',
  locations: '/app/attendance/locations',
  planner: '/app/shift-planner',
  templates: '/app/shift-templates',
  permissions: '/app/permission-desk',
  policies: '/app/attendance-policies',
  payroll: '/app/attendance/payroll',
  audit: '/app/attendance/audit',
  leave: '/app/attendance/leave',
  holidays: '/app/attendance/holidays',
  exceptions: '/app/attendance/exceptions',
  approvalFlow: '/app/attendance/approval-flow',
  geo: '/app/attendance/geo-fencing',
  devices: '/app/attendance/devices',
  reports: '/app/attendance/reports',
  myLeave: '/app/attendance/my-leave',
  myPermission: '/app/attendance/my-permission',
  teamApprovals: '/app/attendance/team-approvals',
  companyCalendar: '/app/attendance/company-calendar',
};
export type AttendanceLink = keyof typeof ATTENDANCE_LINKS;

export interface ShiftDef { id: string; name: string; start: string; end: string; breakMinutes: number; graceMinutes: number; active: boolean; }
export type DaySource = 'register' | 'punch' | 'sample' | 'upcoming';
export interface DayView { rec: AttRecord; source: DaySource; minutes: number; late: number; overtime: number; live: boolean; }
export interface MonthStats {
  scheduled: number; P: number; HD: number; L: number; A: number; U: number; WO: number; H: number;
  minutes: number; overtime: number; late: number; missing: number; payable: number; lop: number; rate: number; days: number;
}

const SHIFT_STORE = 'precision-attendance-management-v1'; // shift templates + shift planner
export const DEFAULT_SHIFTS: ShiftDef[] = [
  { id: 'SH-GENERAL', name: 'General shift', start: '09:00', end: '18:00', breakMinutes: 60, graceMinutes: 10, active: true },
  { id: 'SH-EARLY', name: 'Early shift', start: '06:00', end: '14:00', breakMinutes: 30, graceMinutes: 10, active: true },
  { id: 'SH-EVENING', name: 'Evening shift', start: '14:00', end: '22:00', breakMinutes: 30, graceMinutes: 10, active: true },
  { id: 'SH-NIGHT', name: 'Night shift', start: '22:00', end: '06:00', breakMinutes: 30, graceMinutes: 10, active: true },
];

@Injectable({ providedIn: 'root' })
export class AttendanceDataService {
  private readonly usersApi = inject(UserDirectoryApiService);
  private readonly deptApi = inject(IamAdminApiService);
  private readonly router = inject(Router);
  readonly flow = inject(AttendanceFlowStore);

  readonly people = signal<Employee[]>([]);
  readonly departments = signal<string[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly overrides = signal<Record<string, AttRecord>>(readRegisterOverrides());
  readonly shifts = signal<ShiftDef[]>(DEFAULT_SHIFTS);
  private assignments: Record<string, string> = {};
  private loaded: Promise<void> | null = null;
  readonly today = todayIso();

  constructor() {
    this.readShifts();
    try { window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) this.overrides.set(readRegisterOverrides()); if (e.key === SHIFT_STORE) this.readShifts(); }); } catch { /* SSR */ }
  }

  /** load the directory once per session; pages call this from their constructor */
  ensure(force = false): Promise<void> {
    if (!this.loaded || force) this.loaded = this.load();
    this.overrides.set(readRegisterOverrides());
    this.readShifts();
    return this.loaded;
  }

  private async load() {
    this.loading.set(true); this.error.set('');
    try {
      const [users, deps] = await Promise.all([
        firstValueFrom(this.usersApi.searchUsers({ pageIndex: 0, pageSize: 1000 })),
        firstValueFrom(this.deptApi.getDepartments()),
      ]);
      const depRows = Array.isArray(deps) ? deps : apiList(deps, ['items', 'departments', 'results', 'content']);
      const byId = new Map<string, string>();
      for (const d of depRows as any[]) { const name = depDisplay(d), id = d?.id ?? d?.departmentId ?? d?.department_id ?? d?.uuid; if (name && id != null) byId.set(String(id), name); }
      const rows = apiList(users, ['items', 'users', 'employees', 'results', 'content', 'records']);
      const people = rows.map((u, i) => mapUser(u, byId, i)).filter((u): u is Employee => !!u);
      if (rows.length && !people.length) throw new Error('Users response format could not be mapped.');
      this.people.set(people);
      this.departments.set([...new Set([...depRows.map(depDisplay), ...people.map(p => p.department)].filter(Boolean))]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.loaded = null;
    } finally { this.loading.set(false); }
  }

  private readShifts() {
    try {
      const raw = JSON.parse(localStorage.getItem(SHIFT_STORE) || 'null');
      if (raw && Array.isArray(raw.shifts) && raw.shifts.length) this.shifts.set(raw.shifts.map((s: any) => ({ id: s.id, name: s.name, start: s.start, end: s.end, breakMinutes: Number(s.breakMinutes ?? 0), graceMinutes: Number(s.graceMinutes ?? 10), active: s.active !== false })));
      const map: Record<string, string> = {};
      if (raw && Array.isArray(raw.assignments)) for (const a of raw.assignments) if (a?.employeeId && a?.date) map[a.date + '|' + a.employeeId] = a.shiftId;
      this.assignments = map;
    } catch { /* keep defaults */ }
  }

  /* ------------------------------------------------ reads */
  person(id: string) { return this.people().find(p => p.id === id) ?? null; }
  personIndex(id: string) { return Math.max(0, this.people().findIndex(p => p.id === id)); }
  location(id: string, date: string) {
    return this.flow.meta(id, date).location ?? this.flow.log(id, date)?.location ?? this.flow.home(id, this.personIndex(id));
  }
  shiftFor(id: string, date: string): ShiftDef {
    const sid = this.flow.meta(id, date).shift ?? this.assignments[date + '|' + id];
    return this.shifts().find(s => s.id === sid) ?? this.shifts().find(s => s.id === 'SH-GENERAL') ?? DEFAULT_SHIFTS[0];
  }

  /** one day for one employee, from the best source available */
  day(id: string, date: string): DayView {
    if (date > this.today) return { rec: { status: 'U', in: '', out: '', break: 0, mode: 'Office', session: 'AM', note: 'Upcoming' }, source: 'upcoming', minutes: 0, late: 0, overtime: 0, live: false };
    const k = key(date, id), saved = this.overrides()[k], log = this.flow.log(id, date), punched = log && dayKind(date) === 'W' ? punchRecord(log) : null;
    let rec: AttRecord, source: DaySource, minutes: number, live = false;
    if (saved) { rec = saved; source = 'register'; minutes = netMinutes(saved) ?? 0; }
    else if (punched && log) {
      const now = new Date(), s = summarize(log.punches, date === this.today ? now.getHours() * 60 + now.getMinutes() : null);
      rec = punched; source = 'punch'; minutes = s.workedMin; live = s.open;
    } else { rec = employeeDemoRecord(date, id); source = 'sample'; minutes = netMinutes(rec) ?? 0; }
    const sh = this.shiftFor(id, date), start = toMin(sh.start) ?? SHIFT.startMin, inMin = toMin(rec.in);
    const late = rec.status === 'P' && inMin !== null ? Math.max(0, inMin - start > sh.graceMinutes ? inMin - start : 0) : lateMinutes(rec);
    return { rec, source, minutes, late, overtime: rec.status === 'P' ? Math.max(0, minutes - SHIFT.netTarget) : 0, live };
  }

  monthStats(id: string, month: string): MonthStats {
    const s: MonthStats = { scheduled: 0, P: 0, HD: 0, L: 0, A: 0, U: 0, WO: 0, H: 0, minutes: 0, overtime: 0, late: 0, missing: 0, payable: 0, lop: 0, rate: 0, days: 0 };
    for (const date of datesOf(month)) {
      if (date > this.today) break;
      const kind = dayKind(date); if (kind === 'F') continue;
      s.days++;
      if (kind === 'W') s.scheduled++;
      const d = this.day(id, date), st = d.rec.status;
      if (st in s) (s as any)[st]++;
      s.minutes += d.minutes; s.overtime += d.overtime; if (d.late) s.late++;
      if (['P', 'HD'].includes(st) && !d.live && netMinutes(d.rec) === null) s.missing++;
    }
    s.payable = s.P + s.HD * .5 + s.L + s.WO + s.H;
    s.lop = s.A + s.HD * .5;
    const required = Math.max(0, s.scheduled - s.L);
    s.rate = required ? (s.P + s.HD * .5) / required * 100 : 0;
    return s;
  }

  /* ------------------------------------------------ writes */
  /** merge records into the saved register (the admin Attendance page reads the same storage) */
  writeRecords(entries: Record<string, AttRecord>, action: string, detail: string): string {
    const keys = Object.keys(entries);
    if (!keys.length) return 'Nothing to save.';
    const locked = keys.find(k => this.flow.isLocked(k.slice(0, 10)));
    if (locked) return 'That month is finalised. Reopen it in Payroll summary first.';
    try {
      const current = readRegisterOverrides();
      const next = { ...current, ...entries };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, records: next }));
      this.overrides.set(next);
      this.flow.recordAdmin(action, detail);
      return '';
    } catch { return 'Browser storage is unavailable - changes were not saved.'; }
  }

  /* ------------------------------------------------ helpers */
  label(s: Status) { return LABELS[s]; }
  go(link: AttendanceLink, query?: Record<string, string>) { void this.router.navigateByUrl(ATTENDANCE_LINKS[link] + (query ? '?' + new URLSearchParams(query).toString() : '')); }
  csv(name: string, rows: (string | number)[][]) {
    const text = '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/** what approving an employee request writes into the register (shared by admin, managers and HR) */
export function requestToRecord(r: FlowRequest, cur: AttRecord): { record: AttRecord | null; text: string } {
  const kind = dayKind(r.date);
  const short = new Date(r.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (kind !== 'W') return { record: null, text: 'No register change - ' + LABELS[kind].toLowerCase() + '.' };
  const remote = /remote/i.test(r.location);
  const span = (toMin(r.to) ?? 0) - (toMin(r.from) ?? 0);
  const br = span >= 300 ? 60 : 0;
  let next: AttRecord;
  switch (r.type) {
    case 'Punch correction': next = record('P', { in: r.from, out: r.to, break: br, mode: remote ? 'Remote' : 'Office', note: ('Punch correction ' + r.id + ' · ' + r.reason).slice(0, 180) }); break;
    case 'Work from home': next = record('P', { in: r.from || SHIFT.start, out: r.to || SHIFT.end, break: br || 60, mode: 'Remote', note: ('Work from home ' + r.id + ' · ' + r.reason).slice(0, 180) }); break;
    case 'On duty': next = record('P', { in: r.from || SHIFT.start, out: r.to || SHIFT.end, break: br, mode: 'Office', note: ('On duty at ' + r.location + ' · ' + r.id).slice(0, 180) }); break;
    case 'Half day': {
      const pm = (toMin(r.from) ?? 540) >= 780;
      next = record('HD', { session: pm ? 'PM' : 'AM', in: pm ? '14:00' : '09:00', out: pm ? '18:00' : '13:00', break: 0, mode: remote ? 'Remote' : 'Office', note: ('Half day ' + r.id).slice(0, 180) });
      break;
    }
    default: next = { ...cur, note: ('Permission ' + r.from + '–' + r.to + ' approved. ' + cur.note).slice(0, 180) };
  }
  const text = r.type === 'Permission'
    ? 'Adds an approved-permission note to ' + short + '. Status stays ' + LABELS[cur.status].toLowerCase() + '.'
    : short + ' becomes ' + LABELS[next.status] + (next.in ? ' · ' + next.in + '–' + next.out : '') + ' · ' + next.mode + '.';
  return { record: validate(next) ? null : next, text: validate(next) ? 'Cannot apply: ' + validate(next) : text };
}

/* small shared formatting helpers */
export const hm = (n: number) => `${Math.floor(Math.max(0, n) / 60)}h ${String(Math.max(0, n) % 60).padStart(2, '0')}m`;
export const niceDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', opts);
export const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
export const STATUS_TONE: Record<Status, string> = { P: 'teal', HD: 'amber', L: 'violet', A: 'rose', U: 'neutral', WO: 'neutral', H: 'blue', F: 'neutral' };