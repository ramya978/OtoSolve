import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, addDays, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, ApproverRole, ChainStep, FlowConfig, Kind, ROLE_LABEL } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';

/* =====================================================================================================
   APPROVAL FLOW (admin set-up)
     Who approves : levels for leave and for attendance requests (corrections, WFH, on duty, half day,
                    permission), with "only if N days or more", reply time and what happens on no reply
     Approvers    : reporting manager and department head per department
     Waiting now  : everything pending, at which level, for how long - and run the timeout rules
     Cover        : someone approves for an absent approver between two dates
   ===================================================================================================== */
type Tab = 'flows' | 'approvers' | 'waiting' | 'cover';

@Component({
  selector: 'app-approval-flow',
  standalone: true,
  imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './approval-flow.html',
  styleUrls: ['../Attendance/attendance-kit.css', './approval-flow.css'],
})
export class ApprovalFlow {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly roleLabel = ROLE_LABEL;
  readonly tab = signal<Tab>('flows');
  readonly draft = signal<Record<Kind, FlowConfig>>(structuredClone(this.hr.flows()));
  readonly kinds: { k: Kind; title: string; unit: string; text: string }[] = [
    { k: 'leave', title: 'Leave', unit: 'days', text: 'Extra levels can be added only for longer leave.' },
    { k: 'request', title: 'Attendance requests', unit: '', text: 'Punch corrections, work from home, on duty, half day and permission.' },
  ];
  readonly roleOptions = (['manager', 'head', 'hr'] as ApproverRole[]).map(r => ({ value: r, label: ROLE_LABEL[r] }));
  readonly slaOptions = [4, 8, 24, 48, 72].map(h => ({ value: String(h), label: h < 24 ? h + ' hours' : h / 24 + ' day' + (h > 24 ? 's' : '') }));
  readonly timeoutOptions = [{ value: 'next', label: 'Pass to the next level, or HR' }, { value: 'remind', label: 'Send a reminder only' }, { value: 'approve', label: 'Approve automatically' }];

