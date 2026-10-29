import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { PageHeader } from '../../Shared/layout/page-header/page-header';
import { firstValueFrom } from 'rxjs';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { IamAdminApiService } from '../../Service/iam-admin-api.service';
import { LoaderService } from '../../Shared/services/loader.service';
import { UserListItemResponse, DepartmentResponse } from '../../Shared/models/iam-contract.model';

/* =====================================================================================================
   ATTENDANCE - daily register · monthly report · PDF preview / download
   Same flow as the "Precision Attendance Studio" prototype:
     Daily      : figures · register (filters, bulk "mark present", per-row edit) · attention desk · editor
     Monthly    : figures · day-by-day grid / summary table · by department · report checks
     PDF        : on-screen paper preview (2 pages) · landscape A4 PDF built with pdf-lib
   Records are sample data kept in this browser (localStorage) until the attendance API is connected.
   PDF needs:  npm i pdf-lib   (loaded on demand, only when a PDF is downloaded)
   ===================================================================================================== */

/* ---------------------------------------------------------------- types */
export type Status = 'P' | 'HD' | 'L' | 'A' | 'U' | 'WO' | 'H' | 'F';
export type View = 'daily' | 'timeline' | 'report' | 'pdf';
export type Tone = 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'neutral';

export interface Employee { id: string; name: string; department: string; role: string; initials: string; tone: Tone; }
export interface AttRecord { status: Status; in: string; out: string; break: number; mode: 'Office' | 'Remote'; session: 'AM' | 'PM'; note: string; }
export interface Period { label: string; cutoff: string; holiday: string; holidayName: string; }
export interface Summary {
  id: string; name: string; department: string;
  scheduled: number; P: number; HD: number; L: number; A: number; U: number; WO: number; H: number;
  late: number; missing: number; minutes: number; credit: number; required: number; rate: number;
}
export interface Totals {
  scheduled: number; P: number; HD: number; L: number; A: number; U: number;
  late: number; missing: number; minutes: number; credit: number; required: number; rate: number;
}
export interface Report {
  month: string; period: Period; employees: Employee[]; rows: Summary[]; total: Totals;
  data: Record<string, AttRecord>; dates: string[]; meta: { department: string; search: string; draftCount: number };
}

/* ---------------------------------------------------------------- sample data + rules */
export const EMPLOYEES: Employee[] = ([
  ['EMP-1001', 'Maya Raj', 'Engineering', 'Frontend engineer', 'MR', 'blue'],
  ['EMP-1002', 'Arun Daniel', 'Engineering', 'Backend engineer', 'AD', 'violet'],
  ['EMP-1003', 'N. Priya', 'Engineering', 'QA engineer', 'NP', 'teal'],
  ['EMP-1004', 'S. Anita', 'Operations', 'Operations lead', 'SA', 'violet'],
  ['EMP-1005', 'P. Ravi', 'Operations', 'Campaign coordinator', 'PR', 'amber'],
  ['EMP-1006', 'Daniel Lim', 'Operations', 'Support specialist', 'DL', 'blue'],
  ['EMP-1007', 'Farah Nizam', 'Operations', 'Programme coordinator', 'FN', 'rose'],
  ['EMP-1008', 'Joel Mathew', 'Engineering', 'Software engineer', 'JM', 'teal'],
  ['EMP-1009', 'Ruth George', 'Administration', 'People operations', 'RG', 'amber'],
  ['EMP-1010', 'Leena Joseph', 'Administration', 'Finance associate', 'LJ', 'violet'],
  ['EMP-1011', 'David Thomas', 'Engineering', 'Platform engineer', 'DT', 'blue'],
  ['EMP-1012', 'Sarah Paul', 'Administration', 'Office coordinator', 'SP', 'teal'],
] as const).map(([id, name, department, role, initials, tone]) => ({ id, name, department, role, initials, tone: tone as Tone }));

export const DEPARTMENTS = ['Engineering', 'Operations', 'Administration'];

// Read-only directory API. Attendance changes remain browser-local until a write API is supplied.
type ApiObject = Record<string, any>;
function apiList(payload: any, names: string[]): ApiObject[] {
  if (Array.isArray(payload)) return payload;
  for (const obj of [payload, payload?.data, payload?.result, payload?.response, payload?.data?.data]) {
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') for (const name of names) if (Array.isArray(obj[name])) return obj[name];
  }
  return [];
}
function depDisplay(d: any): string {
  if (typeof d === 'string') return d;
  return String(d?.name ?? d?.departmentName ?? d?.department_name ?? d?.title ?? '').trim();
}
function mapDepartment(u: ApiObject, byId: Map<string,string>): string {
  const dep = u['department'] ?? u['departmentDetails'] ?? u['department_details'] ?? u['department_name'] ?? u['departmentName'];
  if (dep && typeof dep === 'object') {
    const name = depDisplay(dep);
    if (name) return name;
  }
  const id = u['departmentId'] ?? u['department_id'] ?? u['department']?.['id'] ?? u['department']?.['uuid'] ?? dep;
  return byId.get(String(id ?? '')) ?? (typeof dep === 'string' && !/^[0-9a-f-]{20,}$/i.test(dep) ? dep : 'Unassigned');
}
function mapUser(u: ApiObject, byId: Map<string,string>, index: number): Employee | null {
  const rawId = u['id'] ?? u['userId'] ?? u['user_id'] ?? u['uuid'] ?? u['employeeId'] ?? u['employee_id'];
  if (rawId === undefined || rawId === null || rawId === '') return null;
  const first = String(u['firstName'] ?? u['first_name'] ?? u['firstname'] ?? '').trim();
  const last = String(u['lastName'] ?? u['last_name'] ?? u['lastname'] ?? '').trim();
  const name = String(u['name'] ?? u['fullName'] ?? u['full_name'] ?? u['displayName'] ?? [first,last].filter(Boolean).join(' ') ?? '').trim() || String(u['email'] ?? rawId);
  const initials = name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase() ?? '').join('').slice(0,2);
  return { id:String(rawId), name, department:mapDepartment(u,byId), role:String(u['designation']?.['name'] ?? u['designation'] ?? u['role']?.['name'] ?? u['jobTitle'] ?? u['job_title'] ?? u['position'] ?? 'Employee'), initials, tone: (['blue','violet','teal','amber','rose'] as Tone[])[index%5] };
}


export const PERIODS: Record<string, Period> = {
  '2026-06': { label: 'June 2026', cutoff: '2026-06-30', holiday: '', holidayName: '' },
  '2026-07': { label: 'July 2026', cutoff: '2026-07-31', holiday: '', holidayName: '' },
  '2026-08': { label: 'August 2026', cutoff: '2026-08-31', holiday: '', holidayName: '' },
  '2026-09': { label: 'September 2026', cutoff: '2026-09-30', holiday: '2026-09-17', holidayName: 'Sample company holiday' },
  '2026-10': { label: 'October 2026', cutoff: '2026-10-29', holiday: '2026-10-02', holidayName: 'Sample company holiday' },
};

export const LABELS: Record<Status, string> = {
  P: 'Present', HD: 'Half-day', L: 'Approved leave', A: 'Absent', U: 'Unmarked', WO: 'Weekly off', H: 'Holiday', F: 'Not in period',
};

export const TONES: Record<Status, Tone> = { P: 'teal', HD: 'amber', L: 'violet', A: 'rose', U: 'neutral', WO: 'neutral', H: 'blue', F: 'neutral' };

const MIN_DATE = '2026-06-01';
const MAX_DATE = '2026-10-29';
const STORAGE_KEY = 'precision-attendance-v1';
/** today's date (local) as YYYY-MM-DD */
export const todayIso = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
const DP_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label, i) => ({ label, off: i > 4 }));
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/* ---------------------------------------------------------------- pure helpers (same rules as the prototype) */
export const key = (date: string, id: string) => date + '|' + id;
export const dateObj = (d: string) => new Date(d + 'T12:00:00Z');
export const weekday = (d: string) => dateObj(d).getUTCDay();
export const daysInMonth = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
export const datesOf = (m: string) => Array.from({ length: daysInMonth(m) }, (_, i) => m + '-' + String(i + 1).padStart(2, '0'));

