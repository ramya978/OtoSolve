import { map, switchMap } from 'rxjs';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DonorApiService } from '../../../../Service/donor-api.service';
import { GeoMasterService } from '../../../../Shared/services/geo-master.service';
import { ToastService } from '../../../../Shared/services/toast.service';
import { CreateLeadRequest, DonLookupItem } from '../../../../Shared/models/donor-contract.model';
import { CountryLookup } from '../../../../Shared/models/geo-lookup.model';
import { MasterLookup } from '../../../../Shared/models/global-master.model';
import { apiErrorMessage, apiFieldErrors } from '../../../../Shared/models/api-response.model';
import { LcSelect } from '../lc-select';
import { CONTACT_CHANNELS, LC_ICONS, LC_PATHS, LcOpt } from '../lc-shared';

/** Everything the single-lead form holds. */
interface LeadForm {
  firstName: string; lastName: string; displayName: string;
  phones: string[]; email: string; language: string;
  address1: string; address2: string; zip: string; country: string; state: string; city: string;
  source: string; campaign: string; sourceDetails: string;
  consentOn: boolean; channels: string[]; recognition: '' | 'Anonymous' | 'Recognised';
  capturedThrough: string; consentState: string;
  effDate: string; hh: string; mm: string; ampm: 'AM' | 'PM';
  evidence: string; purpose: string; notes: string;
}

type Key = keyof LeadForm;
type SectionId = 'identity' | 'contact' | 'location' | 'source' | 'consent';

const EMPTY: LeadForm = {
  firstName: '', lastName: '', displayName: '',
  phones: [''], email: '', language: '',
  address1: '', address2: '', zip: '', country: 'India', state: '', city: '',
  source: '', campaign: '', sourceDetails: '',
  consentOn: false, channels: [], recognition: '', capturedThrough: '', consentState: '',
  effDate: '', hh: '', mm: '', ampm: 'AM', evidence: '', purpose: '', notes: '',
};

/** Which fields belong to which section (drives the section status and the summary checklist). */
const SECTION_FIELDS: Record<SectionId, string[]> = {
  identity: ['firstName', 'lastName', 'displayName'],
  contact: ['phone0', 'phone1', 'phone2', 'email', 'language'],
  location: ['address1', 'zip', 'country', 'state', 'city'],
  source: ['source', 'campaign', 'sourceDetails'],
  consent: ['channels', 'recognition', 'capturedThrough', 'consentState', 'effDate', 'time', 'evidence', 'purpose'],
};

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP = /^\d{6}$/;

@Component({
  selector: 'app-lead-capture-single',
  imports: [LcSelect, RouterLink],
  templateUrl: './lead-capture-single.html',
  styleUrl: './lead-capture-single.css',
})
export class LeadCaptureSingle implements OnInit {
  private readonly api = inject(DonorApiService);
  private readonly geo = inject(GeoMasterService);
  private readonly toast = inject(ToastService);

  // ---- option lists (loaded from the API) ----
  private readonly languageList = signal<LcOpt[]>([]);
  private readonly sourceList = signal<LcOpt[]>([]);
  private readonly campaignList = signal<LcOpt[]>([]);
  private readonly consentStateList = signal<LcOpt[]>([]);
  private readonly captureChannelList = signal<LcOpt[]>([]);
  private readonly countryRows = signal<CountryLookup[]>([]);
  private readonly stateRows = signal<MasterLookup[]>([]);
  private readonly cityRows = signal<MasterLookup[]>([]);
  private diallingCode = '+91';
  private readonly serverErrors = signal<Record<string, string>>({});
  protected readonly saving = signal(false);

  protected get languages(): LcOpt[] { return this.languageList(); }
  protected get sources(): LcOpt[] { return this.sourceList(); }
  protected get campaigns(): LcOpt[] { return this.campaignList(); }
  protected get consentStates(): LcOpt[] { return this.consentStateList(); }
  protected get captureChannels(): LcOpt[] { return this.captureChannelList(); }
  protected readonly countryOpts = computed<LcOpt[]>(() =>
    this.countryRows().filter((c) => c.status === 'active').map((c) => ({ value: c.name, label: c.name })));
  protected get countries(): LcOpt[] { return this.countryOpts(); }
  protected readonly stateOpts = computed<LcOpt[]>(() =>
    this.stateRows().filter((r) => r.status === 'active').map((r) => ({ value: r.name, label: r.name })));
  protected get states(): LcOpt[] { return this.stateOpts(); }
  protected readonly contactChannels = CONTACT_CHANNELS;
  protected readonly queuePath = LC_PATHS.queue;

