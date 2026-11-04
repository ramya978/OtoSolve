import { Injectable, computed, inject, signal } from '@angular/core';
import { AttRecord, COMPANY_HOLIDAYS, Employee, dayKind, key, readRegisterOverrides, record } from './attendance';
import { AttendanceFlowStore, FlowRequest, PUNCH_SOURCES, toMin } from './attendance-flow.store';
import { AttendanceDataService, addDays, requestToRecord } from './attendance-data.service';

/* =====================================================================================================
   ATTENDANCE HR STORE - leave, holidays, approval chains, geo-fencing, punch methods and overtime.
     Leave       : leave types (quota, paid) · requests · balances · approval writes "Leave" into the register
     Holidays    : company holiday calendar (feeds every page through COMPANY_HOLIDAYS)
     Approvals   : who approves each kind of request, at how many levels, SLA and what happens on timeout,
                   department managers / heads, cover for absent approvers (delegation)
     Geo         : a circle (lat, lng, radius) per work location, enforcement on/off, client visits
     Devices     : punch methods on/off, biometric / kiosk device list
     Overtime    : approve or reject overtime per employee-day
   Kept in this browser (localStorage) until the HR APIs are connected.
   ===================================================================================================== */

export type Kind = 'leave' | 'request';
export type ApproverRole = 'manager' | 'head' | 'hr';
export type StepStatus = 'Waiting' | 'Queued' | 'Approved' | 'Rejected' | 'Skipped';
export interface ChainStep { role: ApproverRole; who: string; name: string; status: StepStatus; at?: string; note?: string; }
export interface FlowLevel { role: ApproverRole; minDays: number; }
export interface FlowConfig { levels: FlowLevel[]; slaHours: number; onTimeout: 'next' | 'remind' | 'approve'; }
export interface Delegation { id: string; from: string; to: string; fromDate: string; toDate: string; }

export interface LeaveType { id: string; name: string; code: string; quota: number | null; paid: boolean; color: string; active: boolean; }
export interface LeaveRequest {
  id: string; employeeId: string; employeeName: string; department: string; typeId: string;
  from: string; to: string; half: '' | 'AM' | 'PM'; days: number; reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'; createdAt: string; decidedAt?: string; decidedBy?: string; note?: string;
  chain: ChainStep[];
}
export interface Holiday { date: string; name: string; type: 'National' | 'Festival' | 'Company'; optional: boolean; }
export interface GeoZone { lat: number; lng: number; radius: number; }
export interface Visit { id: string; employeeId: string; employeeName: string; date: string; site: string; note: string; }
export interface Device { id: string; name: string; method: string; location: string; serial: string; active: boolean; lastSync: string; }
export interface OtDecision { status: 'Approved' | 'Rejected'; minutes: number; by: string; at: string; note: string; }
export interface PermissionRules { perMonth: number; maxMinutes: number; }

const HR_KEY = 'otosolve-attendance-hr-v1';
const year = new Date().getFullYear();
export const ROLE_LABEL: Record<ApproverRole, string> = { manager: 'Reporting manager', head: 'Department head', hr: 'HR' };

