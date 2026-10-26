import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { CheckJobDto, WhatsAppApiService, WhatsAppOverviewDto, NumberAnswerDto, CheckJobResultDto } from '../../../Service/whatsapp-api.service';
import { rowsOf, when, saveBlob, csv, money, MESSAGES_PATH } from '../../../Shared/services/wa-utils';


const ACCEPT = ['txt', 'csv', 'xls', 'xlsx'];

interface SrcLine { sheet: string; line: number; text: string; cells: string[]; }
interface Found { number: string; sheet: string; line: number; raw: string; }
interface Invalid { sheet: string; line: number; value: string; reason: string; }
interface Dupe { number: string; count: number; lines: string; }
interface Parsed { sheets: number; rows: number; found: Found[]; invalid: Invalid[]; }
interface ReportRow { number: string; whatsApp: 'yes' | 'no' | 'unknown'; note: string; fromSaved: boolean; contactName: string | null; }
interface CampaignOption { id: string; name: string; }

type Step = 1 | 2 | 3 | 4;
type View = 'new' | 'jobs';
type ReviewTab = 'check' | 'saved' | 'dupes' | 'invalid';
type ReportTab = 'yes' | 'no' | 'unknown';
type JobStatus = CheckJobDto['displayStatus'];
type JobFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled';
type Menu = 'campaign' | 'rows' | null;

/* =====================================================================================================
   Reading numbers out of a file (in the browser, for the Review step - the server reads the file again)
   - every cell is read on its own, so dates, times, IDs and amounts in other columns are ignored
   - Indian numbers become +91…, anything already written with + or 00 keeps its own country code
   ===================================================================================================== */
const DATE_OR_TIME = /^\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})([T\s]\d{1,2}:\d{2}.*)?\s*$|^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/;
const TOKEN = /\+?\d[\d\s().-]{5,}\d/g;
const DATE_TOKEN = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;

type Norm = { number: string | null; reason: string };
const ok = (n: string): Norm => ({ number: n, reason: '' });
const bad = (reason: string): Norm => ({ number: null, reason });

function international(d: string): Norm {
  if (d.length < 8) return bad(`Too short (${d.length} digits)`);
  if (d.length > 15) return bad(`Too long (${d.length} digits)`);
  if (d.startsWith('91') && d.length !== 12) return bad('Indian numbers need 10 digits after +91');
  return ok('+' + d);
}

/** One written number → "+<country><number>", or the reason it cannot be used. */
export function normalise(token: string): Norm {
  const plus = token.trim().startsWith('+');
  const d = token.replace(/\D/g, '');
  if (plus) return international(d);
  if (d.startsWith('00')) return international(d.slice(2));
  if (d.length === 10) return /^[6-9]/.test(d) ? ok('+91' + d) : bad(`Not a mobile number (starts with ${d[0]})`);
  if (d.length === 11 && d.startsWith('0')) return /^0[6-9]/.test(d) ? ok('+91' + d.slice(1)) : bad(`Not a mobile number (starts with ${d[1]})`);
  if (d.length === 12 && /^91[6-9]/.test(d)) return ok('+' + d);
  if (d.length < 10) return bad(`Too short (${d.length} digits) and no country code`);
  return bad(`${d.length} digits and no country code - add + and the country code`);
}

function readCells(cells: string[]): { numbers: string[]; reason: string } {
  const numbers: string[] = [];
  let reason = '';
  for (const raw of cells) {
    const cell = raw.replace(/(\d)\.0+\b/g, '$1'); // 9876543210.0 from spreadsheets
    if (!cell.trim() || DATE_OR_TIME.test(cell)) continue;
    for (const m of cell.match(TOKEN) ?? []) {
      if (DATE_TOKEN.test(m.trim())) continue;
      const n = normalise(m);
      if (n.number) numbers.push(n.number);
      else if (!reason) reason = n.reason;
    }
  }
  return { numbers, reason };
}

function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';' || c === '\t') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/* ---------- .xlsx without any package: an .xlsx file is a zip of XML files ---------- */
type ZipEntry = { method: number; data: Uint8Array };

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The entries of a zip file (still compressed), by name. */
function zipEntries(buf: ArrayBuffer): Map<string, ZipEntry> {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--; // end of central directory
  if (e < 0) throw new Error('Not a zip file');
  const count = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count && v.getUint32(p, true) === 0x02014b50; i++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), noteLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    out.set(name, { method, data: u8.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + noteLen;
  }
  return out;
}