  protected readonly sections: { id: SectionId; no: string; title: string; hint: string; icon: string }[] = [
    { id: 'identity', no: '01', title: 'Identity', hint: 'Who the person is', icon: 'user' },
    { id: 'contact', no: '02', title: 'Contact', hint: 'How to reach them', icon: 'phone' },
    { id: 'location', no: '03', title: 'Location', hint: 'Where they live', icon: 'pin' },
    { id: 'source', no: '04', title: 'Source', hint: 'Where the lead came from', icon: 'source' },
    { id: 'consent', no: '05', title: 'Consent', hint: 'Optional - contact permission', icon: 'shield' },
  ];

  // ---- state ----
  protected readonly f = signal<LeadForm>({ ...EMPTY, phones: [''] });
  /** true once the user edits Display name themselves (stops auto-fill from first + last name). */
  private readonly displayEdited = signal(false);
  protected readonly touched = signal<Set<string>>(new Set());
  protected readonly submitted = signal(false);
  protected readonly saved = signal<{ ref: string; name: string } | null>(null);
  protected readonly active = signal<SectionId>('identity');

  protected readonly cityOpts = computed<LcOpt[]>(() => this.cityRows().filter((r) => r.status === 'active').map((r) => ({ value: r.name, label: r.name })));
  protected readonly isIndia = computed(() => this.f().country === 'India');

  /** Field -> error message ('' when fine). Consent fields are only checked when consent is switched on. */
  protected readonly errors = computed<Record<string, string>>(() => {
    const f = this.f();
    const e: Record<string, string> = {};
    const need = (k: string, v: string, msg = 'Required') => { if (!v.trim()) e[k] = msg; };

    need('firstName', f.firstName);
    need('lastName', f.lastName);
    need('displayName', f.displayName);

    f.phones.forEach((p, i) => {
      const d = p.replace(/\D/g, '');
      if (i === 0 && !d) e['phone0'] = 'Required';
      else if (d && !MOBILE.test(d)) e['phone' + i] = 'Enter a 10-digit mobile number';
    });
    if (!f.email.trim()) e['email'] = 'Required';
    else if (!EMAIL.test(f.email.trim())) e['email'] = 'Enter a valid e-mail address';
    need('language', f.language, 'Pick a language');

    need('address1', f.address1);
    if (f.zip.trim() && !ZIP.test(f.zip.trim())) e['zip'] = 'Zipcode has 6 digits';
    need('country', f.country, 'Pick a country');
    need('state', f.state, this.isIndia() ? 'Pick a state' : 'Required');
    need('city', f.city, this.isIndia() ? 'Pick a city' : 'Required');

    need('source', f.source, 'Pick a source');
    need('campaign', f.campaign, 'Pick a campaign');
    if (f.sourceDetails.trim() && f.sourceDetails.trim().length < 10) e['sourceDetails'] = 'Use at least 10 characters';

    if (f.consentOn) {
      if (!f.channels.length) e['channels'] = 'Pick at least one way to contact';
      need('recognition', f.recognition, 'Choose one');
      need('capturedThrough', f.capturedThrough, 'Pick a channel');
      need('consentState', f.consentState, 'Pick a state');
      need('effDate', f.effDate, 'Pick a date');
      const h = Number(f.hh), m = Number(f.mm);
      if (!f.hh || !f.mm) e['time'] = 'Enter the time';
      else if (!(h >= 1 && h <= 12) || !(m >= 0 && m <= 59)) e['time'] = 'Use HH 1-12 and MM 0-59';
      if (f.consentState === 'Granted' && !f.evidence) e['evidence'] = 'Evidence is needed when consent is granted';
      if (f.purpose.trim().length < 10) e['purpose'] = f.purpose.trim() ? 'Use at least 10 characters' : 'Required';
    }
    return { ...e, ...this.serverErrors() };
  });

  /** Per section: done / has error (shown only after a submit or a blur) / untouched. */
  protected readonly sectionState = computed<Record<SectionId, 'done' | 'error' | 'todo' | 'off'>>(() => {
    const e = this.errors();
    const out = {} as Record<SectionId, 'done' | 'error' | 'todo' | 'off'>;
    for (const s of this.sections) {
      if (s.id === 'consent' && !this.f().consentOn) { out[s.id] = 'off'; continue; }
      const bad = SECTION_FIELDS[s.id].some((k) => e[k]);
      const seen = this.submitted() || SECTION_FIELDS[s.id].some((k) => this.touched().has(k));
      out[s.id] = !bad ? 'done' : seen ? 'error' : 'todo';
    }
    return out;
  });

