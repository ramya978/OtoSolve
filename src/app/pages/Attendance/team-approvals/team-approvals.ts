import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, ChainStep, ROLE_LABEL } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';

/* =====================================================================================================
   TEAM APPROVALS (employee who approves - manager, department head or someone covering)
     everything waiting at my level · approve passes it to the next level automatically · reject with a
     reason · what I decided before · who I am covering for
   ===================================================================================================== */
interface Item {
  kind: 'leave' | 'request'; id: string; who: string; whoId: string; dept: string; what: string; when: string; reason: string;
  chain: ChainStep[]; level: number; levels: number; hours: number; late: boolean;
}

@Component({
  selector: 'app-team-approvals',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './team-approvals.html',
  styleUrls: ['../Attendance/attendance-kit.css', './team-approvals.css'],
})
export class TeamApprovals {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly roleLabel = ROLE_LABEL;
  readonly rejecting = signal<Item | null>(null);
  readonly note = signal('');
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure().then(() => { this.hr.seedDemo(); if (!this.hr.me()) this.pickAnApprover(); }); }

  readonly me = computed(() => this.data.person(this.hr.meId()));
  readonly peopleOptions = computed(() => this.data.people().map(p => ({ value: p.id, label: p.name, hint: p.department })));
  readonly reports = computed(() => { const me = this.me(); return me ? this.data.people().filter(p => p.id !== me.id && this.hr.managerOf(p) === me.id).length : 0; });

  readonly queue = computed<Item[]>(() => {
    const me = this.me(); if (!me) return [];
    const q = this.hr.queueFor(me.id), now = Date.now();
    const hours = (since: string) => Math.max(0, Math.round((now - new Date(since).getTime()) / 3600000));
    const leaves = q.leaves.map(l => ({
      kind: 'leave' as const, id: l.id, who: l.employeeName, whoId: l.employeeId, dept: l.department,
      what: (this.hr.type(l.typeId)?.name ?? 'Leave') + ' · ' + l.days + ' day' + (l.days === 1 ? '' : 's'),
      when: l.from === l.to ? this.short(l.from) : this.short(l.from) + ' → ' + this.short(l.to), reason: l.reason,
      chain: l.chain, level: l.chain.findIndex(s => s.status === 'Waiting') + 1, levels: l.chain.length,
      hours: hours(this.hr.waitingSince(l)), late: this.hr.overdue('leave', l),
    }));
    const reqs = q.requests.map(r => { const chain = this.hr.requestChain(r); return {
      kind: 'request' as const, id: r.id, who: r.employeeName, whoId: r.employeeId, dept: r.department, what: r.type,
      when: this.short(r.date) + (r.type === 'Work from home' ? '' : ' · ' + r.from + '–' + r.to), reason: r.reason,
      chain, level: chain.findIndex(s => s.status === 'Waiting') + 1, levels: chain.length,
      hours: hours(this.hr.waitingSince({ ...r, chain })), late: this.hr.overdue('request', { ...r, chain }),
    }; });
    return [...leaves, ...reqs].sort((a, b) => b.hours - a.hours);
  });
  readonly history = computed(() => {
    const me = this.me(); if (!me) return [];
    const out: { id: string; who: string; what: string; status: string; at: string; note: string }[] = [];
    for (const l of this.hr.leaves()) for (const s of l.chain) if (s.who === me.id && (s.status === 'Approved' || s.status === 'Rejected') && s.at) out.push({ id: l.id, who: l.employeeName, what: this.hr.type(l.typeId)?.name ?? 'Leave', status: s.status, at: s.at, note: s.note ?? '' });
    for (const r of this.data.flow.requests()) for (const s of this.hr.requestChain(r)) if (s.who === me.id && (s.status === 'Approved' || s.status === 'Rejected') && s.at) out.push({ id: r.id, who: r.employeeName, what: r.type, status: s.status, at: s.at, note: s.note ?? '' });
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  });
  readonly covering = computed(() => { const me = this.me(); const T = this.data.today; return me ? this.hr.delegations().filter(d => d.to === me.id && d.fromDate <= T && d.toDate >= T).map(d => this.data.person(d.from)?.name ?? d.from) : []; });
  readonly coveredBy = computed(() => { const me = this.me(); return me ? this.data.person(this.hr.coverFor(me.id))?.name ?? '' : ''; });
  readonly lateCount = computed(() => this.queue().filter(x => x.late).length);

  /** demo: open on someone who has something to approve */
  private pickAnApprover() {
    const ids = new Set<string>();
    this.hr.leaves().forEach(l => { const s = this.hr.waitingStep(l.chain); if (s && s.who !== 'HR') ids.add(s.who); });
    const first = [...ids][0]; if (first) this.hr.setMe(first);
  }

  initials(x: Item) { return this.data.person(x.whoId)?.initials ?? x.who.slice(0, 2).toUpperCase(); }
  tone(x: Item) { return this.data.person(x.whoId)?.tone ?? 'blue'; }
  short(d: string) { return niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
  ago(iso: string) { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? Math.max(1, m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : niceDate(iso.slice(0, 10)); }
  stepTone(s: ChainStep) { return s.status === 'Approved' ? 'teal' : s.status === 'Rejected' ? 'rose' : s.status === 'Waiting' ? 'blue' : ''; }
  nextAfter(x: Item) { const n = x.chain.slice(x.level).find(s => s.status === 'Queued'); return n ? 'Then ' + n.name : 'You are the last level'; }

  approve(x: Item) {
    const me = this.me(); if (!me) return;
    const err = x.kind === 'leave' ? this.hr.decideLeave(x.id, 'Approved', '', me.id) : this.hr.decideRequest(x.id, 'Approved', '', me.id);
    if (err) { this.notify(err); return; }
    const after = x.kind === 'leave' ? this.hr.leaves().find(l => l.id === x.id) : this.data.flow.requests().find(r => r.id === x.id);
    this.notify(after?.status === 'Approved' ? x.who + '’s ' + x.what.split(' · ')[0].toLowerCase() + ' approved.' : 'Approved at your level - sent to ' + (this.hr.waitingStep((after as any)?.chain)?.name ?? 'the next level') + '.');
  }
  startReject(x: Item) { this.rejecting.set(x); this.note.set(''); this.error.set(''); }
  reject() {
    const x = this.rejecting(), me = this.me(); if (!x || !me) return;
    if (this.note().trim().length < 3) return this.error.set('Write a short reason - ' + x.who + ' will see it.');
    if (x.kind === 'leave') this.hr.decideLeave(x.id, 'Rejected', this.note(), me.id); else this.hr.decideRequest(x.id, 'Rejected', this.note(), me.id);
    this.rejecting.set(null);
    this.notify('Request rejected.');
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}
