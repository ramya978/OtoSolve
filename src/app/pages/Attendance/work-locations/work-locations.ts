import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService } from '../Attendance/attendance-data.service';
import { AkSelect } from '../Attendance/ak-select';
import { LocationType, WorkLocation } from '../Attendance/attendance-flow.store';

/* =====================================================================================================
   WORK LOCATIONS - offices, remote work, client sites and field work.
     figures · location list (default employees, at work today) · add / edit / deactivate
     · who is where today. Locations feed every location picker (punch, bulk, field hub, requests).
   ===================================================================================================== */
const TYPES: LocationType[] = ['Office', 'Remote', 'Client site', 'Field'];

@Component({
  selector: 'app-work-locations',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './work-locations.html',
  styleUrls: ['../Attendance/attendance-kit.css', './work-locations.css'],
})
export class WorkLocations {
  readonly data = inject(AttendanceDataService);
  readonly flow = this.data.flow;
  readonly types = TYPES;
  readonly today = this.data.today;

  readonly typeFilter = signal('all');
  readonly editing = signal<{ original: string; loc: WorkLocation } | null>(null);
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  readonly typeOptions = [{ value: 'all', label: 'All types' }, ...TYPES.map(t => ({ value: t, label: t }))];

  constructor() { void this.data.ensure(); }

  /** where every employee is today, and their default */
  private readonly people = computed(() => {
    this.flow.logs(); this.flow.homeLocation(); this.flow.dayMeta();
    return this.data.people().map((e, i) => {
      const v = this.data.day(e.id, this.today);
      return { e, home: this.flow.home(e.id, i), here: this.data.location(e.id, this.today), working: ['P', 'HD'].includes(v.rec.status), live: v.live };
    });
  });

  readonly rows = computed(() => {
    const p = this.people(), f = this.typeFilter();
    return this.flow.locations().filter(l => f === 'all' || l.type === f).map(l => ({
      l, defaults: p.filter(x => x.home === l.name).length,
      today: p.filter(x => x.working && x.here === l.name).length,
      live: p.filter(x => x.live && x.here === l.name).length,
    }));
  });

  readonly kpis = computed(() => {
    const all = this.flow.locations(), p = this.people();
    return {
      active: all.filter(l => l.active).length, total: all.length,
      offices: all.filter(l => l.type === 'Office' && l.active).length,
      remote: p.filter(x => x.working && /remote/i.test(x.here)).length,
      field: p.filter(x => x.working && ['Client site', 'Field'].includes(this.flow.locations().find(l => l.name === x.here)?.type ?? '')).length,
    };
  });

  /** people at work today, grouped by location */
  readonly todayGroups = computed(() => {
    const p = this.people().filter(x => x.working);
    return [...new Set(p.map(x => x.here))].map(name => ({ name, people: p.filter(x => x.here === name) })).sort((a, b) => b.people.length - a.people.length);
  });

  typeTone(t: string) { return ({ Office: 'blue', Remote: 'violet', 'Client site': 'amber', Field: 'teal' } as Record<string, string>)[t] ?? ''; }

  add() { this.editing.set({ original: '', loc: { name: '', type: 'Office', city: '', active: true } }); this.error.set(''); }
  edit(l: WorkLocation) { this.editing.set({ original: l.name, loc: { ...l } }); this.error.set(''); }
  close() { this.editing.set(null); }
  patch(p: Partial<WorkLocation>) { const e = this.editing(); if (e) this.editing.set({ ...e, loc: { ...e.loc, ...p } }); this.error.set(''); }
  save() {
    const e = this.editing(); if (!e) return;
    const name = e.loc.name.trim();
    if (name.length < 2) return this.error.set('Give the location a name.');
    if (this.flow.locations().some(l => l.name.toLowerCase() === name.toLowerCase() && l.name !== e.original)) return this.error.set('A location with this name already exists.');
    this.flow.saveLocation({ ...e.loc, name, city: e.loc.city.trim() }, e.original);
    this.notify(e.original ? name + ' updated.' : name + ' added. It now appears in every location picker.');
    this.close();
  }
  toggle(l: WorkLocation) {
    if (l.active && this.flow.activeLocations().length <= 1) return this.notify('Keep at least one active location.');
    this.flow.toggleLocation(l.name);
    this.notify(l.name + (l.active ? ' deactivated - existing records keep it.' : ' is active again.'));
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

