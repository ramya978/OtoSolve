import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';
import { AttRecord, LABELS, PERIODS, Status, employeeDemoRecord, key, lateMinutes, netMinutes, readRegisterOverrides, todayIso } from '../Attendance/attendance';
import {
  AttendanceFlowStore, FlowRequest, PunchKind, REQUEST_TYPES, RequestType, SHIFT, WORK_LOCATIONS,
  fromMin, nowClock, pad2, punchRecord, summarize, toMin,
} from '../Attendance/attendance-flow.store';
import { AkSelect, AkOption } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';
import '../Attendance/attendance-font'; // Public Sans, the reference typeface
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { IamAdminApiService } from '../../../Service/iam-admin-api.service';
import { UserDirectoryApiService } from '../../../Service/user-directory-api.service';

/* =====================================================================================================
   MY ATTENDANCE - the employee side of the attendance flow (layout follows the OtoSolve HR reference).
     Punch bar     : shift · live clock · status · worked / in / out / break · today's work-time bar
                     · work location · round Punch in / Punch out button (+ break)
     Missed punches: days in the last two weeks without a punch-in or punch-out, each one opens a fix
     Stats strip   : today · this week · this month · overtime · attendance rate
     Month         : calendar or list view · my requests       + day details · today's punches
     Requests      : punch correction · work from home · on duty · half day · permission → approval chain
   Punches and requests go to AttendanceFlowStore; the admin Attendance page reads the same store, so a
   punch shows up live in the daily register and an approved request is written into it.
   ===================================================================================================== */

type View = 'calendar' | 'list' | 'requests';
type Source = 'register' | 'punch' | 'sample' | 'upcoming';
interface Person { id: string; name: string; department: string; role: string; initials: string; }
interface Day {
  date: string; number: number; weekday: string; status: Status; label: string; rec: AttRecord;
  minutes: number; late: number; overtime: number; source: Source; future: boolean; location: string;
}

