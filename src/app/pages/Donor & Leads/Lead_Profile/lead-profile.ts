import { Component, DestroyRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Footer } from '../../../Shared/layout/Footer/footer';

export type LeadStatus = 'New' | 'Assigned' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost' | 'Dormant';

export type StatusTone = 'new' | 'assigned' | 'contacted' | 'qualified' | 'converted' | 'closed';

export interface ConsentRow {
  channel: 'Phone call' | 'SMS' | 'E-mail' | 'WhatsApp';
  decision: 'Opted in' | 'Opted out' | 'Not asked';
  status: 'Active' | 'Withdrawn' | '-';
  noticeVersion: string;
  /** ISO date or null */
  effective: string | null;
  /** ISO date or null = no expiry */
  expires: string | null;
}

export interface LeadProfileData {
  id: string;
  reference: string;
  fullName: string;
  displayName: string;
  status: LeadStatus;
  phone: string;
  otherNumbers: string[];
  email: string;
  language: string;
  bestTimeToCall: string | null;
  notes: string | null;

  health: number;
  healthLabel: string;
  temperature: 'Hot' | 'Warm' | 'Cold';
  potential: 'High' | 'Medium' | 'Low';
  responseClock: 'On time' | 'Due soon' | 'Breached';

  campaign: string;
  leadSource: string;
  owner: string;
  team: string;
  donationLink: string;

  country: string | null;
  city: string | null;
  regionCode: string | null;
  address: string | null;

  lastOutcome: string;
  /** ISO date-time */
  lastContacted: string | null;
  /** ISO date */
  nextFollowUp: string | null;
  plannedAction: string;

  /** ISO date-times */
  captured: string;
  lastUpdated: string;
  accepted: string | null;
  qualified: string | null;
  converted: string | null;

  consentEvidence: string;
  consent: ConsentRow[];
}

interface Owner {
  name: string;
  team: string;
}

type IconName =
  | 'back' | 'arrow' | 'copy' | 'check' | 'user' | 'calendar' | 'chat' | 'chevron' | 'contact' | 'origin'
  | 'pulse' | 'shield' | 'pin' | 'flag' | 'note' | 'phone' | 'mail' | 'sms' | 'whatsapp' | 'clock'
  | 'thermo' | 'bars' | 'link' | 'search';

const ICONS: Record<IconName, string> = {
  back: 'M19 12H5M11 18l-6-6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M20 6L9 17l-5-5',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  chevron: 'M6 9l6 6 6-6',
  contact: 'M5 3h14v18H5zM9 3v18M13 8h3M13 12h3',
  origin: 'M6 3v12M18 9v12M6 15a6 6 0 0 0 12 0M6 6a3 3 0 1 0 0-.01M18 6a3 3 0 1 0 0-.01',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  flag: 'M4 22V3c5-4 11 4 16 0v11c-5 4-11-4-16 0',
  note: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h.01M12 10h.01M16 10h.01',
  whatsapp: 'M3 21l1.7-5A9 9 0 1 1 8 19.3zM9 9.5c.5 2.5 2.5 4.5 5 5l1.2-1.2 2 1-.5 1.7c-4 .3-8.5-4.2-8.2-8.2L10.2 7l1 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  thermo: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
  bars: 'M6 20v-6M12 20V9M18 20V4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3'
};

/** Lifecycle track shown in the summary card - the open statuses in order. Lost / Dormant close the lead. */
const STAGES: LeadStatus[] = ['New', 'Assigned', 'Contacted', 'Qualified', 'Converted'];

const STATUS_TONES: Record<LeadStatus, StatusTone> = {
  New: 'new',
  Assigned: 'assigned',
  Contacted: 'contacted',
  Qualified: 'qualified',
  Converted: 'converted',
  Lost: 'closed',
  Dormant: 'closed'
};

