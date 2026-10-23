import { Component, DestroyRef, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';
import { DonorApiService } from '../../../Service/donor-api.service';
import { CommunicationTimelineResponse, LeadDetail } from '../../../Shared/models/donor-contract.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

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

const EMPTY_LEAD: LeadProfileData = {
  id: '', reference: '', fullName: '', displayName: '', status: 'New', phone: '', otherNumbers: [], email: '', language: '',
  bestTimeToCall: null, notes: null, health: 0, healthLabel: '', temperature: 'Cold', potential: 'Low', responseClock: 'On time',
  campaign: '', leadSource: '', owner: '', team: '', donationLink: '', country: null, city: null, regionCode: null, address: null,
  lastOutcome: '', lastContacted: null, nextFollowUp: null, plannedAction: '', captured: '', lastUpdated: '', accepted: null,
  qualified: null, converted: null, consentEvidence: '', consent: []
};

const nk = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z]/g, '');

function statusOf(v: string, converted: boolean): LeadStatus {
  const k = nk(v);
  if (converted || k.startsWith('convert')) return 'Converted';
  if (k.startsWith('qualif')) return 'Qualified';
  if (k.startsWith('contact')) return 'Contacted';
  if (k.startsWith('assign') || k.startsWith('accept')) return 'Assigned';
  if (k.startsWith('dormant') || k.startsWith('nurture')) return 'Dormant';
  if (k.startsWith('lost') || k.startsWith('closed') || k.startsWith('disqual')) return 'Lost';
  return 'New';
}

function channelOf(v: string): ConsentRow['channel'] {
  const k = nk(v);
  return k.includes('whatsapp') ? 'WhatsApp' : k.includes('sms') ? 'SMS' : k.includes('mail') ? 'E-mail' : 'Phone call';
}

