import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FU_ICONS, FollowUp, FollowUpStore, FuExecution, FuMethod, MONTHS, MONTHS_LONG, WEEKDAYS, channelOf, fmtDate, fmtTime,
  initials, isOpen, isoDay, monthWeeks, pad2, priorityOf, toDate
} from '../../../Shared/layout/Donors_Leads/fu-store';

/* =====================================================================================================
   FOLLOW-UP EXECUTION  (route /app/fundraising/relationships/follow-up-queue/execute?id=<follow-up id>)
   Opened from the play button on the Follow-ups list.
   Account-workspace look (same as My profile), theme colour on active states:
   page header (Back) → profile card (who · channel · due · owner | instructions) → facts strip
   (open · completed · overdue · readiness) → brief banner (why this follow-up)
   → icon-row cards: The contact · The result · Notes · Relationship update
   → side: Ready to complete? (checklist · Complete · Cancel) · Relationship readiness ·
     Next follow-up (Yes / No) · Supporting files · Earlier conversations.
   ===================================================================================================== */

type FeMenu = 'date' | 'time' | 'status' | 'reason' | 'outcome' | 'temperature' | 'disposition' | 'manager' | null;
type FeErr = 'method' | 'when' | 'status' | 'reason' | 'outcome' | 'engagement' | 'quality' | 'notes' | 'disposition';
type FeStatus = FuExecution['status'];
type FeTemp = FuExecution['temperature'];

const NOTE_MIN = 20;
const NOTE_MAX = 2000;
const FILE_MAX = 10 * 1024 * 1024;
const FILE_TYPES = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];

@Component({
  selector: 'app-follow-up-execution',
  standalone: true,
  templateUrl: './follow-up-execution.html',
  styleUrls: ['../../../Shared/layout/Donors_Leads/fu-shared.css', './follow-up-execution.css']
})
export class FollowUpExecution {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(FollowUpStore);

  protected readonly queuePath = '/app/fundraising/relationships/follow-up-queue';
  protected readonly planPath = '/app/fundraising/relationships/follow-up-queue/plan';
  protected readonly timelinePath = '/app/fundraising/relationships/communication-timeline';
  protected readonly noteMin = NOTE_MIN;
  protected readonly noteMax = NOTE_MAX;

