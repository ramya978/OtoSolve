import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { PaymentApiService } from '../../../Service/payment-api.service';
import { PaymentActivityRow, PaymentActivitySummary } from '../../../Shared/models/payment.model';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { fetchAllPages } from '../../../Shared/services/paging';
import { map } from 'rxjs';

export type PaymentStatus = 'successful' | 'pending' | 'failed';

export interface ReceiptRow {

  ref: string;
  subRef: string | null;
  donor: string | null;
  email: string | null;
  /** Whole rupees. */
  amount: number;
  status: PaymentStatus;
  receivedAt: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmtDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

export const inr = (n: number): string =>
  'INR ' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const inrCompact = (n: number): string => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

function toRow(r: PaymentActivityRow): ReceiptRow {
  const k = (r.paymentStatus ?? '').toLowerCase();
  const status: PaymentStatus = k.startsWith('succ') ? 'successful' : k.startsWith('fail') ? 'failed' : 'pending';
  const issued = !!r.receiptNumber;
  return {
    ref: issued ? r.receiptNumber! : r.eventReference,
    subRef: issued ? r.receiptNumber : (r.receiptOrIntentReference || null),
    donor: r.donorName,
    email: r.donorEmail,
    amount: r.amount?.amount ?? 0,
    status,
    receivedAt: new Date(r.occurredAtUtc ?? Date.now())
  };
}

export interface StatCard {
  label: string;
  value: string;
  note: string;
  tone: 'ink' | 'accent' | 'teal' | 'blue' | 'red';
  icon: 'calendar' | 'rupee' | 'check' | 'clock' | 'x';
}

function toStats(rows: ReceiptRow[], summary: PaymentActivitySummary | null): StatCard[] {
  const count = (st: PaymentStatus) => rows.filter((r) => r.status === st).length;
  return [
    { label: 'Total events', value: String(summary?.totalEvents ?? rows.length), note: 'In selected scope', tone: 'ink', icon: 'calendar' },
    { label: 'Total amount', value: inrCompact(summary?.totalAmount?.amount ?? rows.reduce((t, r) => t + r.amount, 0)), note: 'In selected scope', tone: 'accent', icon: 'rupee' },
    { label: 'Successful', value: String(summary?.successful ?? count('successful')), note: 'Receipt sent', tone: 'teal', icon: 'check' },
    { label: 'Pending', value: String(summary?.pending ?? count('pending')), note: 'Awaiting payment', tone: 'blue', icon: 'clock' },
    { label: 'Failed', value: String(summary?.failed ?? count('failed')), note: 'Needs retry', tone: 'red', icon: 'x' }
  ];
}

const ICON_PATHS: Record<string, string> = {
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
  check: 'M20 6 9 17l-5-5',
  rupee: 'M6 3h12 M6 8h12 M6 13l8.5 8 M6 13h3 M9 13c6.667 0 6.667-10 0-10',
  clock: 'M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0 M12 6v6l4 2',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  x: 'M18 6 6 18 M6 6l12 12',
  search: 'M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0 M21 21l-4.35-4.35',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chev: 'M6 9l6 6 6-6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  tick: 'M20 6 9 17l-5-5'
};

const TONE_COLORS: Record<string, string> = {
  ink: 'var(--ink)',
  accent: 'var(--orange)',
  teal: 'var(--teal)',
  blue: 'var(--blue)',
  red: 'var(--red)'
};

@Component({
  selector: 'app-payments-receipts',
  imports:[PageHeader],
  templateUrl: './payments-receipts.html',
  styleUrls: ['./payments-receipts.css', '../../../Shared/layout/page-header/page-header.css']
})
export class PaymentsReceipts implements OnInit {
  private readonly api = inject(PaymentApiService);
  private readonly rows = signal<ReceiptRow[]>([]);
  private readonly summary = signal<PaymentActivitySummary | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  protected readonly inr = inr;
  protected readonly fmtDate = fmtDate;
  readonly query = signal('');
  readonly statusFilter = signal<'all' | PaymentStatus>('all');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly selected = signal<ReceiptRow | null>(null);

  private readonly statsC = computed(() => toStats(this.rows(), this.summary()));
  get stats(): StatCard[] { return this.statsC(); }
  get total(): number { return this.summary()?.totalEvents ?? this.rows().length; }

