import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeader } from '../../Shared/layout/page-header/page-header';

export type RequestState = 'pending' | 'approved' | 'declined' | 'cancelled';
export interface Person { id: string; name: string; department: string; email?: string; }
export interface Permission {
  id: string; employeeId: string; date: string; start: string; end: string;
  type: string; reason: string; status: RequestState; note: string;
}
const STORAGE_KEY = 'precision-attendance-management-v1';
const dateISO = (d: Date): string => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const shiftDate = (base: Date, delta: number): string => { const d = new Date(base); d.setDate(d.getDate() + delta); return dateISO(d); };
// Fixed fictional directory: no Users/Departments API requests are made.
const SEED_PEOPLE: Person[] = [
  ['EMP-1001','Arjun Kumar','Engineering'], ['EMP-1002','Priya Raman','Engineering'],
  ['EMP-1003','Karthik Raj','Operations'], ['EMP-1004','Ananya Menon','Human Resources'],
  ['EMP-1005','Rahul Nair','Finance'], ['EMP-1006','Sneha Iyer','Marketing'],
  ['EMP-1007','Vignesh S','Engineering'], ['EMP-1008','Divya Krishnan','Operations'],
  ['EMP-1009','Mohammed Farhan','Support'], ['EMP-1010','Meera Joseph','Design'],
  ['EMP-1011','Sanjay Prakash','Sales'], ['EMP-1012','Lakshmi Devi','Finance'],
  ['EMP-1013','Nithin Babu','Engineering'], ['EMP-1014','Aishwarya R','Human Resources'],
  ['EMP-1015','Manoj Selvam','Operations'], ['EMP-1016','Harini Balaji','Support'],
  ['EMP-1017','Praveen Das','Marketing'], ['EMP-1018','Keerthana S','Design'],
  ['EMP-1019','Abdul Rahman','Sales'], ['EMP-1020','Swetha Narayan','Engineering']
].map(([id,name,department])=>({id,name,department}));
const requestTypes = ['Personal permission', 'Late arrival', 'Early departure', 'Business duty', 'Medical permission', 'Family emergency', 'Bank appointment', 'Official travel'];
const reasons = [
  'Doctor appointment scheduled during shift', 'Public transport delay on the way to office',
  'Family commitment requiring a short absence', 'Client meeting at an external location',
  'Medical follow-up and pharmacy visit', 'Urgent family matter',
  'Bank documentation and verification', 'Travel to the partner office',
  'School pickup for a dependent', 'Personal appointment approved by lead',
  'Site inspection and client coordination', 'Traffic diversion delayed arrival'
];
const statusPattern: RequestState[] = ['pending', 'approved', 'pending', 'declined', 'approved', 'pending', 'cancelled', 'approved', 'pending', 'approved', 'pending', 'declined'];
const timeWindows = [['09:00', '10:15'], ['11:00', '12:30'], ['15:30', '17:00'], ['13:00', '14:00'], ['10:30', '12:00'], ['16:00', '17:30']];
function hashText(text: string): number { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return value >>> 0; }
function sampleRecords(people: Person[]): Permission[] {
  const anchor = new Date(); anchor.setHours(12, 0, 0, 0);
  const out: Permission[] = [];
  for (const p of people.slice(0, 20)) {
    const h = hashText(p.id);
    for (let i = 0; i < 1; i++) {
      const j = (h + i * 7) >>> 0;
      const window = timeWindows[j % timeWindows.length];
      const offset = i === 0 ? -((h % 3) + 1) : -(i * 4 + (h % 7));
      out.push({
        id: `DEMO-${p.id}-${i + 1}`, employeeId: p.id, date: shiftDate(anchor, offset),
        start: window[0], end: window[1], type: requestTypes[(j + i) % requestTypes.length],
        reason: reasons[(j + i * 2) % reasons.length],
        status: statusPattern[(i + h % 3) % statusPattern.length], note: (i % 5 === 0 ? 'Reviewed by reporting manager (demo)' : '')
      });
    }
  }
  return out;
}
const emptyForm = (): Permission => ({ id: '', employeeId: '', date: dateISO(new Date()), start: '09:00', end: '10:00', type: 'Personal permission', reason: '', status: 'pending', note: '' });