async function zipXml(zip: Map<string, ZipEntry>, name: string): Promise<Document | null> {
  const entry = zip.get(name);
  if (!entry) return null;
  const bytes = entry.method === 8 ? await inflateRaw(entry.data) : entry.method === 0 ? entry.data : null;
  return bytes ? new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml') : null;
}

const tags = (node: Document | Element, name: string): Element[] => Array.from(node.getElementsByTagNameNS('*', name));

async function readXlsx(file: File): Promise<{ lines: SrcLine[]; sheets: number }> {
  const zip = zipEntries(await file.arrayBuffer());
  const book = await zipXml(zip, 'xl/workbook.xml');
  if (!book) throw new Error('Not an Excel workbook');
  const rels = await zipXml(zip, 'xl/_rels/workbook.xml.rels');
  const shared = await zipXml(zip, 'xl/sharedStrings.xml');
  const strings = shared ? tags(shared, 'si').map((si) => tags(si, 't').map((t) => t.textContent ?? '').join('')) : [];
  const target = new Map(rels ? tags(rels, 'Relationship').map((r) => [r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? ''] as const) : []);

  const lines: SrcLine[] = [];
  const sheets = tags(book, 'sheet');
  for (const [i, s] of sheets.entries()) {
    const name = s.getAttribute('name') ?? `Sheet${i + 1}`;
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id') ?? '';
    const t = target.get(rid) ?? `worksheets/sheet${i + 1}.xml`;
    const doc = await zipXml(zip, t.startsWith('/') ? t.slice(1) : 'xl/' + t);
    if (!doc) continue;
    for (const [n, row] of tags(doc, 'row').entries()) {
      const cells = tags(row, 'c').map((c) => {
        const type = c.getAttribute('t');
        if (type === 'inlineStr') return tags(c, 't').map((x) => x.textContent ?? '').join('').trim();
        const v = tags(c, 'v')[0]?.textContent ?? '';
        return (type === 's' ? strings[Number(v)] ?? '' : v).trim();
      });
      const line = Number(row.getAttribute('r')) || n + 1;
      lines.push({ sheet: name, line, text: cells.filter(Boolean).join(', '), cells });
    }
  }
  return { lines, sheets: sheets.length };
}

async function readLines(file: File, ext: string): Promise<{ lines: SrcLine[]; sheets: number }> {
  if (ext === 'txt' || ext === 'csv') {
    const sheet = ext === 'csv' ? 'CSV file' : 'Text file';
    const lines = (await file.text()).split(/\r?\n/).map((text, i) => ({
      sheet, line: i + 1, text: text.trim(), cells: ext === 'csv' ? csvCells(text) : [text]
    }));
    return { lines, sheets: 1 };
  }
  if (ext === 'xlsx') return readXlsx(file);
  throw new Error('xls'); // the old binary .xls format cannot be read in the browser
}

function parse(lines: SrcLine[], sheets: number): Parsed {
  const found: Found[] = [];
  const invalid: Invalid[] = [];
  let rows = 0;
  for (const l of lines) {
    if (!l.text) continue;
    rows++;
    const { numbers, reason } = readCells(l.cells);
    if (numbers.length) numbers.forEach((n) => found.push({ number: n, sheet: l.sheet, line: l.line, raw: l.text }));
    else if (l.line === 1 && /[a-z]/i.test(l.text) && !reason) continue; // header row
    else invalid.push({ sheet: l.sheet, line: l.line, value: l.text, reason: reason || 'No phone number in this line' });
  }
  return { sheets, rows, found, invalid };
}

const ICONS: Record<string, string> = {
  upload: 'M12 15V3 M7 8l5-5 5 5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 12.5l2.7 2.7L16 9.8',
  alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  text: 'M4 7V5h16v2 M9 19h6 M12 5v14',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  chev: 'M6 9l6 6 6-6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
  x: 'M18 6 6 18 M6 6l12 12',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6'
};

const JOB_TONE: Record<JobStatus, string> = { queued: 'amber', running: 'blue', completed: 'green', failed: 'red', cancelled: '' };
const JOB_LABEL: Record<JobStatus, string> = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };
const isLive = (s: JobStatus | undefined) => s === 'queued' || s === 'running';

