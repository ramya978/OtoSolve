import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, ShiftDef, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';
import { AttRecord, Employee, Status, dayKind, key, record, validate } from '../Attendance/attendance';
import { DayMeta, toMin } from '../Attendance/attendance-flow.store';

/* =====================================================================================================
   BULK ATTENDANCE - a register-style board on ONE screen:
     top bar      date · shift · what a normal day was (status, times, locations, break)
     left pane    tick the people (search, department, everyone, not marked yet, paste, CSV)
     centre pane  the live result for every ticked person - change a time right in the row
     right pane   exceptions (permission, worked extra, visit, work from home, half-day, leave)
     footer       tally + apply
   A second tab moves people to a new default work location, with a reason per person.
   ===================================================================================================== */
type Mode = 'attendance' | 'location';
type Base = 'P' | 'HD' | 'A' | 'L';
type RuleKind = 'permission' | 'extra' | 'visit' | 'wfh' | 'half' | 'leave';
interface Rule { id: string; kind: RuleKind; people: string[]; from: string; to: string; out: string; place: string; session: 'AM' | 'PM'; leaveType: string; note: string; }
interface Outcome {
  e: Employee; status: Status; label: string; tone: string; in: string; out: string; inLoc: string; outLoc: string; brk: number;
  details: string[]; rec: AttRecord | null; error: string;
}
interface LocDraft { location: string; reason: string; }