  ngOnInit(): void {
    this.loading.set(true);
    let summary: PaymentActivitySummary | null = null;
    fetchAllPages((page, size) => this.api.getPaymentActivity({ page, pageSize: size }).pipe(
      map((r) => { summary = r.summary; return r.rows; })
    )).subscribe({
      next: (items) => {
        this.summary.set(summary);
        this.rows.set(items.map(toRow));
        this.loading.set(false);
      },
      error: (e: unknown) => { this.loading.set(false); this.loadError.set(apiErrorMessage(e)); }
    });
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const status = this.statusFilter();
    return this.rows().filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (!q ||
          [r.ref, r.subRef ?? '', r.donor ?? '', r.email ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));

  /** Current page kept inside 1..totalPages (a filter or page-size change can shrink the page count). */
  readonly pageSafe = computed(() => Math.min(Math.max(1, this.page()), this.totalPages()));

  readonly pageRows = computed(() => {
    const start = (this.pageSafe() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  /** Page buttons with gaps: 1 2 … 9 (0 = "…"). Up to 7 pages are all shown. */
  readonly pages = computed<number[]>(() => {
    const total = this.totalPages();
    const cur = this.pageSafe();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: number[] = [1];
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    if (start > 2) out.push(0);
    for (let p = start; p <= end; p++) out.push(p);
    if (end < total - 1) out.push(0);
    out.push(total);
    return out;
  });

  readonly from = computed(() => (this.filtered().length === 0 ? 0 : (this.pageSafe() - 1) * this.pageSize() + 1));
  readonly to = computed(() => Math.min(this.pageSafe() * this.pageSize(), this.filtered().length));

  // ---- rows-per-page dropdown ----
  readonly rowOpts = [10, 25, 50];
  readonly openDd = signal<'rows' | null>(null);

  toggleDd(key: 'rows', event: Event): void {
    event.stopPropagation();
    this.openDd.update((cur) => (cur === key ? null : key));
  }

  pickRows(n: number): void {
    this.pageSize.set(n);
    this.page.set(1);
    this.openDd.set(null);
  }

  goPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.totalPages()));
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.openDd.set(null);
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  setStatus(value: string): void {
    this.statusFilter.set(value as 'all' | PaymentStatus);
    this.page.set(1);
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
  }

  close(): void {
    this.selected.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.openDd()) this.openDd.set(null);
    else this.close();
  }

  iconPath(name: string): string {
    return ICON_PATHS[name] ?? '';
  }

  toneColor(tone: string): string {
    return TONE_COLORS[tone] ?? TONE_COLORS['ink'];
  }

  /** Two-letter initials for the donor avatar ("Meera Iyer" -> "MI"). */
  initials(name: string | null): string {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  /** Stable avatar colour per donor name. */
  avatarTone(name: string | null): string {
    if (!name) return 'av-none';
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
    return 'av-' + (h % 4);
  }

  /** Small grey line under the reference. */
  refNote(r: ReceiptRow): string {
    if (r.status === 'successful') return 'Receipt number';
    return r.subRef ? 'Intent · ' + r.subRef : 'No intent reference';
  }

  statusLabel(status: PaymentStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  statusIcon(status: PaymentStatus): string {
    return status === 'successful' ? 'check-circle' : status === 'pending' ? 'clock' : 'x';
  }

  badgeTone(status: PaymentStatus): string {
    return status === 'successful' ? 'teal' : status === 'pending' ? 'amber' : 'red';
  }

  /** Receipt state derived from payment + receipt number.
   *  - successful + RCPT ref  -> Issued (green)
   *  - successful + evt_ ref  -> Awaiting issue (brown) : payment received, receipt not yet generated
   *  - pending               -> Not issued (dark) : awaiting payment
   *  - failed                -> Not applicable (grey) : payment failed */
  receiptState(r: ReceiptRow): 'issued' | 'awaiting-issue' | 'not-issued' | 'not-applicable' {
    if (r.status === 'successful') {
      return r.ref.startsWith('RCPT') ? 'issued' : 'awaiting-issue';
    }
    return r.status === 'pending' ? 'not-issued' : 'not-applicable';
  }

  receiptTitle(r: ReceiptRow): string {
    const s = this.receiptState(r);
    return s === 'issued'
      ? 'Issued'
      : s === 'awaiting-issue'
        ? 'Awaiting issue'
        : s === 'not-issued'
          ? 'Not issued'
          : 'Not applicable';
  }

  receiptSub(r: ReceiptRow): string {
    const s = this.receiptState(r);
    return s === 'issued'
      ? r.ref
      : s === 'awaiting-issue'
        ? 'Payment received'
        : s === 'not-issued'
          ? 'Awaiting payment'
          : 'Payment failed';
  }

  receiptNote(r: ReceiptRow): string {
    const s = this.receiptState(r);
    return s === 'issued'
      ? `Issued - ${r.ref} · sent to the donor`
      : s === 'awaiting-issue'
        ? 'Payment received - receipt awaiting issue'
        : s === 'not-issued'
          ? 'Not issued yet - awaiting payment'
          : 'Not applicable - payment failed, retry required';
  }
}