/* ---------- sample data (replace with the lead API response) ---------- */
export const SAMPLE_LEAD: LeadProfileData = {
  id: 'led-38',
  reference: 'LED-2026-000038',
  fullName: 'Preeti Vivek',
  displayName: 'Preeti Vivek',
  status: 'Contacted',
  phone: '+919829414801',
  otherNumbers: [],
  email: 'preeti.vivek@mail.test',
  language: 'hi-IN',
  bestTimeToCall: null,
  notes: null,

  health: 44,
  healthLabel: 'Needs attention',
  temperature: 'Cold',
  potential: 'Low',
  responseClock: 'Breached',

  campaign: 'Girls in STEM Scholarship Fund',
  leadSource: 'Alumni network event',
  owner: 'Kavita Ashok',
  team: 'NORTH',
  donationLink: 'http://localhost:6700/auth/donor-form?campaign=5eed8a20-3c46-ec13-b415-2ec4684cb299',

  country: null,
  city: 'Jaipur',
  regionCode: null,
  address: null,

  lastOutcome: 'No answer',
  lastContacted: '2026-10-08T17:49',
  nextFollowUp: '2026-10-10',
  plannedAction: 'Third call attempt, then an e-mail',

  captured: '2026-09-27T15:56',
  lastUpdated: '2026-10-08T17:49',
  accepted: '2026-09-27T18:56',
  qualified: null,
  converted: null,

  consentEvidence: 'OPTIN-0038',
  consent: [
    { channel: 'Phone call', decision: 'Opted in', status: 'Active', noticeVersion: 'PN-2026-01', effective: '2026-09-27', expires: null },
    { channel: 'E-mail', decision: 'Not asked', status: '-', noticeVersion: '-', effective: null, expires: null },
    { channel: 'SMS', decision: 'Not asked', status: '-', noticeVersion: '-', effective: null, expires: null },
    { channel: 'WhatsApp', decision: 'Not asked', status: '-', noticeVersion: '-', effective: null, expires: null }
  ]
};

/** Owners offered in "Reassign" (replace with the eligible-owner API). */
const OWNERS: Owner[] = [
  { name: 'Kavita Ashok', team: 'NORTH' },
  { name: 'Rohan Mehta', team: 'NORTH' },
  { name: 'Sneha Iyer', team: 'SOUTH' },
  { name: 'Arjun Prakash', team: 'SOUTH' },
  { name: 'Farah Khan', team: 'WEST' },
  { name: 'Deepak Bose', team: 'EAST' }
];

@Component({
  selector: 'app-lead-profile',
  imports: [Footer],
  templateUrl: './lead-profile.html',
  styleUrl: './lead-profile.css'
})
export class LeadProfile {
  /** The lead to show. Pass the API record; the sample is used until then. */
  readonly lead = input<LeadProfileData>(SAMPLE_LEAD);

  readonly back = output<void>();
  readonly communicate = output<LeadProfileData>();
  readonly scheduleFollowUp = output<LeadProfileData>();
  readonly logOutcome = output<LeadProfileData>();
  readonly reassigned = output<{ lead: LeadProfileData; owner: string }>();
  readonly closed = output<{ lead: LeadProfileData; as: 'Lost' | 'Dormant' }>();

  protected readonly stages = STAGES;
  protected readonly owners = OWNERS;

  // ---- local changes made on this page (until the API returns the updated lead) ----
  private readonly ownerOverride = signal<string | null>(null);
  private readonly statusOverride = signal<LeadStatus | null>(null);

  protected readonly owner = computed(() => this.ownerOverride() ?? this.lead().owner);
  protected readonly ownerTeam = computed(
    () => OWNERS.find((o) => o.name === this.owner())?.team ?? this.lead().team
  );
  protected readonly status = computed<LeadStatus>(() => this.statusOverride() ?? this.lead().status);
  protected readonly isClosed = computed(() => this.status() === 'Lost' || this.status() === 'Dormant');

  // ---- reassign dropdown ----
  protected readonly reassignOpen = signal(false);
  protected readonly ownerQuery = signal('');
  protected readonly activeIndex = signal(0);
  protected readonly filteredOwners = computed(() => {
    const q = this.ownerQuery().trim().toLowerCase();
    return q ? OWNERS.filter((o) => (o.name + ' ' + o.team).toLowerCase().includes(q)) : OWNERS;
  });

  // ---- feedback ----
  protected readonly copied = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  private copyTimer: ReturnType<typeof setTimeout> | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  // ---- derived figures ----
  protected readonly initials = computed(() => this.initialsOf(this.lead().fullName));
  protected readonly ownerInitials = computed(() => this.initialsOf(this.owner()));