const pad = pad2;
const dateParts = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const isoOf = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (s: string, n: number) => { const d = dateParts(s); d.setDate(d.getDate() + n); return isoOf(d); };
const fmt = (n: number) => `${Math.floor(n / 60)}h ${pad(n % 60)}m`;
const AXIS_START = 360, AXIS_LEN = 960; // work-time bar: 06:00 → 22:00
const TONES: Record<Status, string> = { P: 'teal', HD: 'amber', L: 'violet', A: 'rose', U: 'grey', WO: 'grey', H: 'blue', F: 'grey' };
const list = (x: any): any[] => {
  for (const v of [x, x?.data, x?.result, x?.response, x?.data?.data]) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') for (const k of ['items', 'users', 'employees', 'results', 'content', 'records']) if (Array.isArray(v[k])) return v[k];
  } return [];
};
const nameOf = (x: any) => String(x?.name ?? x?.departmentName ?? x?.department_name ?? x?.title ?? '').trim();
const mapPerson = (x: any, departments: Map<string, string>): Person | null => {
  const id = x?.id ?? x?.userId ?? x?.user_id ?? x?.uuid ?? x?.employeeId;
  if (id === undefined || id === null) return null;
  const name = String(x?.fullName ?? x?.name ?? x?.displayName ?? ([x?.firstName ?? x?.first_name, x?.lastName ?? x?.last_name].filter(Boolean).join(' '))).trim() || String(x?.email ?? id);
  const raw = x?.department ?? x?.departmentDetails ?? x?.departmentName ?? x?.department_name;
  const ref = x?.departmentId ?? x?.department_id ?? raw?.id ?? raw;
  const department = (typeof raw === 'object' ? nameOf(raw) : '') || departments.get(String(ref ?? '')) || (typeof raw === 'string' && !/^[0-9a-f-]{20,}$/i.test(raw) ? raw : 'Unassigned');
  return { id: String(id), name, department, role: String(x?.designation?.name ?? x?.designation ?? x?.role?.name ?? x?.jobTitle ?? 'Employee'), initials: name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') };
};

@Component({
  selector: 'app-user-attendance', standalone: true, imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './user_attendance.html', styleUrls: ['../Attendance/attendance-kit.css', './user_attendance.css'],
})
export class IndividualAttendance implements OnDestroy {
  private readonly usersApi = inject(UserDirectoryApiService);
  private readonly deptApi = inject(IamAdminApiService);
  readonly flow = inject(AttendanceFlowStore);
  readonly hr = inject(AttendanceHrStore);

  /* directory */
  readonly people = signal<Person[]>([]);
  readonly departments = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selectedId = signal('');

  /* screen state */
  readonly view = signal<View>('calendar');
  readonly today = signal(todayIso());
  readonly now = signal(new Date());
  readonly month = signal(todayIso().slice(0, 7));
  readonly selectedDate = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'all' | Status>('all');
  readonly location = signal(WORK_LOCATIONS[0]);
  readonly toast = signal<string | null>(null);
  readonly overrides = signal<Record<string, AttRecord>>(readRegisterOverrides());

  /* constants for the template */
  readonly labels = LABELS;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly requestTypes = REQUEST_TYPES;
  readonly shift = SHIFT;
  readonly axisHours = ['06:00', '10:00', '14:00', '18:00', '22:00'];
  readonly legend: { label: string; tone: string }[] = [
    { label: 'Present', tone: 'teal' }, { label: 'Half day', tone: 'amber' }, { label: 'Absent', tone: 'rose' },
    { label: 'Leave', tone: 'violet' }, { label: 'Holiday', tone: 'blue' },
  ];
  readonly statusOptions: AkOption[] = [{ value: 'all', label: 'All statuses' },
    ...(['P', 'A', 'HD', 'L', 'WO', 'U', 'H'] as Status[]).map(s => ({ value: s, label: LABELS[s] }))];
  private readonly monthKeys = Object.keys(PERIODS);
  private timer?: ReturnType<typeof setInterval>;
  private toastTimer?: ReturnType<typeof setTimeout>;

  /* request form */
  readonly rqOpen = signal(false);
  readonly rqType = signal<RequestType>('Punch correction');
  readonly rqDate = signal(todayIso());
  readonly rqFrom = signal('09:00');
  readonly rqTo = signal('18:00');
  readonly rqLocation = signal(WORK_LOCATIONS[0]);
  readonly rqReason = signal('');
  readonly rqError = signal('');

  constructor() {
    void this.loadDirectory();
    this.timer = setInterval(() => {
      const d = new Date();
      this.now.set(d);
      if (isoOf(d) !== this.today()) this.today.set(isoOf(d)); // midnight roll-over
    }, 1000);
  }
  ngOnDestroy() { clearInterval(this.timer); clearTimeout(this.toastTimer); }

  /* ------------------------------------------------ directory */
  async loadDirectory() {
    this.loading.set(true); this.error.set('');
    try {
      const [u, d] = await Promise.all([firstValueFrom(this.usersApi.searchUsers({ pageIndex: 0, pageSize: 1000 })), firstValueFrom(this.deptApi.getDepartments())]);
      const depList = Array.isArray(d) ? d : list(d), depMap = new Map<string, string>();
      depList.forEach((x: any) => { const name = nameOf(x), id = x?.id ?? x?.departmentId ?? x?.uuid; if (name && id != null) depMap.set(String(id), name); });
      const userRows = list(u); const people = userRows.map(x => mapPerson(x, depMap)).filter((x): x is Person => !!x);
      if (userRows.length && !people.length) throw new Error('Users API response does not include usable employee IDs.');
      this.people.set(people); this.departments.set([...new Set(people.map(p => p.department))]);
      // ?employee=EMP-1001 opens that person (used by the Employee directory)
      let wanted = '';
      try { wanted = new URLSearchParams(window.location.search).get('employee') ?? ''; } catch { /* no window */ }
      if (wanted && people.some(p => p.id === wanted)) this.selectedId.set(wanted);
      else if (people.some(p => p.id === this.hr.me())) this.selectedId.set(this.hr.me()); // same person as the other employee pages
      else if (!people.some(p => p.id === this.selectedId())) this.selectedId.set(people[0]?.id ?? '');
      if (this.selectedId() !== this.hr.me()) this.hr.setMe(this.selectedId());
      const me = this.person();
      if (me) this.location.set(this.flow.home(me.id, people.indexOf(me)));
    } catch (e) { this.error.set(e instanceof Error ? e.message : String(e)); this.people.set([]); } finally { this.loading.set(false); }
  }

  /* ------------------------------------------------ one day, from the best source available */
  readonly nowMin = computed(() => { const d = this.now(); return d.getHours() * 60 + d.getMinutes(); });

  private dayInfo(date: string, p: Person): Day {
    const dp = dateParts(date), weekday = dp.toLocaleDateString('en-GB', { weekday: 'short' }), number = dp.getDate();
    if (date > this.today()) {
      const rec: AttRecord = { status: 'U', in: '', out: '', break: 0, mode: 'Office', session: 'AM', note: 'Upcoming day' };
      const off = dp.getDay() === 0 || dp.getDay() === 6;
      return { date, number, weekday, status: off ? 'WO' : 'U', label: off ? LABELS.WO : 'Upcoming', rec, minutes: 0, late: 0, overtime: 0, source: 'upcoming', future: true, location: '' };
    }
    const k = key(date, p.id), saved = this.overrides()[k], log = this.flow.log(p.id, date);
    const fromLog = log ? punchRecord(log) : null;
    let rec: AttRecord, source: Source, minutes: number;
    if (saved) { rec = saved; source = 'register'; minutes = netMinutes(saved) ?? 0; }
    else if (fromLog && log) { rec = fromLog; source = 'punch'; minutes = summarize(log.punches, date === this.today() ? this.nowMin() : null).workedMin; }
    else { rec = employeeDemoRecord(date, p.id); source = 'sample'; minutes = netMinutes(rec) ?? 0; }
    const location = log?.location ?? (['P', 'HD'].includes(rec.status) ? (rec.mode === 'Remote' ? 'Remote · Home' : 'Office') : '');
    return {
      date, number, weekday, status: rec.status, label: LABELS[rec.status], rec, minutes,
      late: lateMinutes(rec), overtime: rec.status === 'P' ? Math.max(0, minutes - SHIFT.netTarget) : 0,
      source, future: false, location,
    };
  }

  /* ------------------------------------------------ derived */
  readonly person = computed(() => this.people().find(x => x.id === this.selectedId()) ?? null);
  readonly personOptions = computed<AkOption[]>(() => this.people().map(p => ({ value: p.id, label: p.name, hint: p.department + ' · ' + p.id })));
  get locationOptions(): string[] { return this.flow.activeLocations(); }
  readonly monthLabel = computed(() => dateParts(this.month() + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  readonly monthShort = computed(() => dateParts(this.month() + '-01').toLocaleDateString('en-GB', { month: 'short' }));
  readonly days = computed<Day[]>(() => {
    const p = this.person(); if (!p) return [];
    const [y, m] = this.month().split('-').map(Number), max = new Date(y, m, 0).getDate();
    return Array.from({ length: max }, (_, i) => this.dayInfo(`${y}-${pad(m)}-${pad(i + 1)}`, p));
  });
  readonly filteredDays = computed(() => this.days().filter(d => !d.future && (this.statusFilter() === 'all' || d.status === this.statusFilter()) && (!this.search() || `${d.date} ${d.weekday} ${d.label} ${d.location}`.toLowerCase().includes(this.search().toLowerCase()))).reverse());
  readonly focusDay = computed(() => this.days().find(x => x.date === this.selectedDate()) ?? this.days().find(x => x.date === this.today()) ?? this.days().filter(x => !x.future).pop() ?? this.days()[0] ?? null);
  readonly calendarPadding = computed(() => { const d = this.days()[0]; return d ? Array.from({ length: (dateParts(d.date).getDay() + 6) % 7 }, (_, i) => i) : []; });
  readonly summary = computed(() => {
    const days = this.days().filter(d => !d.future), count = (code: Status) => days.filter(x => x.status === code).length;
    const worked = days.reduce((s, x) => s + x.minutes, 0);
    const scheduled = days.filter(x => !['WO', 'H', 'F', 'L'].includes(x.status)).length;
    return { present: count('P'), absent: count('A'), half: count('HD'), leave: count('L'), off: count('WO'), unmarked: count('U'), worked, rate: scheduled ? Math.round((count('P') + count('HD') * .5) / scheduled * 100) : 0 };
  });

  /** working days in the last two weeks with a missing punch-in or punch-out (today is still in progress) */
  readonly missed = computed(() => {
    const p = this.person(); if (!p) return [];
    const out: { date: string; text: string }[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = this.dayInfo(addDays(this.today(), -i), p);
      if (d.status === 'U') out.push({ date: d.date, text: this.shortDay(d.date) + ' · punch-in missing' });
      else if (['P', 'HD'].includes(d.status) && d.rec.in && !d.rec.out) out.push({ date: d.date, text: this.shortDay(d.date) + ' · punch-out missing' });
    }
    return out;
  });

  /* today */
  readonly todayLog = computed(() => { const p = this.person(); return p ? this.flow.log(p.id, this.today()) : null; });
  readonly todaySummary = computed(() => summarize(this.todayLog()?.punches ?? [], this.nowMin()));
  readonly todayDay = computed(() => { const p = this.person(); return p ? this.dayInfo(this.today(), p) : null; });
  readonly punchState = computed<'out' | 'working' | 'break' | 'done'>(() => {
    const s = this.todaySummary();
    return s.onBreak ? 'break' : s.open ? 'working' : s.done ? 'done' : 'out';
  });
  readonly greeting = computed(() => { const h = this.now().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; });
  readonly firstName = computed(() => (this.person()?.name ?? '').split(/\s+/)[0]);
  readonly clock = computed(() => { const d = this.now(); return { hm: pad(d.getHours()) + ':' + pad(d.getMinutes()), s: pad(d.getSeconds()) }; });
  readonly todayLabel = computed(() => dateParts(this.today()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  readonly punchHeadline = computed(() => {
    const s = this.todaySummary();
    switch (this.punchState()) {
      case 'working': return { title: 'Working since ' + s.first, sub: fmt(s.workedMin) + ' worked so far', tone: 'teal' };
      case 'break': return { title: 'On a break', sub: 'Break time today ' + fmt(s.breakMin), tone: 'amber' };
      case 'done': return { title: 'Shift complete', sub: s.first + ' – ' + s.last + ' · ' + fmt(s.workedMin) + ' worked', tone: 'blue' };
      default: {
        const t = this.todayDay();
        if (t && t.source === 'register') return { title: LABELS[t.status], sub: 'Marked by HR for today', tone: 'violet' };
        if (t && ['WO', 'H'].includes(t.status)) return { title: t.label, sub: 'Punches today count as extra time only', tone: 'grey' };
        return { title: 'Not punched in yet', sub: 'Shift starts at ' + SHIFT.start + (this.nowMin() > SHIFT.startMin + 10 ? ' · you are late' : ''), tone: 'grey' };
      }
    }
  });
  /** the big round button: what one tap does now */
  readonly mainAction = computed<{ kind: PunchKind; label: string; tone: string }>(() => {
    switch (this.punchState()) {
      case 'working': return { kind: 'out', label: 'Punch out', tone: 'rose' };
      case 'break': return { kind: 'break-end', label: 'End break', tone: 'amber' };
      case 'done': return { kind: 'in', label: 'Punch in again', tone: 'teal' };
      default: return { kind: 'in', label: 'Punch in', tone: 'teal' };
    }
  });
  readonly todayChips = computed(() => {
    const s = this.todaySummary(), t = this.todayDay();
    const worked = s.workedMin || (t?.minutes ?? 0);
    return [
      { label: 'Worked', value: fmt(worked) },
      { label: 'In', value: s.first || t?.rec.in || '—' },
      { label: 'Out', value: s.open ? '—' : s.last || t?.rec.out || '—' },
      { label: 'Break', value: s.breakMin ? fmt(s.breakMin) : '—' },
    ];
  });
  readonly todayPunches = computed(() => (this.todayLog()?.punches ?? []).map(p => ({
    ...p, label: { in: 'Punched in', 'break-start': 'Break started', 'break-end': 'Break ended', out: 'Punched out' }[p.kind],
  })).reverse());

  /* stats strip */
  private sumMinutes(dates: string[]) { const p = this.person(); return p ? dates.map(d => this.dayInfo(d, p)).reduce((a, d) => a + d.minutes, 0) : 0; }
  private sumOvertime(dates: string[]) { const p = this.person(); return p ? dates.map(d => this.dayInfo(d, p)).reduce((a, d) => a + d.overtime, 0) : 0; }
  private readonly weekDates = computed(() => { const t = this.today(), start = addDays(t, -((dateParts(t).getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(d => d <= t); });
  private readonly monthDates = computed(() => { const t = this.today(), n = Number(t.slice(-2)); return Array.from({ length: n }, (_, i) => t.slice(0, 8) + pad(i + 1)); });
  readonly stats = computed(() => {
    const today = this.todaySummary().workedMin || (this.todayDay()?.minutes ?? 0);
    const week = this.sumMinutes(this.weekDates()), month = this.sumMinutes(this.monthDates()), ot = this.sumOvertime(this.monthDates());
    const sm = this.summary();
    return [
      { key: 'today', icon: 'clock', label: 'Today', value: fmt(today), sub: 'of ' + fmt(SHIFT.netTarget), pct: Math.min(100, today / SHIFT.netTarget * 100), tone: 'blue', hide: '' },
      { key: 'week', icon: 'week', label: 'This week', value: fmt(week), sub: 'of 40h 00m', pct: Math.min(100, week / 2400 * 100), tone: 'teal', hide: '' },
      { key: 'month', icon: 'month', label: 'This month', value: fmt(month), sub: this.monthDates().length + ' days so far', pct: -1, tone: 'violet', hide: 'sm' },
      { key: 'ot', icon: 'bolt', label: 'Overtime', value: fmt(ot), sub: 'beyond ' + fmt(SHIFT.netTarget) + ' a day', pct: -1, tone: 'amber', hide: 'lg' },
      { key: 'rate', icon: 'check', label: 'Attendance · ' + this.monthShort(), value: sm.rate + '%', sub: sm.present + ' present · ' + sm.absent + ' absent', pct: sm.rate, tone: 'teal', hide: '' },
    ];
  });

  /* work-time bar for today (06:00 → 22:00) */
  readonly bar = computed(() => {
    const s = this.todaySummary(), pct = (m: number) => Math.max(0, Math.min(100, (m - AXIS_START) / AXIS_LEN * 100));
    return {
      segments: s.segments.map(g => ({ kind: g.kind, left: pct(g.from), width: Math.max(.4, pct(g.to) - pct(g.from)), title: (g.kind === 'work' ? 'Work ' : 'Break ') + fromMin(g.from) + '–' + fromMin(g.to) })),
      shiftLeft: pct(SHIFT.startMin), shiftWidth: pct(SHIFT.endMin) - pct(SHIFT.startMin),
      nowLeft: pct(this.nowMin()), showNow: this.nowMin() >= AXIS_START && this.nowMin() <= AXIS_START + AXIS_LEN,
    };
  });

  /* requests */
  readonly myRequests = computed(() => { const p = this.person(); return p ? [...this.flow.requestsFor(p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []; });
  readonly myPending = computed(() => this.myRequests().filter(r => r.status === 'Pending').length);
  readonly rqHint = computed(() => REQUEST_TYPES.find(t => t.type === this.rqType())?.hint ?? '');
  readonly rqNeedsTime = computed(() => this.rqType() !== 'Work from home');
  readonly rqNeedsLocation = computed(() => ['On duty', 'Work from home', 'Punch correction'].includes(this.rqType()));
  readonly rqMin = computed(() => addDays(this.today(), -60));
  readonly rqMax = computed(() => this.rqType() === 'Punch correction' ? this.today() : addDays(this.today(), 30));
  readonly rqDayNote = computed(() => {
    const p = this.person(); if (!p) return '';
    const d = this.dayInfo(this.rqDate(), p);
    return d.future ? 'Upcoming day' : 'Currently: ' + d.label + (d.rec.in ? ' · ' + d.rec.in + '–' + (d.rec.out || '…') : '');
  });

  /* ------------------------------------------------ template helpers */
  tone(s: Status) { return TONES[s]; }
  displayTime(s: string) { return s || '—'; }
  worked(n: number) { return n ? fmt(n) : '—'; }
  shortDay(d: string) { return dateParts(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  shortDate(d: string) { return dateParts(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  longDay(d: string) { return dateParts(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }
  sourceLabel(s: Source) { return { register: 'Saved by HR', punch: 'Web punch', sample: 'Sample data', upcoming: 'Upcoming' }[s]; }
  requestTone(s: string) { return s === 'Approved' ? 'teal' : s === 'Rejected' ? 'rose' : s === 'Pending' ? 'amber' : 'grey'; }
  requestTime(r: FlowRequest) { return r.type === 'Work from home' ? 'Full day' : r.from + ' – ' + r.to; }
  canMonth(n: number) { const i = this.monthKeys.indexOf(this.month()) + n; return i >= 0 && i < this.monthKeys.length; }
  isLive(d: Day) { return d.date === this.today() && !!d.rec.in && !d.rec.out; }
  /** short text in a calendar cell */
  cellLabel(d: Day) {
    if (d.date === this.today() && d.status === 'U') return this.punchState() === 'out' ? 'Not in yet' : 'Working';
    if (d.status === 'WO') return 'Off';
    return this.isLive(d) ? 'Working' : d.label;
  }
  dayRange(d: Day) { return d.rec.in ? d.rec.in + '–' + (d.rec.out || (this.isLive(d) ? 'now' : '…')) : ''; }
  outText(d: Day) { return this.isLive(d) ? 'On shift' : this.displayTime(d.rec.out); }

  /* ------------------------------------------------ actions */
  selectEmployee(id: string) {
    this.selectedId.set(id); this.hr.setMe(id);
    const p = this.people().find(x => x.id === id);
    if (p && !this.todayLog()) this.location.set(this.flow.home(p.id, this.people().indexOf(p)));
    this.selectedDate.set(''); this.statusFilter.set('all');
  }
  moveMonth(delta: number) { if (!this.canMonth(delta)) return; this.month.set(this.monthKeys[this.monthKeys.indexOf(this.month()) + delta]); this.selectedDate.set(''); }
  thisMonth() { this.month.set(this.today().slice(0, 7)); this.selectedDate.set(''); }
  selectDay(date: string) { this.selectedDate.set(date); }
  setStatusFilter(v: string) { this.statusFilter.set(v as 'all' | Status); }
  /** open a missed day: show it in the calendar and start a correction for it */
  fixDay(date: string) {
    if (date.slice(0, 7) !== this.month() && this.monthKeys.includes(date.slice(0, 7))) this.month.set(date.slice(0, 7));
    this.selectedDate.set(date); this.openRequest('Punch correction', date);
  }

  readonly checking = signal(false);
  /** browser location, or null when it is blocked / unavailable */
  private currentPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(res => {
      try {
        if (!navigator.geolocation) { res(null); return; }
        navigator.geolocation.getCurrentPosition(x => res({ lat: x.coords.latitude, lng: x.coords.longitude }), () => res(null), { timeout: 8000, maximumAge: 60000 });
      } catch { res(null); }
    });
  }

  async punch(kind: PunchKind) {
    const p = this.person(); if (!p || this.checking()) return;
    // punch methods (Set up → Punch methods and devices) and geo-fencing (Set up → Geo-fencing)
    if (!this.hr.methodOn('Web punch')) { this.notify('Web punching is switched off by HR. Use the punch station or a biometric device.'); return; }
    if (this.hr.geoEnforced() && (kind === 'in' || kind === 'out')) {
      this.checking.set(true);
      const g = this.hr.checkGeo(p.id, this.location(), await this.currentPosition());
      this.checking.set(false);
      if (!g.ok) { this.notify(g.text); return; }
    }
    const err = this.flow.punch(p, this.today(), kind, this.location());
    const at = nowClock();
    this.notify(err || ({ in: 'Punched in at ' + at + ' · ' + this.location(), 'break-start': 'Break started at ' + at, 'break-end': 'Welcome back - break ended at ' + at, out: 'Punched out at ' + at + '. Have a good evening!' } as Record<PunchKind, string>)[kind]);
  }

  openRequest(type: RequestType = 'Punch correction', date?: string) {
    const p = this.person(); if (!p) return;
    const d = date && date <= addDays(this.today(), 30) ? date : this.today();
    this.rqDate.set(d); this.rqReason.set(''); this.rqError.set('');
    this.setRqType(type);
    this.rqOpen.set(true);
  }
  setRqType(t: RequestType) {
    this.rqType.set(t); this.rqError.set('');
    if (t === 'Punch correction' && this.rqDate() > this.today()) this.rqDate.set(this.today());
    const p = this.person(), day = p ? this.dayInfo(this.rqDate(), p) : null;
    const preset: Record<RequestType, [string, string, string]> = {
      'Punch correction': [day?.rec.in || SHIFT.start, day?.rec.out || SHIFT.end, this.location()],
      'Work from home': [SHIFT.start, SHIFT.end, 'Remote · Home'],
      'On duty': [SHIFT.start, SHIFT.end, 'Client site'],
      'Half day': ['09:00', '13:00', this.location()],
      'Permission': ['11:00', '12:00', this.location()],
    };
    const [a, b, l] = preset[t];
    this.rqFrom.set(a); this.rqTo.set(b); this.rqLocation.set(l);
  }
  setRqDate(d: string) {
    if (d < this.rqMin() || d > this.rqMax()) return;
    this.rqDate.set(d); this.rqError.set('');
    if (this.rqType() === 'Punch correction') this.setRqType('Punch correction');
  }
  setHalf(pm: boolean) { this.rqFrom.set(pm ? '14:00' : '09:00'); this.rqTo.set(pm ? '18:00' : '13:00'); }
  closeRequest() { this.rqOpen.set(false); }

  submitRequest(ev: Event) {
    ev.preventDefault();
    const p = this.person(); if (!p) return;
    const type = this.rqType(), date = this.rqDate(), from = this.rqFrom(), to = this.rqTo(), reason = this.rqReason().trim();
    if (type === 'Punch correction' && date > this.today()) return this.rqError.set('A punch correction can only be raised for today or an earlier day.');
    if (this.rqNeedsTime() && (toMin(from) === null || toMin(to) === null || toMin(to)! <= toMin(from)!)) return this.rqError.set('The end time must be after the start time.');
    if (reason.length < 5) return this.rqError.set('Add a short reason (at least 5 characters) for your manager.');
    if (this.myRequests().some(r => r.status === 'Pending' && r.type === type && r.date === date)) return this.rqError.set('You already have a pending ' + type.toLowerCase() + ' for this day.');
    const req = this.hr.raiseRequest({
      employeeId: p.id, employeeName: p.name, department: p.department, type, date,
      from: this.rqNeedsTime() ? from : SHIFT.start, to: this.rqNeedsTime() ? to : SHIFT.end,
      location: this.rqNeedsLocation() ? this.rqLocation() : this.location(), reason: reason.slice(0, 240),
    });
    this.rqOpen.set(false);
    this.view.set('requests');
    const first = this.hr.waitingStep(this.hr.requestChain(this.flow.requests().find(x => x.id === req.id) ?? req))?.name ?? 'HR';
    this.notify(req.id + ' sent to ' + first + ' for approval. You will see the decision here.');
  }
  rqWhere(r: FlowRequest) { const s = this.hr.waitingStep(this.hr.requestChain(r)); return r.status === 'Pending' && s ? 'Waiting on ' + s.name : r.decidedBy ? 'by ' + r.decidedBy : ''; }
  withdraw(r: FlowRequest) { const p = this.person(); if (!p) return; this.flow.withdraw(r.id, p.name); this.notify('Request ' + r.id + ' withdrawn.'); }

  notify(text: string) { this.toast.set(text); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4500); }

  exportCsv() {
    const e = this.person(); if (!e) return;
    const lines = [['Date', 'Day', 'Status', 'Check-in', 'Check-out', 'Break minutes', 'Worked minutes', 'Late minutes', 'Overtime minutes', 'Location', 'Source'],
      ...this.days().filter(d => !d.future).map(d => [d.date, d.weekday, d.status, d.rec.in, d.rec.out, d.rec.break, d.minutes, d.late, d.overtime, d.location, this.sourceLabel(d.source)])];
    const csv = '﻿' + lines.map(r => r.map(s => '"' + String(s).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `my-attendance-${e.id}-${this.month()}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------ global listeners */
  @HostListener('document:keydown.escape')
  onEsc() { if (this.rqOpen()) this.closeRequest(); }

  /** the admin page saved the register in another tab: pick up approvals and corrections */
  @HostListener('window:storage')
  onStorage() { this.overrides.set(readRegisterOverrides()); }
}
