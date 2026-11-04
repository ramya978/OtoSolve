import { Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { AttendanceDataService } from '../Attendance/attendance-data.service';
import { AttendanceHrStore, Device } from '../Attendance/attendance-hr.store';
import { PUNCH_SOURCES } from '../Attendance/attendance-flow.store';
import { AkSelect } from '../Attendance/ak-select';

/* =====================================================================================================
   PUNCH METHODS & DEVICES (admin set-up)
     methods  : switch each way of punching on or off (web, mobile GPS, biometric, QR kiosk, HR edits)
                - My attendance and the Punch station respect these switches
     devices  : biometric terminals and kiosks, where they are, last sync
   ===================================================================================================== */
const ABOUT: Record<string, { text: string; where: string }> = {
  'Web punch': { text: 'Employees punch from My attendance in a browser.', where: 'My attendance' },
  'Mobile GPS': { text: 'Punch from a phone, with the location checked against geo-fencing.', where: 'Phone app' },
  'Biometric': { text: 'Fingerprint or face terminals; punches arrive when the device syncs.', where: 'Devices below' },
  'QR kiosk': { text: 'A shared tablet at reception - the Punch station page.', where: 'Punch station' },
  'Manual correction': { text: 'HR and managers fix days in the register, bulk entry and missed punches.', where: 'Admin pages' },
};

@Component({
  selector: 'app-punch-devices',
  standalone: true,
  imports: [PageHeader, AkSelect],
  templateUrl: './punch-devices.html',
  styleUrls: ['../Attendance/attendance-kit.css', './punch-devices.css'],
})
export class PunchDevices {
  readonly data = inject(AttendanceDataService);
  readonly hr = inject(AttendanceHrStore);
  readonly flow = this.data.flow;
  readonly about = ABOUT;
  readonly methods = PUNCH_SOURCES;
  readonly deviceMethods = ['Biometric', 'QR kiosk', 'Mobile GPS'];
  readonly editing = signal<Device | null>(null);
  readonly error = signal('');
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() { void this.data.ensure(); }

  /** punches today by method */
  readonly today = computed(() => {
    const c: Record<string, number> = {};
    for (const l of Object.values(this.flow.logs())) if (l.date === this.data.today) c['Web punch'] = (c['Web punch'] ?? 0) + 1;
    for (const [k, m] of Object.entries(this.flow.dayMeta())) if (k.startsWith(this.data.today) && m.source && m.source !== 'Web punch') c[m.source] = (c[m.source] ?? 0) + 1;
    return c;
  });
  readonly onCount = computed(() => this.methods.filter(m => this.hr.methodOn(m)).length);

  toggle(m: string, on: boolean) {
    if (!on && this.onCount() <= 1) { this.notify('Keep at least one way to punch.'); return; }
    this.hr.setMethod(m, on);
    this.notify(m + (on ? ' switched on.' : ' switched off - people can no longer punch this way.'));
  }
  lastSync(d: Device) {
    if (!d.lastSync) return 'Never';
    const m = Math.round((Date.now() - new Date(d.lastSync).getTime()) / 60000);
    return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(d.lastSync).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  isSaved(d: Device) { return this.hr.devices().some(x => x.id === d.id); }
  add() { this.editing.set({ id: 'DV-' + Date.now().toString(36).toUpperCase(), name: '', method: 'Biometric', location: this.flow.activeLocations()[0] ?? '', serial: '', active: true, lastSync: '' }); this.error.set(''); }
  edit(d: Device) { this.editing.set({ ...d }); this.error.set(''); }
  patch(p: Partial<Device>) { const d = this.editing(); if (d) this.editing.set({ ...d, ...p }); this.error.set(''); }
  save() {
    const d = this.editing(); if (!d) return;
    if (d.name.trim().length < 2) return this.error.set('Give the device a name.');
    if (d.serial.trim().length < 3) return this.error.set('Enter the serial number printed on the device.');
    this.hr.saveDevice({ ...d, name: d.name.trim(), serial: d.serial.trim() });
    this.editing.set(null);
    this.notify(d.name.trim() + ' saved.');
  }
  remove() { const d = this.editing(); if (!d) return; this.hr.removeDevice(d.id); this.editing.set(null); this.notify(d.name + ' removed.'); }
  sync(d: Device) { this.hr.syncDevice(d.id); this.notify(d.name + ' synced. (Connect the device API to pull real punches.)'); }
  notify(t: string) { this.toast.set(t); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.set(null), 4000); }
}