  /** Index of the current stage on the track (-1 when closed or when the API sends an unknown status). */
  protected readonly stageIndex = computed(() => STAGES.indexOf(this.status()));

  /** Colour family of the current status (chip, lifecycle bar, status tag). */
  protected readonly statusTone = computed<StatusTone>(() => STATUS_TONES[this.status()] ?? 'new');

  protected readonly optedIn = computed(() => this.lead().consent.filter((c) => c.decision === 'Opted in').length);
  protected readonly consentGranted = computed(() => this.optedIn() > 0);

  /** Health ring: stroke-dasharray for a 44px ring (r = 18). */
  protected readonly healthDash = computed(() => {
    const c = 2 * Math.PI * 18;
    const v = Math.max(0, Math.min(100, this.lead().health));
    return `${(c * v) / 100} ${c}`;
  });

  protected readonly healthTone = computed(() => {
    const v = this.lead().health;
    return v >= 70 ? 'good' : v >= 40 ? 'warn' : 'bad';
  });

  protected readonly followUpDue = computed(() => {
    const d = this.lead().nextFollowUp;
    if (!d) return false;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return d <= iso;
  });

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.copyTimer);
      clearTimeout(this.toastTimer);
    });
  }

  // =================================================================================================
  // helpers
  // =================================================================================================
  protected icon(name: IconName): string {
    return ICONS[name];
  }

  protected channelIcon(channel: ConsentRow['channel']): IconName {
    switch (channel) {
      case 'Phone call': return 'phone';
      case 'E-mail': return 'mail';
      case 'SMS': return 'sms';
      case 'WhatsApp': return 'whatsapp';
    }
  }

  private initialsOf(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  /** "27 Sept 2026" */
  protected date(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00' : iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** "27 Sept 2026, 15:56" */
  protected dateTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day}, ${time}`;
  }

  protected orDash(value: string | null | undefined): string {
    return value && value.trim() ? value : '—';
  }

  // =================================================================================================
  // copy
  // =================================================================================================
  protected async copy(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // clipboard blocked - fall back to a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    clearTimeout(this.copyTimer);
    this.copied.set(key);
    this.copyTimer = setTimeout(() => this.copied.set(null), 1600);
  }

  // =================================================================================================
  // reassign
  // =================================================================================================
  protected toggleReassign(event: Event): void {
    event.stopPropagation();
    if (this.reassignOpen()) {
      this.closeReassign();
      return;
    }
    this.ownerQuery.set('');
    this.activeIndex.set(0);
    this.reassignOpen.set(true);
    setTimeout(() => document.querySelector<HTMLInputElement>('.lp-owner-search input')?.focus());
  }

  protected closeReassign(): void {
    this.reassignOpen.set(false);
    this.ownerQuery.set('');
  }

  protected searchOwners(event: Event): void {
    this.ownerQuery.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected ownerKey(event: KeyboardEvent): void {
    const list = this.filteredOwners();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!list.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update((i) => (i + step + list.length) % list.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const o = list[this.activeIndex()];
      if (o) this.pickOwner(o);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeReassign();
    }
  }

  protected pickOwner(o: Owner): void {
    this.closeReassign();
    if (o.name === this.owner()) return;
    this.ownerOverride.set(o.name);
    this.reassigned.emit({ lead: this.lead(), owner: o.name });
    this.showToast(`Lead reassigned to ${o.name}.`);
  }

  // =================================================================================================
  // actions
  // =================================================================================================
  protected onCommunicate(): void {
    this.communicate.emit(this.lead());
  }

  protected onSchedule(): void {
    this.scheduleFollowUp.emit(this.lead());
  }

  protected onLogOutcome(): void {
    this.logOutcome.emit(this.lead());
  }

  protected close(as: 'Lost' | 'Dormant'): void {
    if (this.isClosed()) return;
    this.statusOverride.set(as);
    this.closed.emit({ lead: this.lead(), as });
    this.showToast(as === 'Lost' ? 'Lead marked as lost.' : 'Lead marked as dormant.');
  }

  /** Undo a close made on this page. */
  protected reopen(): void {
    this.statusOverride.set(null);
    this.showToast('Lead reopened.');
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3200);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.reassignOpen() && !(event.target as HTMLElement | null)?.closest('.lp-reassign')) this.closeReassign();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.reassignOpen()) this.closeReassign();
  }
}