export function dayKind(date: string): 'W' | 'WO' | 'H' | 'F' {
  const p = PERIODS[date.slice(0, 7)];
  if (!p || date > p.cutoff) return 'F';
  if ([0, 6].includes(weekday(date))) return 'WO';
  if (date === p.holiday) return 'H';
  return 'W';
}

export const minutes = (t: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t || '') ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null;
export const clock = (n: number) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
export const duration = (n: number | null) => n === null ? '—' : Math.floor(n / 60) + 'h ' + String(n % 60).padStart(2, '0') + 'm';
export const compactDuration = (n: number) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');

export function record(status: Status = 'U', extra: Partial<AttRecord> = {}): AttRecord {
  return {
    status,
    in: status === 'P' || status === 'HD' ? '09:00' : '',
    out: status === 'P' ? '18:00' : status === 'HD' ? '13:00' : '',
    break: status === 'P' ? 60 : 0,
    mode: 'Office', session: 'AM', note: '',
    ...extra,
  };
}

export function createSeed(): Record<string, AttRecord> {
  const data: Record<string, AttRecord> = {};
  for (const month of Object.keys(PERIODS)) {
    for (const date of datesOf(month)) {
      const kind = dayKind(date);
      EMPLOYEES.forEach((e, i) => {
        const d = Number(date.slice(-2));
        let r = record(kind === 'W' ? 'P' : kind);
        if (kind === 'W') {
          const offset = (i * 3 + d) % 9;
          const late = (i * 7 + d) % 13 === 0 ? 18 : offset;
          r = record('P', { in: clock(540 + late), out: clock(1080 + late), mode: (i + d) % 5 === 0 ? 'Remote' : 'Office' });
          if ((d + i * 4) % 29 === 0) r = record('L', { note: 'Approved personal leave' });
          else if ((d * 2 + i * 3) % 31 === 0) r = record('HD', { note: 'Approved morning half-day' });
          else if ((d * 3 + i * 5) % 53 === 0) r = record('A', { note: 'Attendance follow-up required' });
        }
        data[key(date, e.id)] = r;
      });
    }
  }
  const sep = [
    record('P', { in: '09:04', out: '18:05' }), record('P', { in: '09:18', out: '18:12', note: 'Delayed arrival' }),
    record('P', { in: '09:02', out: '', note: 'Check-out confirmation pending' }), record('L', { note: 'Approved personal leave' }),
    record('HD', { note: 'Approved morning session' }), record('P', { mode: 'Remote' }), record('A', { note: 'Owner follow-up required' }),
    record('P', { in: '09:01', out: '18:08' }), record('P'), record('L', { note: 'Approved personal leave' }),
    record('P', { in: '09:26', out: '18:30' }), record('U'),
  ];
  EMPLOYEES.forEach((e, i) => data[key('2026-09-30', e.id)] = sep[i]);
  return data;
}

