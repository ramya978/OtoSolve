import { Injectable, computed, signal } from '@angular/core';

/* =====================================================================================================
   ATTENDANCE FLOW STORE - the link between the employee page and the admin register.
     Employee (My attendance) : punch in · start / end break · punch out · raise requests · withdraw
     Admin (Attendance)       : sees live punches in the daily register · approves / rejects requests
     Both                     : one audit trail of every punch, request and decision
   Kept in this browser (localStorage) until the attendance API is connected. Other open tabs update
   through the "storage" event, so an employee tab and an admin tab stay in sync.
   ===================================================================================================== */

export type PunchKind = 'in' | 'break-start' | 'break-end' | 'out';
export interface Punch { kind: PunchKind; at: string; location: string; }
export interface DayLog { employeeId: string; date: string; location: string; punches: Punch[]; }

export type RequestType = 'Punch correction' | 'Work from home' | 'On duty' | 'Half day' | 'Permission';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
export interface FlowRequest {
  id: string; employeeId: string; employeeName: string; department: string;
  type: RequestType; date: string; from: string; to: string; location: string; reason: string;
  status: RequestStatus; createdAt: string; decidedAt?: string; decidedBy?: string; reviewNote?: string;
  /** approval levels (set by AttendanceHrStore); missing = HR decides alone */
  chain?: { role: string; who: string; name: string; status: string; at?: string; note?: string }[];
}
export interface AuditEntry { at: string; actor: string; action: string; detail: string; }
export type LocationType = 'Office' | 'Remote' | 'Client site' | 'Field';
export interface WorkLocation { name: string; type: LocationType; city: string; active: boolean; }
/** extra per-day fields kept beside the register record (field hub / bulk attendance) */
export interface DayMeta { location?: string; project?: string; source?: string; shift?: string; approval?: 'Approved' | 'Pending'; reason?: string; }

/** what a day of punches means for the register (same shape as the register record) */
export interface PunchRecord {
  status: 'P'; in: string; out: string; break: number; mode: 'Office' | 'Remote'; session: 'AM'; note: string;
}
export interface DaySummary {
  first: string; last: string; open: boolean; onBreak: boolean; done: boolean;
  workedMin: number; breakMin: number;
  segments: { kind: 'work' | 'break'; from: number; to: number }[];
}

export const DEFAULT_LOCATIONS: WorkLocation[] = [
  { name: 'Chennai HQ', type: 'Office', city: 'Chennai', active: true },
  { name: 'Bengaluru Office', type: 'Office', city: 'Bengaluru', active: true },
  { name: 'Remote · Home', type: 'Remote', city: 'Anywhere', active: true },
  { name: 'Client site', type: 'Client site', city: 'Chennai', active: true },
  { name: 'Field visit', type: 'Field', city: 'Tamil Nadu', active: true },
];
export const WORK_LOCATIONS = DEFAULT_LOCATIONS.map(l => l.name);
export const PUNCH_SOURCES = ['Web punch', 'Biometric', 'Mobile GPS', 'QR kiosk', 'Manual correction'];
export const REQUEST_TYPES: { type: RequestType; hint: string }[] = [
  { type: 'Punch correction', hint: 'Fix a missed or wrong check-in / check-out' },
  { type: 'Work from home', hint: 'Count a day worked remotely' },
  { type: 'On duty', hint: 'Client visit, field work or travel' },
  { type: 'Half day', hint: 'Morning or afternoon session only' },
  { type: 'Permission', hint: 'A short time away during the shift' },
];
export const SHIFT = { name: 'General shift', start: '09:00', end: '18:00', startMin: 540, endMin: 1080, netTarget: 480 };

const FLOW_KEY = 'otosolve-attendance-flow-v1';
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toMin = (t: string) => /^\d{2}:\d{2}/.test(t || '') ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null;
export const fromMin = (n: number) => pad2(Math.floor(n / 60) % 24) + ':' + pad2(n % 60);
export const isoDay = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
export const nowClock = (d = new Date()) => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
const flowKey = (date: string, id: string) => date + '|' + id;
const isRemote = (location: string) => /remote/i.test(location || '');

