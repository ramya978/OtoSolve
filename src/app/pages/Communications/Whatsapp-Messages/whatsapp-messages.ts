import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { WatiMessageDto, WhatsAppApiService, WhatsAppOverviewDto, WatiTemplateDto, WatiRecipientDto, WatiRecipientFacetsDto, SelectedRecipientDto, SendReviewDto, WatiRecipientFilterDto, SendBroadcastDto, ParameterBindingDto } from '../../../Service/whatsapp-api.service';
import { rowsOf, totalOf, when, VERIFY_PATH, csv, saveBlob } from '../../../Shared/services/wa-utils';


type Tab = 'send' | 'log';
type MsgStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'skipped';
type StatusFilter = 'all' | MsgStatus;
type Menu = 'template' | 'source' | 'fBroadcast' | 'fTemplate' | 'rows' | `var:${string}` | null;
/** Where a template value comes from: typed once for everybody, or each person's own name / number. */
type ValueSource = 'typed' | 'contactName' | 'phoneNumber';

const REC_PAGE = 50;

const ICONS: Record<string, string> = {
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  check: 'M20 6 9 17l-5-5',
  checks: 'M2 12.5l4.5 4.5L15 8.5 M10 15.5l1.5 1.5L20 8.5',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  chev: 'M6 9l6 6 6-6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
  x: 'M18 6 6 18 M6 6l12 12',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  reply: 'M9 17l-5-5 5-5 M4 12h11a5 5 0 0 1 5 5v2',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  back: 'M15 18l-6-6 6-6'
};

const STATUS_LABEL: Record<MsgStatus, string> = {
  pending: 'Pending', sent: 'Sent', delivered: 'Delivered', read: 'Read', replied: 'Replied', failed: 'Failed', skipped: 'Skipped'
};
const STATUS_TONE: Record<MsgStatus, string> = {
  pending: 'amber', sent: 'blue', delivered: 'primary', read: 'green', replied: 'green', failed: 'red', skipped: ''
};
/** How far a message got - a read message was also delivered and sent. */
const REACHED: Record<MsgStatus, number> = { pending: 0, failed: 0, skipped: 0, sent: 1, delivered: 2, read: 3, replied: 4 };
const statusOf = (m: WatiMessageDto): MsgStatus => {
  const s = String(m.status ?? '').toLowerCase() as MsgStatus;
  return s in STATUS_LABEL ? s : 'pending';
};