export const RULES: { kind: RuleKind; title: string; text: string; tone: string; icon: string }[] = [
  { kind: 'permission', title: 'Took permission', text: 'Came late, left early or stepped out', tone: 'amber', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' },
  { kind: 'extra', title: 'Worked extra', text: 'Stayed late or did office work outside', tone: 'violet', icon: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  { kind: 'visit', title: 'Visited a place', text: 'Tag where they went, in and out', tone: 'blue', icon: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' },
  { kind: 'wfh', title: 'Work from home', text: 'Mark as remote for the day', tone: 'teal', icon: 'M3 11l9-8 9 8M5 10v10h14V10' },
  { kind: 'half', title: 'Half-day', text: 'Only half the day worked', tone: 'amber', icon: 'M12 3a9 9 0 1 0 0 18zM12 3v18' },
  { kind: 'leave', title: 'On leave', text: 'Full day of approved leave', tone: 'rose', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
];
const BASES: { s: Base; title: string; text: string; tone: string }[] = [
  { s: 'P', title: 'Present', text: 'Worked the full day', tone: 'teal' },
  { s: 'HD', title: 'Half-day', text: 'Worked half the day', tone: 'amber' },
  { s: 'A', title: 'Absent', text: 'Did not come', tone: 'rose' },
  { s: 'L', title: 'On leave', text: 'On approved leave', tone: 'violet' },
];
const min = (t: string) => toMin(t) ?? 0;
const hhmm = (n: number) => String(Math.floor(n / 60) % 24).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

@Component({
  selector: 'app-bulk-attendance',
  standalone: true,
  imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './bulk-attendance.html',
  styleUrls: ['../Attendance/attendance-kit.css', './bulk-attendance.css'],
})
export class BulkAttendance {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly flow = this.data.flow;
  readonly rules = RULES;
  readonly bases = BASES;
  readonly mode = signal<Mode>('attendance');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  readonly minDate = (() => { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return d.toISOString().slice(0, 8) + '01'; })();

  /* who */
  readonly date = signal(this.data.today);
  readonly shiftId = signal('SH-GENERAL');
  readonly picked = signal<Set<string>>(new Set());
  readonly query = signal('');
  readonly rosterDept = signal('all');
  readonly pasteOpen = signal(false);
  readonly pasteText = signal('');
  readonly pasteNote = signal('');
  /* normal day */
  readonly base = signal<Base>('P');
  readonly bIn = signal('09:00');
  readonly bOut = signal('18:00');
  readonly bInLoc = signal('Chennai HQ');
  readonly bOutLoc = signal('');
  readonly bBreak = signal(60);
  readonly bLeaveType = signal('LT-CL');
  /* exceptions */
  readonly cards = signal<Rule[]>([]);
  /* result */
  readonly edits = signal<Record<string, { in?: string; out?: string }>>({});
  readonly fDept = signal('all');
  readonly fOutcome = signal('all');
  readonly fQuery = signal('');
  readonly error = signal('');
  /* default location tab */
  readonly locDept = signal('all');
  readonly locQuery = signal('');
  readonly locDrafts = signal<Record<string, LocDraft>>({});
  readonly locCommon = signal('Chennai HQ');
  readonly locReason = signal('');
  readonly locPicked = signal<Set<string>>(new Set());

  constructor() { void this.start(); }

  /** "+ Add attendance" on the register opens this page with ?date=YYYY-MM-DD&department=Name */
  private async start() {
    let q = new URLSearchParams();
    try { q = new URLSearchParams(window.location.search); } catch { /* no window */ }
    const date = q.get('date') ?? '', dept = q.get('department') ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= this.minDate && date <= this.data.today) this.setDate(date);
    await this.data.ensure();
    if (dept && this.data.departments().includes(dept)) { this.addDept(dept); this.rosterDept.set(dept); }
  }

  /* ------------------------------------------------ options */
  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);
  readonly addDeptOptions = computed(() => this.data.departments().map(d => ({ value: d, label: d, hint: this.data.people().filter(p => p.department === d).length + ' people' })));
  readonly shiftOptions = computed(() => this.data.shifts().filter(s => s.active).map(s => ({ value: s.id, label: s.name, hint: s.start + ' – ' + s.end })));
  readonly shift = computed<ShiftDef | null>(() => this.data.shifts().find(s => s.id === this.shiftId()) ?? null);
  readonly outLocOptions = computed(() => [{ value: '', label: 'Same as in location' }, ...this.flow.activeLocations().map(l => ({ value: l, label: l }))]);
  readonly placeOptions = computed(() => this.flow.activeLocations());
  readonly leaveOptions = computed(() => this.hr.types().filter(t => t.active).map(t => ({ value: t.id, label: t.name, hint: t.paid ? 'Paid' : 'Unpaid' })));
  readonly outcomeOptions = [{ value: 'all', label: 'All outcomes' }, { value: 'Present', label: 'Present' }, { value: 'Half-day', label: 'Half-day' }, { value: 'Absent', label: 'Absent' }, { value: 'Leave', label: 'Leave' }, { value: 'fix', label: 'Needs a fix' }];
  readonly dateText = computed(() => niceDate(this.date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  readonly dayIsWorking = computed(() => dayKind(this.date()) === 'W');
  readonly locked = computed(() => this.flow.isLocked(this.date()));

  /* ------------------------------------------------ who */
  /** people who cannot be marked today: approved leave already recorded */
  readonly leftOut = computed(() => {
    const d = this.date(), out: { e: Employee; why: string }[] = [];
    this.data.overrides(); this.hr.leaves();
    for (const id of this.picked()) {
      const e = this.data.person(id); if (!e) continue;
      const lv = this.hr.leaveOn(id, d), rec = this.data.day(id, d).rec;
      if (lv) out.push({ e, why: 'is on ' + (this.hr.type(lv.typeId)?.name.toLowerCase() ?? 'leave') });
      else if (rec.status === 'L' && this.data.day(id, d).source === 'register') out.push({ e, why: 'is already on leave in the register' });
    }
    return out;
  });
  readonly selected = computed(() => { const skip = new Set(this.leftOut().map(x => x.e.id)); return [...this.picked()].map(id => this.data.person(id)).filter((e): e is Employee => !!e && !skip.has(e.id)); });
  readonly unmarkedIds = computed(() => { this.data.overrides(); return this.data.people().filter(e => this.data.day(e.id, this.date()).rec.status === 'U').map(e => e.id); });
  readonly chips = computed(() => [...this.picked()].slice(0, 10).map(id => this.data.person(id)).filter((e): e is Employee => !!e));
  readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase(); if (q.length < 1) return [];
    return this.data.people().filter(e => `${e.name} ${e.id} ${e.department}`.toLowerCase().includes(q)).slice(0, 8);
  });

  /** the people checklist on the left */
  readonly roster = computed(() => {
    const q = this.query().trim().toLowerCase(), d = this.rosterDept(), picked = this.picked();
    const unmarked = new Set(this.unmarkedIds()), skip = new Map(this.leftOut().map(x => [x.e.id, x.why]));
    return this.data.people()
      .filter(e => (d === 'all' || e.department === d) && (!q || `${e.name} ${e.id} ${e.department}`.toLowerCase().includes(q)))
      .map(e => ({ e, on: picked.has(e.id), marked: !unmarked.has(e.id), skip: skip.get(e.id) ?? '' }));
  });
  readonly rosterAllOn = computed(() => this.roster().length > 0 && this.roster().every(r => r.on));
  readonly rosterSomeOn = computed(() => this.roster().some(r => r.on) && !this.rosterAllOn());
  toggle(id: string, on: boolean) {
    if (on) this.picked.set(new Set([...this.picked(), id]));
    else this.removeOne(id);
  }
  rosterAll(on: boolean) {
    const ids = this.roster().map(r => r.e.id);
    if (on) this.picked.set(new Set([...this.picked(), ...ids]));
    else ids.forEach(id => this.removeOne(id));
  }

  setDate(d: string) { this.date.set(d); this.edits.set({}); this.error.set(''); }
  setShift(id: string) { this.shiftId.set(id); const s = this.shift(); if (s) { this.bIn.set(s.start); this.bOut.set(s.end); this.bBreak.set(s.breakMinutes); } }
  everyone() { this.picked.set(new Set(this.data.people().map(e => e.id))); }
  notMarked() { this.picked.set(new Set([...this.picked(), ...this.unmarkedIds()])); }
  addDept(d: string) { this.picked.set(new Set([...this.picked(), ...this.data.people().filter(e => e.department === d).map(e => e.id)])); this.notify('Added everyone in ' + d + '.'); }
  addOne(e: Employee) { this.picked.set(new Set([...this.picked(), e.id])); this.query.set(''); }
  removeOne(id: string) { const s = new Set(this.picked()); s.delete(id); this.picked.set(s); this.cards.update(c => c.map(r => ({ ...r, people: r.people.filter(p => p !== id) }))); }
  clear() { this.picked.set(new Set()); this.cards.update(c => c.map(r => ({ ...r, people: [] }))); }

  /** paste names or IDs (one per line, or separated by commas / tabs) */
  applyPaste(text = this.pasteText()) {
    const tokens = text.split(/[\n,;\t]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    const found: string[] = [], missed: string[] = [];
    for (const t of tokens) {
      const e = this.data.people().find(p => p.id.toLowerCase() === t || p.name.toLowerCase() === t);
      if (e) found.push(e.id); else if (!/^(employee|id|name|employee id)$/.test(t)) missed.push(t);
    }
    this.picked.set(new Set([...this.picked(), ...found]));
    this.pasteNote.set(found.length + ' matched' + (missed.length ? ' · not found: ' + missed.slice(0, 5).join(', ') + (missed.length > 5 ? ' and ' + (missed.length - 5) + ' more' : '') : ''));
    if (found.length) { this.pasteText.set(''); }
  }
  onFile(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { const rows = String(reader.result ?? '').split(/\r?\n/).map(r => r.split(',')[0].replace(/"/g, '').trim()); this.applyPaste(rows.join('\n')); this.pasteOpen.set(true); };
    reader.readAsText(f);
    (ev.target as HTMLInputElement).value = '';
  }
  template() { this.data.csv('bulk-attendance-people.csv', [['Employee ID', 'Name (optional)'], ...this.data.people().slice(0, 3).map(e => [e.id, e.name])]); }

  /* ------------------------------------------------ normal day */
  readonly baseActive = computed(() => this.base() === 'P' || this.base() === 'HD');
  setBase(b: Base) {
    this.base.set(b);
    if (b === 'HD') { this.bOut.set(hhmm(min(this.bIn()) + 240)); this.bBreak.set(0); }
    if (b === 'P') { const s = this.shift(); this.bOut.set(s?.end ?? '18:00'); this.bBreak.set(s?.breakMinutes ?? 60); }
  }
  readonly baseText = computed(() => {
    const n = this.selected().length, who = n === 1 ? 'The 1 person' : 'Everyone (' + n + ')';
    if (!n) return 'Tick people on the left - they will all get this normal day.';
    if (this.base() === 'A') return who + ' will be marked Absent.';
    if (this.base() === 'L') return who + ' will be marked on ' + (this.hr.type(this.bLeaveType())?.name ?? 'leave') + '.';
    return who + ' will be marked ' + (this.base() === 'P' ? 'Present' : 'Half-day') + ' from ' + this.bIn() + ' to ' + this.bOut() + ' at ' + this.bInLoc() + (this.bOutLoc() && this.bOutLoc() !== this.bInLoc() ? ' (leaving from ' + this.bOutLoc() + ')' : '') + '.';
  });

  /* ------------------------------------------------ exceptions */
  rule(kind: RuleKind) { return RULES.find(r => r.kind === kind)!; }
  addCard(kind: RuleKind) {
    const s = this.shift(), start = s?.start ?? '09:00', end = s?.end ?? '18:00';
    const r: Rule = { id: 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, people: [], from: start, to: hhmm(min(start) + 60), out: hhmm(min(end) + 120), place: this.placeOptions().find(p => /client|field/i.test(p)) ?? this.placeOptions()[0] ?? '', session: 'AM', leaveType: 'LT-CL', note: '' };
    this.cards.update(c => [...c, r]);
  }
  removeCard(id: string) { this.cards.update(c => c.filter(r => r.id !== id)); }
  patchCard(id: string, p: Partial<Rule>) { this.cards.update(c => c.map(r => r.id === id ? { ...r, ...p } : r)); }
  cardPeopleOptions(r: Rule) { return this.selected().filter(e => !r.people.includes(e.id)).map(e => ({ value: e.id, label: e.name, hint: e.department })); }
  addToCard(r: Rule, id: string) { if (id) this.patchCard(r.id, { people: [...r.people, id] }); }
  removeFromCard(r: Rule, id: string) { this.patchCard(r.id, { people: r.people.filter(p => p !== id) }); }
  name(id: string) { return this.data.person(id)?.name ?? id; }

  /* ------------------------------------------------ outcome for every person */
  readonly outcomes = computed<Outcome[]>(() => {
    const cards = this.cards(), edits = this.edits();
    return this.selected().map(e => {
      let status: Status = this.base() === 'L' ? 'L' : this.base();
      let inT = this.baseActive() ? this.bIn() : '', outT = this.baseActive() ? this.bOut() : '';
      let inLoc = this.baseActive() ? this.bInLoc() : '', outLoc = this.baseActive() ? (this.bOutLoc() || this.bInLoc()) : '';
      let brk = this.base() === 'P' ? this.bBreak() : 0, mode: 'Office' | 'Remote' = /remote/i.test(inLoc) ? 'Remote' : 'Office';
      let leaveType = this.base() === 'L' ? this.bLeaveType() : '';
      const details: string[] = [], mine = cards.filter(c => c.people.includes(e.id));
      for (const c of mine) {
        switch (c.kind) {
          case 'permission': details.push('Permission ' + c.from + '–' + c.to); break;
          case 'extra': if (status === 'P' || status === 'HD') { outT = c.out; details.push('Worked until ' + c.out + (c.note ? ' · ' + c.note : '')); } break;
          case 'visit': status = status === 'A' || status === 'L' ? 'P' : status; inT = inT || c.from; outT = outT || c.to; inLoc = c.place; outLoc = c.place; mode = 'Office'; details.push('Visited ' + c.place); break;
          case 'wfh': status = status === 'A' || status === 'L' ? 'P' : status; inT = inT || this.bIn(); outT = outT || this.bOut(); inLoc = outLoc = 'Remote · Home'; mode = 'Remote'; details.push('Worked from home'); break;
          case 'half': status = 'HD'; brk = 0; inT = c.session === 'AM' ? this.bIn() : hhmm(min(this.bIn()) + 300); outT = hhmm(min(inT) + 240); details.push('Half-day (' + (c.session === 'AM' ? 'morning' : 'afternoon') + ')'); break;
          case 'leave': status = 'L'; inT = outT = ''; inLoc = outLoc = ''; leaveType = c.leaveType; details.push(this.hr.type(c.leaveType)?.name ?? 'Leave'); break;
        }
      }
      const ed = edits[e.id];
      if (ed && (status === 'P' || status === 'HD')) { inT = ed.in ?? inT; outT = ed.out ?? outT; if (ed.in || ed.out) details.push('Time changed here'); }
      if (status === 'L' && leaveType && this.hr.type(leaveType)?.paid === false) status = 'A';
      const active = status === 'P' || status === 'HD';
      if (active && min(outT) - min(inT) < 300) brk = Math.min(brk, 0);
      const rec = record(status, { in: active ? inT : '', out: active ? outT : '', break: active ? brk : 0, mode, session: 'AM', note: [...new Set(['Bulk entry', ...details, status === 'L' || (leaveType && status === 'A') ? this.hr.type(leaveType)?.name ?? '' : ''].filter(Boolean))].join(' · ').slice(0, 180) });
      let error = mine.length > 2 ? 'In ' + mine.length + ' exceptions - check the result' : '';
      const v = validate(rec);
      if (v) error = v;
      const label = ({ P: 'Present', HD: 'Half-day', A: 'Absent', L: 'Leave' } as Record<string, string>)[status] ?? status;
      const tone = ({ P: 'teal', HD: 'amber', A: 'rose', L: 'violet' } as Record<string, string>)[status] ?? '';
      return { e, status, label, tone, in: active ? inT : '', out: active ? outT : '', inLoc, outLoc, brk, details, rec: v ? null : rec, error };
    });
  });
  readonly shown = computed(() => {
    const q = this.fQuery().trim().toLowerCase(), d = this.fDept(), o = this.fOutcome();
    return this.outcomes().filter(x => (d === 'all' || x.e.department === d) && (o === 'all' || (o === 'fix' ? !!x.error : x.label === o)) && (!q || `${x.e.name} ${x.e.id}`.toLowerCase().includes(q)));
  });
  readonly tally = computed(() => {
    const o = this.outcomes(), c: Record<string, number> = {};
    o.forEach(x => c[x.label] = (c[x.label] ?? 0) + 1);
    return { counts: Object.entries(c).map(([label, n]) => ({ label, n, tone: o.find(x => x.label === label)?.tone ?? '' })), errors: o.filter(x => x.error && !x.rec).length, warns: o.filter(x => x.error && x.rec).length, ready: o.filter(x => x.rec).length };
  });
  readonly blocker = computed(() => {
    if (!this.picked().size) return 'Tick the people you are marking.';
    if (!this.dayIsWorking()) return this.dateText() + ' is a weekly off or holiday - choose a working day.';
    if (this.locked()) return 'This month is finalised in Payroll summary - reopen it to change attendance.';
    if (!this.selected().length) return 'Everyone ticked is left out (already on leave).';
    if (this.tally().errors) return this.tally().errors + ' ' + (this.tally().errors === 1 ? 'person needs' : 'people need') + ' a fix in the table.';
    return '';
  });
  editTime(id: string, which: 'in' | 'out', v: string) { this.edits.update(m => ({ ...m, [id]: { ...(m[id] ?? {}), [which]: v } })); }

  apply() {
    if (this.blocker()) return this.error.set(this.blocker());
    const entries: Record<string, AttRecord> = {}, meta: Record<string, DayMeta> = {};
    for (const x of this.outcomes()) {
      if (!x.rec) continue;
      const k = key(this.date(), x.e.id);
      entries[k] = x.rec;
      meta[k] = { location: x.inLoc || undefined, source: 'Manual correction', shift: this.shiftId(), approval: 'Approved' };
    }
    const err = this.data.writeRecords(entries, 'Bulk entry', Object.keys(entries).length + ' people · ' + this.date() + ' · ' + this.cards().length + ' exception' + (this.cards().length === 1 ? '' : 's'));
    if (err) return this.error.set(err);
    this.flow.setDayMeta(meta);
    this.notify('Attendance saved for ' + Object.keys(entries).length + ' people on ' + niceDate(this.date()) + '.');
    this.error.set('');
    this.edits.set({});
  }
  startOver() {
    this.picked.set(new Set()); this.cards.set([]); this.edits.set({}); this.error.set(''); this.query.set(''); this.pasteText.set(''); this.pasteNote.set('');
    this.rosterDept.set('all'); this.setBase('P'); this.setShift('SH-GENERAL');
  }

  /* ------------------------------------------------ default location tab */
  readonly locRows = computed(() => {
    const q = this.locQuery().trim().toLowerCase(), dep = this.locDept();
    this.flow.homeLocation();
    return this.data.people().filter(e => (dep === 'all' || e.department === dep) && (!q || `${e.name} ${e.id}`.toLowerCase().includes(q)))
      .map((e) => ({ e, home: this.flow.home(e.id, this.data.personIndex(e.id)) }));
  });
  locRow(id: string, home: string): LocDraft { return this.locDrafts()[id] ?? { location: home, reason: '' }; }
  editLoc(id: string, home: string, p: Partial<LocDraft>) {
    const next = { ...this.locRow(id, home), ...p };
    this.locDrafts.update(d => { const n = { ...d }; if (next.location === home && !next.reason) delete n[id]; else n[id] = next; return n; });
  }
  locToggle(id: string, on: boolean) { const s = new Set(this.locPicked()); on ? s.add(id) : s.delete(id); this.locPicked.set(s); }
  locToggleAll(on: boolean) { const s = new Set(this.locPicked()); this.locRows().forEach(r => on ? s.add(r.e.id) : s.delete(r.e.id)); this.locPicked.set(s); }
  readonly locAllOn = computed(() => this.locRows().length > 0 && this.locRows().every(r => this.locPicked().has(r.e.id)));
  readonly locChanges = computed(() => Object.keys(this.locDrafts()).length);
  locApplyCommon() {
    const rows = this.locRows().filter(r => this.locPicked().has(r.e.id));
    if (!rows.length) return this.error.set('Tick the people to move first.');
    rows.forEach(r => this.editLoc(r.e.id, r.home, { location: this.locCommon(), reason: this.locReason() || this.locRow(r.e.id, r.home).reason }));
    this.error.set('');
  }
  saveLocations() {
    const changes = Object.entries(this.locDrafts()).map(([id, d]) => ({ id, d, e: this.data.person(id) })).filter(x => x.e && x.d.location !== this.flow.home(x.id, this.data.personIndex(x.id)));
    if (!changes.length) return this.error.set('No location changes to save.');
    const missing = changes.find(x => x.d.reason.trim().length < 3);
    if (missing) return this.error.set('Add a reason for ' + missing.e!.name + '.');
    this.flow.setHome(changes.map(x => ({ employeeId: x.id, name: x.e!.name, location: x.d.location, reason: x.d.reason.trim() })));
    this.notify(changes.length + ' default work location' + (changes.length === 1 ? '' : 's') + ' changed.');
    this.locDrafts.set({}); this.locPicked.set(new Set()); this.error.set('');
  }

  jump(id: string) { try { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* no DOM */ } }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4500); }
}