/** reads a day's punches into worked time, breaks and bar segments; open sessions run until `nowMin` */
export function summarize(punches: Punch[], nowMin: number | null = null): DaySummary {
  const segments: DaySummary['segments'] = [];
  let state: 'off' | 'work' | 'break' = 'off', since = 0, worked = 0, brk = 0, first = '', last = '';
  for (const p of punches) {
    const t = toMin(p.at); if (t === null) continue;
    if (p.kind === 'in' && state === 'off') {
      if (last) { const gap = Math.max(0, t - toMin(last)!); brk += gap; if (gap) segments.push({ kind: 'break', from: toMin(last)!, to: t }); }
      state = 'work'; since = t; if (!first) first = p.at;
    } else if (p.kind === 'break-start' && state === 'work') {
      worked += t - since; segments.push({ kind: 'work', from: since, to: t }); state = 'break'; since = t;
    } else if (p.kind === 'break-end' && state === 'break') {
      brk += t - since; segments.push({ kind: 'break', from: since, to: t }); state = 'work'; since = t;
    } else if (p.kind === 'out' && state !== 'off') {
      if (state === 'work') { worked += t - since; segments.push({ kind: 'work', from: since, to: t }); }
      else { brk += t - since; segments.push({ kind: 'break', from: since, to: t }); }
      state = 'off'; last = p.at;
    }
  }
  if (state !== 'off' && nowMin !== null && nowMin >= since) {
    if (state === 'work') { worked += nowMin - since; segments.push({ kind: 'work', from: since, to: nowMin }); }
    else { brk += nowMin - since; segments.push({ kind: 'break', from: since, to: nowMin }); }
  }
  return { first, last: state === 'off' ? last : '', open: state !== 'off', onBreak: state === 'break', done: !!first && state === 'off', workedMin: Math.max(0, worked), breakMin: Math.max(0, brk), segments };
}

/** a day of punches as a register record: first in, last out, breaks = every gap that was not work */
export function punchRecord(log: DayLog): PunchRecord | null {
  const s = summarize(log.punches);
  if (!s.first) return null;
  return {
    status: 'P', in: s.first, out: s.last, break: s.breakMin,
    mode: isRemote(log.location) ? 'Remote' : 'Office', session: 'AM',
    note: (s.open ? 'Live web punch' : 'Web punch') + ' · ' + log.location,
  };
}

@Injectable({ providedIn: 'root' })
export class AttendanceFlowStore {
  readonly logs = signal<Record<string, DayLog>>({});
  readonly requests = signal<FlowRequest[]>([]);
  readonly audit = signal<AuditEntry[]>([]);
  readonly locations = signal<WorkLocation[]>(DEFAULT_LOCATIONS.map(l => ({ ...l })));
  /** default work location per employee (employee directory / bulk location change) */
  readonly homeLocation = signal<Record<string, string>>({});
  readonly dayMeta = signal<Record<string, DayMeta>>({});
  readonly lockedMonths = signal<string[]>([]);
  private seeded = false;

  readonly activeLocations = computed(() => this.locations().filter(l => l.active).map(l => l.name));
  home(employeeId: string, index = 0) { return this.homeLocation()[employeeId] ?? this.activeLocations()[index % Math.max(1, Math.min(2, this.activeLocations().length))] ?? 'Chennai HQ'; }
  meta(employeeId: string, date: string): DayMeta { return this.dayMeta()[flowKey(date, employeeId)] ?? {}; }
  isLocked(dateOrMonth: string) { return this.lockedMonths().includes(dateOrMonth.slice(0, 7)); }

  readonly pendingCount = computed(() => this.requests().filter(r => r.status === 'Pending').length);

  constructor() {
    this.load();
    try { window.addEventListener('storage', e => { if (e.key === FLOW_KEY) this.load(); }); } catch { /* no window (SSR) */ }
  }

  /* ------------------------------------------------ reads */
  log(employeeId: string, date: string): DayLog | null { return this.logs()[flowKey(date, employeeId)] ?? null; }
  requestsFor(employeeId: string) { return this.requests().filter(r => r.employeeId === employeeId); }

  /** sequence rules for the punch buttons */
  canPunch(employeeId: string, date: string, kind: PunchKind): boolean {
    const s = summarize(this.log(employeeId, date)?.punches ?? []);
    if (kind === 'in') return !s.open;
    if (kind === 'break-start') return s.open && !s.onBreak;
    if (kind === 'break-end') return s.onBreak;
    return s.open;
  }

