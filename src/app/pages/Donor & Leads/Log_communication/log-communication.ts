import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Level3, Quality, CommunicationStore, COMM_CHANNELS, OUTCOME_GROUPS, pad2, isoDay, CommChannel, CommDirection, CommOutcome, healthLabel, MONTHS, entryTitle, COMM_ICONS, channelOf, outcomeOf, outcomeTone, OUTCOMES, daysBetween } from '../../../Shared/layout/Donors_Leads/Store';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';


type LcMenu = 'hh' | 'mm' | 'cal' | null;

export const SUMMARY_MAX = 2000;
export const NOTE_MAX = 3000;
export const FILE_MAX_MB = 10;
export const FILE_TYPES = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];
export const STARTERS = ['They said… ', 'They asked for… ', 'We agreed… ', 'Next step: '];
export const LEVELS: { key: Level3; label: string; bars: number }[] = [
  { key: 'low', label: 'Low', bars: 1 },
  { key: 'medium', label: 'Medium', bars: 2 },
  { key: 'high', label: 'High', bars: 3 }
];
export const QUALITIES: { key: Quality; label: string; bars: number }[] = [
  { key: 'poor', label: 'Poor', bars: 1 },
  { key: 'average', label: 'Average', bars: 2 },
  { key: 'good', label: 'Good', bars: 3 },
  { key: 'excellent', label: 'Excellent', bars: 4 }
];

@Component({
  selector: 'app-log-communication',
  standalone: true,
  imports:[PageHeader],
  templateUrl:'./log-communication.html',
  styleUrls: ['./log-communication.css', '../../../Shared/layout/page-header/page-header.css']
})
export class LogCommunication {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(CommunicationStore);

  protected readonly timelinePath = '/app/fundraising/relationships/communication-timeline';
  protected readonly channels = COMM_CHANNELS;
  protected readonly groups = OUTCOME_GROUPS;
  protected readonly levels = LEVELS;
  protected readonly qualities = QUALITIES;
  protected readonly starters = STARTERS;
  protected readonly summaryMax = SUMMARY_MAX;
  protected readonly noteMax = NOTE_MAX;
  protected readonly hours = Array.from({ length: 12 }, (_, i) => pad2(i + 1));
  protected readonly minutes = Array.from({ length: 12 }, (_, i) => pad2(i * 5));

  private readonly ref = this.route.snapshot.queryParamMap.get('ref');
  private readonly loadedOnce = this.store.load(this.ref);
  protected readonly lead = computed(() => this.store.lead(this.ref));
  protected readonly history = computed(() => this.store.entriesFor(this.lead().code));
  protected readonly today = new Date();
  protected readonly todayIso = isoDay(this.today);

  /* ---------- form ---------- */
  protected readonly channel = signal<CommChannel>('call');
  protected readonly day = signal<string>(this.todayIso);
  protected readonly hh = signal<string>('');
  protected readonly mm = signal<string>('');
  protected readonly ampm = signal<'AM' | 'PM'>(this.today.getHours() < 12 ? 'AM' : 'PM');
  protected readonly direction = signal<CommDirection>('out');
  protected readonly outcome = signal<CommOutcome | null>(null);
  protected readonly engagement = signal<Level3 | null>(null);
  protected readonly quality = signal<Quality | null>(null);
  protected readonly summary = signal('');
  protected readonly note = signal('');
  protected readonly important = signal(false);
  protected readonly file = signal<{ name: string; size: number } | null>(null);
  protected readonly fileError = signal('');

