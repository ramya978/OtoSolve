import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService } from '../Attendance/attendance-data.service';
import { AkSelect } from '../Attendance/ak-select';
import { AuditEntry } from '../Attendance/attendance-flow.store';

/* =====================================================================================================
   AUDIT TRAIL - every punch, request, decision, register save, location change and month close.
     filters (type · person · search) · grouped by day · export. Browser-only until the API exists,
     so it is not tamper-proof and holds the latest 300 entries.
   ===================================================================================================== */
type Kind = 'all' | 'punch' | 'request' | 'decision' | 'register' | 'location' | 'month';

@Component({
  selector: 'app-attendance-audit',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './attendance-audit.html',
  styleUrls: ['../Attendance/attendance-kit.css', './attendance-audit.css'],
})
export class AttendanceAudit {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly kind = signal<Kind>('all');
  readonly actor = signal('all');
  readonly search = signal('');
  readonly confirmClear = signal(false);
  readonly kinds: { value: Kind; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'punch', label: 'Punches' }, { value: 'request', label: 'Requests' },
    { value: 'decision', label: 'Decisions' }, { value: 'register', label: 'Register' }, { value: 'location', label: 'Locations' }, { value: 'month', label: 'Month close' },
  ];

  kindOf(a: AuditEntry): Exclude<Kind, 'all'> {
    const x = a.action.toLowerCase();
    if (/punch|break/.test(x)) return 'punch';
    if (/raised|withdrew/.test(x)) return 'request';
    if (/approved|rejected/.test(x)) return 'decision';
    if (/location/.test(x)) return 'location';
    if (/finalised|reopened/.test(x)) return 'month';
    return 'register';
  }
  tone(k: string) { return ({ punch: 'teal', request: 'amber', decision: 'violet', register: 'blue', location: '', month: 'rose' } as Record<string, string>)[k] ?? ''; }

  readonly actors = computed(() => [{ value: 'all', label: 'Everyone' }, ...[...new Set(this.flow.audit().map(a => a.actor))].sort().map(a => ({ value: a, label: a }))]);
  readonly counts = computed(() => {
    const c: Record<string, number> = { all: this.flow.audit().length };
    this.flow.audit().forEach(a => { const k = this.kindOf(a); c[k] = (c[k] ?? 0) + 1; });
    return c;
  });
  readonly rows = computed(() => {
    const k = this.kind(), who = this.actor(), q = this.search().trim().toLowerCase();
    return this.flow.audit().filter(a => (k === 'all' || this.kindOf(a) === k) && (who === 'all' || a.actor === who) && (!q || `${a.action} ${a.detail} ${a.actor}`.toLowerCase().includes(q)));
  });
  /** grouped by calendar day, newest first */
  readonly groups = computed(() => {
    const out: { day: string; items: (AuditEntry & { k: string; time: string })[] }[] = [];
    for (const a of this.rows()) {
      const d = new Date(a.at), day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const item = { ...a, k: this.kindOf(a), time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(item); else out.push({ day, items: [item] });
    }
    return out;
  });

  clear() {
    if (!this.confirmClear()) { this.confirmClear.set(true); return; }
    this.flow.clearAudit(); this.confirmClear.set(false);
  }
  exportCsv() {
    this.data.csv('attendance-audit.csv', [['Recorded at', 'Actor', 'Type', 'Action', 'Details'], ...this.rows().map(a => [a.at, a.actor, this.kindOf(a), a.action, a.detail])]);
  }
}

