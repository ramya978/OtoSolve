import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Footer } from '../../../Shared/layout/Footer/footer';
export type LeadStage = 'New' | 'Assigned' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost';
export type LeadTemp = 'Cold' | 'Warm' | 'Hot';
export type LeadPotential = 'Low' | 'Medium' | 'High';
export type StatTab = 'all' | 'unassigned' | 'assigned' | 'hot' | 'high' | 'recent' | 'converted';

export interface LeadRow {
  id: string; ref: string; name: string; phone: string; email: string;
  campaign: string; source: string; owner: string | null; stage: LeadStage;
  temp: LeadTemp; potential: LeadPotential; due: string; overdue: number; recent: boolean;
}

const C = (r: LeadRow): LeadRow => r;

const FIRST: LeadRow[] = [
  C({ id: 'l38', ref: 'LED-2026-000038', name: 'Gopal Krishnan', phone: '+919830273826', email: 'gopal.krishnan@mail.test', campaign: 'Adopt a Day-Care Centre', source: 'QR poster', owner: 'Vivek Sridhar', stage: 'Contacted', temp: 'Cold', potential: 'Low', due: '10 Oct 2026', overdue: 9, recent: false }),
  C({ id: 'l81', ref: 'LED-2026-000081', name: 'Tapas Nirmal', phone: '+919830543645', email: 'tapas.nirmal@mail.test', campaign: 'Mobile Healthcare Units', source: 'QR poster', owner: 'Imran Iqbal', stage: 'Contacted', temp: 'Cold', potential: 'Low', due: '11 Oct 2026', overdue: 8, recent: false }),
  C({ id: 'l23', ref: 'LED-2026-000023', name: 'Geeta Ramesh', phone: '+919839506969', email: 'geeta.ramesh@mail.test', campaign: 'Mobile Healthcare Units', source: 'Newsletter', owner: 'Gaurav Deepak', stage: 'Contacted', temp: 'Cold', potential: 'Low', due: '11 Oct 2026', overdue: 8, recent: false }),
  C({ id: 'l64', ref: 'LED-2026-000064', name: 'Hari Babu', phone: '+919849810193', email: 'hari.babu@mail.test', campaign: 'Annual Appeal 2026', source: 'Facebook form', owner: null, stage: 'New', temp: 'Cold', potential: 'Low', due: '12 Oct 2026', overdue: 7, recent: false }),
  C({ id: 'l06', ref: 'LED-2026-000006', name: 'Dinesh Babu', phone: '+919842161104', email: 'dinesh.babu@mail.test', campaign: 'Mobile Healthcare Units', source: 'Newsletter', owner: 'Nisha Karthik', stage: 'Contacted', temp: 'Cold', potential: 'Low', due: '12 Oct 2026', overdue: 7, recent: false }),
  C({ id: 'l68', ref: 'LED-2026-000068', name: 'Dinesh Kailash', phone: '+919839051359', email: 'dinesh.kailash@mail.test', campaign: 'Winter Relief', source: 'WhatsApp reply', owner: 'Shalini Balaji', stage: 'Contacted', temp: 'Cold', potential: 'Low', due: '12 Oct 2026', overdue: 7, recent: false }),
  C({ id: 'l50', ref: 'LED-2026-000050', name: 'Sarita Mahesh', phone: '+919822970083', email: 'sarita.mahesh@mail.test', campaign: 'Mobile Healthcare Units', source: 'CSR referral', owner: 'Arvind Murali', stage: 'Contacted', temp: 'Cold', potential: 'Medium', due: '12 Oct 2026', overdue: 7, recent: false }),
  C({ id: 'l62', ref: 'LED-2026-000062', name: 'Firoz Salim', phone: '+919811386411', email: 'firoz.salim@mail.test', campaign: 'Elder Helpline', source: 'Inbound call', owner: null, stage: 'New', temp: 'Warm', potential: 'High', due: '13 Oct 2026', overdue: 6, recent: false }),
  C({ id: 'l03', ref: 'LED-2026-000003', name: 'Fathima Ismail', phone: '+919845332260', email: 'fathima.ismail@mail.test', campaign: 'Digital Literacy', source: 'Tech fair', owner: 'Nisha Karthik', stage: 'Assigned', temp: 'Warm', potential: 'Medium', due: '13 Oct 2026', overdue: 6, recent: false }),
  C({ id: 'l21', ref: 'LED-2026-000021', name: 'Chandni Rakesh', phone: '+919811486562', email: 'chandni.rakesh@mail.test', campaign: 'Elder Helpline', source: 'Website form', owner: 'Gaurav Deepak', stage: 'Assigned', temp: 'Hot', potential: 'Medium', due: '13 Oct 2026', overdue: 6, recent: false }),
];
const FN = ['Aarav', 'Meera', 'Kiran', 'Divya', 'Suresh', 'Lakshmi', 'Arjun', 'Pooja', 'Rahul', 'Sneha', 'Vikram', 'Ananya', 'Rohan', 'Priya', 'Kavya', 'Manoj', 'Nandini', 'Sathish', 'Rekha', 'Aditya'];
const LN = ['Iyer', 'Menon', 'Pillai', 'Reddy', 'Sharma', 'Nair', 'Gupta', 'Joshi', 'Verma', 'Khan', 'Das', 'Kulkarni', 'Bose', 'Singh', 'Rao', 'Malhotra', 'Pandey', 'Ghosh', 'Thakur', 'Sheikh'];
const CAMPS: Array<[string, string]> = [
  ['Mobile Healthcare Units - Care at the Doorstep', 'Newsletter sign-up'],
  ['Adopt a Day-Care Centre', "Residents' association QR poster"],
  ['Winter Relief - Warmth for Elders', 'WhatsApp broadcast reply'],
  ['Elder Helpline - Keep the Line Open', 'Website enquiry form'],
  ['Care for the Elderly - Annual Appeal 2026', 'Facebook lead form'],
  ['Digital Literacy for Seniors', 'Senior tech fair counter'],
  ['Palliative Care at Home', 'CSR desk referral'],
  ['Walkathon for Elders 2027', 'Inbound call to donor services'],
];
const OWNERS = ['Vivek Sridhar', 'Imran Iqbal', 'Gaurav Deepak', 'Nisha Karthik', 'Shalini Balaji', 'Arvind Murali', 'Kavita Ashok', 'Rohan Mehta', 'Sneha Iyer'];
const HOT = new Set([11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47, 50, 53, 56, 59, 62, 65, 68]);
const HIGH = new Set([11, 13, 15, 17, 19, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61]);
const UNASS = new Set([15, 27, 39, 51, 63, 75]);
const CONV = new Set([20, 32, 44, 56, 68, 78, 83]);
const RECENT = new Set([12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84]);

