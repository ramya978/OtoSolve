import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, hm } from '../Attendance/attendance-data.service';
import { AkSelect } from '../Attendance/ak-select';
import { Employee } from '../Attendance/attendance';
import { PunchKind, nowClock, summarize } from '../Attendance/attendance-flow.store';
import { AttendanceHrStore } from '../Attendance/attendance-hr.store';

/* =====================================================================================================
   PUNCH STATION - a shared kiosk (reception tablet / front desk).
     find yourself → see your state → punch in / break / punch out at a location
     + live board of everyone's punches today. Punches go to the same store as My attendance,
     so they appear in the daily register immediately.
   ===================================================================================================== */
type State = 'out' | 'working' | 'break' | 'done';

@Component({
  selector: 'app-punch-station',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './punch-station.html',
  styleUrls: ['../Attendance/attendance-kit.css', './punch-station.css'],
})
export class PunchStation implements OnDestroy {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly hr = inject(AttendanceHrStore);
  readonly now = signal(new Date());
  private timer = setInterval(() => this.now.set(new Date()), 1000);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly search = signal('');
  readonly department = signal('all');
  readonly selectedId = signal('');
  readonly location = signal('Chennai HQ');
  readonly toast = signal<string | null>(null);
  readonly hm = hm;

  constructor() { void this.data.ensure(); }
  ngOnDestroy() { clearInterval(this.timer); clearTimeout(this.toastTimer); }

  readonly today = this.data.today;
  readonly nowMin = computed(() => { const d = this.now(); return d.getHours() * 60 + d.getMinutes(); });
  readonly clock = computed(() => { const d = this.now(), p = (n: number) => String(n).padStart(2, '0'); return { hm: p(d.getHours()) + ':' + p(d.getMinutes()), s: p(d.getSeconds()) }; });
  readonly dateText = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);

  state(e: Employee): { state: State; s: ReturnType<typeof summarize> } {
    const s = summarize(this.flow.log(e.id, this.today)?.punches ?? [], this.nowMin());
    return { state: s.onBreak ? 'break' : s.open ? 'working' : s.done ? 'done' : 'out', s };
  }
  stateText(st: State) { return { out: 'Not in', working: 'Working', break: 'On break', done: 'Shift done' }[st]; }
  stateTone(st: State) { return { out: '', working: 'teal', break: 'amber', done: 'blue' }[st]; }

  readonly people = computed(() => {
    const q = this.search().trim().toLowerCase(), dep = this.department();
    this.flow.logs(); this.nowMin();
    return this.data.people().filter(e => (dep === 'all' || e.department === dep) && (!q || `${e.name} ${e.id}`.toLowerCase().includes(q)))
      .map(e => ({ e, ...this.state(e) }));
  });
  readonly selected = computed(() => this.people().find(x => x.e.id === this.selectedId()) ?? null);

  readonly counts = computed(() => {
    this.flow.logs(); this.nowMin();
    const all = this.data.people().map(e => this.state(e).state), n = (s: State) => all.filter(x => x === s).length;
    return { working: n('working'), break: n('break'), done: n('done'), out: n('out') };
  });

  /** every punch today, newest first */
  readonly board = computed(() => {
    const byId = new Map(this.data.people().map(e => [e.id, e]));
    return Object.values(this.flow.logs()).filter(l => l.date === this.today && byId.has(l.employeeId))
      .flatMap(l => l.punches.map(p => ({ e: byId.get(l.employeeId)!, ...p })))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  });
  punchWord(k: PunchKind) { return { in: 'Punched in', 'break-start': 'Break started', 'break-end': 'Break ended', out: 'Punched out' }[k]; }
  punchTone(k: PunchKind) { return { in: 'teal', 'break-start': 'amber', 'break-end': 'amber', out: 'blue' }[k]; }

  pick(e: Employee) {
    this.selectedId.set(e.id);
    this.location.set(this.flow.log(e.id, this.today)?.location ?? this.flow.home(e.id, this.data.personIndex(e.id)));
  }
  clear() { this.selectedId.set(''); this.search.set(''); }

  punch(kind: PunchKind) {
    const x = this.selected(); if (!x) return;
    if (!this.hr.methodOn('QR kiosk')) { this.notify('The punch station is switched off by HR (Set up → Punch methods).'); return; }
    const err = this.flow.punch(x.e, this.today, kind, this.location());
    this.notify(err || `${x.e.name}: ${this.punchWord(kind).toLowerCase()} at ${nowClock()} · ${this.location()}`);
    if (!err && (kind === 'out' || kind === 'in')) setTimeout(() => this.clear(), 1500); // ready for the next person
  }

  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