const DEFAULT_TYPES: LeaveType[] = [
  { id: 'LT-CL', name: 'Casual leave', code: 'CL', quota: 12, paid: true, color: '#3d64d8', active: true },
  { id: 'LT-SL', name: 'Sick leave', code: 'SL', quota: 12, paid: true, color: '#c2410c', active: true },
  { id: 'LT-EL', name: 'Earned leave', code: 'EL', quota: 15, paid: true, color: '#0f766e', active: true },
  { id: 'LT-CO', name: 'Comp-off', code: 'CO', quota: 4, paid: true, color: '#7448ac', active: true },
  { id: 'LT-LOP', name: 'Loss of pay', code: 'LOP', quota: null, paid: false, color: '#aa3d5b', active: true },
];
const DEFAULT_HOLIDAYS: Holiday[] = [
  { date: year + '-01-01', name: 'New Year', type: 'Company', optional: false },
  { date: year + '-01-26', name: 'Republic Day', type: 'National', optional: false },
  { date: year + '-05-01', name: 'May Day', type: 'National', optional: false },
  { date: year + '-08-15', name: 'Independence Day', type: 'National', optional: false },
  { date: year + '-10-02', name: 'Gandhi Jayanti', type: 'National', optional: false },
  { date: year + '-12-25', name: 'Christmas', type: 'Festival', optional: false },
];
const DEFAULT_FLOWS: Record<Kind, FlowConfig> = {
  leave: { levels: [{ role: 'manager', minDays: 0 }, { role: 'hr', minDays: 3 }], slaHours: 24, onTimeout: 'next' },
  request: { levels: [{ role: 'manager', minDays: 0 }], slaHours: 24, onTimeout: 'next' },
};
const DEFAULT_ZONES: Record<string, GeoZone> = {
  'Chennai HQ': { lat: 13.0827, lng: 80.2707, radius: 200 },
  'Bengaluru Office': { lat: 12.9716, lng: 77.5946, radius: 200 },
  'Client site': { lat: 13.0067, lng: 80.2206, radius: 300 },
};
const DEFAULT_METHODS: Record<string, boolean> = Object.fromEntries(PUNCH_SOURCES.map(m => [m, true]));
const DEFAULT_DEVICES: Device[] = [
  { id: 'DV-1', name: 'Reception biometric', method: 'Biometric', location: 'Chennai HQ', serial: 'ZK-K40-0192', active: true, lastSync: '' },
  { id: 'DV-2', name: 'Lobby QR kiosk', method: 'QR kiosk', location: 'Bengaluru Office', serial: 'QR-TAB-07', active: true, lastSync: '' },
];

/** great-circle distance in metres */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, r = (x: number) => x * Math.PI / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

@Injectable({ providedIn: 'root' })
export class AttendanceHrStore {
  private readonly data = inject(AttendanceDataService);
  private readonly flow = inject(AttendanceFlowStore);

  readonly me = signal('');
  readonly types = signal<LeaveType[]>(DEFAULT_TYPES);
  readonly leaves = signal<LeaveRequest[]>([]);
  readonly holidays = signal<Holiday[]>(DEFAULT_HOLIDAYS);
  readonly flows = signal<Record<Kind, FlowConfig>>(DEFAULT_FLOWS);
  readonly deptRoles = signal<Record<string, { manager?: string; head?: string }>>({});
  readonly delegations = signal<Delegation[]>([]);
  readonly zones = signal<Record<string, GeoZone>>(DEFAULT_ZONES);
  readonly geoEnforced = signal(false);
  readonly visits = signal<Visit[]>([]);
  readonly methods = signal<Record<string, boolean>>(DEFAULT_METHODS);
  readonly devices = signal<Device[]>(DEFAULT_DEVICES);
  readonly ot = signal<Record<string, OtDecision>>({});
  readonly permRules = signal<PermissionRules>({ perMonth: 3, maxMinutes: 120 });
  private seeded = false;

  readonly pendingLeaves = computed(() => this.leaves().filter(l => l.status === 'Pending').length);

  constructor() {
    this.load();
    void this.data.ensure(); // approvers come from the directory
    try { window.addEventListener('storage', e => { if (e.key === HR_KEY) this.load(); }); } catch { /* SSR */ }
  }

  /* ------------------------------------------------ people & approvers */
  private people() { return this.data.people(); }
  person(id: string): Employee | null { return this.data.person(id); }
  setMe(id: string) { this.me.set(id); this.persist(); }
  /** the employee whose screens are shown (demo: no sign-in yet) */
  meId() { const p = this.people(); return p.some(x => x.id === this.me()) ? this.me() : p[0]?.id ?? ''; }