/** Demo-only attendance for employees returned by Users API. Never passed off as backend attendance. */
export function employeeDemoRecord(date: string, employeeId: string): AttRecord {
  const kind = dayKind(date);
  if (kind !== 'W') return record(kind);
  let h = 2166136261;
  for (const c of `${date}|${employeeId}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const n = h >>> 0;
  const choice = n % 100;
  if (choice < 6) return record('A', { note: 'Demo: absence recorded' });
  if (choice < 13) return record('L', { note: 'Demo: approved leave' });
  if (choice < 21) {
    const afternoon = (n % 2) === 0;
    return record('HD', {
      session: afternoon ? 'PM' : 'AM',
      in: afternoon ? '14:00' : '09:00', out: afternoon ? '18:00' : '13:00',
      break: 0, note: 'Demo: half-day attendance',
    });
  }
  if (choice < 25) return record('U', { note: 'Demo: awaiting confirmation' });
  const offset = ((n >>> 8) % 39) - 8;
  const start = 540 + offset;
  const end = start + 535 + ((n >>> 17) % 37);
  return record('P', {
    in: clock(start), out: clock(end), break: 45 + ((n >>> 21) % 4) * 5,
    mode: n % 7 === 0 ? 'Remote' : 'Office',
    note: offset > 10 ? 'Demo: late arrival' : '',
  });
}

export function netMinutes(r: AttRecord): number | null {
  if (!['P', 'HD'].includes(r.status)) return 0;
  const a = minutes(r.in), b = minutes(r.out), br = Number(r.break);
  if (a === null || b === null || b <= a || !Number.isInteger(br) || br < 0 || br >= b - a) return null;
  return b - a - br;
}

export function lateMinutes(r: AttRecord): number {
  if (!['P', 'HD'].includes(r.status)) return 0;
  const a = minutes(r.in);
  if (a === null) return 0;
  const start = r.status === 'HD' && r.session === 'PM' ? 840 : 540;
  return a > start + 10 ? a - start : 0;
}

export function validate(r: AttRecord): string {
  if (!LABELS[r.status] || ['WO', 'H', 'F'].includes(r.status)) return 'Choose an editable attendance status.';
  if (['P', 'HD'].includes(r.status)) {
    if (r.status === 'HD' && !['AM', 'PM'].includes(r.session)) return 'Choose a half-day session.';
    if (!r.in || !r.out) return 'Enter both check-in and check-out for this completed day.';
    if (netMinutes(r) === null) return 'Check-out must be after check-in, with a shorter non-negative break.';
    if ((minutes(r.out)! - minutes(r.in)!) > 16 * 60) return 'This page supports day shifts up to 16 hours.';
  }
  if (!['Office', 'Remote'].includes(r.mode)) return 'Choose Office or Remote.';
  return '';
}

export function employeeSummary(data: Record<string, AttRecord>, e: Employee, month: string): Summary {
  const s: Summary = { id: e.id, name: e.name, department: e.department, scheduled: 0, P: 0, HD: 0, L: 0, A: 0, U: 0, WO: 0, H: 0, late: 0, missing: 0, minutes: 0, credit: 0, required: 0, rate: 0 };
  for (const date of datesOf(month)) {
    const kind = dayKind(date);
    if (kind === 'F') continue;
    if (kind === 'W') s.scheduled++;
    const r = data[key(date, e.id)] || record(kind === 'W' ? 'U' : kind);
    if (r.status in s) (s as any)[r.status]++;
    if (lateMinutes(r) > 0) s.late++;
    const net = netMinutes(r);
    if (net === null) s.missing++; else s.minutes += net;
  }
  s.credit = s.P + .5 * s.HD;
  s.required = Math.max(0, s.scheduled - s.L);
  s.rate = s.required ? s.credit / s.required * 100 : 0;
  return s;
}

export function buildReport(data: Record<string, AttRecord>, employees: Employee[], month: string, meta = { department: 'all', search: '', draftCount: 0 }): Report {
  const rows = employees.map(e => employeeSummary(data, e, month));
  const total: Totals = { scheduled: 0, P: 0, HD: 0, L: 0, A: 0, U: 0, late: 0, missing: 0, minutes: 0, credit: 0, required: 0, rate: 0 };
  rows.forEach(r => (Object.keys(total) as (keyof Totals)[]).forEach(k => { if (k !== 'rate') total[k] += r[k]; }));
  total.rate = total.required ? total.credit / total.required * 100 : 0;
  return { month, period: PERIODS[month], employees, rows, total, data, dates: datesOf(month), meta };
}

export const rateText = (t: { required: number; rate: number }) => t.required ? t.rate.toFixed(1) + '%' : '—';

const fmtDate = (date: string, long = true) => dateObj(date).toLocaleDateString('en-GB', {
  ...(long ? { weekday: 'long' } : {}), day: '2-digit', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC',
});

/* ---------------------------------------------------------------- icons (line icons, 24 × 24) */
const ICONS: Record<string, string> = {
  calendarCheck: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  fileCheck: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4',
  database: 'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35',
  userCheck: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 11l2 2 4-4',
  userX: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17 8l5 5M22 8l-5 5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  calendarHeart: 'M8 2v4M16 2v4M3 10h18M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7M17.5 22l-3-3a1.8 1.8 0 0 1 3-2 1.8 1.8 0 0 1 3 2z',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  circleCheck: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 12l2 2 4-4',
  checkCheck: 'M18 6L7 17l-5-5M22 10l-7.5 7.5L13 16',
  check: 'M20 6L9 17l-5-5',
  coffee: 'M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2',
  pen: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  clockAlert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5M12 16h.01',
  laptop: 'M4 5h16v10H4zM2 19h20',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 16v-4M12 8h.01',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  calculator: 'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  shieldCheck: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  badgeCheck: 'M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2zM9 12l2 2 4-4',
  clipboard: 'M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6',
  x: 'M18 6L6 18M6 6l12 12',
};

/* ---------------------------------------------------------------- component */
interface Metric { label: string; value: string; unit?: string; context: string; tone: Tone; icon: string; }

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [PageHeader],
  templateUrl: './attendance.html',
  styleUrls: ['./attendance.css'],
})
export class Attendance {
  private readonly userApi = inject(UserDirectoryApiService);
  private readonly deptApi = inject(IamAdminApiService);

  /* constants for the template */
  get departments(): string[] { return this.departmentList(); }
  readonly departmentList = signal<string[]>([]);
  readonly directoryEmployees = signal<Employee[]>([]);
  readonly directoryLoading = signal(true);
  readonly directoryError = signal('');
  readonly periods = PERIODS;
  readonly monthKeys = Object.keys(PERIODS);
  readonly labels = LABELS;
  readonly tones = TONES;
  readonly minDate = MIN_DATE;
  readonly maxDate = MAX_DATE;
  readonly legendCodes: Status[] = ['P', 'HD', 'L', 'A', 'U', 'WO', 'H'];
  readonly editableStatuses: Status[] = ['P', 'HD', 'L', 'A', 'U'];
  readonly duration = duration;
  readonly compactDuration = compactDuration;
  readonly rate = rateText;

  /* records */
  private readonly seed: Record<string, AttRecord> = {}; // Live directory: do not display fictional seed attendance
  readonly data = signal<Record<string, AttRecord>>(structuredClone(this.seed));
  private saved: Record<string, AttRecord> = structuredClone(this.seed);
  readonly stored = signal(false);

  /* screen state */
  readonly view = signal<View>('daily');
  /** opens on today when today is inside the register range, else on the latest sample day */
  readonly today = todayIso();
  readonly date = signal(this.today >= MIN_DATE && this.today <= MAX_DATE ? this.today : MAX_DATE);
  readonly month = signal('2026-10');
  readonly department = signal('all');
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'U' | 'issues'>('all');
  readonly selected = signal<string | null>(null);
  readonly checked = signal<Set<string>>(new Set());
  readonly dirty = signal<Set<string>>(new Set());
  readonly layout = signal<'grid' | 'summary'>('grid');
  readonly pdfPage = signal<1 | 2>(1);
  readonly policyOpen = signal(false);
  readonly busyPdf = signal(false);
  readonly toast = signal<string | null>(null);
  readonly editorOpen = signal(false);
  readonly addOpen = signal(false);
  readonly addScope = signal<'department' | 'individual'>('department');
  readonly addDepartment = signal('');
  readonly addEmployee = signal(''); // legacy single-selection value (not used by bulk picker)
  readonly addSelectedEmployees = signal<string[]>([]);
  readonly addEmployeeSearch = signal('');
  readonly addStatus = signal<Status>('P');
  readonly addIn = signal('09:00');
  readonly addOut = signal('18:00');
  readonly addMode = signal<'Office' | 'Remote'>('Office');
  readonly addNote = signal('');
  readonly addError = signal('');
  readonly timelineFilter = signal<'all' | 'P' | 'A' | 'L'>('all');
  readonly timelineSelectedId = signal<string>('');
  readonly timelineHours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '00:00 +1', '04:00 +1', '08:00 +1'];
  readonly timelineSelected = computed(() => this.employees().find(e => e.id === this.timelineSelectedId()) ?? this.employees()[0] ?? null);
  // Display uses a continuous 32-hour axis (midnight to next-day 08:00).
  // Shift assignments are demonstration defaults until the shifts API is connected.
  timelineShift(e: Employee) {
    const r = this.rec(e);
    const start = minutes(r.in);
    if (start !== null && start < 510) return { label: 'Early shift', time: '06:00 – 14:00', tone: 'early', start: 360, end: 840 };
    if (start !== null && start >= 1200) return { label: 'Night shift', time: '22:00 – 06:00 +1', tone: 'night', start: 1320, end: 1800 };
    if (start !== null && start >= 780) return { label: 'Evening shift', time: '14:00 – 22:00', tone: 'evening', start: 840, end: 1320 };
    return { label: 'General shift', time: '09:00 – 18:00', tone: 'general', start: 540, end: 1080 };
  }
  timelinePlanLeft(e: Employee) { return this.timelineShift(e).start / 1920 * 100; }
  timelinePlanWidth(e: Employee) { const sh = this.timelineShift(e); return (sh.end - sh.start) / 1920 * 100; }
  timelineActualLeft(r: AttRecord) { return Math.max(0, Math.min(100, (minutes(r.in) ?? 0) / 1920 * 100)); }
  timelineActualWidth(r: AttRecord) {
    const a = minutes(r.in), b = minutes(r.out);
    if (a === null || b === null) return 0;
    const end = b <= a ? b + 1440 : b;
    return Math.max(0, Math.min(1920 - a, end - a) / 1920 * 100);
  }
  timelineBreakLeft(r: AttRecord) {
    const a = minutes(r.in), b = minutes(r.out);
    if (a === null || b === null || !r.break) return 0;
    const end = b <= a ? b + 1440 : b;
    return (a + (end - a) / 2 - r.break / 2) / 1920 * 100;
  }
  timelineBreakWidth(r: AttRecord) { return Math.max(0, r.break) / 1920 * 100; }
  timelinePlanBreakLeft(e: Employee) {
    const s = this.timelineShift(e);
    return (s.start + (s.end - s.start) / 2 - 15) / 1920 * 100;
  }
  editTimelineEmployee(e: Employee) { this.setView('daily'); this.openEditor(e); }

  readonly addCandidates = computed(() => this.directoryEmployees().filter(e => this.addDepartment() === 'all' || e.department === this.addDepartment()));
  readonly addVisibleCandidates = computed(() => {
    const q = this.addEmployeeSearch().trim().toLowerCase();
    return this.addCandidates().filter(e => !q || `${e.name} ${e.id} ${e.department}`.toLowerCase().includes(q));
  });
  readonly addSelectedCount = computed(() => this.addScope() === 'department' ? this.addCandidates().length : this.addSelectedEmployees().length);
  readonly addAllVisibleSelected = computed(() => this.addVisibleCandidates().length > 0 && this.addVisibleCandidates().every(e => this.addSelectedEmployees().includes(e.id)));
  toggleAddEmployee(id: string, checked: boolean) {
    this.addSelectedEmployees.update(ids => checked ? [...new Set([...ids, id])] : ids.filter(x => x !== id));
    this.addError.set('');
  }
  selectVisibleAddEmployees() {
    const ids = this.addVisibleCandidates().map(e => e.id);
    this.addSelectedEmployees.update(current => [...new Set([...current, ...ids])]);
    this.addError.set('');
  }
  clearAddEmployees() { this.addSelectedEmployees.set([]); this.addError.set(''); }
  toggleAllVisibleAddEmployees(checked: boolean) {
    if (checked) this.selectVisibleAddEmployees();
    else {
      const visible = new Set(this.addVisibleCandidates().map(e => e.id));
      this.addSelectedEmployees.update(current => current.filter(id => !visible.has(id)));
    }
  }
  readonly timelineEmployees = computed(() => this.employees().filter(e => this.timelineFilter() === 'all' || this.rec(e).status === this.timelineFilter()));
  private toastTimer?: ReturnType<typeof setTimeout>;

  /* editor fields */
  readonly eStatus = signal<Status>('U');
  readonly eIn = signal('');
  readonly eOut = signal('');
  readonly eBreak = signal(0);
  readonly eMode = signal<'Office' | 'Remote'>('Office');
  readonly eSession = signal<'AM' | 'PM'>('AM');
  readonly eNote = signal('');
  readonly eError = signal('');

  constructor() {
    this.loadStored();
    this.refreshEditor();
    void this.loadDirectory();
  }

  /** Fetch users and departments; never overwrite browser attendance with fabricated API attendance. */
  async loadDirectory() {
    this.directoryLoading.set(true); this.directoryError.set('');
    
    try {
      // Users API (same as Users page) + Departments API (same as Departments page)
      const [userResponse, deptResponse] = await Promise.all([
        firstValueFrom(this.userApi.searchUsers({ pageIndex: 0, pageSize: 1000 })),
        firstValueFrom(this.deptApi.getDepartments()),
      ]);

      const userRows = apiList(userResponse, ['items', 'users', 'employees', 'results', 'content', 'records']);
      const byId = new Map<string,string>();
      for (const dep of deptResponse) {
        const name = depDisplay(dep as ApiObject);
        const id = (dep as ApiObject)?.['id'] ?? (dep as ApiObject)?.['departmentId'] ?? (dep as ApiObject)?.['department_id'] ?? (dep as ApiObject)?.['uuid'];
        if (name && id != null) byId.set(String(id), name);
      }
      const users = userRows.map((u, i) => mapUser(u as ApiObject, byId, i)).filter((u): u is Employee => u !== null);
      if (!Array.isArray(userRows) || (userRows.length && !users.length)) throw new Error('Users response format could not be mapped.');
      const departments = [...new Set([...deptResponse.map(depDisplay), ...users.map(u => u.department)].filter(Boolean))];
      // Keep records already stored in this browser; fresh user IDs start unmarked.
      const current={...this.data()};
      for (const month of Object.keys(PERIODS)) for (const date of datesOf(month)) for (const user of users) {
        const k=key(date,user.id);
        if (!current[k]) current[k] = employeeDemoRecord(date, user.id);
      }
      this.data.set(current);
      this.saved=structuredClone(current);
      this.directoryEmployees.set(users);
      this.departmentList.set(departments);
      if (this.department()!=='all' && !departments.includes(this.department())) this.department.set('all');
      if (!departments.includes(this.addDepartment())) this.addDepartment.set(departments[0]??'');
      if (!users.some(u=>u.id===this.addEmployee())) this.addEmployee.set(users[0]?.id??'');
      if (!users.some(u=>u.id===this.selected())) this.selected.set(users[0]?.id??null);
      if (!users.some(u=>u.id===this.timelineSelectedId())) this.timelineSelectedId.set(users[0]?.id??'');
      this.refreshEditor();
    } catch(err) {
      this.directoryError.set((err instanceof Error ? err.message : String(err)) + '. Retry the Users / Departments API.');
      this.directoryEmployees.set([]);
      this.departmentList.set([]);
    } finally { this.directoryLoading.set(false); }
  }

  /** the editor shows the selected employee's record for the chosen date */
  private refreshEditor() {
    const e = this.selectedEmployee();
    this.fill(e ? this.data()[key(this.date(), e.id)] : record('U'));
    this.eError.set('');
  }

  /* ------------------------------------------------ derived */
  readonly employees = computed(() => {
    const dep = this.department(), q = this.search().toLowerCase();
    return this.directoryEmployees().filter(e => (dep === 'all' || e.department === dep) && (!q || (e.name + ' ' + e.id).toLowerCase().includes(q)));
  });

  readonly editable = computed(() => dayKind(this.date()) === 'W');

  rec(e: Employee): AttRecord { return this.data()[key(this.date(), e.id)] ?? record((dayKind(this.date()) === 'W' ? 'U' : dayKind(this.date()) === 'F' ? 'F' : dayKind(this.date())) as Status); }
  isIssue(r: AttRecord) { return r.status === 'U' || lateMinutes(r) > 0 || netMinutes(r) === null; }

  readonly visible = computed(() => {
    const f = this.statusFilter();
    return this.employees().filter(e => f === 'all' || (f === 'U' ? this.rec(e).status === 'U' : this.isIssue(this.rec(e))));
  });

  readonly dailyTotals = computed(() => {
    const t = { P: 0, HD: 0, L: 0, A: 0, U: 0, WO: 0, H: 0, F: 0, late: 0, missing: 0, minutes: 0 };
    this.employees().forEach(e => {
      const r = this.rec(e);
      t[r.status]++;
      if (lateMinutes(r)) t.late++;
      const n = netMinutes(r);
      if (n === null) t.missing++; else t.minutes += n;
    });
    return t;
  });

  readonly issuesCount = computed(() => this.employees().filter(e => this.isIssue(this.rec(e))).length);

  readonly dailyMetrics = computed<Metric[]>(() => {
    const t = this.dailyTotals();
    return [
      { label: 'Present', value: String(t.P), context: 'Full-day attendance', tone: 'teal', icon: 'userCheck' },
      { label: 'Half-day', value: String(t.HD), context: '0.5 attendance credit', tone: 'amber', icon: 'sun' },
      { label: 'Approved leave', value: String(t.L), context: 'Excluded from required days', tone: 'violet', icon: 'calendarHeart' },
      { label: 'Absent', value: String(t.A), context: 'Marked absence only', tone: 'rose', icon: 'userX' },
      { label: 'Unmarked', value: String(t.U), context: 'Awaiting review', tone: 'blue', icon: 'circle' },
    ];
  });

  readonly registerState = computed(() => {
    const kind = dayKind(this.date()), t = this.dailyTotals();
    if (kind !== 'W') return { text: LABELS[kind], tone: 'neutral' as Tone };
    return t.U || t.missing ? { text: 'Open for review', tone: 'blue' as Tone } : { text: 'Attendance marked', tone: 'teal' as Tone };
  });

  readonly nonWorkingText = computed(() => {
    const k = dayKind(this.date());
    return k === 'H' ? 'Company holiday - attendance entry is not required.'
      : k === 'WO' ? 'Weekly off - these records are excluded from attendance calculations.'
        : 'This date is outside the reporting period.';
  });

  readonly allChecked = computed(() => { const v = this.visible(), c = this.checked(); return v.length > 0 && v.every(e => c.has(e.id)); });
  readonly someChecked = computed(() => { const v = this.visible(), c = this.checked(); const n = v.filter(e => c.has(e.id)).length; return n > 0 && n < v.length; });
  readonly checkedCount = computed(() => this.visible().filter(e => this.checked().has(e.id)).length);

  readonly selectedEmployee = computed(() => this.employees().find(e => e.id === this.selected()) ?? this.employees()[0] ?? null);
  readonly canEdit = computed(() => !!this.selectedEmployee() && this.editable());

  readonly scopeNote = computed(() => this.view() === 'daily'
    ? dateObj(this.date()).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) + ' · Day shift'
    : 'Through ' + fmtDate(PERIODS[this.month()].cutoff, false));

  readonly saveText = computed(() => {
    const n = this.dirty().size;
    return n ? n + ' unsaved change' + (n === 1 ? '' : 's') : this.stored() ? 'Saved in this browser' : 'Sample register loaded';
  });

  readonly draftInReport = computed(() => {
    const m = this.month(), es = this.employees();
    return [...this.dirty()].filter(k => k.startsWith(m) && es.some(e => k.endsWith('|' + e.id))).length;
  });

  readonly report = computed(() => buildReport(this.data(), this.employees(), this.month(),
    { department: this.department(), search: this.search(), draftCount: this.draftInReport() }));

  readonly reportMetrics = computed<Metric[]>(() => {
    const t = this.report().total;
    return [
      { label: 'Attendance rate', value: rateText(t), context: t.required + ' required employee-days', tone: 'blue', icon: 'chart' },
      { label: 'Attendance credit', value: t.credit.toFixed(1), unit: 'days', context: t.P + ' present · ' + t.HD + ' half-days', tone: 'teal', icon: 'badgeCheck' },
      { label: 'Approved leave', value: String(t.L), unit: 'days', context: t.scheduled + ' scheduled employee-days', tone: 'violet', icon: 'calendarHeart' },
      { label: 'Outstanding records', value: String(t.U), context: t.missing + ' incomplete punch' + (t.missing === 1 ? '' : 'es'), tone: 'amber', icon: 'clipboard' },
    ];
  });

  readonly reportState = computed(() => {
    const r = this.report(), t = r.total;
    if (t.U || r.meta.draftCount) return { text: 'Provisional', tone: 'amber' as Tone };
    if (t.missing) return { text: 'Hours need review', tone: 'amber' as Tone };
    return { text: 'Attendance marked', tone: 'teal' as Tone };
  });

  readonly departmentRows = computed(() => {
    const r = this.report();
    return this.departmentList().map((dep, i) => {
      const es = r.employees.filter(e => e.department === dep);
      if (!es.length) return null;
      const d = buildReport(this.data(), es, this.month()).total;
      return { dep, count: es.length, credit: d.credit.toFixed(1), rate: rateText(d), width: Math.min(100, d.rate), color: ['#4e73cf', '#209987', '#9972cb'][i] };
    }).filter((x): x is NonNullable<typeof x> => !!x);
  });

  readonly checks = computed(() => {
    const t = this.report().total;
    return [
      { icon: t.U ? 'circle' : 'circleCheck', text: t.U ? 'Unmarked attendance needs a decision.' : 'All attendance records are marked.', value: t.U + ' records', ok: !t.U },
      { icon: t.missing ? 'clockAlert' : 'circleCheck', text: t.missing ? 'Missing punches are excluded from work hours.' : 'Work hours include all present / half-day punches.', value: t.missing + ' records', ok: !t.missing },
      { icon: 'calendarCheck', text: 'Weekly off and company holidays are excluded.', value: 'Applied', ok: true },
    ];
  });

  /* ---- overview widget ---- */
  /** daily: share of today's records that are marked (ring) */
  readonly dayRing = computed(() => {
    const t = this.dailyTotals(), n = this.employees().length;
    const marked = n - t.U - t.WO - t.H - t.F;
    const pct = n && this.editable() ? Math.round(marked / n * 100) : 0;
    return { pct, marked, total: n };
  });

  /** daily: one bar split by status, with a legend */
  readonly dayBreak = computed(() => this.breakdown(this.dailyTotals()));

  /** monthly: same bar for employee-days in the month */
  readonly monthBreak = computed(() => this.breakdown(this.report().total));

  private breakdown(t: { P: number; HD: number; L: number; A: number; U: number }) {
    const parts = (['P', 'HD', 'L', 'A', 'U'] as Status[]).map(s => ({ code: s, label: LABELS[s], count: t[s as 'P'], tone: TONES[s] }));
    const sum = parts.reduce((a, p) => a + p.count, 0) || 1;
    return parts.map(p => ({ ...p, pct: p.count / sum * 100 }));
  }

  readonly monthRing = computed(() => {
    const t = this.report().total;
    return { pct: t.required ? Math.round(t.rate) : 0, text: rateText(t) };
  });

  /**
   * Completion tiles (a different idea from the status bar beside it - no chart):
   *   Daily   - one initials tile per employee in scope, solid once that person is marked for the day.
   *   Monthly - one numbered tile per working day, solid when every record that day is marked.
   */
  readonly doneTiles = computed(() => {
    type T = { text: string; state: 'on' | 'open' | 'off' | 'blank'; label: string };
    const tiles: T[] = [];
    if (this.view() === 'daily') {
      const work = this.editable();
      for (const e of this.employees()) {
        const s = this.rec(e).status;
        tiles.push({ text: e.initials, state: !work ? 'off' : s === 'U' ? 'open' : 'on', label: e.name + ' - ' + LABELS[s] });
      }
      const n = tiles.length, done = tiles.filter(x => x.state === 'on').length;
      return { tiles: n > 36 ? [] : tiles.map((x, i) => ({ ...x, i })), cols: Math.min(6, Math.max(n, 1)), n, done, pct: n ? Math.round(done / n * 100) : 0 };
    }
    const m = this.month(), data = this.data(), es = this.employees(), cut = PERIODS[m].cutoff;
    const days = datesOf(m).filter(d => d <= cut && ![0, 6].includes(weekday(d)));
    for (const d of days) {
      if (dayKind(d) === 'H') { tiles.push({ text: String(+d.slice(-2)), state: 'off', label: fmtDate(d, false) + ' - holiday' }); continue; }
      const open = es.filter(e => data[key(d, e.id)]?.status === 'U').length;
      tiles.push({ text: String(+d.slice(-2)), state: open ? 'open' : 'on', label: fmtDate(d, false) + (open ? ' - ' + open + ' unmarked' : ' - all marked') });
    }
    const work = tiles.filter(x => x.state === 'on' || x.state === 'open'), done = work.filter(x => x.state === 'on').length;
    return { tiles: tiles.map((x, i) => ({ ...x, i })), cols: 5, n: work.length, done, pct: work.length ? Math.round(done / work.length * 100) : 0 };
  });

  /** text around the tiles */
  readonly doneInfo = computed(() => {
    const d = this.doneTiles();
    if (this.view() !== 'daily') {
      return { title: 'Days complete', big: d.done + '/' + d.n, pct: d.pct + '%', chip: d.done < d.n ? (d.n - d.done) + ' day' + (d.n - d.done === 1 ? '' : 's') + ' still open' : 'Every day marked', warn: d.done < d.n };
    }
    if (!this.editable()) return { title: 'Marked today', big: '—', pct: '', chip: this.registerState().text, warn: false };
    const left = d.n - d.done;
    const who = this.employees().filter(e => this.rec(e).status === 'U').map(e => e.name);
    const chip = !left ? 'All marked' : who.length && who.length <= 2 ? who.join(', ') + ' to mark' : left + ' left to mark';
    return { title: 'Marked today', big: d.done + '/' + d.n, pct: d.pct + '%', chip, warn: !!left };
  });

  ringDash(pct: number, r = 42) { const c = 2 * Math.PI * r; return (c * Math.min(100, Math.max(0, pct)) / 100) + ' ' + c; }

  /** calendar tile beside the date: month on the strip, day (or month) large */
  readonly tile = computed(() => {
    if (this.view() === 'daily' || this.view() === 'timeline') {
      const d = dateObj(this.date());
      return { top: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase(), big: String(d.getUTCDate()) };
    }
    const m = dateObj(this.month() + '-01');
    return { top: String(m.getUTCFullYear()), big: m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase() };
  });

  /* ---------------- own date picker */
  readonly dpWeek = DP_WEEK;
  readonly pickerOpen = signal(false);
  readonly pickerMonth = signal(this.date().slice(0, 7));
  readonly isToday = computed(() => this.date() === this.today);
  readonly todayInRange = this.today >= MIN_DATE && this.today <= MAX_DATE;
  /** short label shown inside the stepper, e.g. "Wed, 30 Sep 2026" */
  readonly dateChip = computed(() => dateObj(this.date()).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
  readonly pickerTitle = computed(() => dateObj(this.pickerMonth() + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
  /** 6-row Monday-first grid; each day knows if it can be picked and whether its register is complete */
  readonly pickerDays = computed(() => {
    const m = this.pickerMonth(), data = this.data(), sel = this.date();
    const first = dateObj(m + '-01');
    first.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first); d.setUTCDate(first.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const kind = dayKind(iso);
      const ok = iso >= MIN_DATE && iso <= MAX_DATE;
      let state: 'done' | 'open' | '' = '';
      if (ok && kind === 'W') state = this.directoryEmployees().some(e => data[key(iso, e.id)]?.status === 'U') ? 'open' : 'done';
      return {
        iso, day: d.getUTCDate(), out: iso.slice(0, 7) !== m, ok, state,
        off: kind === 'WO', holiday: kind === 'H', sel: iso === sel, today: iso === this.today,
        label: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
          + (kind === 'H' ? ', company holiday' : kind === 'WO' ? ', weekly off' : '') + (state === 'open' ? ', has unmarked entries' : ''),
      };
    });
  });
  canPickerShift(n: number) {
    const k = Object.keys(PERIODS), i = k.indexOf(this.pickerMonth()) + n;
    return i >= 0 && i < k.length;
  }
  pickerShift(n: number) { if (this.canPickerShift(n)) this.pickerMonth.set(Object.keys(PERIODS)[Object.keys(PERIODS).indexOf(this.pickerMonth()) + n]); }
  togglePicker() {
    if (!this.pickerOpen()) this.pickerMonth.set(this.date().slice(0, 7));
    this.pickerOpen.update(v => !v);
  }
  pick(iso: string) { this.onDate(iso); this.pickerOpen.set(false); }
  goToday() {
    if (!this.todayInRange) { this.notify('Today is outside this register (1 September to 9 October 2026).'); return; }
    this.pick(this.today);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (this.pickerOpen() && !(e.target as HTMLElement | null)?.closest?.('.at-dp-anchor')) this.pickerOpen.set(false);
  }

  readonly dayTitle = computed(() => ({
    weekday: dateObj(this.date()).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    date: dateObj(this.date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }));

  readonly scopeLabel = computed(() => (this.department() !== 'all' ? this.department() : 'All departments') + (this.search() ? ' · Search: ' + this.search() : ''));

  /* editor live calculation */
  readonly editorRecord = computed<AttRecord>(() => ({
    status: this.eStatus(), in: this.eIn(), out: this.eOut(), break: Number(this.eBreak()), mode: this.eMode(), session: this.eSession(), note: this.eNote().trim(),
  }));
  readonly editorActive = computed(() => ['P', 'HD'].includes(this.eStatus()));
  readonly editorNet = computed(() => netMinutes(this.editorRecord()));
  readonly editorLate = computed(() => lateMinutes(this.editorRecord()));
  readonly editorOther = computed(() => ({ L: 'Excluded', A: '0 credit', U: 'Needs review' } as Record<string, string>)[this.eStatus()] ?? '—');

  /* ------------------------------------------------ template helpers */
  icon(name: string) { return ICONS[name] ?? ICONS['circle']; }
  label(s: Status) { return LABELS[s]; }
  tone(s: Status) { return TONES[s]; }
  isActive(r: AttRecord) { return ['P', 'HD'].includes(r.status); }
  net(r: AttRecord) { return netMinutes(r); }
  late(r: AttRecord) { return lateMinutes(r); }
  longDate(d: string) { return fmtDate(d); }
  shortDate(d: string) { return fmtDate(d, false); }
  dayNo(d: string) { return Number(d.slice(-2)); }
  dayLetter(d: string) { return WEEKDAY_LETTER[weekday(d)]; }
  isOffDay(d: string) { return dayKind(d) !== 'W'; }
  cell(d: string, e: Employee) { return this.data()[key(d, e.id)] ?? record('U'); }
  plural(n: number, word: string) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  reviewOf(r: AttRecord): { icon: string; text: string; ok: boolean } {
    if (netMinutes(r) === null) return { icon: 'clockAlert', text: 'Missing punch', ok: false };
    if (r.status === 'U') return { icon: 'circle', text: 'Not marked', ok: false };
    const l = lateMinutes(r);
    if (l) return { icon: 'clock', text: 'Late ' + l + 'm', ok: false };
    return { icon: 'check', text: 'Reviewed', ok: true };
  }

  /* ------------------------------------------------ actions */
  setView(v: View) { this.view.set(v); }
  openAdd() {
    this.addScope.set('individual');
    this.addError.set('');
    this.addDepartment.set(this.department() === 'all' ? 'all' : this.department());
    this.addSelectedEmployees.set([]);
    this.addEmployeeSearch.set('');
    const first = this.directoryEmployees().find(e => e.department === this.addDepartment());
    if (first) this.addEmployee.set(first.id);
    this.addOpen.set(true);
  }
  onAddDepartment(d: string) {
    this.addDepartment.set(d);
    const first = this.directoryEmployees().find(e => e.department === d);
    if (first) this.addEmployee.set(first.id);
  }
  onAddStatus(s: Status) {
    this.addStatus.set(s);
    if (s === 'P') { this.addIn.set('09:00'); this.addOut.set('18:00'); }
    else if (s === 'HD') { this.addIn.set('09:00'); this.addOut.set('13:00'); }
  }
  submitAdd(ev: Event) {
    ev.preventDefault();
    if (!this.editable()) { this.addError.set('This date is not an editable working day.'); return; }
    const targets = this.addScope() === 'department' ? this.addCandidates() : this.directoryEmployees().filter(e => this.addSelectedEmployees().includes(e.id));
    if (!targets.length) { this.addError.set('Select at least one employee or choose a department with employees.'); return; }
    const status = this.addStatus();
    const entry = record(status, {
      mode: this.addMode(), note: this.addNote().slice(0, 180),
      ...(status === 'P' || status === 'HD' ? { in: this.addIn(), out: this.addOut(), break: status === 'P' ? 60 : 0 } : {}),
    });
    const error = validate(entry);
    if (error) { this.addError.set(error); return; }
    targets.forEach(e => this.setRecord(key(this.date(), e.id), { ...entry }));
    this.save();
    this.addOpen.set(false);
    this.notify(targets.length + ' employee attendance record(s) saved.');
  }

  /** previous / next day inside the reporting range */
  shiftDay(n: number) {
    const d = dateObj(this.date());
    d.setUTCDate(d.getUTCDate() + n);
    const iso = d.toISOString().slice(0, 10);
    if (iso < MIN_DATE || iso > MAX_DATE) { this.notify('Choose a date from 1 September to 9 October 2026.'); return; }
    this.onDate(iso);
  }
  canShiftDay(n: number) {
    const d = dateObj(this.date()); d.setUTCDate(d.getUTCDate() + n);
    const iso = d.toISOString().slice(0, 10);
    return iso >= MIN_DATE && iso <= MAX_DATE;
  }

  shiftMonth(n: number) {
    const i = this.monthKeys.indexOf(this.month()) + n;
    if (i >= 0 && i < this.monthKeys.length) this.onMonth(this.monthKeys[i]);
  }

  openEditor(e: Employee) {
    this.selected.set(e.id);
    this.refreshEditor();
    this.editorOpen.set(true);
    setTimeout(() => (document.getElementById('at-edit-status') as HTMLSelectElement | null)?.focus());
  }
  closeEditor() { this.editorOpen.set(false); }

  onDate(value: string) {
    if (!/^2026-(09|10)-\d{2}$/.test(value) || value < MIN_DATE || value > MAX_DATE || !datesOf(value.slice(0, 7)).includes(value)) {
      this.notify('Choose a date from 1 September to 9 October 2026.');
      return;
    }
    this.date.set(value);
    this.month.set(value.slice(0, 7));
    this.checked.set(new Set());
    this.refreshEditor();
  }

  onMonth(m: string) {
    this.month.set(m);
    this.date.set(PERIODS[m].cutoff);
    this.checked.set(new Set());
    this.refreshEditor();
  }

  onDepartment(d: string) { this.department.set(d); this.checked.set(new Set()); this.refreshEditor(); }
  onSearch(q: string) { this.search.set(q.trim()); this.checked.set(new Set()); this.refreshEditor(); }
  setFilter(f: 'all' | 'U' | 'issues') { this.statusFilter.set(f); this.checked.set(new Set()); }

  toggleCheck(id: string, on: boolean) {
    const s = new Set(this.checked());
    on ? s.add(id) : s.delete(id);
    this.checked.set(s);
  }

  toggleAll(on: boolean) {
    const s = new Set(this.checked());
    this.visible().forEach(e => on ? s.add(e.id) : s.delete(e.id));
    this.checked.set(s);
  }

  markSelectedPresent() {
    if (!this.editable()) return;
    const es = this.visible().filter(e => this.checked().has(e.id));
    es.forEach(e => { const r = this.rec(e); this.setRecord(key(this.date(), e.id), record('P', { mode: r.mode, note: r.note })); });
    this.checked.set(new Set());
    this.refreshEditor();
    this.notify(es.length + ' employees marked present for 09:00–18:00. Review and save the register.');
  }

  edit(e: Employee) {
    this.selected.set(e.id);
    this.refreshEditor();
    setTimeout(() => (document.getElementById('at-edit-status') as HTMLSelectElement | null)?.focus());
  }

  /* editor */
  private fill(r: AttRecord) {
    this.eStatus.set(this.editableStatuses.includes(r.status) ? r.status : 'U');
    this.eIn.set(r.in); this.eOut.set(r.out); this.eBreak.set(r.break);
    this.eMode.set(r.mode); this.eSession.set(r.session); this.eNote.set(r.note);
  }

  onEditStatus(s: Status) {
    const e = this.selectedEmployee();
    const old = e ? this.rec(e) : record('U');
    const note = this.eNote(), mode = this.eMode();
    const next = s === old.status ? { ...old } : record(s, { mode, note, session: 'AM' });
    this.fill({ ...next, note });
    this.eError.set('');
  }

  onSession(s: 'AM' | 'PM') {
    this.eSession.set(s);
    this.eIn.set(s === 'PM' ? '14:00' : '09:00');
    this.eOut.set(s === 'PM' ? '18:00' : '13:00');
    this.eBreak.set(0);
  }

  applyEntry(ev: Event) {
    ev.preventDefault();
    const e = this.selectedEmployee();
    if (!e || !this.editable()) return;
    let r = this.editorRecord();
    if (!['P', 'HD'].includes(r.status)) r = { ...r, in: '', out: '', break: 0, session: 'AM' };
    const error = validate(r);
    this.eError.set(error);
    if (error) return;
    this.setRecord(key(this.date(), e.id), r);
    this.editorOpen.set(false);
    this.notify('Attendance updated in the register. Save to keep it.');
  }

  private setRecord(k: string, r: AttRecord) {
    this.data.update(d => ({ ...d, [k]: r }));
    const dirty = new Set(this.dirty());
    if (JSON.stringify(r) === JSON.stringify(this.saved[k])) dirty.delete(k); else dirty.add(k);
    this.dirty.set(dirty);
  }

  save() {
    if (!this.dirty().size) return;
    try {
      const overrides: Record<string, AttRecord> = {};
      for (const [k, r] of Object.entries(this.data())) {
        const baseKind = dayKind(k.slice(0, 10));
        const employeeId = k.slice(11);
        const initial = employeeDemoRecord(k.slice(0, 10), employeeId);
        if (JSON.stringify(r) !== JSON.stringify(initial)) overrides[k] = r;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, records: overrides }));
      this.saved = structuredClone(this.data());
      this.dirty.set(new Set());
      this.stored.set(true);
      this.notify('Register saved. Monthly reports now include your changes.');
    } catch {
      this.notify('Browser storage is unavailable. Your edits remain in this session; download a PDF to keep a copy.');
    }
  }

  private loadStored() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || raw.schema !== 1 || !raw.records || typeof raw.records !== 'object') return;
      const data = structuredClone(this.data());
      for (const [k, r] of Object.entries<any>(raw.records)) {
        if (/^\d{4}-\d{2}-\d{2}\|.+$/.test(k) && dayKind(k.slice(0, 10)) === 'W' && r && typeof r === 'object' && !validate(r) && typeof r.note === 'string' && r.note.length <= 180) {
          data[k] = { status: r.status, in: r.in || '', out: r.out || '', break: Number(r.break) || 0, mode: r.mode, session: r.session === 'PM' ? 'PM' : 'AM', note: r.note };
        }
      }
      this.data.set(data);
      this.saved = structuredClone(data);
      this.stored.set(true);
    } catch { /* storage unavailable: the session still works */ }
  }

  /* monthly grid: click a working day to edit it on the daily register */
  openDay(d: string, e: Employee) {
    if (dayKind(d) !== 'W') return;
    this.date.set(d);
    this.selected.set(e.id);
    this.statusFilter.set('all');
    this.checked.set(new Set());
    this.view.set('daily');
    this.refreshEditor();
    this.editorOpen.set(true);
    setTimeout(() => (document.getElementById('at-edit-status') as HTMLSelectElement | null)?.focus());
  }

  /* toast */
  notify(text: string) {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 5500);
  }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.pickerOpen()) this.pickerOpen.set(false); else if (this.editorOpen()) this.closeEditor(); }

  @HostListener('window:beforeunload', ['$event'])
  onLeave(e: BeforeUnloadEvent) { if (this.dirty().size) { e.preventDefault(); e.returnValue = ''; } }

  /* ------------------------------------------------ PDF (landscape A4, 2 pages) */
  async download() {
    const r = this.report();
    if (!r.employees.length) { this.notify('Choose at least one employee to create a report.'); return; }
    this.busyPdf.set(true);
    try {
      const bytes = await createPdf(r);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Attendance-' + r.month + (this.department() === 'all' ? '' : '-' + this.department()) + (r.meta.draftCount ? '-Draft' : '') + '.pdf';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.notify('Your two-page PDF is ready' + (r.meta.draftCount ? ' - it identifies unsaved edits.' : '.'));
    } catch (err) {
      console.error('PDF export failed', err);
      this.notify('The PDF could not be created. Please retry. Your attendance changes are still here.');
    } finally {
      this.busyPdf.set(false);
    }
  }
}

/* ---------------------------------------------------------------- PDF builder (pdf-lib) */
const PDF_COLORS = { navy: '#142C42', muted: '#677889', line: '#E1E8EF', pale: '#F4F7FA', white: '#FFFFFF', blue: '#2764E7', teal: '#078677', violet: '#7756C9', amber: '#A86B0C', rose: '#C34D67' };
const PDF_TONES: Record<Status, [string, string]> = {
  P: ['#E8F6F1', '#078677'], HD: ['#FFF4DB', '#996009'], L: ['#F0EBFC', '#7756C9'], A: ['#FDEDF0', '#C34D67'],
  U: ['#F2F4F7', '#77818C'], WO: ['#F4F6F8', '#8D98A5'], H: ['#EAF1FD', '#3969AA'], F: ['#FFFFFF', '#A4AEB8'],
};
const pdfSafe = (s: unknown) => String(s ?? '').replace(/—|–/g, '-').replace(/·/g, ' | ').replace(/½/g, '0.5').replace(/[^\x20-\x7E]/g, '');
const pdfDate = (d: string) => dateObj(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pdfRate = (t: { required: number; rate: number }) => t.required ? t.rate.toFixed(1) + '%' : '-';
const pdfScope = (r: Report) => (r.meta.department && r.meta.department !== 'all' ? r.meta.department : 'All departments') + (r.meta.search ? ' | Search: ' + r.meta.search : '');

async function createPdf(r: Report): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle('Attendance report - ' + r.period.label);
  doc.setAuthor('OtoSolve');
  doc.setSubject('Employee attendance report');
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 34, CW = W - M * 2;
  const color = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  let page: any;
  const rect = (x: number, y: number, w: number, h: number, fill: string, border?: string) =>
    page.drawRectangle({ x, y: H - y - h, width: w, height: h, color: color(fill), ...(border ? { borderColor: color(border), borderWidth: .55 } : {}) });
  const line = (x: number, y: number, x2: number, y2: number, c = PDF_COLORS.line) =>
    page.drawLine({ start: { x, y: H - y }, end: { x: x2, y: H - y2 }, thickness: .6, color: color(c) });
  const tx = (s0: unknown, x: number, y: number, size = 9, c = PDF_COLORS.navy, weight = false, max?: number) => {
    let s = pdfSafe(s0); const f = weight ? bold : regular;
    if (max) while (s.length && f.widthOfTextAtSize(s, size) > max) s = s.slice(0, -2) + '~';
    page.drawText(s, { x, y: H - y - size, font: f, size, color: color(c) });
  };
  const centered = (s0: unknown, x: number, y: number, w: number, size = 9, c = PDF_COLORS.navy, weight = false) => {
    const s = pdfSafe(s0); tx(s, x + (w - (weight ? bold : regular).widthOfTextAtSize(s, size)) / 2, y, size, c, weight);
  };
  const wrap = (s: string, x: number, y: number, max: number, size = 8, leading = 12, c = PDF_COLORS.muted) => {
    let acc = '', yy = y;
    for (const word of pdfSafe(s).split(' ')) {
      const next = acc ? acc + ' ' + word : word;
      if (regular.widthOfTextAtSize(next, size) > max && acc) { tx(acc, x, yy, size, c); yy += leading; acc = word; } else acc = next;
    }
    if (acc) tx(acc, x, yy, size, c);
    return yy + leading;
  };
  const provisional = !!(r.total.U || r.meta.draftCount);
  const header = (title: string, pageNo: number) => {
    page = doc.addPage([W, H]);
    rect(M, 29, 21, 21, PDF_COLORS.blue); tx('O', M + 6, 31, 14, PDF_COLORS.white, true);
    tx('OTOSOLVE', M + 29, 29, 10, PDF_COLORS.navy, true); tx('PEOPLE OPERATIONS', M + 29, 42, 6.5, PDF_COLORS.muted);
    tx('ATT-' + r.month.replace('-', '') + '  /  ATTENDANCE REPORT', W - M - 210, 32, 8, PDF_COLORS.muted, true);
    line(M, 62, W - M, 62);
    tx(title, M, 75, 23, PDF_COLORS.navy, true);
    tx(r.period.label + '  |  Through ' + pdfDate(r.period.cutoff) + '  |  ' + r.employees.length + ' employees', M, 106, 9, PDF_COLORS.muted);
    tx(pdfScope(r), M, 121, 8, PDF_COLORS.muted, false, CW - 190);
    tx(provisional ? 'PROVISIONAL REPORT' : 'ATTENDANCE SUMMARY', W - M - 160, 121, 7.5, provisional ? PDF_COLORS.amber : PDF_COLORS.teal, true);
    line(M, 558, W - M, 558);
    tx('Attendance rules as configured | No payroll calculation', M, 570, 7, PDF_COLORS.muted);
    tx('OtoSolve', M + 390, 570, 7, PDF_COLORS.muted);
    tx('Page ' + pageNo + ' of 2', W - M - 58, 570, 7, PDF_COLORS.muted, true);
  };

  /* page 1: summary */
  header('Monthly attendance report', 1);
  const kpis: [string, string, string, string][] = [
    ['ATTENDANCE RATE', pdfRate(r.total), 'Weighted across required days', PDF_COLORS.blue],
    ['ATTENDANCE CREDIT', r.total.credit.toFixed(1) + ' days', r.total.required + ' required employee-days', PDF_COLORS.teal],
    ['APPROVED LEAVE', r.total.L + ' days', 'Excluded from required days', PDF_COLORS.violet],
    ['UNMARKED RECORDS', String(r.total.U), 'Outstanding attendance entries', PDF_COLORS.amber],
  ];
  const kw = (CW - 30) / 4;
  kpis.forEach((k, i) => { const x = M + i * (kw + 10); rect(x, 145, kw, 59, PDF_COLORS.pale); rect(x, 145, 3, 59, k[3]); tx(k[0], x + 12, 153, 7, PDF_COLORS.muted, true); tx(k[1], x + 12, 167, 19, k[3], true); tx(k[2], x + 12, 190, 7, PDF_COLORS.muted); });
  tx('01  /  EMPLOYEE SUMMARY', M, 219, 9, PDF_COLORS.navy, true);
  tx('Hours exclude incomplete punches', W - M - 166, 219, 7.5, PDF_COLORS.muted);
  const widths = [152, 112, 54, 44, 44, 44, 44, 44, 52, 84, CW - 674];
  const heads = ['Employee', 'Department', 'Sched.', 'P', 'HD', 'L', 'A', 'U', 'Late', 'Hours', 'Rate'];
  let x = M; rect(M, 238, CW, 23, PDF_COLORS.navy);
  heads.forEach((l, i) => { i < 2 ? tx(l, x + 8, 245, 7.5, PDF_COLORS.white, true) : centered(l, x, 245, widths[i], 7.5, PDF_COLORS.white, true); x += widths[i]; });
  const rowHeight = 17; let y = 261;
  r.rows.forEach((s, i) => {
    if (i % 2 === 0) rect(M, y, CW, rowHeight, '#F5F8FB');
    x = M;
    const cells = [s.name, s.department, s.scheduled, s.P, s.HD, s.L, s.A, s.U, s.late, compactDuration(s.minutes), pdfRate(s)];
    cells.forEach((v, j) => {
      if (j < 2) tx(v, x + 8, y + 4, 8, j === 1 ? PDF_COLORS.muted : PDF_COLORS.navy, j === 0, widths[j] - 12);
      else centered(v, x, y + 4, widths[j], 8, j === 10 ? PDF_COLORS.teal : j === 7 && s.U ? PDF_COLORS.amber : PDF_COLORS.navy, j === 10);
      x += widths[j];
    });
    y += rowHeight; line(M, y, W - M, y);
  });
  rect(M, y, CW, 23, '#EAF1FB'); x = M;
  [ 'Total', r.employees.length + ' employees', r.total.scheduled, r.total.P, r.total.HD, r.total.L, r.total.A, r.total.U, r.total.late, compactDuration(r.total.minutes), pdfRate(r.total) ]
    .forEach((v, j) => { if (j < 2) tx(v, x + 8, y + 7, 8, PDF_COLORS.navy, true); else centered(v, x, y + 7, widths[j], 8, j === 10 ? PDF_COLORS.blue : PDF_COLORS.navy, true); x += widths[j]; });
  const noteY = Math.max(500, y + 34);
  wrap('Method: (Present + 0.5 x Half-day) / (Scheduled workdays - Approved leave). Weekends and the company holiday are excluded.', M, noteY, CW, 7.4, 10);
  const draft = Number(r.meta.draftCount) || 0;
  wrap('Review: ' + r.total.U + ' unmarked; ' + r.total.missing + ' incomplete punch record' + (r.total.missing === 1 ? '' : 's') + ' excluded from hours; ' + r.total.late + ' late arrivals. ' + (draft ? draft + ' unsaved edit' + (draft === 1 ? '' : 's') + ' included.' : 'No unsaved edits in this report.'),
    M, noteY + 13, CW, 7.4, 10, r.total.U || r.total.missing || draft ? PDF_COLORS.amber : PDF_COLORS.muted);
  tx('Prepared for: Attendance review', M, 541, 7.5, PDF_COLORS.muted);
  tx('Reviewed by: __________________________', W - M - 224, 541, 7.5, PDF_COLORS.muted);

  /* page 2: day-by-day register */
  header('Day-by-day attendance register', 2);
  const legends: [Status, string][] = [['P', 'Present'], ['HD', 'Half-day'], ['L', 'Leave'], ['A', 'Absent'], ['U', 'Unmarked'], ['WO', 'Weekly off'], ['H', 'Holiday']];
  x = M;
  legends.forEach(([code, label]) => { const [bg, fg] = PDF_TONES[code]; rect(x, 145, 20, 17, bg); centered(code, x, 149, 20, 7, fg, true); tx(label, x + 25, 149, 7.5, PDF_COLORS.muted); x += label.length * 3.4 + 38; });
  tx('Dot = late', W - M - 58, 149, 7.5, PDF_COLORS.amber);
  const nameWidth = 139, dw = (CW - nameWidth) / r.dates.length, headY = 177;
  rect(M, headY, CW, 31, PDF_COLORS.navy); tx('EMPLOYEE / ID', M + 8, headY + 11, 8, PDF_COLORS.white, true);
  r.dates.forEach((d, j) => { const xx = M + nameWidth + j * dw; if (dayKind(d) !== 'W') rect(xx, headY, dw, 31, '#2B4257'); centered(Number(d.slice(-2)), xx, headY + 5, dw, 8, PDF_COLORS.white, true); centered(WEEKDAY_LETTER[weekday(d)], xx, headY + 17, dw, 6.5, '#C1CBD5'); });
  y = headY + 31; const rh = 25;
  r.employees.forEach((e, i) => {
    rect(M, y, CW, rh, i % 2 ? '#FFFFFF' : '#F6F8FB');
    tx(e.name, M + 8, y + 4, 8.5, PDF_COLORS.navy, true); tx(e.id, M + 8, y + 15, 6.2, PDF_COLORS.muted);
    r.dates.forEach((d, j) => {
      const rr = r.data[key(d, e.id)] || record('U'), xx = M + nameWidth + j * dw, [bg, fg] = PDF_TONES[rr.status] || PDF_TONES.U;
      rect(xx + .5, y + .5, dw - 1, rh - 1, bg);
      centered(rr.status === 'F' ? '-' : rr.status, xx, y + 9, dw, rr.status === 'WO' ? 6.5 : 7.4, fg, true);
      if (lateMinutes(rr) > 0) page.drawCircle({ x: xx + dw - 4, y: H - y - 5, size: 1.5, color: color(PDF_COLORS.amber) });
    });
    y += rh; line(M, y, W - M, y);
  });
  wrap('Reading the register: P = 1 attendance day; HD = 0.5 day. U remains outstanding, never automatically absent. A dash marks dates after the report cutoff.', M, 522, CW, 7.6, 11);
  tx('Company holiday: ' + pdfDate(r.period.holiday) + '. Late = arrival more than 10 minutes after session start.', M, 539, 7.5, PDF_COLORS.muted);
  return await doc.save();
}