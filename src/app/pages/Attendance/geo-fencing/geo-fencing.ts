import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService, niceDate } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, GeoZone, distanceM } from '../Attendance/attendance-hr.store';
import { AkSelect } from '../Attendance/ak-select';
import { AkDate } from '../Attendance/ak-date';

/* =====================================================================================================
   GEO-FENCING (admin set-up)
     Zones         : a circle (centre + radius) around each work location people may punch from;
                     simplified map, and a "test a point" tool
     Client visits : who may punch at a client site, on which day
     When geo-fencing is on, My attendance checks the phone/browser location before every punch.
   ===================================================================================================== */
type Tab = 'zones' | 'visits';

@Component({
  selector: 'app-geo-fencing',
  standalone: true,
  imports: [PageHeader, AkSelect, AkDate],
  templateUrl: './geo-fencing.html',
  styleUrls: ['../Attendance/attendance-kit.css', './geo-fencing.css'],
})
export class GeoFencing {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly flow = this.data.flow;
  readonly tab = signal<Tab>('zones');
  readonly editing = signal<{ name: string; z: GeoZone } | null>(null);
  readonly testLat = signal('');
  readonly testLng = signal('');
  readonly vPerson = signal('');
  readonly vDate = signal(this.data.today);
  readonly vSite = signal('');
  readonly vNote = signal('');
  readonly locating = signal(false);
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure(); }

  readonly rows = computed(() => this.flow.locations().map(l => ({ l, z: this.hr.zone(l.name) })));
  readonly peopleOptions = computed(() => this.data.people().map(p => ({ value: p.id, label: p.name, hint: p.department })));
  readonly siteOptions = computed(() => this.flow.locations().filter(l => l.active && (l.type === 'Client site' || l.type === 'Field')).map(l => l.name));
  readonly visits = computed(() => [...this.hr.visits()].sort((a, b) => b.date.localeCompare(a.date)));

  /** zones drawn on a simple flat map that fits them all */
  readonly map = computed(() => {
    const zs = this.rows().filter(r => r.z).map(r => ({ name: r.l.name, active: r.l.active, ...r.z! }));
    if (!zs.length) return { zs: [] as (GeoZone & { name: string; active: boolean; x: number; y: number; r: number })[], test: null as { x: number; y: number } | null, scaleKm: 0 };
    const lats = zs.map(z => z.lat), lngs = zs.map(z => z.lng);
    const pad = .02, minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad, minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
    const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180), w = (maxLng - minLng) * kx, h = maxLat - minLat, span = Math.max(w, h);
    const W = 600, H = 340, s = Math.min(W, H) / span;
    const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
    const test = this.testPoint();
    return {
      zs: zs.map(z => ({ ...z, x: ox + (z.lng - minLng) * kx * s, y: oy + (maxLat - z.lat) * s, r: Math.max(7, z.radius / 111000 * s * 6) })),
      test: test ? { x: ox + (test.lng - minLng) * kx * s, y: oy + (maxLat - test.lat) * s } : null,
      scaleKm: Math.round(span * 111 / 4),
    };
  });
  readonly testPoint = computed(() => { const a = parseFloat(this.testLat()), b = parseFloat(this.testLng()); return isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null; });
  readonly testResult = computed(() => {
    const p = this.testPoint(); if (!p) return [];
    return this.rows().filter(r => r.z).map(r => { const d = distanceM(p.lat, p.lng, r.z!.lat, r.z!.lng); return { name: r.l.name, d, inside: d <= r.z!.radius, radius: r.z!.radius }; }).sort((a, b) => a.d - b.d);
  });

  km(d: number) { return d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'; }
  short(d: string) { return niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
  typeTone(t: string) { return ({ Office: 'blue', Remote: 'violet', 'Client site': 'amber', Field: 'teal' } as Record<string, string>)[t] ?? ''; }

  edit(name: string) { this.editing.set({ name, z: { ...(this.hr.zone(name) ?? { lat: 13.0827, lng: 80.2707, radius: 200 }) } }); this.error.set(''); }
  patch(p: Partial<GeoZone>) { const e = this.editing(); if (e) this.editing.set({ ...e, z: { ...e.z, ...p } }); this.error.set(''); }
  hereForZone() {
    if (!navigator.geolocation) return this.error.set('This browser cannot share its location.');
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      p => { this.locating.set(false); this.patch({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }); },
      () => { this.locating.set(false); this.error.set('Location access was blocked.'); }, { timeout: 8000 });
  }
  save() {
    const e = this.editing(); if (!e) return;
    const { lat, lng, radius } = e.z;
    if (!isFinite(lat) || Math.abs(lat) > 90 || !isFinite(lng) || Math.abs(lng) > 180) return this.error.set('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
    if (!(radius >= 30 && radius <= 5000)) return this.error.set('Radius must be between 30 and 5000 metres.');
    this.hr.saveZone(e.name, { lat: +lat, lng: +lng, radius: Math.round(radius) });
    this.editing.set(null);
    this.notify('Zone for ' + e.name + ' saved.');
  }
  removeZone() { const e = this.editing(); if (!e) return; this.hr.saveZone(e.name, null); this.editing.set(null); this.notify('Zone removed - anyone can punch at ' + e.name + '.'); }
  toggle(on: boolean) { this.hr.setGeoEnforced(on); this.notify(on ? 'Geo-fencing is on. Punches outside a zone are blocked.' : 'Geo-fencing is off. Punches are not location checked.'); }

  addVisit() {
    const p = this.data.person(this.vPerson());
    if (!p) return this.error.set('Choose who is going.');
    if (!this.vSite()) return this.error.set('Choose the client site.');
    if (this.hr.visitOn(p.id, this.vDate())) return this.error.set(p.name + ' already has a visit on that day.');
    this.hr.addVisit({ employeeId: p.id, employeeName: p.name, date: this.vDate(), site: this.vSite(), note: this.vNote().trim() });
    this.vPerson.set(''); this.vNote.set(''); this.error.set('');
    this.notify('Visit assigned. ' + p.name + ' can punch at ' + this.vSite() + ' that day.');
  }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