  protected readonly doneCount = computed(() => Object.values(this.sectionState()).filter((s) => s === 'done').length);
  protected readonly needed = computed(() => (this.f().consentOn ? 5 : 4));
  protected readonly progress = computed(() => Math.round((Math.min(this.doneCount(), this.needed()) / this.needed()) * 100));
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);

  /** Live summary card on the right - fills in as the form is typed. */
  protected readonly preview = computed(() => {
    const f = this.f();
    const name = f.displayName.trim() || (f.firstName.trim() + ' ' + f.lastName.trim()).trim();
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    const phone = f.phones.find((p) => p.length === 10) ?? '';
    const consent = !f.consentOn ? 'Not collected' : f.consentState || 'Collecting';
    return {
      name,
      initials,
      phone: phone ? '+91 ' + phone.slice(0, 5) + ' ' + phone.slice(5) : '',
      email: f.email.trim(),
      place: [f.city, f.state].filter(Boolean).join(', '),
      language: f.language,
      campaign: this.campaignList().find((c) => c.value === f.campaign)?.label ?? '',
      source: this.sourceList().find((s) => s.value === f.source)?.label ?? '',
      consent,
      channels: f.consentOn ? f.channels.length : 0,
    };
  });

  /** Short status text next to each section title. */
  stateLabel(id: SectionId): string {
    switch (this.sectionState()[id]) {
      case 'done': return 'Complete';
      case 'error': return 'Needs attention';
      case 'off': return 'Optional';
      default: return 'To do';
    }
  }

  ngOnInit(): void {
    const opts = (list: DonLookupItem[] | undefined, withHint = false): LcOpt[] =>
      (list ?? []).map((o) => ({ value: o.value, label: o.label, ...(withHint && o.description ? { hint: o.description } : {}) }));
    this.api.getLeadCaptureForm().subscribe({
      next: (r) => {
        this.languageList.set(opts(r.languageOptions));
        this.sourceList.set(opts(r.sourceOptions));
        this.campaignList.set(opts(r.campaignOptions, true));
        this.consentStateList.set(opts(r.consentStateOptions));
        this.captureChannelList.set(opts(r.consentChannelOptions));
        this.diallingCode = r.defaultDiallingCode || '+91';
      },
      error: (e: unknown) => this.toast.show('Lead capture unavailable', apiErrorMessage(e), 'error')
    });
    this.geo.getCountries().subscribe((c) => {
      this.countryRows.set(c);
      this.loadStates(this.f().country);
    });
  }

  private loadStates(countryName: string): void {
    const c = this.countryRows().find((x) => x.name === countryName);
    this.stateRows.set([]);
    this.cityRows.set([]);
    if (c) this.geo.getStates(c.id).subscribe((r) => this.stateRows.set(r));
  }

  private loadCities(stateName: string): void {
    const c = this.countryRows().find((x) => x.name === this.f().country);
    const st = this.stateRows().find((x) => x.name === stateName);
    this.cityRows.set([]);
    if (st) this.geo.getCities(st.id, c?.id).subscribe((r) => this.cityRows.set(r));
  }

  // ---- helpers for the template ----
  icon(n: string): string { return LC_ICONS[n] ?? ''; }

  /** Error text for a field, shown after blur or after a submit attempt. */
  err(k: string): string {
    return this.submitted() || this.touched().has(k) ? this.errors()[k] ?? '' : '';
  }

  touch(k: string): void {
    if (this.touched().has(k)) return;
    this.touched.update((s) => new Set(s).add(k));
  }

  set<K extends Key>(k: K, v: LeadForm[K]): void {
    this.f.update((f) => {
      const next = { ...f, [k]: v };
      // Display name follows first + last until the user types in it.
      if ((k === 'firstName' || k === 'lastName') && !this.displayEdited()) {
        next.displayName = (next.firstName.trim() + ' ' + next.lastName.trim()).trim().slice(0, 50);
      }
      // Changing the country / state clears what depended on it.
      if (k === 'country') { next.state = ''; next.city = ''; }
      if (k === 'state') next.city = '';
      return next;
    });
    if (k === 'country') this.loadStates(v as string);
    if (k === 'state') this.loadCities(v as string);
    if (Object.keys(this.serverErrors()).length) this.serverErrors.set({});
  }

  setDisplay(v: string): void {
    this.displayEdited.set(true);
    this.set('displayName', v.slice(0, 50));
  }

  // phones
  setPhone(i: number, v: string): void {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    this.f.update((f) => ({ ...f, phones: f.phones.map((p, j) => (j === i ? digits : p)) }));
  }
  addPhone(): void {
    if (this.f().phones.length < 3) this.f.update((f) => ({ ...f, phones: [...f.phones, ''] }));
  }
  removePhone(i: number): void {
    this.f.update((f) => ({ ...f, phones: f.phones.filter((_, j) => j !== i) }));
  }

  // consent
  toggleConsent(): void { this.set('consentOn', !this.f().consentOn); }
  hasChannel(k: string): boolean { return this.f().channels.includes(k); }
  toggleChannel(k: string): void {
    const c = this.f().channels;
    this.set('channels', c.includes(k) ? c.filter((x) => x !== k) : [...c, k]);
    this.touch('channels');
  }
  setTime(k: 'hh' | 'mm', v: string): void { this.set(k, v.replace(/\D/g, '').slice(0, 2)); }

  onEvidence(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const okType = /\.(pdf|jpe?g|png)$/i.test(file.name);
    const okSize = file.size <= 5 * 1024 * 1024;
    this.touch('evidence');
    this.set('evidence', okType && okSize ? file.name : '');
    (e.target as HTMLInputElement).value = '';
  }

  len(k: 'displayName' | 'sourceDetails' | 'purpose' | 'notes'): number { return this.f()[k].length; }

  // navigation between sections
  go(id: SectionId): void {
    this.active.set(id);
    document.getElementById('lc-sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- actions ----
  submit(): void {
    // Messages from an earlier attempt must not keep blocking the form once it is fixed.
    this.serverErrors.set({});
    this.submitted.set(true);
    const st = this.sectionState();
    const first = this.sections.find((s) => st[s.id] === 'error');
    if (first) { this.go(first.id); return; }
    if (this.saving()) return;
    this.saving.set(true);
    // Two calls, in order, as before: save creates the record, submit moves it out of draft so
    // it appears in the Lead Work Queue (a draft never does).
    this.api.saveLead(this.buildRequest()).pipe(
      switchMap((lead) => this.api.submitLead(lead.id, {
        reason: 'Captured and submitted to the Lead Queue from Lead Capture.',
        expectedVersion: lead.version,
      }).pipe(map(() => lead)))
    ).subscribe({
      next: (lead) => {
        this.saving.set(false);
        this.saved.set({ ref: lead.leadReference, name: lead.displayName || this.f().displayName });
      },
      error: (e: unknown) => {
        this.saving.set(false);
        const fields = apiFieldErrors(e);
        const map: Record<string, string> = {
          firstName: 'firstName', lastName: 'lastName', displayName: 'displayName', mobileNumber: 'phone0',
          emailAddress: 'email', preferredLanguage: 'language', addressLine: 'address1', country: 'country',
          geographyCode: 'state', city: 'city', source: 'source', campaignId: 'campaign', notes: 'sourceDetails'
        };
        const mapped: Record<string, string> = {};
        for (const [field, message] of Object.entries(fields)) {
          const key = map[field.charAt(0).toLowerCase() + field.slice(1)];
          if (key) mapped[key] = message;
        }
        this.serverErrors.set(mapped);
        this.toast.show('Lead not saved', apiErrorMessage(e), 'error');
      }
    });
  }

  private buildRequest(): CreateLeadRequest {
    const f = this.f();
    const e164 = (p: string) => (p.replace(/\D/g, '') ? this.diallingCode + p.replace(/\D/g, '') : null);
    const [primary, ...others] = f.phones.map(e164).filter((p): p is string => !!p);
    let consent: CreateLeadRequest['consent'] = null;
    if (f.consentOn) {
      let hour = Number(f.hh) % 12;
      if (f.ampm === 'PM') hour += 12;
      const at = new Date(`${f.effDate}T${String(hour).padStart(2, '0')}:${String(Number(f.mm)).padStart(2, '0')}:00+05:30`);
      consent = {
        collectConsent: true,
        emailConsent: f.channels.includes('email'),
        smsConsent: f.channels.includes('sms'),
        whatsAppConsent: f.channels.includes('whatsapp'),
        phoneCallConsent: f.channels.includes('phone'),
        doNotContact: false,
        consentState: f.consentState || null,
        consentSource: this.captureChannelList().find((o) => o.value === f.capturedThrough)?.label ?? null,
        consentDateUtc: Number.isNaN(at.getTime()) ? null : at.toISOString(),
        publicRecognitionPreference: f.recognition === 'Recognised',
        consentEvidenceReference: f.evidence || null,
        purpose: f.purpose.trim() || null
      };
    }
    return {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim() || null,
      displayName: f.displayName.trim() || null,
      mobileNumber: primary ?? null,
      alternateMobileNumbers: others,
      emailAddress: f.email.trim() || null,
      preferredLanguage: f.language || null,
      country: f.country || null,
      city: f.city || null,
      geographyCode: f.state || null,
      addressLine: [f.address1, f.address2, f.zip].map((x) => x.trim()).filter(Boolean).join(', ') || null,
      campaignId: f.campaign,
      source: f.source || 'Manual',
      notes: f.sourceDetails.trim() || f.notes.trim() || null,
      consent
    };
  }

  startOver(): void {
    this.f.set({ ...EMPTY, phones: [''] });
    this.displayEdited.set(false);
    this.touched.set(new Set());
    this.submitted.set(false);
    this.saved.set(null);
    this.go('identity');
  }
}