function build(): LeadRow[] {
  const rows = [...FIRST];
  for (let i = 11; i <= 84; i++) {
    const fn = FN[(i * 7) % FN.length]; const ln = LN[(i * 11) % LN.length];
    const pair = CAMPS[i % CAMPS.length];
    const temp: LeadTemp = HOT.has(i) ? 'Hot' : i % 3 === 0 ? 'Warm' : 'Cold';
    const pot: LeadPotential = HIGH.has(i) ? 'High' : i % 3 === 1 ? 'Medium' : 'Low';
    const stage: LeadStage = CONV.has(i) ? 'Converted' : i % 9 === 4 ? 'New' : i % 5 === 0 ? 'Assigned' : i % 7 === 0 ? 'Qualified' : 'Contacted';
    rows.push({
      id: 'lx' + i, ref: 'LED-2026-' + String(i).padStart(6, '0'), name: fn + ' ' + ln,
      phone: '+9198' + String(1000000 + ((i * 7919) % 8999999)), email: fn.toLowerCase() + '.' + ln.toLowerCase() + '@mail.test',
      campaign: pair[0], source: pair[1], owner: UNASS.has(i) ? null : OWNERS[i % OWNERS.length],
      stage, temp, potential: pot, due: (13 + ((i - 10) % 12)) + ' Oct 2026',
      overdue: Math.max(0, 6 - Math.floor((i - 10) / 14)), recent: RECENT.has(i),
    });
  }
  return rows;
}
export const LEADS: LeadRow[] = build();

const ICONS: Record<string, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sort: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  plus: 'M12 5v14M5 12h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  flame: 'M12 22c4 0 7-2.7 7-6.5 0-4-3.5-5.5-3.5-9.5-3 1-4.5 3.5-4.5 6-1-.5-1.8-1.4-2.2-2.8C6.4 10.5 5 12.4 5 15.5 5 19.3 8 22 12 22z',
  diamond: 'M6 3h12l4 6-10 12L2 9z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  heart: 'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 1 10 8 16 7-6 13-11 8-16z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  chev: 'M6 9l6 6 6-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  thermo: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
  check: 'M20 6L9 17l-5-5',
  userPlus: 'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  x: 'M18 6 6 18M6 6l12 12',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  source: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
};

export type SortKey = 'due' | 'name' | 'newest';
type Dd = 's' | 't' | 'p' | 'r' | 'o' | 'sort' | 'rows';

/** One option of a custom dropdown. */
interface Opt { value: string; label: string; }