  /* try it */
  readonly tryKind = signal<Kind>('leave');
  readonly tryPerson = signal('');
  readonly tryDays = signal(4);
  /* cover */
  readonly cFrom = signal('');
  readonly cTo = signal('');
  readonly cStart = signal(this.data.today);
  readonly cEnd = signal(addDays(this.data.today, 7));
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure().then(() => this.hr.seedDemo()); }

  readonly peopleOptions = computed(() => this.data.people().map(p => ({ value: p.id, label: p.name, hint: p.department })));
  /** someone who has a reporting manager other than themself, for the preview */
  samplePerson() { return this.data.people().find(p => this.hr.managerOf(p) && this.hr.managerOf(p) !== p.id)?.id ?? ''; }
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.hr.flows()));
  readonly departments = computed(() => this.data.departments().map(d => ({
    d, people: this.data.people().filter(p => p.department === d).map(p => ({ value: p.id, label: p.name })),
    manager: this.hr.deptRoles()[d]?.manager ?? '', head: this.hr.deptRoles()[d]?.head ?? '',
    autoManager: this.data.person(this.hr.managerOf({ id: '', name: '', department: d, role: '', initials: '', tone: 'blue' }))?.name ?? '—',
    autoHead: this.data.person(this.hr.headOf(d))?.name ?? '—',
  })).filter(x => x.people.length));

  readonly preview = computed<ChainStep[]>(() => {
    const p = this.data.person(this.tryPerson() || this.samplePerson());
    if (!p) return [];
    // preview with the unsaved draft
    return this.hr.buildChain(this.tryKind(), p, this.tryKind() === 'leave' ? this.tryDays() : 1, this.draft()[this.tryKind()]);
  });

  readonly waiting = computed(() => {
    const now = Date.now();
    const leaves = this.hr.leaves().filter(l => l.status === 'Pending').map(l => ({ id: l.id, kind: 'leave' as Kind, who: l.employeeName, what: (this.hr.type(l.typeId)?.name ?? 'Leave') + ' · ' + l.days + 'd', step: this.hr.waitingStep(l.chain), since: this.hr.waitingSince(l), late: this.hr.overdue('leave', l) }));
    const reqs = this.data.flow.requests().filter(r => r.status === 'Pending').map(r => { const chain = this.hr.requestChain(r); return { id: r.id, kind: 'request' as Kind, who: r.employeeName, what: r.type, step: this.hr.waitingStep(chain), since: this.hr.waitingSince({ ...r, chain }), late: this.hr.overdue('request', { ...r, chain }) }; });
    return [...leaves, ...reqs].map(x => ({ ...x, hours: Math.max(0, Math.round((now - new Date(x.since).getTime()) / 3600000)) })).sort((a, b) => b.hours - a.hours);
  });
  readonly lateCount = computed(() => this.waiting().filter(x => x.late).length);
  readonly covers = computed(() => this.hr.delegations().map(d => ({ ...d, fromName: this.data.person(d.from)?.name ?? d.from, toName: this.data.person(d.to)?.name ?? d.to, active: d.fromDate <= this.data.today && d.toDate >= this.data.today })));

  /* flow editing */
  levels(k: Kind) { return this.draft()[k].levels; }
  private patch(k: Kind, cfg: Partial<FlowConfig>) { this.draft.update(d => ({ ...d, [k]: { ...d[k], ...cfg } })); }
  setRole(k: Kind, i: number, role: string) { this.patch(k, { levels: this.levels(k).map((l, j) => j === i ? { ...l, role: role as ApproverRole } : l) }); }
  setMin(k: Kind, i: number, v: number) { this.patch(k, { levels: this.levels(k).map((l, j) => j === i ? { ...l, minDays: Math.max(0, Math.round(v || 0)) } : l) }); }
  addLevel(k: Kind) { const used = this.levels(k).map(l => l.role), role = (['manager', 'head', 'hr'] as ApproverRole[]).find(r => !used.includes(r)) ?? 'hr'; this.patch(k, { levels: [...this.levels(k), { role, minDays: 0 }] }); }
  removeLevel(k: Kind, i: number) { this.patch(k, { levels: this.levels(k).filter((_, j) => j !== i) }); }
  setSla(k: Kind, v: string) { this.patch(k, { slaHours: +v }); }
  setOnTimeout(k: Kind, v: string) { this.patch(k, { onTimeout: v as FlowConfig['onTimeout'] }); }
  saveFlows() { (['leave', 'request'] as Kind[]).forEach(k => this.hr.saveFlow(k, this.draft()[k])); this.notify('Approval flow saved. New requests follow it; requests already sent keep their path.'); }
  resetFlows() { this.draft.set(structuredClone(this.hr.flows())); }

  setRoleFor(d: string, role: 'manager' | 'head', id: string) { this.hr.setDeptRole(d, role, id); this.notify('Approver for ' + d + ' updated.'); }
  runSla() { const n = this.hr.runSla(); this.notify(n ? n + ' overdue request' + (n === 1 ? '' : 's') + ' handled by the timeout rules.' : 'Nothing is overdue.'); }

  addCover() {
    if (!this.cFrom() || !this.cTo()) return this.error.set('Choose who is away and who covers.');
    if (this.cFrom() === this.cTo()) return this.error.set('Choose two different people.');
    if (this.cEnd() < this.cStart()) return this.error.set('The end date must be on or after the start date.');
    this.hr.addDelegation({ from: this.cFrom(), to: this.cTo(), fromDate: this.cStart(), toDate: this.cEnd() });
    this.cFrom.set(''); this.cTo.set(''); this.error.set('');
    this.notify('Cover added. New requests go to the covering person during those dates.');
  }

  short(d: string) { return niceDate(d, { day: 'numeric', month: 'short' }); }
  stepTone(s: ChainStep) { return s.status === 'Approved' ? 'teal' : s.status === 'Rejected' ? 'rose' : s.status === 'Waiting' ? 'blue' : ''; }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4500); }
}