  managerOf(emp: Employee): string {
    const set = this.deptRoles()[emp.department]?.manager;
    if (set) return set;
    const first = this.people().find(p => p.department === emp.department);
    return first?.id ?? '';
  }
  headOf(dept: string): string {
    const set = this.deptRoles()[dept]?.head;
    if (set) return set;
    const inDept = this.people().filter(p => p.department === dept);
    return inDept[1]?.id ?? inDept[0]?.id ?? '';
  }
  setDeptRole(dept: string, role: 'manager' | 'head', id: string) {
    this.deptRoles.update(r => ({ ...r, [dept]: { ...(r[dept] ?? {}), [role]: id } }));
    this.flow.recordAdmin('Changed approver', `${dept} · ${role === 'manager' ? 'reporting manager' : 'department head'} → ${this.person(id)?.name ?? id}`);
    this.persist();
  }
  /** someone covering for an absent approver today */
  coverFor(id: string, date = this.data.today) { return this.delegations().find(d => d.from === id && d.fromDate <= date && d.toDate >= date)?.to ?? ''; }
  addDelegation(d: Omit<Delegation, 'id'>) {
    this.delegations.update(l => [...l, { ...d, id: 'DG-' + Date.now().toString(36) }]);
    this.flow.recordAdmin('Added approval cover', `${this.person(d.from)?.name} → ${this.person(d.to)?.name} · ${d.fromDate} to ${d.toDate}`);
    this.persist();
  }
  removeDelegation(id: string) { this.delegations.update(l => l.filter(d => d.id !== id)); this.persist(); }
  saveFlow(kind: Kind, cfg: FlowConfig) { this.flows.update(f => ({ ...f, [kind]: cfg })); this.flow.recordAdmin('Changed approval flow', kind === 'leave' ? 'Leave' : 'Attendance requests'); this.persist(); }

  /** build the approval chain for a request: skips the requester themself and repeated approvers */
  buildChain(kind: Kind, emp: Employee, size: number, cfg: FlowConfig = this.flows()[kind]): ChainStep[] {
    const levels = cfg.levels.filter(l => size >= l.minDays);
    const steps: ChainStep[] = [], seen = new Set<string>();
    for (const l of levels) {
      let who = l.role === 'hr' ? 'HR' : l.role === 'manager' ? this.managerOf(emp) : this.headOf(emp.department);
      if (!who || who === emp.id) who = l.role === 'hr' ? 'HR' : '';
      if (!who || seen.has(who)) continue;
      const cover = who !== 'HR' ? this.coverFor(who) : '';
      const name = who === 'HR' ? 'HR' : (this.person(cover || who)?.name ?? who) + (cover ? ' (for ' + (this.person(who)?.name ?? who) + ')' : '');
      seen.add(who);
      steps.push({ role: l.role, who: cover || who, name, status: steps.length ? 'Queued' : 'Waiting' });
    }
    if (!steps.length) steps.push({ role: 'hr', who: 'HR', name: 'HR', status: 'Waiting' });
    return steps;
  }
  waitingStep(chain: ChainStep[] | undefined) { return chain?.find(s => s.status === 'Waiting') ?? null; }
  waitingSince(item: { createdAt: string; chain?: ChainStep[] }) {
    const done = (item.chain ?? []).filter(s => s.at && (s.status === 'Approved' || s.status === 'Skipped')).map(s => s.at!).sort();
    return done.length ? done[done.length - 1] : item.createdAt;
  }
  overdue(kind: Kind, item: { createdAt: string; chain?: ChainStep[]; status: string }) {
    return item.status === 'Pending' && (Date.now() - new Date(this.waitingSince(item)).getTime()) / 3600000 > this.flows()[kind].slaHours;
  }

  /* ------------------------------------------------ attendance requests with a chain */
  raiseRequest(r: Omit<FlowRequest, 'id' | 'status' | 'createdAt'>): FlowRequest {
    const req = this.flow.raiseRequest(r);
    const emp = this.person(r.employeeId) ?? { id: r.employeeId, name: r.employeeName, department: r.department, role: '', initials: '', tone: 'blue' as const };
    { const chain = this.buildChain('request', emp, 1); this.flow.requests.update(l => l.map(x => x.id === req.id ? { ...x, chain } as FlowRequest : x)); this.flow.recordAdmin('Sent for approval', req.id + ' → ' + chain[0].name, r.employeeName); }
    return req;
  }
  requestChain(r: FlowRequest): ChainStep[] { return ((r as any).chain as ChainStep[] | undefined) ?? [{ role: 'hr', who: 'HR', name: 'HR', status: r.status === 'Pending' ? 'Waiting' : r.status === 'Approved' ? 'Approved' : 'Rejected' }]; }