@Component({
  selector: 'app-lead-work-queue',
  imports: [Footer],
  templateUrl: './lead-work-queue.html',
  styleUrl: './lead-work-queue.css',
})
export class LeadWorkQueue {
  private readonly router = inject(Router);
  protected readonly all = LEADS;
  protected readonly query = signal('');
  protected readonly tab = signal<StatTab>('all');
  protected readonly page = signal(1);
  protected readonly checked = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);
  private toastTimer = 0;

  protected readonly fStage = signal('all');
  protected readonly fTemp = signal('all');
  protected readonly fPot = signal('all');
  protected readonly fSrc = signal('all');
  protected readonly fOwner = signal('all');
  protected readonly pageSize = signal(10);
  protected readonly pageSizes = [10, 25, 50];
  protected readonly sort = signal<SortKey>('due');
  protected readonly openDd = signal<Dd | null>(null);

  // ---- dropdown options ----
  protected readonly stageOpts: Opt[] = [{ value: 'all', label: 'All' }, ...['New', 'Assigned', 'Contacted', 'Qualified', 'Converted', 'Lost'].map((v) => ({ value: v, label: v }))];
  protected readonly tempOpts: Opt[] = [{ value: 'all', label: 'All' }, ...['Cold', 'Warm', 'Hot'].map((v) => ({ value: v, label: v }))];
  protected readonly potOpts: Opt[] = [{ value: 'all', label: 'All' }, ...['Low', 'Medium', 'High'].map((v) => ({ value: v, label: v }))];
  protected readonly sortOpts: Opt[] = [
    { value: 'due', label: 'Next contact due' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'newest', label: 'Newest first' },
  ];

  protected readonly sources = computed(() => [...new Set(this.all.map((r) => r.source))].sort());
  protected readonly owners = computed(() => [...new Set(this.all.map((r) => r.owner).filter((o): o is string => !!o))].sort());
  protected readonly srcOpts = computed<Opt[]>(() => [{ value: 'all', label: 'All' }, ...this.sources().map((v) => ({ value: v, label: v }))]);
  protected readonly ownerOpts = computed<Opt[]>(() => [{ value: 'all', label: 'All' }, { value: 'none', label: 'Unassigned' }, ...this.owners().map((v) => ({ value: v, label: v }))]);
  /** The five filter dropdowns, rendered with one @for. */
  protected readonly filterDefs = computed<{ key: Dd; label: string; icon: string; opts: Opt[]; value: string }[]>(() => [
    { key: 's', label: 'Stage', icon: 'flag', opts: this.stageOpts, value: this.fStage() },
    { key: 't', label: 'Temperature', icon: 'thermo', opts: this.tempOpts, value: this.fTemp() },
    { key: 'p', label: 'Potential', icon: 'diamond', opts: this.potOpts, value: this.fPot() },
    { key: 'r', label: 'Source', icon: 'source', opts: this.srcOpts(), value: this.fSrc() },
    { key: 'o', label: 'Owner', icon: 'user', opts: this.ownerOpts(), value: this.fOwner() },
  ]);
  /** Number of filters that are not "All" - shown on the Filters button. */
  protected readonly activeFilters = computed(() => [this.fStage(), this.fTemp(), this.fPot(), this.fSrc(), this.fOwner()].filter((v) => v !== 'all').length);
  protected readonly counts = computed(() => ({
    all: this.all.length,
    unassigned: this.all.filter((r) => !r.owner).length,
    assigned: this.all.filter((r) => !!r.owner).length,
    hot: this.all.filter((r) => r.temp === 'Hot').length,
    high: this.all.filter((r) => r.potential === 'High').length,
    recent: this.all.filter((r) => r.recent).length,
    converted: this.all.filter((r) => r.stage === 'Converted').length,
  }));
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const t = this.tab();
    return this.all.filter((r) =>
      (t === 'all' || (t === 'unassigned' && !r.owner) || (t === 'assigned' && !!r.owner) ||
        (t === 'hot' && r.temp === 'Hot') || (t === 'high' && r.potential === 'High') ||
        (t === 'recent' && r.recent) || (t === 'converted' && r.stage === 'Converted')) &&
      (this.fStage() === 'all' || r.stage === this.fStage()) &&
      (this.fTemp() === 'all' || r.temp === this.fTemp()) &&
      (this.fPot() === 'all' || r.potential === this.fPot()) &&
      (this.fSrc() === 'all' || r.source === this.fSrc()) &&
      (this.fOwner() === 'all' || (this.fOwner() === 'none' ? !r.owner : r.owner === this.fOwner())) &&
      (!q || (r.name + ' ' + r.ref + ' ' + r.phone + ' ' + r.email).toLowerCase().includes(q)))
      .sort((a, b) => {
        const k = this.sort();
        if (k === 'name') return a.name.localeCompare(b.name);
        if (k === 'newest') return b.ref.localeCompare(a.ref);
        return b.overdue - a.overdue || Date.parse(a.due) - Date.parse(b.due);
      });
  });
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly pageSafe = computed(() => Math.min(this.page(), this.totalPages()));
  protected readonly pageRows = computed(() => {
    const s = (this.pageSafe() - 1) * this.pageSize();
    return this.filtered().slice(s, s + this.pageSize());
  });
  /** Page buttons with gaps: 1 … 4 5 6 … 9 (0 = gap). */
  protected readonly pages = computed<number[]>(() => {
    const n = this.totalPages(), p = this.pageSafe();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const out: number[] = [1];
    const from = Math.max(2, p - 1), to = Math.min(n - 1, p + 1);
    if (from > 2) out.push(0);
    for (let i = from; i <= to; i++) out.push(i);
    if (to < n - 1) out.push(0);
    out.push(n);
    return out;
  });
  protected readonly rangeFrom = computed(() => (this.filtered().length ? (this.pageSafe() - 1) * this.pageSize() + 1 : 0));
  protected readonly rangeTo = computed(() => Math.min(this.pageSafe() * this.pageSize(), this.filtered().length));
  protected readonly allChecked = computed(() => this.pageRows().length > 0 && this.pageRows().every((r) => this.checked().has(r.id)));

  setQuery(v: string): void { this.query.set(v); this.page.set(1); }
  setTab(t: StatTab): void { this.tab.set(t); this.page.set(1); }
  setF(which: Dd, v: string): void {
    if (which === 's') this.fStage.set(v);
    if (which === 't') this.fTemp.set(v);
    if (which === 'p') this.fPot.set(v);
    if (which === 'r') this.fSrc.set(v);
    if (which === 'o') this.fOwner.set(v);
    this.page.set(1);
  }
  reset(): void {
    this.query.set(''); this.tab.set('all'); this.fStage.set('all'); this.fTemp.set('all');
    this.fPot.set('all'); this.fSrc.set('all'); this.fOwner.set('all'); this.page.set(1); this.sort.set('due');
    this.checked.set(new Set());
  }
  toggleRow(id: string): void {
    this.checked.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  toggleAll(): void {
    const rows = this.pageRows();
    this.checked.update((s) => {
      const n = new Set(s);
      if (rows.every((r) => n.has(r.id))) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.add(r.id));
      return n;
    });
  }
  /** Clear one filter from its pill (x button) without opening the dropdown. */
  clearF(which: Dd, e: Event): void { e.stopPropagation(); this.setF(which, 'all'); this.openDd.set(null); }
  /** Clear only the five filters (keeps search, tab and sort). */
  clearFilters(): void { (['s', 't', 'p', 'r', 'o'] as Dd[]).forEach((k) => this.setF(k, 'all')); }
  clearChecked(): void { this.checked.set(new Set()); }

  // ---- custom dropdowns ----
  toggleDd(d: Dd, e: Event): void { e.stopPropagation(); this.openDd.set(this.openDd() === d ? null : d); }
  pick(d: Dd, v: string): void {
    if (d === 'sort') { this.sort.set(v as SortKey); this.page.set(1); }
    else if (d === 'rows') { this.pageSize.set(+v); this.page.set(1); }
    else this.setF(d, v);
    this.openDd.set(null);
  }
  labelOf(opts: Opt[], v: string | number): string { return opts.find((o) => o.value === String(v))?.label ?? String(v); }
  readonly rowOpts: Opt[] = [10, 25, 50].map((n) => ({ value: String(n), label: String(n) }));
  exportSelected(): void { this.flash('Export queued for ' + this.checked().size + ' selected leads.'); }
  assignSelected(): void { this.flash(this.checked().size + ' leads ready to assign - pick an owner from the lead profile.'); }
  isChecked(id: string): boolean { return this.checked().has(id); }
  goCapture(): void { this.router.navigate(['/app/fundraising/relationships/lead-capture']); }
  openLead(r: LeadRow): void { this.router.navigate(['/app/fundraising/Lead/Lead-view'], { queryParams: { ref: r.ref } }); }
  act(r: LeadRow, kind: 'view' | 'note' | 'assign'): void {
    if (kind === 'view') return this.openLead(r);
    if (kind === 'assign') { this.flash((r.owner ? 'Reassign ' : 'Assign ') + r.name + ' from the lead profile.'); return; }
    this.flash('Note for ' + r.name + ' — log it from the lead profile.');
  }
  doExport(): void { this.flash('Export queued — the filtered CSV will download shortly.'); }
  icon(n: string): string { return ICONS[n] ?? ''; }
  bars(p: LeadPotential): number { return p === 'Low' ? 1 : p === 'Medium' ? 2 : 3; }
  private flash(t: string): void {
    clearTimeout(this.toastTimer); this.toast.set(t);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 2800);
  }
  @HostListener('document:click') onDocClick(): void { this.openDd.set(null); }
  @HostListener('document:keydown.escape') onEscape(): void {
    if (this.openDd()) this.openDd.set(null); else this.clearChecked();
  }
}