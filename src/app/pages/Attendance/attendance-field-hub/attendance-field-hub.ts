import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, STATUS_TONE, hm, niceDate } from '../Attendance/attendance-data.service';
import { AkSelect } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';
import { AttRecord, Employee, LABELS, Status, dayKind, key, record, validate } from '../Attendance/attendance';
import { DayMeta, PUNCH_SOURCES } from '../Attendance/attendance-flow.store';

/* =====================================================================================================
   ATTENDANCE FIELD HUB - every attendance field for one day, editable in one grid:
     status · shift · work location · punch source · project · approval · note
   Change any cell (or fill a column for the selected rows), then save once. Status changes go to the
   register; the other fields are kept beside it and show in exports.
   ===================================================================================================== */
interface Row { status: Status; shift: string; location: string; source: string; project: string; approval: 'Approved' | 'Pending'; note: string; }
type Field = keyof Row;
const EDITABLE: Status[] = ['P', 'HD', 'L', 'A', 'U'];

@Component({
  selector: 'app-attendance-field-hub',
  standalone: true,
  imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './attendance-field-hub.html',
  styleUrls: ['../Attendance/attendance-kit.css', './attendance-field-hub.css'],
})
export class AttendanceFieldHub {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly tone = STATUS_TONE;
  readonly labels = LABELS;
  readonly hm = hm;

  readonly date = signal(this.data.today);
  readonly department = signal('all');
  readonly search = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly edits = signal<Record<string, Row>>({});
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  /* fill-column tool */
  readonly fillField = signal<Field>('location');
  readonly fillValue = signal('');

  readonly minDate = (() => { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return d.toISOString().slice(0, 8) + '01'; })();
  readonly statusOptions = EDITABLE.map(s => ({ value: s, label: LABELS[s] }));
  readonly sourceOptions = PUNCH_SOURCES;
  readonly approvalOptions = ['Approved', 'Pending'];
  readonly fieldOptions = [
    { value: 'status', label: 'Status' }, { value: 'shift', label: 'Shift' }, { value: 'location', label: 'Work location' },
    { value: 'source', label: 'Punch source' }, { value: 'project', label: 'Project' }, { value: 'approval', label: 'Approval' },
  ];
  constructor() { void this.data.ensure(); }

  readonly deptOptions = computed(() => [{ value: 'all', label: 'All departments' }, ...this.data.departments().map(d => ({ value: d, label: d }))]);
  readonly shiftOptions = computed(() => this.data.shifts().filter(s => s.active).map(s => ({ value: s.id, label: s.name, hint: s.start + ' – ' + s.end })));
  readonly fillOptions = computed<(string | { value: string; label: string; hint?: string })[]>(() => {
    switch (this.fillField()) {
      case 'status': return this.statusOptions;
      case 'shift': return this.shiftOptions();
      case 'location': return this.flow.activeLocations();
      case 'source': return this.sourceOptions;
      case 'approval': return this.approvalOptions;
      default: return [];
    }
  });
  readonly editable = computed(() => dayKind(this.date()) === 'W' && !this.flow.isLocked(this.date()) && this.date() <= this.data.today);
  readonly dateText = computed(() => niceDate(this.date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase(), dep = this.department(), d = this.date();
    this.flow.dayMeta();
    return this.data.people().filter(e => (dep === 'all' || e.department === dep) && (!q || `${e.name} ${e.id} ${this.base(e).project}`.toLowerCase().includes(q)))
      .map(e => ({ e, v: this.data.day(e.id, d) }));
  });
  readonly allOn = computed(() => this.rows().length > 0 && this.rows().every(r => this.selected().has(r.e.id)));
  readonly changed = computed(() => Object.keys(this.edits()).length);

  /** saved values for a row (before edits) */
  base(e: Employee): Row {
    const d = this.date(), v = this.data.day(e.id, d), m = this.flow.meta(e.id, d), log = this.flow.log(e.id, d);
    return {
      status: EDITABLE.includes(v.rec.status) ? v.rec.status : 'U',
      shift: this.data.shiftFor(e.id, d).id,
      location: this.data.location(e.id, d),
      source: m.source ?? (log ? 'Web punch' : v.source === 'register' ? 'Manual correction' : 'Biometric'),
      project: m.project ?? '',
      approval: m.approval ?? (v.source === 'register' || v.rec.status !== 'U' ? 'Approved' : 'Pending'),
      note: v.rec.note,
    };
  }
  val(e: Employee): Row { return this.edits()[e.id] ?? this.base(e); }
  isDirty(e: Employee, f: Field) { const x = this.edits()[e.id]; return !!x && x[f] !== this.base(e)[f]; }

