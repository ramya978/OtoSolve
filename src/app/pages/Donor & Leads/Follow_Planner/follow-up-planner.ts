import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FU_CHANNELS, FU_ICONS, FU_PRIORITIES, FollowUpStore, FuChannel, FuPerson, FuPriority, MONTHS, MONTHS_LONG, WEEKDAYS, addDays,
  fmtTime, initials, isoDay, monthWeeks, pad2, toDate
} from '../../../Shared/layout/Donors_Leads/fu-store';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';


type PlMenu = 'owner' | 'date' | 'time' | null;

const MAX_TEXT = 500;

@Component({
  selector: 'app-follow-up-planner',
  standalone: true,
  templateUrl: './follow-up-planner.html',
  styleUrls: ['../../../Shared/layout/Donors_Leads/fu-shared.css', './follow-up-planner.css']
})
export class FollowUpPlanner {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(FollowUpStore);

  protected readonly queuePath = '/app/fundraising/relationships/follow-up-queue';
  protected readonly newPath = '/app/fundraising/relationships/follow-up-queue/new';
  protected readonly maxText = MAX_TEXT;

  protected readonly channels = FU_CHANNELS;
  protected readonly priorities = FU_PRIORITIES;
  protected readonly owners = this.store.owners;
  protected readonly datePresets = [
    { label: 'Tomorrow', days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'In 1 week', days: 7 },
    { label: 'In 2 weeks', days: 14 }
  ];
  protected readonly timePresets = ['09:30', '11:00', '14:00', '16:30'];
  protected readonly timeSlots = Array.from({ length: 24 }, (_, i) => `${pad2(8 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`); // 08:00 - 19:30

  protected readonly todayIso = isoDay(new Date());

  /* ---------- who ---------- */
  /**
   * The person comes from the address and from the API, never from "whoever is first in the list":
   * ?leadId= / ?donorId= load that record (get-lead / get-donor), ?ref= alone is looked up by its code,
   * and an address naming nobody goes back to the picker.
   */
  private readonly ref = this.route.snapshot.queryParamMap.get('ref');
  protected readonly person = signal<FuPerson | null>(null);
  protected readonly personLoading = signal(true);

  /* ---------- form ---------- */
  protected readonly owner = signal<string | null>(null);
  protected readonly priority = signal<FuPriority>('normal');
  protected readonly channel = signal<FuChannel | null>(null);
  protected readonly date = signal<string | null>(null);
  protected readonly time = signal<string | null>(null);
  protected readonly purpose = signal('');
  protected readonly outcome = signal('');

  protected readonly menu = signal<PlMenu>(null);
  protected readonly pickMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly toast = signal('');

  /** Per channel: ok, caution (no consent on record - acknowledged when scheduling) or blocked (withdrawn). */
  private readonly consentMap = signal<Partial<Record<FuChannel, 'ok' | 'caution' | 'blocked'>>>({});

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const leadId = q.get('leadId');
    const donorId = q.get('donorId');
    const found = (p: FuPerson | null) => {
      this.personLoading.set(false);
      if (!p) { this.toast.set('That lead or donor could not be found. Choose who the follow-up is for.'); this.router.navigate([this.newPath]); return; }
      this.person.set(p);
    };
    const failed = (e: unknown) => { this.personLoading.set(false); this.toast.set(apiErrorMessage(e)); this.router.navigate([this.newPath]); };
    if (leadId || donorId) {
      this.store.loadPerson(leadId ? 'lead' : 'donor', (leadId ?? donorId)!).subscribe({ next: found, error: failed });
    } else if (this.ref) {
      this.store.findPersonByCode(this.ref).subscribe({ next: found, error: failed });
    } else {
      this.personLoading.set(false);
      this.router.navigate([this.newPath]);
    }