/** WhatsApp Messages: send an approved template to checked numbers, then follow delivery, reads and replies. */
@Component({
  selector: 'app-whatsapp-messages',
  imports: [PageHeader],
  templateUrl: './whatsapp-messages.html',
  styleUrls: ['../wa-shared.css', './whatsapp-messages.css', '../../../Shared/layout/page-header/page-header.css']
})
export class WhatsappMessages implements OnInit {
  private readonly api = inject(WhatsAppApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rowOptions = [25, 50, 100];
  protected readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time zone';
  protected readonly sources: { value: ValueSource; label: string; hint: string }[] = [
    { value: 'typed', label: 'Type a value', hint: 'Same for everybody' },
    { value: 'contactName', label: 'Contact name', hint: "Each person's own name" },
    { value: 'phoneNumber', label: 'Phone number', hint: "Each person's own number" }
  ];

  /* ---------- page ---------- */
  protected readonly tab = signal<Tab>('send');
  protected readonly overview = signal<WhatsAppOverviewDto | null>(null);
  protected readonly error = signal('');
  protected readonly toast = signal('');
  protected readonly menu = signal<Menu>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- send: template ---------- */
  protected readonly templates = signal<WatiTemplateDto[]>([]);
  protected readonly templatesLoading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly templateName = signal<string | null>(null);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly bind = signal<Record<string, ValueSource>>({});
  protected readonly broadcastName = signal('');

  /* ---------- send: recipients (paged on the server) ---------- */
  protected readonly pool = signal<WatiRecipientDto[]>([]);
  protected readonly facets = signal<WatiRecipientFacetsDto | null>(null);
  protected readonly poolLoading = signal(true);
  protected readonly recTotal = signal(0);
  protected readonly recPage = signal(1);
  protected readonly recQuery = signal('');
  protected readonly recJob = signal<string | null>(null);
  protected readonly selected = signal<Map<string, SelectedRecipientDto>>(new Map());
  protected readonly matching = signal(false);

  /* ---------- send: review + send ---------- */
  protected readonly tried = signal(false);
  protected readonly reviewing = signal(false);
  protected readonly review = signal<SendReviewDto | null>(null);
  protected readonly sending = signal(false);

  /* ---------- delivered & read ---------- */
  protected readonly messages = signal<WatiMessageDto[]>([]);
  protected readonly messagesLoading = signal(false);
  protected readonly fBroadcast = signal<string | null>(null);
  protected readonly fTemplate = signal<string | null>(null);
  protected readonly status = signal<StatusFilter>('all');
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly rows = signal(25);
  protected readonly detail = signal<WatiMessageDto | null>(null);

  /* ---------- settings ---------- */
  private readonly settings = computed(() => this.overview()?.settings ?? null);
  protected readonly stats = computed(() => this.overview()?.statistics ?? null);
  protected readonly maxPerSend = computed(() => this.settings()?.maxRecipientsPerSend || 1000);
  /** Why sending is not possible right now ('' when it is). Unknown (still loading) counts as fine. */
  protected readonly sendBlocked = computed(() => {
    const o = this.overview();
    if (!o) return '';
    if (!o.integrationAvailable) return 'The integration worker has not been set up for this database yet, so nothing can be sent.';
    if (!o.settings.watiEnabled) return 'Sending through Wati is switched off in the settings.';
    if (!o.settings.watiConfigured) return 'Wati is not configured yet, so nothing can be sent.';
    if (!o.settings.manualBroadcastsAllowed) return 'Sending broadcasts by hand is not allowed in the settings.';
    return '';
  });
  protected readonly workerOffline = computed(() => !!this.overview() && !this.overview()!.worker.online);

  /* ---------- derived: template ---------- */
  protected readonly template = computed(() => this.templates().find((t) => t.name === this.templateName()) ?? null);
  protected readonly variables = computed(() => this.template()?.variables ?? []);
  protected readonly preview = computed(() => {
    const t = this.template();
    if (!t) return '';
    const v = this.values(), b = this.bind();
    return (t.body || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => {
      if (b[key] === 'contactName') return '‹contact name›';
      if (b[key] === 'phoneNumber') return '‹phone number›';
      return v[key]?.trim() ? v[key].trim() : m;
    });
  });
  protected readonly missingValues = computed(() =>
    this.variables().filter((k) => (this.bind()[k] ?? 'typed') === 'typed' && !this.values()[k]?.trim()));

  /* ---------- derived: recipients ---------- */
  protected readonly poolSize = computed(() => this.facets()?.poolSize ?? this.recTotal());
  protected readonly recPages = computed(() => Math.max(1, Math.ceil(this.recTotal() / REC_PAGE)));
  protected readonly recRange = computed(() => {
    const n = this.recTotal();
    return { from: n ? (this.recPage() - 1) * REC_PAGE + 1 : 0, to: Math.min(this.recPage() * REC_PAGE, n), n };
  });
  protected readonly sourceLabel = computed(() => {
    const id = this.recJob();
    const j = this.facets()?.jobs.find((x) => x.id === id);
    return id ? (j ? `${j.jobNumber} · ${j.fileName}` : 'One check') : 'All checks';
  });
  protected readonly allShown = computed(() => {
    const r = this.pool();
    return r.length > 0 && r.every((c) => this.selected().has(c.number));
  });
  protected readonly someShown = computed(() => !this.allShown() && this.pool().some((c) => this.selected().has(c.number)));
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly overLimit = computed(() => this.selectedCount() > this.maxPerSend());

  protected readonly sendErrors = computed(() => ({
    name: !this.broadcastName().trim() ? 'Give this send a name.' : '',
    template: !this.templateName() ? 'Pick a template.' : '',
    values: this.missingValues().length ? `Fill in ${this.missingValues().join(', ')}.` : '',
    recipients: !this.selectedCount() ? 'Pick at least one number.' : this.overLimit() ? `One send can hold at most ${this.maxPerSend()} numbers.` : ''
  }));
  protected readonly canReview = computed(() => !this.reviewing() && !this.sendBlocked() && !Object.values(this.sendErrors()).some(Boolean));

  /* ---------- derived: delivered & read ---------- */
  protected readonly broadcasts = computed(() => [...new Set(this.messages().map((m) => m.broadcastName).filter(Boolean))].sort());
  protected readonly templateLabels = computed(() => [...new Set(this.messages().map((m) => m.templateLabel || m.templateName).filter(Boolean))].sort());
  /** Messages matching the broadcast + template dropdowns (status tabs and search come after). */
  private readonly scoped = computed(() => {
    const b = this.fBroadcast(), t = this.fTemplate();
    return this.messages().filter((m) => (!b || m.broadcastName === b) && (!t || (m.templateLabel || m.templateName) === t));
  });
  protected readonly funnel = computed(() => {
    const l = this.scoped().filter((m) => statusOf(m) !== 'skipped');
    const total = l.length;
    const reached = (n: number) => l.filter((m) => REACHED[statusOf(m)] >= n).length;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const steps = [
      { key: 'sent', label: 'Sent', n: reached(1) },
      { key: 'delivered', label: 'Delivered', n: reached(2) },
      { key: 'read', label: 'Read', n: reached(3) },
      { key: 'replied', label: 'Replied', n: reached(4) }
    ].map((s) => ({ ...s, pct: pct(s.n) }));
    return { total, steps, pending: l.filter((m) => statusOf(m) === 'pending').length, failed: l.filter((m) => statusOf(m) === 'failed').length };
  });
  protected readonly statusCounts = computed(() => {
    const out: Record<StatusFilter, number> = { all: 0, pending: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0 };
    for (const m of this.scoped()) { out.all++; out[statusOf(m)]++; }
    return out;
  });
  /** Skipped only shows as a tab when there is something in it. */
  protected readonly statusTabs = computed<StatusFilter[]>(() => {
    const base: StatusFilter[] = ['all', 'pending', 'sent', 'delivered', 'read', 'replied', 'failed'];
    return this.statusCounts().skipped ? [...base, 'skipped'] : base;
  });
  protected readonly list = computed(() => {
    const s = this.status();
    const q = this.query().trim().toLowerCase();
    return this.scoped()
      .filter((m) => s === 'all' || statusOf(m) === s)
      .filter((m) => !q || `${m.number} ${m.contactName ?? ''} ${m.broadcastName} ${m.templateLabel} ${m.country}`.toLowerCase().includes(q))
      .sort((a, b) => this.lastAt(b).localeCompare(this.lastAt(a)));
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.list().length / this.rows())));
  protected readonly safePage = computed(() => Math.min(this.page(), this.pages()));
  protected readonly range = computed(() => {
    const n = this.list().length;
    return { from: n ? (this.safePage() - 1) * this.rows() + 1 : 0, to: Math.min(this.safePage() * this.rows(), n), n };
  });
  protected readonly pageList = computed(() => {
    const total = this.pages(), cur = this.safePage();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const out: number[] = [1];
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) out.push(p);
    out.push(total);
    return out;
  });
  protected readonly pageRows = computed(() => {
    const s = (this.safePage() - 1) * this.rows();
    return this.list().slice(s, s + this.rows());
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer) clearTimeout(this.toastTimer);
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
    // "Message these numbers" on Number Verification opens this page narrowed to that check.
    this.recJob.set(this.route.snapshot.queryParamMap.get('job'));
    this.load();
  }

  /** Load everything the page shows. Each part loads on its own, so one failing call never blanks the page. */
  load(): void {
    this.error.set('');
    this.api.overview().subscribe({
      next: (o) => {
        this.overview.set(o ?? null);
        const s = o?.settings;
        if (s?.defaultBroadcastName && !this.broadcastName()) this.broadcastName.set(s.defaultBroadcastName);
        if (s?.defaultTemplateName && !this.templateName()) this.applyDefaultTemplate(s.defaultTemplateName);
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e))
    });
    this.loadTemplates();
    this.loadPool();
    this.loadMessages();
  }
  private loadTemplates(): void {
    this.templatesLoading.set(true);
    this.api.templates().subscribe({
      next: (t) => {
        this.templates.set(rowsOf<WatiTemplateDto>(t));
        this.templatesLoading.set(false);
        const d = this.settings()?.defaultTemplateName;
        if (d && !this.templateName()) this.applyDefaultTemplate(d);
      },
      error: (e: unknown) => { this.templatesLoading.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }
  private applyDefaultTemplate(name: string): void {
    const t = this.templates().find((x) => x.name === name);
    if (t) this.pickTemplate(t);
  }
  private filter(): WatiRecipientFilterDto {
    return { page: this.recPage(), pageSize: REC_PAGE, search: this.recQuery().trim() || null, jobId: this.recJob() };
  }
  loadPool(): void {
    this.poolLoading.set(true);
    this.api.recipients(this.filter()).subscribe({
      next: (r) => {
        this.pool.set(rowsOf<WatiRecipientDto>(r?.results));
        this.recTotal.set(totalOf(r?.results));
        this.facets.set(r?.facets ?? null);
        this.poolLoading.set(false);
      },
      error: (e: unknown) => { this.poolLoading.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }
  loadMessages(): void {
    this.messagesLoading.set(true);
    this.api.messages().subscribe({
      next: (m) => { this.messages.set(rowsOf<WatiMessageDto>(m)); this.messagesLoading.set(false); },
      error: (e: unknown) => { this.messagesLoading.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }

  /* ---------- helpers ---------- */
  icon(n: string): string { return ICONS[n] ?? ''; }
  when(iso: string | null | undefined): string { return when(iso); }
  pct(n: number | null | undefined): string { return `${Math.round(Number(n ?? 0))}%`; }
  paramKey(p: string): string { return '{{' + p + '}}'; }
  st(m: WatiMessageDto): MsgStatus { return statusOf(m); }
  statusLabel(s: StatusFilter): string { return s === 'all' ? 'All' : STATUS_LABEL[s]; }
  statusTone(s: MsgStatus): string { return STATUS_TONE[s]; }
  reached(m: WatiMessageDto, n: number): boolean { return REACHED[statusOf(m)] >= n; }
  lastAt(m: WatiMessageDto): string { return m.repliedAtUtc || m.readAtUtc || m.deliveredAtUtc || m.sentAtUtc || m.createdAtUtc || ''; }
  reasons(by: Record<string, number> | null | undefined): { key: string; n: number }[] {
    return Object.entries(by ?? {}).filter(([, n]) => n > 0).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  }
  reasonText(key: string): string { return key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase()); }

  /* ---------- tabs + menus ---------- */
  setTab(t: Tab): void { this.tab.set(t); this.menu.set(null); if (t === 'log') this.loadMessages(); }
  toggle(m: Exclude<Menu, null>, e: Event): void { e.stopPropagation(); this.menu.set(this.menu() === m ? null : m); }
  goVerify(): void { this.router.navigate([VERIFY_PATH]); }

  /* ---------- send: template ---------- */
  pickTemplate(t: WatiTemplateDto): void {
    this.templateName.set(t.name);
    const v: Record<string, string> = {};
    const b: Record<string, ValueSource> = {};
    for (const k of t.variables ?? []) {
      v[k] = t.defaults?.[k] ?? '';
      b[k] = /^(name|contact_?name|first_?name|full_?name)$/i.test(k) ? 'contactName' : 'typed';
    }
    this.values.set(v);
    this.bind.set(b);
    this.review.set(null);
    this.menu.set(null);
  }
  refreshTemplates(): void {
    this.refreshing.set(true);
    this.api.refreshTemplates().subscribe({
      next: () => {
        this.flash('Asked Wati for the latest templates - the list updates in a few seconds.');
        setTimeout(() => { this.refreshing.set(false); this.loadTemplates(); }, 5000);
      },
      error: (e: unknown) => { this.refreshing.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }
  setValue(k: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.values.update((x) => ({ ...x, [k]: v }));
    this.review.set(null);
  }
  setSource(k: string, s: ValueSource): void { this.bind.update((x) => ({ ...x, [k]: s })); this.review.set(null); this.menu.set(null); }
  /** The small "Typed / Contact name / Phone number" menu beside each template value. */
  toggleVar(k: string, e: Event): void { e.stopPropagation(); const m = `var:${k}` as const; this.menu.set(this.menu() === m ? null : m); }
  isVarOpen(k: string): boolean { return this.menu() === `var:${k}`; }
  sourceText(k: string): string { return this.sources.find((s) => s.value === this.sourceOf(k))?.label ?? 'Type a value'; }
  sourceOf(k: string): ValueSource { return this.bind()[k] ?? 'typed'; }
  hasValue(k: string): boolean { return !!(this.values()[k] ?? '').trim(); }
  setBroadcastName(e: Event): void { this.broadcastName.set((e.target as HTMLInputElement).value); }

  /* ---------- send: recipients ---------- */
  setRecQuery(e: Event): void {
    this.recQuery.set((e.target as HTMLInputElement).value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.recPage.set(1); this.loadPool(); }, 300);
  }
  pickSource(jobId: string | null): void { this.recJob.set(jobId); this.recPage.set(1); this.menu.set(null); this.loadPool(); }
  goRecPage(p: number): void { const n = Math.min(this.recPages(), Math.max(1, p)); if (n !== this.recPage()) { this.recPage.set(n); this.loadPool(); } }
  isPicked(n: string): boolean { return this.selected().has(n); }
  togglePick(c: WatiRecipientDto): void {
    const s = new Map(this.selected());
    if (s.has(c.number)) s.delete(c.number);
    else s.set(c.number, { number: c.number, sourceJobId: c.jobId, contactName: c.contactName ?? null });
    this.selected.set(s);
    this.review.set(null);
  }
  /** Tick / untick every number on this page. */
  toggleShown(): void {
    const s = new Map(this.selected());
    const all = this.allShown();
    for (const c of this.pool()) {
      if (all) s.delete(c.number);
      else s.set(c.number, { number: c.number, sourceJobId: c.jobId, contactName: c.contactName ?? null });
    }
    this.selected.set(s);
    this.review.set(null);
  }
  /** Every number that matches the search and source, up to what one send may hold. */
  selectAllMatching(): void {
    this.matching.set(true);
    this.api.matchingRecipients(this.filter(), this.maxPerSend()).subscribe({
      next: (r) => {
        const s = new Map(this.selected());
        for (const c of rowsOf<{ number: string; jobId: string; contactName?: string | null }>(r?.recipients)) {
          s.set(c.number, { number: c.number, sourceJobId: c.jobId, contactName: c.contactName ?? null });
        }
        this.selected.set(s);
        this.matching.set(false);
        this.review.set(null);
        this.flash(r && r.totalMatching > r.limit
          ? `Picked the first ${r.limit} of ${r.totalMatching} - one send holds at most ${r.limit}.`
          : `Picked ${r?.totalMatching ?? 0} number${r?.totalMatching === 1 ? '' : 's'}.`);
      },
      error: (e: unknown) => { this.matching.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }
  clearPicks(): void { this.selected.set(new Map()); this.review.set(null); }

  /* ---------- send: review, then send ---------- */
  private request(): SendBroadcastDto {
    const t = this.template()!;
    const values: Record<string, string> = {};
    const bindings: ParameterBindingDto[] = [];
    for (const k of t.variables ?? []) {
      const src = this.sourceOf(k);
      if (src === 'typed') values[k] = (this.values()[k] ?? '').trim();
      else bindings.push({ name: k, source: src });
    }
    return {
      templateName: t.name,
      templateLabel: t.label || null,
      broadcastName: this.broadcastName().trim(),
      values,
      bindings,
      campaignId: null,
      selection: [...this.selected().values()]
    };
  }
  /** Ask the server what this send would do. Nothing is queued yet. */
  reviewSend(): void {
    this.tried.set(true);
    if (!this.canReview()) return;
    this.reviewing.set(true);
    this.error.set('');
    this.api.reviewSend(this.request()).subscribe({
      next: (r) => { this.reviewing.set(false); this.review.set(r ?? null); },
      error: (e: unknown) => { this.reviewing.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }
  backToEdit(): void { this.review.set(null); }
  confirmSend(): void {
    const r = this.review();
    if (!r || !r.summary.willSend || this.sending()) return;
    this.sending.set(true);
    this.api.sendBroadcast(this.request()).subscribe({
      next: (c) => {
        this.sending.set(false);
        this.flash(`Send queued for ${r.summary.willSend} number${r.summary.willSend === 1 ? '' : 's'}${c?.reference ? ' · ' + c.reference : ''}.`);
        this.tried.set(false);
        this.review.set(null);
        this.clearPicks();
        this.broadcastName.set(this.settings()?.defaultBroadcastName ?? '');
        this.api.overview().subscribe({ next: (o) => this.overview.set(o ?? null), error: () => undefined });
        this.setTab('log');
        setTimeout(() => this.loadMessages(), 4000); // the worker records the messages a moment later
      },
      error: (e: unknown) => { this.sending.set(false); this.error.set(apiErrorMessage(e)); }
    });
  }

  /* ---------- delivered & read ---------- */
  pickBroadcast(b: string | null): void { this.fBroadcast.set(b); this.page.set(1); this.menu.set(null); }
  pickTemplateFilter(t: string | null): void { this.fTemplate.set(t); this.page.set(1); this.menu.set(null); }
  setStatus(s: StatusFilter): void { this.status.set(s); this.page.set(1); }
  setQuery(e: Event): void { this.query.set((e.target as HTMLInputElement).value); this.page.set(1); }
  setRows(n: number): void { this.rows.set(n); this.page.set(1); this.menu.set(null); }
  goPage(p: number): void { this.page.set(Math.min(this.pages(), Math.max(1, p))); }
  openDetail(m: WatiMessageDto): void { this.detail.set(m); }
  closeDetail(): void { this.detail.set(null); }

  /** The rows on screen (all pages), as a CSV. */
  exportCsv(): void {
    const lines = ['Number,Name,Country,Broadcast,Template,Status,Sent,Delivered,Read,Replied,Failure',
      ...this.list().map((m) => [m.number, csv(m.contactName), csv(m.country), csv(m.broadcastName), csv(m.templateLabel || m.templateName),
        STATUS_LABEL[statusOf(m)], csv(m.sentAtUtc), csv(m.deliveredAtUtc), csv(m.readAtUtc), csv(m.repliedAtUtc),
        csv(m.failedReason || m.skipReason)].join(','))];
    saveBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'whatsapp-messages.csv');
  }
  copy(text: string): void { navigator.clipboard?.writeText(text).then(() => this.flash('Copied.')); }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3000);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.menu.set(null); this.detail.set(null); }
}