  protected readonly menu = signal<LcMenu>(null);
  protected readonly calMonth = signal(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirmLeave = signal(false);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- derived ---------- */
  protected readonly initials = computed(() => this.lead().name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  protected readonly health = computed(() => ({ value: this.lead().health, ...healthLabel(this.lead().health) }));
  protected readonly lastContact = computed(() => {
    const e = this.history()[0];
    if (!e) return 'Never';
    const n = daysBetween(new Date(e.at), this.today);
    return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
  });
  protected readonly channelCount = computed(() => this.history().filter((e) => e.channel === this.channel()).length);
  protected readonly hasDirection = computed(() => this.channel() !== 'note');

  /** Last six days + today, oldest first. */
  protected readonly days = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(this.today);
      d.setDate(this.today.getDate() - (6 - i));
      return { iso: isoDay(d), wd: i === 6 ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], d: pad2(d.getDate()) };
    }));
  protected readonly isEarlier = computed(() => !this.days().some((d) => d.iso === this.day()));

  protected readonly time24 = computed(() => {
    if (!this.hh() || !this.mm()) return '';
    let h = Number(this.hh()) % 12;
    if (this.ampm() === 'PM') h += 12;
    return `${pad2(h)}:${this.mm()}`;
  });
  protected readonly atIso = computed(() => (this.time24() ? `${this.day()}T${this.time24()}` : ''));

  protected readonly errors = computed(() => {
    const e: Record<string, string> = {};
    if (!this.day()) e['day'] = 'Pick the day.';
    if (!this.time24()) e['time'] = 'Set the time.';
    else if (this.atIso() > isoDay(new Date()) + 'T' + pad2(new Date().getHours()) + ':' + pad2(new Date().getMinutes()) && this.day() === this.todayIso)
      e['time'] = 'The time is in the future.';
    if (!this.outcome()) e['outcome'] = 'Choose what happened.';
    if (!this.summary().trim()) e['summary'] = 'Write a short summary.';
    else if (this.summary().length > SUMMARY_MAX) e['summary'] = `Keep it under ${SUMMARY_MAX} characters.`;
    if (this.note().length > NOTE_MAX) e['note'] = `Keep it under ${NOTE_MAX} characters.`;
    return e;
  });
  protected readonly checklist = computed(() => [
    { key: 'day', label: 'Date', done: !!this.day() },
    { key: 'time', label: 'Time', done: !!this.time24() && !this.errors()['time'] },
    { key: 'outcome', label: 'Outcome', done: !!this.outcome() },
    { key: 'summary', label: 'Summary', done: !!this.summary().trim() }
  ]);
  protected readonly doneCount = computed(() => this.checklist().filter((c) => c.done).length);
  protected readonly dirty = computed(() =>
    !!(this.outcome() || this.summary().trim() || this.note().trim() || this.engagement() || this.quality() || this.file() || this.hh() || this.mm() || this.important()));

  /** Live preview of the timeline entry. */
  protected readonly preview = computed(() => {
    const d = new Date(this.day() + 'T00:00');
    return {
      day: pad2(d.getDate()),
      month: MONTHS[d.getMonth()],
      time: this.time24() ? `${this.hh()}:${this.mm()} ${this.ampm()}` : '',
      title: entryTitle(this.channel(), this.direction()),
      icon: COMM_ICONS[channelOf(this.channel()).icon],
      outcome: this.outcome() ? outcomeOf(this.outcome()!).label : '',
      tone: this.outcome() ? outcomeTone(this.outcome()!) : 'muted',
      summary: this.summary().trim(),
      note: this.note().trim()
    };
  });

  protected readonly calWeeks = computed(() => {
    const m = this.calMonth();
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const weeks: { iso: string; day: number; out: boolean; future: boolean }[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + i);
        const id = isoDay(d);
        row.push({ iso: id, day: d.getDate(), out: d.getMonth() !== m.getMonth(), future: id > this.todayIso });
      }
      weeks.push(row);
    }
    return weeks;
  });
  protected readonly calTitle = computed(() => MONTHS[this.calMonth().getMonth()] + ' ' + this.calMonth().getFullYear());
  protected readonly canNextMonth = computed(() => {
    const m = this.calMonth();
    return m.getFullYear() < this.today.getFullYear() || (m.getFullYear() === this.today.getFullYear() && m.getMonth() < this.today.getMonth());
  });

  /* ---------- helpers ---------- */
  icon(n: string): string { return COMM_ICONS[n] ?? ''; }
  outcomesOf(g: string) { return OUTCOMES.filter((o) => o.group === g); }
  date(at: string): string { const d = new Date(at); return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
  dayLabel(iso: string): string { return this.date(iso + 'T00:00'); }
  entryIcon(c: CommChannel): string { return COMM_ICONS[channelOf(c).icon]; }
  entryChannel(c: CommChannel): string { return channelOf(c).label; }
  entryOutcome(o: CommOutcome): string { return outcomeOf(o).label; }
  entryTone(o: CommOutcome): string { return outcomeTone(o); }
  show(k: string): string { return this.tried() ? this.errors()[k] ?? '' : ''; }

  /* ---------- editing ---------- */
  setChannel(c: CommChannel): void { this.channel.set(c); }
  pickDay(iso: string): void { this.day.set(iso); this.menu.set(null); }
  toggle(m: Exclude<LcMenu, null>, e: Event): void {
    e.stopPropagation();
    if (m === 'cal' && this.menu() !== 'cal') {
      const d = new Date(this.day() + 'T00:00');
      this.calMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.menu.set(this.menu() === m ? null : m);
  }
  moveCal(step: number): void {
    if (step > 0 && !this.canNextMonth()) return;
    const m = this.calMonth();
    this.calMonth.set(new Date(m.getFullYear(), m.getMonth() + step, 1));
  }
  pickHour(h: string): void { this.hh.set(h); if (!this.mm()) this.mm.set('00'); this.menu.set(null); }
  pickMinute(m: string): void { this.mm.set(m); this.menu.set(null); }
  useNow(): void {
    const n = new Date();
    const h = n.getHours();
    this.day.set(isoDay(n));
    this.hh.set(pad2(h % 12 === 0 ? 12 : h % 12));
    this.mm.set(pad2(n.getMinutes() - (n.getMinutes() % 5)));
    this.ampm.set(h < 12 ? 'AM' : 'PM');
  }
  setText(k: 'summary' | 'note', e: Event): void { (k === 'summary' ? this.summary : this.note).set((e.target as HTMLTextAreaElement).value); }
  addStarter(s: string): void {
    const cur = this.summary();
    this.summary.set(cur && !/\s$/.test(cur) ? `${cur} ${s}` : cur + s);
  }
  pickLevel(v: Level3): void { this.engagement.set(this.engagement() === v ? null : v); }
  pickQuality(v: Quality): void { this.quality.set(this.quality() === v ? null : v); }

  onFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    this.fileError.set('');
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!FILE_TYPES.includes(ext)) { this.fileError.set('Use a PDF, DOCX, PNG or JPG file.'); return; }
    if (f.size > FILE_MAX_MB * 1024 * 1024) { this.fileError.set(`The file is larger than ${FILE_MAX_MB} MB.`); return; }
    this.file.set({ name: f.name, size: f.size });
  }
  removeFile(): void { this.file.set(null); }
  size(b: number): string { return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`; }

  /* ---------- leave / save ---------- */
  cancel(): void {
    if (this.dirty() && !this.saving()) { this.confirmLeave.set(true); return; }
    this.leave();
  }
  leave(): void {
    this.confirmLeave.set(false);
    this.router.navigate([this.timelinePath], { queryParams: { ref: this.lead().code } });
  }

  save(): void {
    this.tried.set(true);
    if (Object.keys(this.errors()).length) { this.flash('Fill in the highlighted fields.'); return; }
    this.saving.set(true);
    this.store.add({
      lead: this.lead().code,
      at: this.atIso(),
      channel: this.channel(),
      direction: this.hasDirection() ? this.direction() : 'out',
      outcome: this.outcome()!,
      engagement: this.engagement(),
      quality: this.quality(),
      summary: this.summary().trim(),
      note: this.note().trim(),
      by: this.lead().owner,
      important: this.important(),
      attachment: this.file()?.name ?? null
    }).subscribe({
      next: () => { this.saving.set(false); this.leave(); },
      error: (e: unknown) => { this.saving.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2400);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menu()) { this.menu.set(null); return; }
    this.confirmLeave.set(false);
  }
}