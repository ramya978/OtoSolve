import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CAMPAIGNS, LC_ICONS, LC_PATHS, TEMPLATE_COLUMNS } from '../lc-shared';

type Step = 1 | 2 | 3;

/** One spreadsheet row after mapping to the template columns. */
interface UploadRow {
  n: number;
  v: Record<string, string>;
  errors: string[];
}

const MAX_BYTES = 10 * 1024 * 1024;
const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CAMPAIGN_CODES = new Set(CAMPAIGNS.map((c) => c.value));

/** "First name", "first_name", "FirstName" -> "firstname" for header matching. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

@Component({
  selector: 'app-lead-capture-bulk',
  imports: [RouterLink],
  templateUrl: './lead-capture-bulk.html',
  styleUrl: './lead-capture-bulk.css',
})
export class LeadCaptureBulk {
  protected readonly columns = TEMPLATE_COLUMNS;
  protected readonly queuePath = LC_PATHS.queue;
  protected readonly steps: { no: Step; label: string; hint: string }[] = [
    { no: 1, label: 'Attach a file', hint: 'CSV or XLSX' },
    { no: 2, label: 'Review the rows', hint: 'Fix or skip errors' },
    { no: 3, label: 'Import', hint: 'Add to the queue' },
  ];

  protected readonly step = signal<Step>(1);
  protected readonly file = signal<{ name: string; size: number; kind: 'csv' | 'xlsx' } | null>(null);
  protected readonly rows = signal<UploadRow[]>([]);
  protected readonly fileError = signal('');
  protected readonly dragOver = signal(false);
  protected readonly errorsOnly = signal(false);
  protected readonly importing = signal(false);
  protected readonly result = signal<{ imported: number; skipped: number } | null>(null);
  /** Header names in the file that did not match any template column. */
  protected readonly unknownHeaders = signal<string[]>([]);

  protected readonly okCount = computed(() => this.rows().filter((r) => !r.errors.length).length);
  protected readonly badCount = computed(() => this.rows().length - this.okCount());
  protected readonly shownRows = computed(() => (this.errorsOnly() ? this.rows().filter((r) => r.errors.length) : this.rows()));

  icon(n: string): string { return LC_ICONS[n] ?? ''; }

  size(bytes: number): string {
    return bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ---------- step 1: attach ----------
  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragOver.set(true); }
  onDragLeave(): void { this.dragOver.set(false); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.take(f);
  }

  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.take(f);
    input.value = '';
  }

  private take(f: File): void {
    this.fileError.set('');
    const kind = /\.csv$/i.test(f.name) ? 'csv' : /\.xlsx$/i.test(f.name) ? 'xlsx' : null;
    if (!kind) { this.fileError.set('Use a .csv or .xlsx file.'); return; }
    if (f.size > MAX_BYTES) { this.fileError.set('The file is larger than 10 MB.'); return; }
    this.file.set({ name: f.name, size: f.size, kind });
    if (kind === 'xlsx') {
      // XLSX is checked on the server; no row preview in the browser.
      this.rows.set([]);
      this.unknownHeaders.set([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.load(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  /** Small built-in sample so the flow can be tried without a file. */
  useSample(): void {
    const lines = [
      TEMPLATE_COLUMNS.map((c) => c.label).join(','),
      'Anita,Raman,9876543210,anita.raman@example.com,English (India),Chennai,HAI-DAYCARE-2026,Website,Met at the Chennai donor meet',
      'Karthik,Iyer,9845012345,karthik.iyer@example.com,Tamil,Coimbatore,HAI-MOBILECARE-2026,Event,',
      'Meera,,9812345678,meera@example,Hindi,Mumbai,HAI-WINTER-2026,Referral,Referred by Priya',
      'Rahul,Menon,12345,rahul.menon@example.com,Malayalam,Kochi,HAI-UNKNOWN,QR poster,',
      'Divya,Nair,+91 98450 33221,,English (India),Bengaluru,HAI-SIGHT-2026,Inbound call,Wants a call on Sunday',
      'Suresh,Pillai,9790011223,suresh.p@example.com,Tamil,Madurai,,WhatsApp,',
    ];
    this.fileError.set('');
    this.file.set({ name: 'sample-leads.csv', size: lines.join('\n').length, kind: 'csv' });
    this.load(lines.join('\n'));
  }

  private load(text: string): void {
    const table = this.parseCsv(text).filter((r) => r.some((c) => c.trim()));
    if (table.length < 2) {
      this.rows.set([]);
      this.fileError.set('No rows found under the header row.');
      return;
    }
    const lookup = new Map<string, string>();
    for (const c of TEMPLATE_COLUMNS) { lookup.set(norm(c.key), c.key); lookup.set(norm(c.label), c.key); }
    const head = table[0].map((h) => lookup.get(norm(h)) ?? '');
    this.unknownHeaders.set(table[0].filter((_, i) => !head[i]).map((h) => h.trim()).filter((h) => h));

    this.rows.set(table.slice(1).map((cells, i) => {
      const v: Record<string, string> = {};
      head.forEach((k, j) => { if (k) v[k] = (cells[j] ?? '').trim(); });
      return { n: i + 2, v, errors: this.check(v) };
    }));
  }

  /** Same rules as the single-lead form, for the columns the template has. */
  private check(v: Record<string, string>): string[] {
    const e: string[] = [];
    if (!v['first_name']) e.push('First name is missing');
    if (!v['last_name']) e.push('Last name is missing');
    const mobile = (v['mobile'] ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!mobile) e.push('Mobile is missing');
    else if (!MOBILE.test(mobile)) e.push('Mobile is not a 10-digit number');
    else v['mobile'] = mobile;
    if (v['email'] && !EMAIL.test(v['email'])) e.push('E-mail is not valid');
    if (v['campaign'] && !CAMPAIGN_CODES.has(v['campaign'])) e.push('Unknown campaign code');
    return e;
  }

  /** CSV with quoted fields ("a, b"), doubled quotes and CRLF line ends. */
  private parseCsv(text: string): string[][] {
    const out: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); out.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out;
  }

  removeFile(): void {
    this.file.set(null);
    this.rows.set([]);
    this.unknownHeaders.set([]);
    this.fileError.set('');
  }

  // ---------- navigation ----------
  canNext(): boolean {
    if (this.step() === 1) return !!this.file() && (this.file()?.kind === 'xlsx' || this.rows().length > 0);
    if (this.step() === 2) return this.file()?.kind === 'xlsx' || this.okCount() > 0;
    return false;
  }

  next(): void {
    if (!this.canNext()) return;
    if (this.step() === 1) { this.errorsOnly.set(false); this.step.set(2); return; }
    if (this.step() === 2) this.runImport();
  }

  back(): void {
    if (this.step() === 2) this.step.set(1);
  }

  goStep(n: Step): void {
    // only steps already reached can be revisited (not the import itself)
    if (n < this.step() && this.step() !== 3) this.step.set(n);
  }

  private runImport(): void {
    this.importing.set(true);
    this.step.set(3);
    window.setTimeout(() => {
      const xlsx = this.file()?.kind === 'xlsx';
      this.result.set({ imported: xlsx ? 0 : this.okCount(), skipped: xlsx ? 0 : this.badCount() });
      this.importing.set(false);
    }, 900);
  }

  startOver(): void {
    this.removeFile();
    this.result.set(null);
    this.importing.set(false);
    this.step.set(1);
  }

  /** Error report for skipped rows (row number + reason), as CSV. */
  downloadErrors(): void {
    const lines = ['Row,First name,Last name,Mobile,Problem'];
    for (const r of this.rows().filter((x) => x.errors.length)) {
      lines.push([r.n, r.v['first_name'] ?? '', r.v['last_name'] ?? '', r.v['mobile'] ?? '', r.errors.join('; ')]
        .map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','));
    }
    this.save('lead-upload-errors.csv', lines.join('\n'));
  }

  // ---------- template ----------
  downloadTemplate(): void {
    const head = TEMPLATE_COLUMNS.map((c) => c.label).join(',');
    const example = TEMPLATE_COLUMNS.map((c) => (c.example.includes(',') ? '"' + c.example + '"' : c.example)).join(',');
    this.save('lead-upload-template.csv', head + '\n' + example + '\n');
  }

  private save(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}