  /* ------------------------------------------------ employee actions */
  punch(employee: { id: string; name: string }, date: string, kind: PunchKind, location: string, at = nowClock()): string {
    if (this.isLocked(date)) return 'This month is finalised. Ask HR to reopen it.';
    if (!this.canPunch(employee.id, date, kind)) {
      return ({ in: 'You are already punched in.', 'break-start': 'Punch in before starting a break.', 'break-end': 'You are not on a break.', out: 'Punch in first.' } as Record<PunchKind, string>)[kind];
    }
    const k = flowKey(date, employee.id);
    const current = this.logs()[k] ?? { employeeId: employee.id, date, location, punches: [] };
    const lastAt = current.punches[current.punches.length - 1]?.at;
    if (lastAt && toMin(at)! < toMin(lastAt)!) at = lastAt;
    const punches = [...current.punches];
    if (kind === 'out' && summarize(punches).onBreak) punches.push({ kind: 'break-end', at, location });
    punches.push({ kind, at, location });
    this.logs.update(l => ({ ...l, [k]: { ...current, location: kind === 'in' ? location : current.location, punches } }));
    const words = { in: 'Punched in', 'break-start': 'Started break', 'break-end': 'Ended break', out: 'Punched out' }[kind];
    this.log_(employee.name, words, `${date} · ${at} · ${location}`);
    this.persist();
    return '';
  }

  raiseRequest(r: Omit<FlowRequest, 'id' | 'status' | 'createdAt'>): FlowRequest {
    const req: FlowRequest = { ...r, id: 'REQ-' + Date.now().toString(36).toUpperCase().slice(-6), status: 'Pending', createdAt: new Date().toISOString() };
    this.requests.update(list => [req, ...list]);
    this.log_(r.employeeName, 'Raised ' + r.type.toLowerCase(), `${req.id} · ${r.date}${r.from ? ' · ' + r.from + '–' + r.to : ''}`);
    this.persist();
    return req;
  }

  withdraw(id: string, actor: string) {
    this.requests.update(list => list.map(r => r.id === id && r.status === 'Pending' ? { ...r, status: 'Withdrawn', decidedAt: new Date().toISOString(), decidedBy: actor } : r));
    this.log_(actor, 'Withdrew request', id);
    this.persist();
  }

  /* ------------------------------------------------ admin actions */
  decide(id: string, status: 'Approved' | 'Rejected', note: string, actor = 'HR administrator'): FlowRequest | null {
    let out: FlowRequest | null = null;
    this.requests.update(list => list.map(r => {
      if (r.id !== id || r.status !== 'Pending') return r;
      out = { ...r, status, reviewNote: note.trim(), decidedAt: new Date().toISOString(), decidedBy: actor };
      return out;
    }));
    if (out) { this.log_(actor, status + ' ' + (out as FlowRequest).type.toLowerCase(), `${id} · ${(out as FlowRequest).employeeName}${note.trim() ? ' · ' + note.trim() : ''}`); this.persist(); }
    return out;
  }

  recordAdmin(action: string, detail: string, actor = 'HR administrator') { this.log_(actor, action, detail); this.persist(); }