    // The owners arrive from the API after the page opens.
    effect(() => {
      const p = this.person();
      if (p?.owner && this.owner() === null) this.owner.set(p.owner);
    });
    // Asked once per person: the signal is set once, so the five channel checks are not repeated.
    effect(() => {
      const p = this.person();
      this.consentMap.set({});
      if (!p?.id) return;
      this.store.consentFor(p).subscribe((m) => this.consentMap.set(m));
    });
  }

  /* ---------- derived ---------- */
  protected readonly ownerInfo = computed(() => (this.store.options(), this.owners).find((o) => o.name === this.owner()) ?? null);
  protected readonly maxLoad = computed(() => Math.max(1, ...this.owners.map((o) => this.store.load().get(o.name) ?? 0)));

  protected readonly consentOk = computed(() => {
    const c = this.channel();
    return !c || this.consentMap()[c] !== 'blocked';
  });
  protected readonly blockedChannels = computed(() =>
    this.channels.filter((c) => (this.consentMap()[c.key] ?? 'ok') !== 'ok').map((c) => c.label));

  protected readonly consentCount = computed(() => {
    const p = this.person();
    return p ? this.channels.filter((c) => (this.consentMap()[c.key] ?? 'ok') === 'ok').length : 0;
  });

  /** Side-card checklist: what is filled in so far. */
  protected readonly checklist = computed(() => [
    { label: 'Assigned user', value: this.owner() ?? '', ok: !!this.owner() },
    { label: 'Channel', value: this.channel() ? this.chLabel(this.channel()) : '', ok: !!this.channel() && this.consentOk() },
    { label: 'Date', value: this.when()?.short ?? '', ok: !!this.date() },
    { label: 'Time', value: this.time() ? this.timeLabel(this.time()) : '', ok: !!this.time() },
    { label: 'Purpose', value: this.purpose().trim() ? 'Written' : '', ok: !!this.purpose().trim() }
  ]);
  protected readonly doneCount = computed(() => this.checklist().filter((c) => c.ok).length);

  protected readonly when = computed(() => {
    if (!this.date()) return null;
    const d = toDate(this.date()!);
    const rel = Math.round((toDate(this.date()!).getTime() - toDate(this.todayIso).getTime()) / 86400000);
    return {
      long: `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`,
      short: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      rel: rel === 0 ? 'today' : rel === 1 ? 'tomorrow' : `in ${rel} days`
    };
  });

  protected readonly missing = computed(() => {
    const m: string[] = [];
    if (!this.owner()) m.push('Assigned user');
    if (!this.channel()) m.push('Channel');
    else if (!this.consentOk()) m.push('A channel with consent');
    if (!this.date()) m.push('Date');
    if (!this.time()) m.push('Time');
    if (!this.purpose().trim()) m.push('Purpose');
    return m;
  });

  protected readonly errors = computed(() => ({
    owner: !this.owner() ? 'Choose who will do this follow-up.' : '',
    channel: !this.channel() ? 'Choose how to reach them.' : !this.consentOk() ? 'There is no consent on record for this channel.' : '',
    date: !this.date() ? 'Pick a date.' : '',
    time: !this.time() ? 'Pick a time.' : '',
    purpose: !this.purpose().trim() ? 'Say why you are following up.' : ''
  }));

  protected readonly pickWeeks = computed(() => monthWeeks(this.pickMonth()));
  protected readonly pickTitle = computed(() => `${MONTHS_LONG[this.pickMonth().getMonth()]} ${this.pickMonth().getFullYear()}`);

  /* ---------- helpers ---------- */
  icon(n: string): string { return FU_ICONS[n] ?? ''; }
  ini(n: string): string { return initials(n); }
  load(name: string): number { return this.store.load().get(name) ?? 0; }
  timeLabel(t: string | null): string { return t ? fmtTime(`2000-01-01T${t}`) : 'Select a time'; }
  hasConsent(k: FuChannel): boolean { return (this.consentMap()[k] ?? 'ok') === 'ok'; }
  priTone(k: FuPriority): string { return this.priorities.find((p) => p.key === k)!.tone; }
  priLabel(k: FuPriority): string { return this.priorities.find((p) => p.key === k)!.label; }
  chLabel(k: FuChannel | null): string { return k ? this.channels.find((c) => c.key === k)!.label : ''; }
  chIcon(k: FuChannel | null): string { return k ? FU_ICONS[this.channels.find((c) => c.key === k)!.icon] : ''; }
  presetIso(days: number): string { return isoDay(addDays(new Date(), days)); }

  /* ---------- actions ---------- */
  toggleMenu(m: Exclude<PlMenu, null>, e: Event): void {
    e.stopPropagation();
    if (m === 'date' && this.menu() !== 'date') {
      const d = toDate(this.date() ?? this.todayIso);
      this.pickMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.menu.set(this.menu() === m ? null : m);
  }
  movePick(n: number): void { const m = this.pickMonth(); this.pickMonth.set(new Date(m.getFullYear(), m.getMonth() + n, 1)); }
  pickOwner(o: string): void { this.owner.set(o); this.menu.set(null); }
  pickDate(iso: string): void { if (iso < this.todayIso) return; this.date.set(iso); this.menu.set(null); }
  pickTime(t: string): void { this.time.set(t); this.menu.set(null); }
  setText(which: 'purpose' | 'outcome', e: Event): void {
    const v = (e.target as HTMLTextAreaElement).value.slice(0, MAX_TEXT);
    (which === 'purpose' ? this.purpose : this.outcome).set(v);
  }

  schedule(): void {
    this.tried.set(true);
    const p = this.person();
    if (!p || this.missing().length || this.saving()) return;
    this.saving.set(true);
    const caution = this.consentMap()[this.channel()!] === 'caution';
    this.store.create({
      person: p,
      owner: this.owner()!,
      channel: this.channel()!,
      dueAt: `${this.date()}T${this.time()}`,
      priority: this.priority(),
      purpose: this.purpose().trim(),
      nextAction: this.outcome().trim() || this.purpose().trim(),
      acknowledged: caution
    }).subscribe({
      next: () => {
        this.toast.set(caution
          ? `Follow-up scheduled for ${p.name} - no consent is on record for this channel, confirm permission before contact`
          : `Follow-up scheduled for ${p.name}`);
        setTimeout(() => this.router.navigate([this.queuePath]), caution ? 1500 : 700);
      },
      error: (e: unknown) => { this.saving.set(false); this.toast.set(apiErrorMessage(e)); }
    });
  }

  discard(): void { this.router.navigate([this.queuePath]); }
  changePerson(): void { this.router.navigate([this.newPath]); }
  back(): void { this.router.navigate([this.newPath]); }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.menu.set(null); }
}