function toLeadProfile(l: LeadDetail, t: CommunicationTimelineResponse | null): LeadProfileData {
  const iso = (u: string | null | undefined) => (u ? u.replace('Z', '') : null);
  const sla = nk(l.slaState);
  const cap = (v: string | null | undefined, fallback: string) => {
    const k = nk(v);
    return k ? k.charAt(0).toUpperCase() + k.slice(1) : fallback;
  };
  const consents: ConsentRow[] = (['Phone call', 'E-mail', 'SMS', 'WhatsApp'] as const).map((ch) => {
    const c = (l.consents ?? []).find((x) => channelOf(x.channel) === ch);
    if (!c) return { channel: ch, decision: 'Not asked' as const, status: '-' as const, noticeVersion: '-', effective: null, expires: null };
    const granted = nk(c.consentState).startsWith('grant');
    return {
      channel: ch, decision: granted ? 'Opted in' as const : 'Opted out' as const,
      status: nk(c.status).startsWith('withdr') || !granted ? 'Withdrawn' as const : 'Active' as const,
      noticeVersion: c.noticeVersion || '-', effective: c.effectiveAtUtc ? c.effectiveAtUtc.slice(0, 10) : null,
      expires: c.expiryAtUtc ? c.expiryAtUtc.slice(0, 10) : null
    };
  });
  return {
    id: l.id, reference: l.leadReference,
    fullName: [l.firstName, l.lastName].filter(Boolean).join(' '), displayName: l.displayName,
    status: statusOf(l.status, !!l.convertedDonorId), phone: l.mobileNumber ?? '', otherNumbers: l.alternateMobileNumbers ?? [],
    email: l.emailAddress ?? '', language: l.preferredLanguage ?? '',
    bestTimeToCall: l.preferredContactTimeUtc ? new Date(l.preferredContactTimeUtc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
    notes: l.notes,
    health: t?.healthScore ?? 0, healthLabel: t?.healthBand ?? '',
    temperature: cap(t?.temperature, 'Cold') as LeadProfileData['temperature'],
    potential: cap(t?.donationPotential, 'Low') as LeadProfileData['potential'],
    responseClock: sla.includes('breach') || sla.includes('overdue') ? 'Breached' : sla.includes('soon') || sla.includes('today') ? 'Due soon' : 'On time',
    campaign: l.campaignName ?? '', leadSource: l.source ?? '', owner: l.ownerName ?? '', team: l.teamCode ?? '',
    donationLink: l.campaignId ? `${window.location.origin}/auth/donor-form?campaign=${l.campaignId}&lead=${l.id}` : '',
    country: l.country, city: l.city, regionCode: l.geographyCode, address: l.addressLine,
    lastOutcome: l.lastContactOutcome ?? '', lastContacted: iso(l.lastContactedAtUtc),
    nextFollowUp: l.nextActionDueUtc ? l.nextActionDueUtc.slice(0, 10) : null, plannedAction: l.nextAction ?? '',
    captured: iso(l.createdAtUtc) ?? '', lastUpdated: iso(l.updatedAtUtc ?? l.createdAtUtc) ?? '',
    accepted: iso(l.acceptedAtUtc), qualified: iso(l.qualifiedAtUtc), converted: iso(l.convertedAtUtc),
    consentEvidence: l.consentEvidenceReference ?? '', consent: consents
  };
}

/** Owners offered in "Reassign" - filled in place from the API. */
const OWNERS: Owner[] = [];

@Component({
  selector: 'app-lead-profile',
  imports: [],
  templateUrl: './lead-profile.html',
  styleUrl: './lead-profile.css'
})
export class LeadProfile implements OnInit {
  private readonly api = inject(DonorApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ownerIds = new Map<string, string>();
  private version = 0;

  /** A lead handed in by a parent screen. When opened by route, the lead is loaded from the API. */
  readonly leadInput = input<LeadProfileData | null>(null);
  private readonly loaded = signal<LeadProfileData | null>(null);
  readonly lead = computed<LeadProfileData>(() => this.loaded() ?? this.leadInput() ?? EMPTY_LEAD);

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

  ngOnInit(): void {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (!ref) return;
    forkJoin([this.api.searchLeads(ref, 5), this.api.getAssignableOwners()]).subscribe({
      next: ([list, owners]) => {
        OWNERS.length = 0;
        this.ownerIds.clear();
        for (const o of owners) { OWNERS.push({ name: o.label, team: o.description ?? '' }); this.ownerIds.set(o.label, o.value); }
        const hit = list.find((x) => x.leadReference === ref) ?? list[0];
        if (!hit) { this.showToast('That lead could not be found.'); return; }
        forkJoin([
          this.api.getLead(hit.id),
          this.api.getCommunicationTimeline(hit.id, null).pipe(catchError(() => of(null)))
        ]).subscribe({
          next: ([l, t]) => { this.version = l.version; this.loaded.set(toLeadProfile(l, t)); },
          error: (e: unknown) => this.showToast(apiErrorMessage(e))
        });
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e))
    });
  }

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
    this.api.assignLead(this.lead().id, {
      newOwnerUserId: this.ownerIds.get(o.name) ?? '',
      newOwnerName: o.name,
      teamCode: o.team || null,
      assignmentReason: `Reassigned to ${o.name} from the lead profile.`,
      expectedVersion: this.version
    }).subscribe({
      next: (l) => {
        this.version = l.version;
        this.ownerOverride.set(o.name);
        this.reassigned.emit({ lead: this.lead(), owner: o.name });
        this.showToast(`Lead reassigned to ${o.name}.`);
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e))
    });
  }

  // =================================================================================================
  // actions
  // =================================================================================================
  protected onCommunicate(): void {
    this.communicate.emit(this.lead());
    this.router.navigate(['/app/fundraising/relationships/communication-timeline'], { queryParams: { ref: this.lead().reference } });
  }

  protected onSchedule(): void {
    this.scheduleFollowUp.emit(this.lead());
    this.router.navigate(['/app/fundraising/relationships/follow-up-queue/plan'], { queryParams: { ref: this.lead().reference } });
  }

  protected onLogOutcome(): void {
    this.logOutcome.emit(this.lead());
    this.router.navigate(['/app/fundraising/relationships/communication-timeline/log'], { queryParams: { ref: this.lead().reference } });
  }

  protected close(as: 'Lost' | 'Dormant'): void {
    if (this.isClosed()) return;
    this.api.closeLead(this.lead().id, {
      reason: as === 'Lost' ? 'Lead marked as lost from the lead profile.' : 'Lead marked as dormant from the lead profile.',
      expectedVersion: this.version
    }).subscribe({
      next: (l) => {
        this.version = l.version;
        this.statusOverride.set(as);
        this.closed.emit({ lead: this.lead(), as });
        this.showToast(as === 'Lost' ? 'Lead marked as lost.' : 'Lead marked as dormant.');
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e))
    });
  }

  /** Undo a close made on this page. */
  protected reopen(): void {
    this.showToast('A closed lead cannot be reopened from here. Capture it again or ask an administrator.');
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