/** Number Verification: upload a list → review what was found → live WhatsApp check → report. */
@Component({
  selector: 'app-number-verification',
  imports: [PageHeader, NgTemplateOutlet],
  templateUrl: './number-verification.html',
  styleUrls: ['../wa-shared.css', './number-verification.css', '../../../Shared/layout/page-header/page-header.css']
})
export class NumberVerification implements OnInit {
  private readonly api = inject(WhatsAppApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly accept = ACCEPT.map((e) => '.' + e).join(',');
  protected readonly acceptList = ACCEPT.map((e) => '.' + e);
  protected readonly rowOptions = [25, 50, 100];
  protected readonly steps: { n: Step; no: string; label: string; hint: string }[] = [
    { n: 1, no: '01', label: 'Upload', hint: 'Add your list' },
    { n: 2, no: '02', label: 'Review', hint: 'Numbers found in the file' },
    { n: 3, no: '03', label: 'Check', hint: 'Live WhatsApp lookup' },
    { n: 4, no: '04', label: 'Report', hint: 'Valid and invalid numbers' }
  ];
  protected readonly rewrites = [
    { from: '9876543210', to: '+919876543210' },
    { from: '098765 43210', to: '+919876543210' },
    { from: 'Ravi 98765-43210', to: '+919876543210' },
    { from: '+44 7700 900123', to: '+447700900123' }
  ];

  /* ---------- page ---------- */
  protected readonly view = signal<View>('new');
  protected readonly overview = signal<WhatsAppOverviewDto | null>(null);
  private readonly groupCampaigns = signal<CampaignOption[]>([]);
  protected readonly error = signal('');
  protected readonly toast = signal('');
  protected readonly menu = signal<Menu>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;

  /* ---------- new check ---------- */
  protected readonly step = signal<Step>(1);
  protected readonly file = signal<File | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly busy = signal(false);
  protected readonly parsed = signal<Parsed | null>(null);
  protected readonly saved = signal<NumberAnswerDto[]>([]);
  protected readonly savedFailed = signal(false);
  protected readonly campaignId = signal<string | null>(null);
  protected readonly reviewTab = signal<ReviewTab>('check');
  protected readonly uploadRef = signal<string | null>(null);
  protected readonly job = signal<CheckJobDto | null>(null);
  protected readonly results = signal<ReportRow[]>([]);
  protected readonly reportTab = signal<ReportTab>('yes');
  protected readonly page = signal(1);
  protected readonly rows = signal(25);

  /* ---------- jobs ---------- */
  protected readonly jobs = signal<CheckJobDto[]>([]);
  protected readonly jobsLoading = signal(false);
  protected readonly jobFilter = signal<JobFilter>('all');
  protected readonly jobQuery = signal('');

  /* ---------- settings from the overview ---------- */
  private readonly settings = computed(() => this.overview()?.settings ?? null);
  protected readonly stats = computed(() => this.overview()?.statistics ?? null);
  protected readonly currency = computed(() => this.settings()?.currency || 'USD');
  protected readonly maxMb = computed(() => this.settings()?.maxFileSizeMegabytes || 10);
  protected readonly minNumbers = computed(() => this.settings()?.minimumNumbersPerTask ?? 0);
  private readonly pollMs = computed(() => Math.max(2, this.settings()?.pollingIntervalSeconds || 3) * 1000);
  /** Unknown (still loading) counts as fine, so the page never flashes a warning. */
  protected readonly workerOk = computed(() => {
    const o = this.overview();
    return !o || (o.integrationAvailable && o.worker.online && o.settings.checkNumberEnabled && o.settings.checkNumberConfigured);
  });
  protected readonly workerNote = computed(() => {
    const o = this.overview();
    if (!o) return '';
    if (!o.integrationAvailable) return 'The integration worker has not been set up for this database yet, so checks cannot run.';
    if (!o.worker.online) return 'The integration worker is offline right now. Uploads wait in the inbox until it is back.';
    if (!o.settings.checkNumberEnabled) return 'WhatsApp number checks are switched off in the settings.';
    if (!o.settings.checkNumberConfigured) return 'CheckNumber.ai is not configured yet, so checks cannot run.';
    return '';
  });

  /* ---------- derived: file ---------- */
  protected readonly ext = computed(() => (this.file()?.name.split('.').pop() ?? '').toLowerCase());
  protected readonly unique = computed(() => {
    const seen = new Map<string, Found>();
    for (const f of this.parsed()?.found ?? []) if (!seen.has(f.number)) seen.set(f.number, f);
    return [...seen.values()];
  });
  protected readonly dupes = computed<Dupe[]>(() => {
    const by = new Map<string, Found[]>();
    for (const f of this.parsed()?.found ?? []) by.set(f.number, [...(by.get(f.number) ?? []), f]);
    return [...by.entries()].filter(([, l]) => l.length > 1)
      .map(([number, l]) => ({ number, count: l.length, lines: l.map((x) => x.line).join(', ') }));
  });
  protected readonly dupeExtra = computed(() => this.dupes().reduce((n, d) => n + d.count - 1, 0));
  private readonly savedSet = computed(() => new Set(this.saved().map((s) => s.number)));
  protected readonly toCheck = computed(() => this.unique().filter((f) => !this.savedSet().has(f.number)));
  protected readonly invalid = computed(() => this.parsed()?.invalid ?? []);
  protected readonly cost = computed(() => {
    const n = this.toCheck().length;
    const s = this.settings();
    if (!n) return 0;
    return Math.max(n * (s?.pricePerNumber ?? 0.005), s?.minimumChargePerTask ?? 0);
  });
  protected readonly belowMinimum = computed(() => this.toCheck().length > 0 && this.toCheck().length < this.minNumbers());
  protected readonly canBuild = computed(() => {
    if (this.busy()) return false;
    if (!this.toCheck().length) return this.saved().length > 0; // only saved answers: report straight away
    return this.workerOk() && !this.belowMinimum();
  });

  /** Campaigns seen on earlier checks and recipient groups. */
  protected readonly campaigns = computed<CampaignOption[]>(() => {
    const m = new Map<string, string>();
    for (const j of this.jobs()) if (j.campaignId) m.set(j.campaignId, j.campaignName || j.campaignId);
    for (const g of this.groupCampaigns()) if (!m.has(g.id)) m.set(g.id, g.name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly campaignName = computed(() => this.campaigns().find((c) => c.id === this.campaignId())?.name ?? 'No campaign');

  /* ---------- derived: paging (one pager shared by the review / report tables) ---------- */
  private readonly listLength = computed(() => {
    if (this.step() === 4) return this.reportList().length;
    switch (this.reviewTab()) {
      case 'check': return this.toCheck().length;
      case 'saved': return this.saved().length;
      case 'dupes': return this.dupes().length;
      default: return this.invalid().length;
    }
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.listLength() / this.rows())));
  protected readonly safePage = computed(() => Math.min(this.page(), this.pages()));
  protected readonly range = computed(() => {
    const n = this.listLength();
    const from = n ? (this.safePage() - 1) * this.rows() + 1 : 0;
    return { from, to: Math.min(this.safePage() * this.rows(), n), n };
  });
  protected readonly pageList = computed(() => {
    const total = this.pages(), cur = this.safePage();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const out: number[] = [1];
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) out.push(p);
    out.push(total);
    return out;
  });
  private slice<T>(list: T[]): T[] { const s = (this.safePage() - 1) * this.rows(); return list.slice(s, s + this.rows()); }
  protected readonly checkRows = computed(() => this.slice(this.toCheck()));
  protected readonly savedRows = computed(() => this.slice(this.saved()));
  protected readonly dupeRows = computed(() => this.slice(this.dupes()));
  protected readonly invalidRows = computed(() => this.slice(this.invalid()));

  /* ---------- derived: check + report ---------- */
  protected readonly jobProgress = computed(() => {
    const j = this.job();
    return j && j.total ? Math.min(100, Math.round((j.processed / j.total) * 100)) : 0;
  });
  protected readonly reportCounts = computed(() => {
    const r = this.results();
    return {
      yes: r.filter((x) => x.whatsApp === 'yes').length,
      no: r.filter((x) => x.whatsApp === 'no').length,
      unknown: r.filter((x) => x.whatsApp === 'unknown').length,
      saved: r.filter((x) => x.fromSaved).length
    };
  });
  protected readonly reportList = computed(() => this.results().filter((x) => x.whatsApp === this.reportTab()));
  protected readonly reportRows = computed(() => this.slice(this.reportList()));

  /* ---------- derived: jobs ---------- */
  protected readonly jobCounts = computed(() => {
    const l = this.jobs();
    return {
      all: l.length,
      running: l.filter((j) => isLive(j.displayStatus)).length,
      completed: l.filter((j) => j.displayStatus === 'completed').length,
      failed: l.filter((j) => j.displayStatus === 'failed').length,
      cancelled: l.filter((j) => j.displayStatus === 'cancelled').length
    };
  });
  protected readonly jobList = computed(() => {
    const f = this.jobFilter();
    const q = this.jobQuery().trim().toLowerCase();
    return this.jobs()
      .filter((j) => f === 'all' || (f === 'running' ? isLive(j.displayStatus) : j.displayStatus === f))
      .filter((j) => !q || `${j.jobNumber} ${j.taskId ?? ''} ${j.fileName} ${j.campaignName ?? ''} ${j.uploadedByName ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.createdAtUtc ?? '').localeCompare(a.createdAtUtc ?? ''));
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => { this.stopPoll(); if (this.toastTimer) clearTimeout(this.toastTimer); });
    this.loadOverview();
    this.loadJobs();
    this.api.groups().subscribe({
      next: (g) => this.groupCampaigns.set(rowsOf<{ campaignId?: string | null; campaignName?: string | null }>(g)
        .filter((x) => !!x.campaignId).map((x) => ({ id: x.campaignId!, name: x.campaignName || x.campaignId! }))),
      error: () => this.groupCampaigns.set([])
    });
  }

  private loadOverview(): void {
    this.api.overview().subscribe({ next: (o) => this.overview.set(o ?? null), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
  loadJobs(): void {
    this.jobsLoading.set(true);
    this.api.jobs().subscribe({
      next: (p) => { this.jobs.set(rowsOf<CheckJobDto>(p)); this.jobsLoading.set(false); },
      error: (e: unknown) => { this.jobsLoading.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }

  /* ---------- helpers ---------- */
  icon(n: string): string { return ICONS[n] ?? ''; }
  size(b: number): string { return b < 1024 * 1024 ? `${Math.max(0.1, Math.round((b / 1024) * 10) / 10)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`; }
  money(n: number | null | undefined, cur?: string | null): string { return money(n, cur || this.currency()); }
  when(iso: string | null | undefined): string { return when(iso); }
  jobTone(s: JobStatus): string { return JOB_TONE[s] ?? ''; }
  jobLabel(s: JobStatus): string { return JOB_LABEL[s] ?? s; }
  isLive(s: JobStatus | undefined): boolean { return isLive(s); }
  canGo(n: Step): boolean { return n < this.step() && this.step() <= 2; }

  /* ---------- view + menus ---------- */
  setView(v: View): void { this.view.set(v); this.error.set(''); if (v === 'jobs') this.loadJobs(); }
  toggle(m: Exclude<Menu, null>, e: Event): void { e.stopPropagation(); this.menu.set(this.menu() === m ? null : m); }
  pickCampaign(id: string | null): void { this.campaignId.set(id); this.menu.set(null); }
  setRows(n: number): void { this.rows.set(n); this.page.set(1); this.menu.set(null); }
  goPage(p: number): void { this.page.set(Math.min(this.pages(), Math.max(1, p))); }
  setReviewTab(t: ReviewTab): void { this.reviewTab.set(t); this.page.set(1); }
  setReportTab(t: ReportTab): void { this.reportTab.set(t); this.page.set(1); }
  goStep(n: Step): void { if (this.canGo(n)) { this.step.set(n); this.page.set(1); } }

  /* ---------- step 1: file ---------- */
  onPick(input: HTMLInputElement): void { const f = input.files?.[0]; input.value = ''; if (f) this.setFile(f); }
  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragOver.set(true); }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.setFile(f);
  }
  private setFile(f: File): void {
    this.error.set('');
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (!ACCEPT.includes(ext)) { this.error.set(`Use a ${this.acceptList.join(', ')} file.`); return; }
    if (f.size > this.maxMb() * 1024 * 1024) { this.error.set(`The file is larger than ${this.maxMb()} MB.`); return; }
    this.file.set(f);
    this.parsed.set(null);
  }
  changeFile(): void { this.file.set(null); this.parsed.set(null); this.saved.set([]); this.step.set(1); this.error.set(''); }

  /* ---------- step 2: review ---------- */
  async next(): Promise<void> {
    const f = this.file();
    if (!f || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { lines, sheets } = await readLines(f, this.ext());
      this.parsed.set(parse(lines, sheets));
    } catch {
      this.busy.set(false);
      this.error.set(this.ext() === 'xls'
        ? 'Old .xls files cannot be read here. Open it in Excel, choose Save As → .xlsx (or .csv), and upload that.'
        : this.ext() === 'xlsx'
          ? 'This Excel file could not be read. Save it as .csv and try again.'
          : 'This file could not be read.');
      return;
    }
    this.saved.set([]);
    this.savedFailed.set(false);
    const numbers = this.unique().map((u) => u.number);
    const done = () => {
      this.busy.set(false);
      this.step.set(2);
      this.page.set(1);
      this.reviewTab.set(this.toCheck().length ? 'check' : this.saved().length ? 'saved' : 'invalid');
    };
    if (!numbers.length) { done(); return; }
    this.api.lookupNumbers(numbers).subscribe({
      next: (r) => { const want = new Set(numbers); this.saved.set(rowsOf<NumberAnswerDto>(r).filter((x) => want.has(x.number))); done(); },
      error: () => { this.savedFailed.set(true); done(); }
    });
  }

  /* ---------- step 3: check ---------- */
  /** Upload the file. The worker picks it up from the inbox, so we wait for the upload, then for the job. */
  buildReport(): void {
    const f = this.file();
    if (!this.canBuild() || !f) return;
    if (!this.toCheck().length) { this.showReport([]); return; }
    this.busy.set(true);
    this.error.set('');
    this.api.uploadList(f, { campaignId: this.campaignId() }).subscribe({
      next: (u) => {
        this.busy.set(false);
        if (u.status === 'Duplicate') {
          this.flash(u.message || 'This exact file was checked before - opening that check.');
          const key = u.duplicateOfJobNumber || u.duplicateOfJobId;
          if (key) this.follow(key);
          return;
        }
        this.uploadRef.set(u.uploadReference ?? null);
        this.job.set(null);
        this.step.set(3);
        this.pollCount = 0;
        if (u.uploadReference) this.waitForUpload(u.uploadReference);
      },
      error: (e: unknown) => { this.busy.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }

  private waitForUpload(ref: string): void {
    this.stopPoll();
    this.pollTimer = setTimeout(() => {
      this.api.uploadStatus(ref).subscribe({
        next: (s) => {
          const key = s.jobNumber || s.jobId;
          if ((s.status === 'Registered' || s.status === 'Duplicate') && key) {
            if (s.status === 'Duplicate') this.flash('This exact file was checked before - showing that check.');
            this.follow(key);
          } else if (s.status === 'Rejected') {
            this.error.set(s.reason || 'The worker refused this file.');
            this.uploadRef.set(null);
            this.step.set(2);
          } else if (++this.pollCount > 100) {
            this.error.set('The worker has not picked the file up yet. It stays queued - find it later under Jobs.');
          } else this.waitForUpload(ref);
        },
        error: () => this.waitForUpload(ref) // network blip: keep asking
      });
    }, this.pollMs());
  }

  /** Show a check (by job number or id) and keep it fresh while it runs. */
  private follow(key: string, now = true): void {
    this.stopPoll();
    const load = () => this.api.job(key).subscribe({
      next: (d) => {
        const j = d?.job ?? null;
        this.job.set(j);
        this.uploadRef.set(null);
        if (!j) return;
        if (isLive(j.displayStatus)) { this.step.set(3); this.follow(key, false); return; }
        if (j.displayStatus === 'completed') { this.loadResults(j); return; }
        this.step.set(3);
        this.error.set(j.reason || `This check ${j.displayStatus === 'cancelled' ? 'was cancelled' : 'failed'}.`);
        this.loadJobs();
      },
      error: (e: unknown) => (now ? this.error.set(apiErrorMessage(e)) : this.follow(key, false))
    });
    if (now) load(); else this.pollTimer = setTimeout(load, this.pollMs());
  }
  private stopPoll(): void { if (this.pollTimer) clearTimeout(this.pollTimer); this.pollTimer = null; }

  private loadResults(j: CheckJobDto): void {
    this.api.jobResults(j.jobNumber || j.id).subscribe({
      next: (r) => {
        this.showReport(rowsOf<CheckJobResultDto>(r).map((x) => ({
          number: x.number, whatsApp: x.whatsApp, note: x.note || x.watiSkipReason || '', fromSaved: x.status === 'saved', contactName: x.contactName ?? null
        })));
        this.loadOverview();
        this.loadJobs();
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e))
    });
  }
  private showReport(fresh: ReportRow[]): void {
    const seen = new Set(fresh.map((x) => x.number));
    const fromSaved: ReportRow[] = this.saved().filter((s) => !seen.has(s.number))
      .map((s) => ({ number: s.number, whatsApp: s.whatsApp, note: `Saved answer from ${when(s.checkedAtUtc)}`, fromSaved: true, contactName: null }));
    this.results.set([...fresh, ...fromSaved]);
    const c = this.reportCounts();
    this.reportTab.set(c.yes ? 'yes' : c.no ? 'no' : 'unknown');
    this.page.set(1);
    this.step.set(4);
  }

  cancelCheck(): void {
    const j = this.job();
    if (!j || !j.canCancel) { this.reset(); return; }
    this.api.cancelJob(j.jobNumber || j.id).subscribe({
      next: () => { this.flash('Cancel requested - the worker stops the check shortly.'); this.follow(j.jobNumber || j.id, false); this.loadJobs(); },
      error: (e: unknown) => this.error.set(apiErrorMessage(e))
    });
  }
  retryCheck(): void {
    const j = this.job();
    if (!j) return;
    this.api.retryJob(j.jobNumber || j.id).subscribe({
      next: () => { this.error.set(''); this.flash('Retry requested.'); this.follow(j.jobNumber || j.id, false); },
      error: (e: unknown) => this.error.set(apiErrorMessage(e))
    });
  }

  /** Start over with a new list. */
  reset(): void {
    this.stopPoll();
    this.file.set(null); this.parsed.set(null); this.saved.set([]); this.results.set([]); this.job.set(null); this.uploadRef.set(null);
    this.campaignId.set(null); this.step.set(1); this.page.set(1); this.error.set(''); this.view.set('new');
  }

  /* ---------- jobs ---------- */
  setJobFilter(f: JobFilter): void { this.jobFilter.set(f); }
  setJobQuery(e: Event): void { this.jobQuery.set((e.target as HTMLInputElement).value); }
  openJob(j: CheckJobDto): void {
    this.view.set('new');
    this.file.set(null);
    this.parsed.set(null);
    this.saved.set([]);
    this.results.set([]);
    this.error.set('');
    this.job.set(j);
    this.step.set(3);
    this.follow(j.jobNumber || j.id);
  }
  cancelJob(j: CheckJobDto, e: Event): void {
    e.stopPropagation();
    this.api.cancelJob(j.jobNumber || j.id).subscribe({
      next: () => { this.flash('Cancel requested.'); this.loadJobs(); },
      error: (er: unknown) => this.error.set(apiErrorMessage(er))
    });
  }

  /* ---------- report actions ---------- */
  /** The server's results file when there is a check; otherwise (saved answers only) a CSV built here. */
  exportReport(): void {
    const j = this.job();
    if (j) {
      this.api.jobFile(j.jobNumber || j.id, 'results').subscribe({
        next: (f) => saveBlob(f.blob, f.fileName),
        error: (e: unknown) => this.error.set(apiErrorMessage(e))
      });
      return;
    }
    const lines = ['Number,On WhatsApp,Note', ...this.results().map((r) =>
      [r.number, r.whatsApp === 'unknown' ? 'Unknown' : r.whatsApp === 'yes' ? 'Yes' : 'No', csv(r.note)].join(','))];
    saveBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `number-check-${(this.file()?.name ?? 'report').replace(/\.\w+$/, '')}.csv`);
  }
  /** WhatsApp Messages, with the recipient list narrowed to this check. */
  messageNumbers(): void {
    const j = this.job();
    this.router.navigate([MESSAGES_PATH], j ? { queryParams: { job: j.id } } : {});
  }
  copy(text: string): void { navigator.clipboard?.writeText(text).then(() => this.flash('Copied.')); }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.menu.set(null); }
}