@Component({
  selector: 'app-permission-desk', standalone: true, imports: [CommonModule, FormsModule, PageHeader],
  templateUrl: './permission-desk.html', styleUrl: './permission-desk.css'
})
export class PermissionDeskComponent implements OnInit {
  readonly people = signal<Person[]>([]);
  readonly departments = signal<string[]>([]);
  readonly permissions = signal<Permission[]>([]);
  readonly loading = signal(false);
  readonly apiError = signal('');
  readonly toast = signal('');
  readonly selectedId = signal('');
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly filters: { value: 'all' | RequestState; label: string }[] = [
    { value: 'all', label: 'All requests' }, { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'cancelled', label: 'Cancelled' }
  ];
  readonly typeOptions = requestTypes;
  statusFilter: 'all' | RequestState = 'all';
  search = '';
  departmentFilter = 'all';
  typeFilter = 'all';
  sortBy: 'newest' | 'oldest' = 'newest';
  page = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];
  get showingFrom(): number { return this.filtered.length ? (Math.min(this.page, this.pageCount) - 1) * this.pageSize + 1 : 0; }
  get showingTo(): number { return Math.min(this.filtered.length, Math.min(this.page, this.pageCount) * this.pageSize); }
  get pageNumbers(): number[] { return Array.from({ length: this.pageCount }, (_, i) => i + 1); }
  goToPage(n: number): void { this.page = Math.max(1, Math.min(this.pageCount, n)); }
  changePageSize(n: number): void { this.pageSize = [10, 20, 50].includes(Number(n)) ? Number(n) : 10; this.resetPage(); }
  get pageCount(): number { return Math.max(1, Math.ceil(this.filtered.length / this.pageSize)); }
  get visibleRequests(): Permission[] { const page = Math.min(this.page, this.pageCount); return this.filtered.slice((page - 1) * this.pageSize, page * this.pageSize); }
  changePage(delta: number): void { this.page = Math.max(1, Math.min(this.pageCount, this.page + delta)); }
  resetPage(): void { this.page = 1; }
  form: Permission = emptyForm();
  private restored: Permission[] = [];
  readonly rows = computed(() => this.permissions());
  readonly counts = computed(() => {
    const list = this.permissions();
    return { all: list.length, pending: list.filter(x => x.status === 'pending').length,
      approved: list.filter(x => x.status === 'approved').length,
      declined: list.filter(x => x.status === 'declined').length,
      cancelled: list.filter(x => x.status === 'cancelled').length };
  });
  get filtered(): Permission[] {
    const q = this.search.trim().toLowerCase();
    return this.permissions().filter(p => {
      const employee = this.people().find(x => x.id === p.employeeId);
      return (this.statusFilter === 'all' || p.status === this.statusFilter)
        && (this.departmentFilter === 'all' || employee?.department === this.departmentFilter)
        && (this.typeFilter === 'all' || p.type === this.typeFilter)
        && (!q || [p.id, employee?.name, employee?.department, p.type, p.reason, p.date].join(' ').toLowerCase().includes(q));
    }).sort((a, b) => this.sortBy === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  }
  get selected(): Permission | null { return this.permissions().find(p => p.id === this.selectedId()) ?? null; }
  get selectedPerson(): Person | undefined { return this.people().find(p => p.id === this.selected?.employeeId); }
  ngOnInit(): void { this.restore(); this.loadPeople(); }
  private restore(): void {
    try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      this.restored = Array.isArray(parsed.permissions) ? parsed.permissions.filter((x: any) => x && x.id && x.employeeId) : [];
    } catch { this.restored = []; }
  }
  private persist(): void {
    try { const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, permissions: this.permissions() }));
    } catch { this.toast.set('Browser storage unavailable. Changes will not survive reload.'); }
  }
  loadPeople(): void {
    this.loading.set(false);
    this.apiError.set('');
    const people = SEED_PEOPLE.map(p => ({ ...p }));
    this.people.set(people);
    this.departments.set([...new Set(people.map(p => p.department))].sort());
    const demo = sampleRecords(people); // Exactly 20 baseline permission records.
    const saved = new Map(this.restored.map(p => [p.id,p]));
    // Retain user edits/new requests for these demo employees; saved entries override baseline.
    this.permissions.set([
      ...demo.filter(p => !saved.has(p.id)),
      ...this.restored.filter(p => people.some(person => person.id === p.employeeId))
    ]);
    const current = this.selectedId();
    if (!this.permissions().some(p => p.id === current)) {
      this.selectedId.set(this.permissions()[0]?.id ?? '');
    }
  }
  person(id: string): Person | undefined { return this.people().find(x => x.id === id); }
  initials(id: string): string { return (this.person(id)?.name ?? '?').split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join(''); }
  dateLabel(date: string): string { return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  dayLabel(date: string): string { return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }); }
  duration(p: Permission): string {
    const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
    const mins = Math.max(0, toMin(p.end) - toMin(p.start));
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  }
  isDemo(p: Permission): boolean { return p.id.startsWith('DEMO-'); }
  select(p: Permission): void { this.selectedId.set(p.id); }
  setFilter(value: 'all' | RequestState): void { this.statusFilter = value; this.resetPage(); }
  clearFilters(): void { this.search = ''; this.statusFilter = 'all'; this.departmentFilter = 'all'; this.typeFilter = 'all'; this.resetPage(); }
  openPermission(p?: Permission): void { this.form = p ? { ...p } : { ...emptyForm(), employeeId: this.people()[0]?.id ?? '' }; this.editing.set(true); }
  close(): void { this.editing.set(false); }
  savePermission(): void {
    const p = this.form;
    if (!p.employeeId || !p.date || !p.reason.trim() || !p.start || !p.end || p.start >= p.end) { this.toast.set('Complete employee, date, valid time range and reason.'); return; }
    const next = { ...p, id: p.id || `PERM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
    this.permissions.update(list => list.some(x => x.id === next.id) ? list.map(x => x.id === next.id ? next : x) : [next, ...list]);
    this.selectedId.set(next.id); this.persist(); this.close(); this.toast.set('Permission saved in browser.');
  }
  decidePermission(p: Permission, status: RequestState): void {
    this.permissions.update(list => list.map(x => x.id === p.id ? { ...x, status } : x));
    this.persist(); this.toast.set(`Request ${status}. Saved in browser.`);
  }
  exportCsv(): void {
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Employee', 'Department', 'Date', 'From', 'To', 'Type', 'Reason', 'Status', 'Demo'] .map(escape).join(',')];
    for (const p of this.filtered) lines.push([this.person(p.employeeId)?.name, this.person(p.employeeId)?.department, p.date, p.start, p.end, p.type, p.reason, p.status, this.isDemo(p) ? 'Yes' : 'No'].map(escape).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'permission-desk.csv'; link.click(); URL.revokeObjectURL(url);
  }
}