  /* ------------------------------------------------ locations, home locations, day fields, month lock */
  saveLocation(loc: WorkLocation, previousName = '') {
    const name = loc.name.trim();
    this.locations.update(list => previousName ? list.map(l => l.name === previousName ? { ...loc, name } : l) : [...list, { ...loc, name }]);
    if (previousName && previousName !== name) {
      this.homeLocation.update(h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v === previousName ? name : v])));
    }
    this.log_('HR administrator', previousName ? 'Updated location' : 'Added location', name + ' · ' + loc.type);
    this.persist();
  }
  toggleLocation(name: string) {
    this.locations.update(list => list.map(l => l.name === name ? { ...l, active: !l.active } : l));
    this.log_('HR administrator', 'Changed location status', name);
    this.persist();
  }
  setHome(changes: { employeeId: string; name: string; location: string; reason: string }[]) {
    if (!changes.length) return;
    this.homeLocation.update(h => { const n = { ...h }; changes.forEach(c => n[c.employeeId] = c.location); return n; });
    changes.forEach(c => this.log_('HR administrator', 'Changed work location', `${c.name} → ${c.location}${c.reason ? ' · ' + c.reason : ''}`));
    this.persist();
  }
  setDayMeta(entries: Record<string, DayMeta>) {
    this.dayMeta.update(m => { const n = { ...m }; for (const [k, v] of Object.entries(entries)) n[k] = { ...(n[k] ?? {}), ...v }; return n; });
    this.persist();
  }
  setLocked(month: string, locked: boolean) {
    this.lockedMonths.update(l => locked ? [...new Set([...l, month])] : l.filter(x => x !== month));
    this.log_('HR administrator', locked ? 'Finalised month' : 'Reopened month', month);
    this.persist();
  }
  clearAudit() { this.audit.set([]); this.persist(); }

  /** a few sample requests the first time the admin page opens, so the approval desk is never empty */
  seedDemo(people: { id: string; name: string; department: string }[], workdays: string[]) {
    if (this.seeded || this.requests().length || people.length < 2 || workdays.length < 3) return;
    const pick = (i: number) => people[i % people.length];
    const d = (i: number) => workdays[Math.max(0, workdays.length - 1 - i)];
    const at = new Date().toISOString();
    const rows: FlowRequest[] = [
      { id: 'DEMO-101', ...this.who(pick(1)), type: 'Punch correction', date: d(1), from: '09:05', to: '18:10', location: 'Chennai HQ', reason: 'Forgot to punch out after the client call.', status: 'Pending', createdAt: at },
      { id: 'DEMO-102', ...this.who(pick(3)), type: 'Work from home', date: d(0), from: '09:00', to: '18:00', location: 'Remote · Home', reason: 'Waiting at home for a scheduled repair visit.', status: 'Pending', createdAt: at },
      { id: 'DEMO-103', ...this.who(pick(4)), type: 'On duty', date: d(2), from: '10:00', to: '17:30', location: 'Client site', reason: 'Quarterly review at the partner office.', status: 'Pending', createdAt: at },
      { id: 'DEMO-104', ...this.who(pick(6)), type: 'Permission', date: d(1), from: '15:00', to: '16:30', location: 'Chennai HQ', reason: 'Bank document verification.', status: 'Approved', createdAt: at, decidedAt: at, decidedBy: 'HR administrator', reviewNote: 'Approved by reporting manager.' },
    ];
    this.requests.set(rows);
    this.seeded = true;
    this.persist();
  }
  private who(p: { id: string; name: string; department: string }) { return { employeeId: p.id, employeeName: p.name, department: p.department }; }

  /* ------------------------------------------------ storage */
  private log_(actor: string, action: string, detail: string) {
    this.audit.update(a => [{ at: new Date().toISOString(), actor, action, detail }, ...a].slice(0, 300));
  }
  private persist() {
    try {
      localStorage.setItem(FLOW_KEY, JSON.stringify({
        schema: 1, seeded: this.seeded, logs: this.logs(), requests: this.requests(), audit: this.audit(),
        locations: this.locations(), homeLocation: this.homeLocation(), dayMeta: this.dayMeta(), lockedMonths: this.lockedMonths(),
      }));
    }
    catch { /* storage unavailable: the session still works */ }
  }
  private load() {
    try {
      const raw = JSON.parse(localStorage.getItem(FLOW_KEY) || 'null');
      if (!raw || raw.schema !== 1) return;
      this.seeded = !!raw.seeded;
      if (raw.logs && typeof raw.logs === 'object') this.logs.set(raw.logs);
      if (Array.isArray(raw.requests)) this.requests.set(raw.requests.filter((r: any) => r && r.id && r.employeeId));
      if (Array.isArray(raw.audit)) this.audit.set(raw.audit);
      if (Array.isArray(raw.locations) && raw.locations.length) this.locations.set(raw.locations.filter((l: any) => l && l.name));
      if (raw.homeLocation && typeof raw.homeLocation === 'object') this.homeLocation.set(raw.homeLocation);
      if (raw.dayMeta && typeof raw.dayMeta === 'object') this.dayMeta.set(raw.dayMeta);
      if (Array.isArray(raw.lockedMonths)) this.lockedMonths.set(raw.lockedMonths);
    } catch { /* ignore broken storage */ }
  }
}