  /* ------------------------------------------------ leave */
  type(id: string) { return this.types().find(t => t.id === id) ?? null; }
  /** working days between two dates (weekly offs and holidays are not counted) */
  leaveDays(from: string, to: string, half: '' | 'AM' | 'PM') {
    if (!from || !to || to < from) return 0;
    if (half) return this.isOffDay(from) ? 0 : .5;
    let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) if (!this.isOffDay(d)) n++;
    return n;
  }
  /** off day check that also works for future dates (outside the register period) */
  isOffDay(d: string) { const k = dayKind(d); if (k === 'WO' || k === 'H') return true; const w = new Date(d + 'T12:00:00').getDay(); return w === 0 || w === 6 || COMPANY_HOLIDAYS().has(d); }
  used(empId: string, typeId: string, includePending = true) {
    return this.leaves().filter(l => l.employeeId === empId && l.typeId === typeId && l.from.startsWith(String(year)) && (l.status === 'Approved' || (includePending && l.status === 'Pending'))).reduce((s, l) => s + l.days, 0);
  }
  balance(empId: string, t: LeaveType) { return t.quota === null ? null : Math.max(0, t.quota - this.used(empId, t.id)); }
  leaveOn(empId: string, date: string) { return this.leaves().find(l => l.employeeId === empId && l.status === 'Approved' && l.from <= date && l.to >= date) ?? null; }

  applyLeave(emp: Employee, typeId: string, from: string, to: string, half: '' | 'AM' | 'PM', reason: string): string {
    const t = this.type(typeId); if (!t) return 'Choose a leave type.';
    if (half) to = from;
    if (!from || !to || to < from) return 'The end date must be on or after the start date.';
    const days = this.leaveDays(from, to, half);
    if (!days) return 'Those dates are all weekly offs or holidays.';
    const bal = this.balance(emp.id, t);
    if (bal !== null && days > bal) return `Only ${bal} day${bal === 1 ? '' : 's'} of ${t.name.toLowerCase()} left.`;
    if (this.leaves().some(l => l.employeeId === emp.id && ['Pending', 'Approved'].includes(l.status) && l.from <= to && l.to >= from)) return 'You already have leave on some of these days.';
    if (reason.trim().length < 3) return 'Write a short reason.';
    const lr: LeaveRequest = {
      id: 'LV-' + Date.now().toString(36).toUpperCase().slice(-6), employeeId: emp.id, employeeName: emp.name, department: emp.department, typeId,
      from, to, half, days, reason: reason.trim().slice(0, 240), status: 'Pending', createdAt: new Date().toISOString(), chain: this.buildChain('leave', emp, days),
    };
    this.leaves.update(l => [lr, ...l]);
    this.flow.recordAdmin('Applied for ' + t.name.toLowerCase(), `${lr.id} · ${from}${to !== from ? ' to ' + to : ''} · ${days} day${days === 1 ? '' : 's'} → ${lr.chain[0].name}`, emp.name);
    this.persist();
    return '';
  }
  cancelLeave(id: string, actor: string) {
    const l = this.leaves().find(x => x.id === id); if (!l) return;
    this.leaves.update(list => list.map(x => x.id === id ? { ...x, status: 'Cancelled', decidedAt: new Date().toISOString(), decidedBy: actor } : x));
    if (l.status === 'Approved') this.writeLeave(l, true);
    this.flow.recordAdmin('Cancelled leave', id, actor);
    this.persist();
  }

  /** approve / reject one step (a manager) or the whole request (HR stepping in) */
  decideLeave(id: string, status: 'Approved' | 'Rejected', note: string, actorId: string): string {
    const l = this.leaves().find(x => x.id === id); if (!l || l.status !== 'Pending') return 'This request is already decided.';
    const res = this.advance(l.chain, status, note, actorId);
    const final = res.final;
    if (final === 'Approved') { const err = this.writeLeave(l); if (err) return err; }
    this.leaves.update(list => list.map(x => x.id === id ? { ...x, chain: res.chain, ...(final ? { status: final, decidedAt: new Date().toISOString(), decidedBy: res.by, note: note.trim() } : {}) } : x));
    this.flow.recordAdmin(status + ' leave' + (final ? '' : ' (level done)'), `${id} · ${l.employeeName}${note.trim() ? ' · ' + note.trim() : ''}`, res.by);
    this.persist();
    return '';
  }
  /** same for attendance requests (corrections, WFH, on duty, half day, permission) */
  decideRequest(id: string, status: 'Approved' | 'Rejected', note: string, actorId: string): string {
    const r = this.flow.requests().find(x => x.id === id); if (!r || r.status !== 'Pending') return 'This request is already decided.';
    const res = this.advance(this.requestChain(r), status, note, actorId);
    if (res.final === 'Approved') {
      const cur = this.data.day(r.employeeId, r.date).rec;
      const { record: rec, text } = requestToRecord(r, cur);
      if (!rec && text.startsWith('Cannot apply')) return text;
      if (rec) { const err = this.data.writeRecords({ [key(r.date, r.employeeId)]: rec }, 'Applied approved request', r.id); if (err) return err; }
    }
    if (res.final) this.flow.decide(id, res.final, note, res.by);
    this.flow.requests.update(l => l.map(x => x.id === id ? { ...x, chain: res.chain } as FlowRequest : x));
    if (!res.final) this.flow.recordAdmin('Approved (level done)', `${id} · ${r.employeeName} → ${this.waitingStep(res.chain)?.name}`, res.by);
    return '';
  }

  private advance(chain: ChainStep[], status: 'Approved' | 'Rejected', note: string, actorId: string) {
    const at = new Date().toISOString(), hr = actorId === 'HR';
    const by = hr ? 'HR administrator' : this.person(actorId)?.name ?? actorId;
    let next = chain.map(s => ({ ...s }));
    const i = next.findIndex(s => s.status === 'Waiting');
    if (status === 'Rejected') {
      next = next.map((s, j) => j === i ? { ...s, status: 'Rejected', at, note, name: hr && s.who !== 'HR' ? s.name + ' · HR stepped in' : s.name } : s.status === 'Queued' ? { ...s, status: 'Skipped' } : s);
      return { chain: next, final: 'Rejected' as const, by };
    }
    if (hr) { // HR can approve at any level: closes the chain
      next = next.map(s => s.status === 'Waiting' || s.status === 'Queued' ? { ...s, status: s.who === 'HR' ? 'Approved' : 'Skipped', at, note: s.who === 'HR' ? note : 'HR approved' } : s);
      if (!next.some(s => s.who === 'HR')) next.push({ role: 'hr', who: 'HR', name: 'HR', status: 'Approved', at, note });
      return { chain: next, final: 'Approved' as const, by };
    }
    if (i >= 0) next[i] = { ...next[i], status: 'Approved', at, note };
    const k = next.findIndex(s => s.status === 'Queued');
    if (k >= 0) { next[k] = { ...next[k], status: 'Waiting' }; return { chain: next, final: null, by }; }
    return { chain: next, final: 'Approved' as const, by };
  }

  /** an approved leave becomes "Leave" (or half day) on each working day in the register */
  private writeLeave(l: LeaveRequest, undo = false): string {
    const t = this.type(l.typeId), saved = readRegisterOverrides(), entries: Record<string, AttRecord> = {};
    for (let d = l.from; d <= l.to; d = addDays(d, 1)) {
      if (this.isOffDay(d)) continue; // weekly offs and holidays are not leave days (future dates are kept for later)
      const k = key(d, l.employeeId);
      if (undo) { if (saved[k]?.note?.includes(l.id)) entries[k] = record('U', { note: 'Leave ' + l.id + ' cancelled' }); continue; }
      entries[k] = l.half
        ? record('HD', { session: l.half === 'PM' ? 'AM' : 'PM', in: l.half === 'PM' ? '09:00' : '14:00', out: l.half === 'PM' ? '13:00' : '18:00', break: 0, note: `${t?.name ?? 'Leave'} (${l.half}) · ${l.id}` })
        : t && !t.paid ? record('A', { note: `${t.name} · ${l.id}` }) : record('L', { note: `${t?.name ?? 'Leave'} · ${l.id}` });
    }
    if (!Object.keys(entries).length) return '';
    return this.data.writeRecords(entries, undo ? 'Removed leave from register' : 'Leave written to register', l.id + ' · ' + l.employeeName);
  }

  saveType(t: LeaveType) {
    this.types.update(l => l.some(x => x.id === t.id) ? l.map(x => x.id === t.id ? t : x) : [...l, t]);
    this.flow.recordAdmin('Saved leave type', t.name);
    this.persist();
  }
  setPermRules(r: PermissionRules) { this.permRules.set(r); this.flow.recordAdmin('Changed permission limits', `${r.perMonth} a month · up to ${r.maxMinutes} min`); this.persist(); }
  permissionUsed(empId: string, month: string) { return this.flow.requests().filter(r => r.employeeId === empId && r.type === 'Permission' && r.date.startsWith(month) && ['Pending', 'Approved'].includes(r.status)).length; }

  /* ------------------------------------------------ SLA: what happens when nobody replies */
  runSla(): number {
    let moved = 0;
    const cfgL = this.flows().leave, cfgR = this.flows().request;
    for (const l of this.leaves()) {
      if (!this.overdue('leave', l)) continue;
      moved++;
      if (cfgL.onTimeout === 'remind') { this.flow.recordAdmin('Reminder sent', l.id + ' → ' + this.waitingStep(l.chain)?.name, 'System'); continue; }
      if (cfgL.onTimeout === 'approve') { this.decideLeave(l.id, 'Approved', 'Approved automatically after ' + cfgL.slaHours + 'h', 'HR'); continue; }
      this.leaves.update(list => list.map(x => x.id === l.id ? { ...x, chain: this.escalate(x.chain) } : x));
      this.flow.recordAdmin('Escalated', l.id + ' after ' + cfgL.slaHours + 'h without a reply', 'System');
    }
    for (const r of this.flow.requests()) {
      const chain = this.requestChain(r);
      if (!this.overdue('request', { ...r, chain })) continue;
      moved++;
      if (cfgR.onTimeout === 'remind') { this.flow.recordAdmin('Reminder sent', r.id + ' → ' + this.waitingStep(chain)?.name, 'System'); continue; }
      if (cfgR.onTimeout === 'approve') { this.decideRequest(r.id, 'Approved', 'Approved automatically after ' + cfgR.slaHours + 'h', 'HR'); continue; }
      this.flow.requests.update(l => l.map(x => x.id === r.id ? { ...x, chain: this.escalate(chain) } as FlowRequest : x));
      this.flow.recordAdmin('Escalated', r.id + ' after ' + cfgR.slaHours + 'h without a reply', 'System');
    }
    this.persist();
    return moved;
  }
  private escalate(chain: ChainStep[]): ChainStep[] {
    const at = new Date().toISOString(), next = chain.map(s => ({ ...s }));
    const i = next.findIndex(s => s.status === 'Waiting');
    if (i < 0) return next;
    next[i] = { ...next[i], status: 'Skipped', at, note: 'No reply in time' };
    const k = next.findIndex(s => s.status === 'Queued');
    if (k >= 0) next[k] = { ...next[k], status: 'Waiting' };
    else next.push({ role: 'hr', who: 'HR', name: 'HR', status: 'Waiting' });
    return next;
  }

  /** everything waiting for one approver (a manager's "Approvals" page) */
  queueFor(empId: string) {
    const ids = new Set([empId]);
    return {
      leaves: this.leaves().filter(l => l.status === 'Pending' && ids.has(this.waitingStep(l.chain)?.who ?? '')),
      requests: this.flow.requests().filter(r => r.status === 'Pending' && ids.has(this.waitingStep(this.requestChain(r))?.who ?? '')),
    };
  }

  /* ------------------------------------------------ holidays */
  holidayOn(date: string) { return this.holidays().find(h => h.date === date) ?? null; }
  saveHoliday(h: Holiday, previousDate = '') {
    this.holidays.update(l => [...l.filter(x => x.date !== previousDate && x.date !== h.date), h].sort((a, b) => a.date.localeCompare(b.date)));
    this.flow.recordAdmin(previousDate ? 'Updated holiday' : 'Added holiday', h.date + ' · ' + h.name);
    this.syncHolidays(); this.persist();
  }
  removeHoliday(date: string) {
    const h = this.holidayOn(date);
    this.holidays.update(l => l.filter(x => x.date !== date));
    this.flow.recordAdmin('Removed holiday', date + ' · ' + (h?.name ?? ''));
    this.syncHolidays(); this.persist();
  }
  private syncHolidays() { COMPANY_HOLIDAYS.set(new Set(this.holidays().filter(h => !h.optional).map(h => h.date))); }

  /* ------------------------------------------------ geo-fencing */
  zone(location: string) { return this.zones()[location] ?? null; }
  saveZone(location: string, z: GeoZone | null) {
    this.zones.update(m => { const n = { ...m }; if (z) n[location] = z; else delete n[location]; return n; });
    this.flow.recordAdmin('Changed geo zone', location + (z ? ` · ${z.radius} m` : ' · removed'));
    this.persist();
  }
  setGeoEnforced(on: boolean) { this.geoEnforced.set(on); this.flow.recordAdmin('Geo-fencing ' + (on ? 'switched on' : 'switched off'), ''); this.persist(); }
  addVisit(v: Omit<Visit, 'id'>) { this.visits.update(l => [{ ...v, id: 'VS-' + Date.now().toString(36) }, ...l]); this.flow.recordAdmin('Assigned client visit', `${v.employeeName} · ${v.site} · ${v.date}`); this.persist(); }
  removeVisit(id: string) { this.visits.update(l => l.filter(v => v.id !== id)); this.persist(); }
  visitOn(empId: string, date: string) { return this.visits().find(v => v.employeeId === empId && v.date === date) ?? null; }
  /** can this person punch at this location from this point? */
  checkGeo(empId: string, location: string, pos: { lat: number; lng: number } | null): { ok: boolean; text: string; distance?: number } {
    if (!this.geoEnforced()) return { ok: true, text: 'Geo-fencing is off' };
    const type = this.flow.locations().find(l => l.name === location)?.type;
    if (type === 'Remote') return { ok: true, text: 'Remote work - location not checked' };
    if (type === 'Client site' && !this.visitOn(empId, this.data.today)) return { ok: false, text: 'No client visit is assigned to you today.' };
    const z = this.zone(location);
    if (!z) return { ok: true, text: 'No zone drawn for ' + location };
    if (!pos) return { ok: false, text: 'Allow location access to punch at ' + location + '.' };
    const d = distanceM(pos.lat, pos.lng, z.lat, z.lng);
    return d <= z.radius ? { ok: true, text: 'Inside ' + location, distance: d } : { ok: false, text: `You are ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} from ${location} (allowed ${z.radius} m).`, distance: d };
  }

  /* ------------------------------------------------ punch methods & devices */
  methodOn(m: string) { return this.methods()[m] !== false; }
  setMethod(m: string, on: boolean) { this.methods.update(x => ({ ...x, [m]: on })); this.flow.recordAdmin('Punch method ' + (on ? 'on' : 'off'), m); this.persist(); }
  saveDevice(d: Device) { this.devices.update(l => l.some(x => x.id === d.id) ? l.map(x => x.id === d.id ? d : x) : [...l, d]); this.flow.recordAdmin('Saved device', d.name); this.persist(); }
  removeDevice(id: string) { this.devices.update(l => l.filter(d => d.id !== id)); this.persist(); }
  syncDevice(id: string) { this.devices.update(l => l.map(d => d.id === id ? { ...d, lastSync: new Date().toISOString() } : d)); this.persist(); }

  /* ------------------------------------------------ overtime */
  otDecision(empId: string, date: string) { return this.ot()[key(date, empId)] ?? null; }
  decideOt(empId: string, date: string, minutes: number, status: 'Approved' | 'Rejected', note = '') {
    this.ot.update(m => ({ ...m, [key(date, empId)]: { status, minutes, by: 'HR administrator', at: new Date().toISOString(), note } }));
    this.flow.recordAdmin(status + ' overtime', `${this.person(empId)?.name ?? empId} · ${date} · ${minutes} min`);
    this.persist();
  }

  /* ------------------------------------------------ sample data */
  seedDemo() {
    const p = this.people();
    if (this.seeded || this.leaves().length || p.length < 4) return;
    const T = this.data.today, nextW = (d: string, n: number) => { let x = d, c = 0; while (c < n) { x = addDays(x, 1); if (!this.isOffDay(x)) c++; } return x; };
    const mk = (i: number, typeId: string, from: string, to: string, reason: string, status: LeaveRequest['status']): LeaveRequest => {
      const e = p[i % p.length], days = this.leaveDays(from, to, '');
      const chain = this.buildChain('leave', e, days);
      if (status === 'Approved') chain.forEach(s => { s.status = 'Approved'; s.at = new Date().toISOString(); });
      return { id: 'LV-DEMO' + i, employeeId: e.id, employeeName: e.name, department: e.department, typeId, from, to, half: '', days, reason, status, createdAt: new Date(Date.now() - (i + 1) * 3 * 3600000).toISOString(), chain };
    };
    const rows = [
      mk(3, 'LT-CL', nextW(T, 2), nextW(T, 3), 'Family function in Madurai', 'Pending'),
      mk(5, 'LT-SL', nextW(T, 1), nextW(T, 1), 'Fever and cold', 'Pending'),
      mk(7, 'LT-EL', nextW(T, 6), nextW(T, 10), 'Annual trip with family', 'Pending'),
      mk(9, 'LT-CL', nextW(T, 4), nextW(T, 4), 'Bank and house registration work', 'Approved'),
    ];
    this.leaves.set(rows);
    this.seeded = true;
    this.persist();
  }

  /* ------------------------------------------------ storage */
  private persist() {
    try {
      localStorage.setItem(HR_KEY, JSON.stringify({
        schema: 1, seeded: this.seeded, me: this.me(), types: this.types(), leaves: this.leaves(), holidays: this.holidays(), flows: this.flows(),
        deptRoles: this.deptRoles(), delegations: this.delegations(), zones: this.zones(), geoEnforced: this.geoEnforced(), visits: this.visits(),
        methods: this.methods(), devices: this.devices(), ot: this.ot(), permRules: this.permRules(),
      }));
    } catch { /* storage unavailable */ }
  }
  private load() {
    try {
      const r = JSON.parse(localStorage.getItem(HR_KEY) || 'null');
      if (r && r.schema === 1) {
        this.seeded = !!r.seeded;
        if (typeof r.me === 'string') this.me.set(r.me);
        if (Array.isArray(r.types) && r.types.length) this.types.set(r.types);
        if (Array.isArray(r.leaves)) this.leaves.set(r.leaves);
        if (Array.isArray(r.holidays)) this.holidays.set(r.holidays);
        if (r.flows?.leave && r.flows?.request) this.flows.set(r.flows);
        if (r.deptRoles) this.deptRoles.set(r.deptRoles);
        if (Array.isArray(r.delegations)) this.delegations.set(r.delegations);
        if (r.zones) this.zones.set(r.zones);
        this.geoEnforced.set(!!r.geoEnforced);
        if (Array.isArray(r.visits)) this.visits.set(r.visits);
        if (r.methods) this.methods.set({ ...DEFAULT_METHODS, ...r.methods });
        if (Array.isArray(r.devices)) this.devices.set(r.devices);
        if (r.ot) this.ot.set(r.ot);
        if (r.permRules) this.permRules.set(r.permRules);
      }
    } catch { /* ignore broken storage */ }
    this.syncHolidays();
  }
}