  /* ---------- options ---------- */
  protected readonly methods: { key: FuMethod; label: string; icon: string }[] = [
    { key: 'call', label: 'Call', icon: 'phone' },
    { key: 'email', label: 'E-mail', icon: 'mail' },
    { key: 'sms', label: 'SMS', icon: 'sms' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
    { key: 'meeting', label: 'Meeting', icon: 'meeting' },
    { key: 'visit', label: 'Visit', icon: 'pin' }
  ];
  protected readonly statuses: { key: FeStatus; label: string; hint: string }[] = [
    { key: 'completed', label: 'Completed', hint: 'The follow-up did what it set out to do' },
    { key: 'partial', label: 'Partially completed', hint: 'Some of it is done, the rest needs another contact' },
    { key: 'no-response', label: 'No response', hint: 'They could not be reached' }
  ];
  protected readonly reasons: Record<FeStatus, string[]> = {
    completed: ['Spoke to the person', 'Questions answered', 'Information shared', 'Visit arranged'],
    partial: ['Asked to call back later', 'Needs to check with family', 'Wants more information', 'Call cut short'],
    'no-response': ['No answer', 'Number switched off', 'Wrong number', 'Message not delivered']
  };
  protected readonly outcomes = ['Interested', 'Visit booked', 'Pledged a gift', 'Gift made', 'Needs more information', 'Not interested'];
  protected readonly engagements: { key: FuExecution['engagement']; label: string; bars: number }[] = [
    { key: 'low', label: 'Low', bars: 1 },
    { key: 'medium', label: 'Medium', bars: 2 },
    { key: 'high', label: 'High', bars: 3 }
  ];
  protected readonly qualities: { key: FuExecution['quality']; label: string }[] = [
    { key: 'poor', label: 'Poor' },
    { key: 'average', label: 'Average' },
    { key: 'good', label: 'Good' },
    { key: 'excellent', label: 'Excellent' }
  ];
  protected readonly temperatures: { key: FeTemp; label: string; tone: string }[] = [
    { key: 'cold', label: 'Cold', tone: 'blue' },
    { key: 'warm', label: 'Warm', tone: 'amber' },
    { key: 'hot', label: 'Hot', tone: 'red' }
  ];
  protected readonly dispositions = ['Keep in touch', 'Ready to qualify', 'Nurture for later', 'Closed - not interested', 'Do not contact'];
  protected readonly timeSlots = Array.from({ length: 48 }, (_, i) => `${pad2(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

  protected readonly now = new Date();
  protected readonly todayIso = isoDay(this.now);

  /* ---------- the follow-up ---------- */
  private readonly id = signal<string | null>(this.route.snapshot.queryParamMap.get('id'));
  protected readonly fu = computed(() => this.store.find(this.id() ?? '') ?? this.store.followUps().find(isOpen) ?? null);
  protected readonly person = computed(() => (this.fu() ? this.store.person(this.fu()!.recordCode) : null));

  /* ---------- form ---------- */
  protected readonly method = signal<FuMethod | null>(null);
  protected readonly date = signal<string>(this.todayIso);
  protected readonly time = signal<string>(`${pad2(this.now.getHours())}:${this.now.getMinutes() < 30 ? '00' : '30'}`);
  protected readonly status = signal<FeStatus | null>(null);
  protected readonly reason = signal<string | null>(null);
  protected readonly outcome = signal<string | null>(null);
  protected readonly engagement = signal<FuExecution['engagement'] | null>(null);
  protected readonly quality = signal<FuExecution['quality'] | null>(null);
  protected readonly notes = signal('');
  protected readonly internal = signal('');
  protected readonly temperature = signal<FeTemp>('warm');
  protected readonly disposition = signal<string | null>(null);
  protected readonly nextContact = signal(false);
  protected readonly files = signal<{ name: string; size: string }[]>([]);
  protected readonly fileError = signal('');
  protected readonly openConv = signal<string | null>(null);

  protected readonly menu = signal<FeMenu>(null);
  protected readonly pickMonth = signal(new Date(this.now.getFullYear(), this.now.getMonth(), 1));
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly toast = signal('');
  protected readonly escOpen = signal(false);
  protected readonly escTo = signal<string | null>(null);
  protected readonly escReason = signal('');
  protected readonly escTried = signal(false);
  protected readonly managers = this.store.managers;

  constructor() {
    const f = this.fu();
    if (f) this.method.set(f.channel === 'post' ? 'visit' : f.channel);
  }

  /* ---------- record figures ---------- */
  protected readonly mine = computed(() => {
    const f = this.fu();
    return f ? this.store.followUps().filter((x) => x.recordCode === f.recordCode) : [];
  });
  protected readonly figures = computed(() => {
    const list = this.mine();
    return {
      open: list.filter(isOpen).length,
      completed: list.filter((x) => !!x.completedAt).length,
      overdue: list.filter((x) => isOpen(x) && x.dueAt.slice(0, 10) < this.todayIso).length
    };
  });
  protected readonly earlier = computed(() =>
    this.mine().filter((x) => !!x.completedAt && x.id !== this.fu()?.id).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
  );

  /* ---------- relationship readiness ---------- */
  protected readonly readiness = computed(() => {
    const checks = [
      { label: 'Communication recorded', ok: this.mine().some((x) => x.history.length > 1) || !!this.method() },
      { label: 'A follow-up completed', ok: this.figures().completed > 0 || this.status() === 'completed' },
      { label: 'Relationship healthy', ok: this.figures().overdue <= 1 },
      { label: 'Temperature hot', ok: this.temperature() === 'hot' },
      { label: 'Interest expressed', ok: ['Interested', 'Visit booked', 'Pledged a gift', 'Gift made'].includes(this.outcome() ?? '') }
    ];
    const done = checks.filter((c) => c.ok).length;
    const score = Math.round(30 + done * 14);
    const state = score >= 70 ? { label: 'Ready', tone: 'green', health: 'Healthy' }
      : score >= 50 ? { label: 'Warming up', tone: 'amber', health: 'Needs attention' }
      : { label: 'Not ready', tone: 'red', health: 'At risk' };
    return { checks, score, state };
  });

  /* ---------- derived ---------- */
  protected readonly when = computed(() => {
    const d = toDate(this.date());
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  });
  protected readonly stage = computed(() => {
    const p = this.person();
    if (!p) return 'Contacted';
    return p.type === 'lead' && ['New', 'Assigned'].includes(p.stage) ? 'Contacted' : p.stage;
  });
  protected readonly stageMoves = computed(() => this.person()?.stage !== this.stage());
  protected readonly futureTime = computed(() => toDate(`${this.date()}T${this.time()}`) > this.now);

  protected readonly errors = computed<Record<FeErr, string>>(() => ({
    method: !this.method() ? 'Choose how the contact was made.' : '',
    when: this.futureTime() ? 'The execution time cannot be in the future.' : '',
    status: !this.status() ? 'Choose a status.' : '',
    reason: !this.reason() ? 'Choose a reason.' : '',
    outcome: !this.outcome() ? 'Choose an outcome.' : '',
    engagement: !this.engagement() ? 'Choose a level.' : '',
    quality: !this.quality() ? 'Choose the quality.' : '',
    notes: this.notes().trim().length < NOTE_MIN ? `Write at least ${NOTE_MIN} characters.` : '',
    disposition: !this.disposition() ? 'Choose a disposition.' : ''
  }));
  protected readonly missing = computed(() => {
    const e = this.errors();
    const m: string[] = [];
    if (e.method) m.push('Contact method');
    if (e.when) m.push('A past time');
    if (e.status) m.push('Execution status');
    if (e.reason) m.push('Completion reason');
    if (e.outcome) m.push('Outcome');
    if (e.engagement) m.push('Engagement');
    if (e.quality) m.push('Quality');
    if (e.notes) m.push('Execution notes');
    if (e.disposition) m.push('Disposition');
    return m;
  });
  /** Side checklist: every required answer, ticked once it is filled in. */
  protected readonly reportChecks = computed(() => {
    const e = this.errors();
    return [
      { label: 'Contact method', ok: !e.method },
      { label: 'Executed date & time', ok: !e.when },
      { label: 'Execution status', ok: !e.status },
      { label: 'Completion reason', ok: !e.reason },
      { label: 'Outcome', ok: !e.outcome },
      { label: 'Engagement level', ok: !e.engagement },
      { label: 'Communication quality', ok: !e.quality },
      { label: 'Execution notes', ok: !e.notes },
      { label: 'Disposition', ok: !e.disposition }
    ];
  });
  protected readonly doneCount = computed(() => this.reportChecks().filter((c) => c.ok).length);
  protected readonly progress = computed(() => Math.round(((9 - this.missing().length) / 9) * 100));

  protected readonly pickWeeks = computed(() => monthWeeks(this.pickMonth()));
  protected readonly pickTitle = computed(() => `${MONTHS_LONG[this.pickMonth().getMonth()]} ${this.pickMonth().getFullYear()}`);

  /* ---------- helpers ---------- */
  icon(n: string): string { return FU_ICONS[n] ?? ''; }
  ini(n: string): string { return initials(n); }
  chIcon(f: FollowUp): string { return FU_ICONS[channelOf(f.channel).icon]; }
  chLabel(f: FollowUp): string { return channelOf(f.channel).label; }
  pri(f: FollowUp) { return priorityOf(f.priority); }
  due(f: FollowUp): string { return `${fmtDate(f.dueAt)} · ${fmtTime(f.dueAt)}`; }
  late(f: FollowUp): number { return Math.max(0, Math.round((toDate(this.todayIso).getTime() - toDate(f.dueAt.slice(0, 10)).getTime()) / 86400000)); }
  stamp(iso: string): string { const d = toDate(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${fmtTime(iso)}`; }
  timeLabel(t: string): string { return fmtTime(`2000-01-01T${t}`); }
  statusLabel(): string { return this.statuses.find((s) => s.key === this.status())?.label ?? 'Select status'; }
  tempInfo() { return this.temperatures.find((t) => t.key === this.temperature())!; }
  bad(k: FeErr): string { return this.tried() ? this.errors()[k] : ''; }

  /* ---------- actions ---------- */
  toggleMenu(m: Exclude<FeMenu, null>, e: Event): void {
    e.stopPropagation();
    if (m === 'date' && this.menu() !== 'date') { const d = toDate(this.date()); this.pickMonth.set(new Date(d.getFullYear(), d.getMonth(), 1)); }
    this.menu.set(this.menu() === m ? null : m);
  }
  movePick(n: number): void { const m = this.pickMonth(); this.pickMonth.set(new Date(m.getFullYear(), m.getMonth() + n, 1)); }
  pickDate(iso: string): void { if (iso > this.todayIso) return; this.date.set(iso); this.menu.set(null); }
  pickTime(t: string): void { this.time.set(t); this.menu.set(null); }
  pickStatus(s: FeStatus): void { if (this.status() !== s) this.reason.set(null); this.status.set(s); this.menu.set(null); }
  pickReason(r: string): void { this.reason.set(r); this.menu.set(null); }
  pickOutcome(o: string): void { this.outcome.set(o); this.menu.set(null); }
  pickTemp(t: FeTemp): void { this.temperature.set(t); this.menu.set(null); }
  pickDisposition(d: string): void { this.disposition.set(d); this.menu.set(null); }
  setText(which: 'notes' | 'internal', e: Event): void {
    const v = (e.target as HTMLTextAreaElement).value.slice(0, NOTE_MAX);
    (which === 'notes' ? this.notes : this.internal).set(v);
  }
  toggleConv(id: string): void { this.openConv.set(this.openConv() === id ? null : id); }

  addFiles(e: Event): void {
    const input = e.target as HTMLInputElement;
    const list = Array.from(input.files ?? []);
    this.fileError.set('');
    for (const f of list) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!FILE_TYPES.includes(ext)) { this.fileError.set(`${f.name} is not a PDF, DOCX, PNG or JPG.`); continue; }
      if (f.size > FILE_MAX) { this.fileError.set(`${f.name} is larger than 10 MB.`); continue; }
      const size = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
      this.files.update((l) => [...l, { name: f.name, size }]);
    }
    input.value = '';
  }
  removeFile(i: number): void { this.files.update((l) => l.filter((_, x) => x !== i)); }

  complete(): void {
    this.tried.set(true);
    const f = this.fu();
    if (!f || this.missing().length || this.saving()) return;
    this.saving.set(true);
    // TODO: upload the files with the report once the API is ready.
    this.store.execute(f.id, {
      method: this.method()!,
      executedAt: `${this.date()}T${this.time()}`,
      status: this.status()!,
      reason: this.reason()!,
      outcome: this.outcome()!,
      engagement: this.engagement()!,
      quality: this.quality()!,
      notes: this.notes().trim(),
      internalNotes: this.internal().trim(),
      temperature: this.temperature(),
      stage: this.stage(),
      disposition: this.disposition()!,
      files: this.files().map((x) => x.name)
    });
    this.toast.set(this.nextContact() ? 'Follow-up completed - plan the next contact' : 'Follow-up completed');
    setTimeout(() => {
      if (this.nextContact()) this.router.navigate([this.planPath], { queryParams: { ref: f.recordCode } });
      else this.router.navigate([this.queuePath]);
    }, 700);
  }

  startQualification(): void {
    // TODO: point this at the qualification screen when it exists.
    this.toast.set('Qualification will open once this follow-up is saved.');
    setTimeout(() => this.toast.set(''), 2400);
  }
  openTimeline(): void { const f = this.fu(); this.router.navigate([this.timelinePath], { queryParams: { ref: f?.recordCode } }); }
  startEscalate(): void { this.escTo.set(null); this.escReason.set(''); this.escTried.set(false); this.escOpen.set(true); }
  pickManager(m: string): void { this.escTo.set(m); this.menu.set(null); }
  setEscReason(e: Event): void { this.escReason.set((e.target as HTMLTextAreaElement).value); }
  confirmEscalate(): void {
    this.escTried.set(true);
    const f = this.fu();
    if (!f || !this.escTo() || !this.escReason().trim()) return;
    this.store.escalate([f.id], this.escTo()!, this.escReason().trim());
    this.escOpen.set(false);
    this.toast.set(`Escalated to ${this.escTo()}`);
    setTimeout(() => this.router.navigate([this.queuePath]), 900);
  }
  cancel(): void { this.router.navigate([this.queuePath]); }
  back(): void { this.router.navigate([this.queuePath]); }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.menu()) this.menu.set(null); else this.escOpen.set(false); }
}