  set(e: Employee, f: Field, value: string) {
    const next = { ...this.val(e), [f]: value } as Row;
    const same = (Object.keys(next) as Field[]).every(k => next[k] === this.base(e)[k]);
    this.edits.update(m => { const n = { ...m }; if (same) delete n[e.id]; else n[e.id] = next; return n; });
    this.error.set('');
  }

  toggle(id: string, on: boolean) { const s = new Set(this.selected()); on ? s.add(id) : s.delete(id); this.selected.set(s); }
  toggleAll(on: boolean) { const s = new Set(this.selected()); this.rows().forEach(r => on ? s.add(r.e.id) : s.delete(r.e.id)); this.selected.set(s); }
  setDate(d: string) { this.date.set(d); this.edits.set({}); this.selected.set(new Set()); this.error.set(''); }
  setFillField(f: string) { this.fillField.set(f as Field); this.fillValue.set(''); }

  fill() {
    const rows = this.rows().filter(r => this.selected().has(r.e.id));
    if (!rows.length) return this.error.set('Select the rows to fill first.');
    if (!this.fillValue().trim()) return this.error.set('Choose a value to fill.');
    rows.forEach(r => this.set(r.e, this.fillField(), this.fillValue().trim()));
    this.notify(rows.length + ' rows filled. Save to keep them.');
  }

  save() {
    if (!this.editable()) return this.error.set('This day cannot be edited (weekly off, holiday, future or finalised month).');
    const records: Record<string, AttRecord> = {}, meta: Record<string, DayMeta> = {};
    for (const [id, row] of Object.entries(this.edits())) {
      const e = this.data.person(id); if (!e) continue;
      const k = key(this.date(), id), was = this.base(e), cur = this.data.day(id, this.date()).rec;
      if (row.status !== was.status || row.note !== was.note || row.location !== was.location) {
        const sh = this.data.shifts().find(s => s.id === row.shift);
        const active = row.status === 'P' || row.status === 'HD';
        const r = row.status === was.status
          ? { ...cur, note: row.note.slice(0, 180), mode: /remote/i.test(row.location) ? 'Remote' as const : 'Office' as const }
          : record(row.status, { in: active ? (cur.in || sh?.start || '09:00') : '', out: active ? (cur.out || (row.status === 'HD' ? '13:00' : sh?.end || '18:00')) : '', mode: /remote/i.test(row.location) ? 'Remote' : 'Office', note: row.note.slice(0, 180) });
        const err = validate(r);
        if (err) return this.error.set(e.name + ': ' + err);
        records[k] = r;
      }
      meta[k] = { shift: row.shift, location: row.location, source: row.source, project: row.project.trim(), approval: row.approval };
    }
    if (Object.keys(records).length) {
      const err = this.data.writeRecords(records, 'Field hub update', Object.keys(records).length + ' records · ' + this.date());
      if (err) return this.error.set(err);
    }
    this.flow.setDayMeta(meta);
    this.flow.recordAdmin('Field hub fields', Object.keys(meta).length + ' employees · ' + this.date());
    this.notify(Object.keys(meta).length + ' employees updated for ' + niceDate(this.date()) + '.');
    this.edits.set({});
  }
  discard() { this.edits.set({}); this.error.set(''); }

  exportCsv() {
    this.data.csv('field-hub-' + this.date() + '.csv', [
      ['Employee ID', 'Employee', 'Department', 'Date', 'Status', 'Shift', 'Location', 'Source', 'Project', 'Approval', 'In', 'Out', 'Worked', 'Note'],
      ...this.rows().map(r => { const v = this.val(r.e); return [r.e.id, r.e.name, r.e.department, this.date(), LABELS[v.status], this.data.shifts().find(s => s.id === v.shift)?.name ?? v.shift, v.location, v.source, v.project, v.approval, r.v.rec.in, r.v.rec.out, hm(r.v.minutes), v.note]; }),
    ]);
  }

  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

