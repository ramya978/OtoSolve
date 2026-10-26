import { Component, DestroyRef, ElementRef, HostListener, afterNextRender, computed, inject, signal, viewChildren } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Footer } from '../../../Shared/layout/Footer/footer';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { CW_PATHS } from '../../../Shared/Campaign/cw-paths';
import { CampaignWorkspaceStore } from '../../../Shared/Campaign/cw.store';
import { CampaignApiService } from '../../../Service/campaign-api.service';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { PeopleDirectoryService } from '../../../Shared/services/people-directory.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { CountryLookup } from '../../../Shared/models/geo-lookup.model';
import { MasterLookup } from '../../../Shared/models/global-master.model';
import { CampaignDetail } from '../../../Shared/models/campaign-contract.model';


type SectionId = 'basic' | 'location' | 'publication' | 'review';
type EditorKey = 'purpose' | 'publicDescription' | 'terms';
type Activation = 'auto' | 'manual';
type Period = 'AM' | 'PM';

type FieldKey =
  | 'name' | 'code' | 'startDate' | 'endDate' | 'amount' | 'target' | 'fund' | 'owner' | 'purpose'
  | 'country' | 'zip' | 'daysBefore' | 'reminder'
  | 'publicDescription' | 'terms';

type IconName =
  | 'plus' | 'back' | 'check' | 'close' | 'chevron' | 'calendar' | 'help' | 'info' | 'arrow' | 'eye' | 'pen'
  | 'search' | 'fund' | 'donor' | 'receipt' | 'user' | 'left' | 'right' | 'alert' | 'clock'
  | 'alignLeft' | 'alignCenter' | 'alignRight';

export interface CampaignForm {
  name: string;
  code: string;
  /** ISO yyyy-mm-dd */
  startDate: string | null;
  endDate: string | null;
  amount: string;
  target: string;
  fund: string;
  ownerId: string | null;
  purpose: string;
  country: string | null;
  state: string | null;
  city: string | null;
  zip: string;
  activation: Activation;
  daysBefore: string;
  remHour: string | null;
  remMinute: string | null;
  remPeriod: Period;
  publicDescription: string;
  terms: string;
}

/** What the page emits on launch. */
export interface CampaignDraft extends CampaignForm {
  amountValue: number;
  targetValue: number;
  /** 24-hour "HH:MM" */
  reminderTime: string;
}

interface Owner {
  id: string;
  name: string;
  role: string;
}

interface Section {
  id: SectionId;
  no: string;
  title: string;
  sub: string;
  fields: FieldKey[];
}

interface EditorConfig {
  key: EditorKey;
  label: string;
  placeholder: string;
  max: number;
  help: string;
  hint: string;
}

interface CalDay {
  iso: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  disabled: boolean;
}

interface MenuChoice {
  label: string;
  value: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SIZE_CHOICES: MenuChoice[] = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' }
];
const FONT_CHOICES: MenuChoice[] = [
  { label: 'Inter', value: 'Inter, Segoe UI, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, Times New Roman, serif' },
  { label: 'Mono', value: 'ui-monospace, Consolas, monospace' }
];
const BLOCK_CHOICES: MenuChoice[] = [
  { label: 'Normal', value: 'p' },
  { label: 'Heading', value: 'h3' },
  { label: 'Quote', value: 'blockquote' }
];

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const CODE = /^[A-Z0-9-]{3,20}$/;
const ZIP = /^[A-Za-z0-9 -]{3,10}$/;

const EMPTY_FORM: CampaignForm = {
  name: '', code: '', startDate: null, endDate: null, amount: '', target: '', fund: '', ownerId: null,
  purpose: '', country: null, state: null, city: null, zip: '', activation: 'manual', daysBefore: '',
  remHour: null, remMinute: null, remPeriod: 'AM', publicDescription: '', terms: ''
};

const ICONS: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  back: 'M19 12H5M11 18l-6-6 6-6',
  check: 'M20 6L9 17l-5-5',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  pen: 'M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  fund: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
  donor: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10'
};

/** Local yyyy-mm-dd (no timezone shift). */
const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fromIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

@Component({
  selector: 'app-new-campaign',
  imports: [NgTemplateOutlet, RouterLink, PageHeader],
  templateUrl: './new-campaign.html',
  styleUrls: ['./new-campaign.css', '../../../Shared/layout/page-header/page-header.css']
})
export class NewCampaign {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(CampaignWorkspaceStore);
  private readonly api = inject(CampaignApiService);
  private readonly geo = inject(GeoMasterService);
  private readonly people = inject(PeopleDirectoryService);

  private readonly countryRows = signal<CountryLookup[]>([]);
  private readonly stateRows = signal<MasterLookup[]>([]);
  private readonly cityRows = signal<MasterLookup[]>([]);
  private editDetail: CampaignDetail | null = null;
  protected readonly saving = signal(false);

  protected readonly paths = CW_PATHS;

  // ---- static data ----
  protected readonly sections: Section[] = [
    {
      id: 'basic', no: '01', title: 'Basic information', sub: 'Campaign identity, dates, amounts and the accountable owner.',
      fields: ['name', 'code', 'startDate', 'endDate', 'amount', 'target', 'fund', 'owner', 'purpose']
    },
    {
      id: 'location', no: '02', title: 'Location & reminder', sub: 'Where the campaign runs and the pre-launch reminder.',
      fields: ['country', 'zip', 'daysBefore', 'reminder']
    },
    {
      id: 'publication', no: '03', title: 'Publication & notice', sub: 'Public description and donor-facing terms.',
      fields: ['publicDescription', 'terms']
    },
  ];

  protected readonly editors: Record<EditorKey, EditorConfig> = {
    purpose: {
      key: 'purpose', label: 'Purpose', max: 1000,
      placeholder: 'Describe the controlled purpose of this campaign…',
      help: 'Internal purpose. Only staff with campaign access can read it.',
      hint: 'Shown to staff only.'
    },
    publicDescription: {
      key: 'publicDescription', label: 'Public description', max: 2000,
      placeholder: 'Public-facing description (published only through a separately approved publication field)…',
      help: 'The wording donors see once the campaign is published.',
      hint: 'Published only after approval.'
    },
    terms: {
      key: 'terms', label: 'Terms and notice', max: 20000,
      placeholder: 'Terms and notice — donor-facing terms, disclaimers and legal notices…',
      help: 'Donor-facing terms, disclaimers and legal notices.',
      hint: 'Shown with every donation receipt.'
    }
  };

  protected readonly sizeChoices = SIZE_CHOICES;
  protected readonly fontChoices = FONT_CHOICES;
  protected readonly blockChoices = BLOCK_CHOICES;
  protected readonly hours = HOURS;
  protected readonly minutes = MINUTES;
  protected readonly weekdays = WEEKDAYS;
  protected readonly requiredTotal = 15;

  // ---- form state ----
  protected readonly form = signal<CampaignForm>({ ...EMPTY_FORM });
  private readonly editorText = signal<Record<EditorKey, string>>({ purpose: '', publicDescription: '', terms: '' });
  protected readonly touched = signal<ReadonlySet<FieldKey>>(new Set());
  protected readonly submitted = signal(false);

  /** Campaign code opened for editing (?code=XXX). Null = create mode. */
  protected readonly editingCode: string | null;
  /** True when editing an existing campaign instead of creating one. */
  protected readonly isEdit = signal(false);

  // ---- ui state ----
  /** Id of the open dropdown / date picker (only one at a time). */
  protected readonly openMenu = signal<string | null>(null);
  protected readonly activeIndex = signal(0);
  protected readonly ownerQuery = signal('');
  protected readonly countryQuery = signal('');
  protected readonly calMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly currentSection = signal<SectionId>('basic');
  protected readonly previewing = signal<ReadonlySet<EditorKey>>(new Set());
  protected readonly marks = signal<Record<EditorKey, { b: boolean; i: boolean; u: boolean }>>({
    purpose: { b: false, i: false, u: false },
    publicDescription: { b: false, i: false, u: false },
    terms: { b: false, i: false, u: false }
  });
  protected readonly blockLabel = signal<Record<EditorKey, string>>({ purpose: 'Normal', publicDescription: 'Normal', terms: 'Normal' });
  protected readonly toast = signal<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly editorEls = viewChildren<ElementRef<HTMLElement>>('ed');

  // ---- derived ----
  protected readonly todayIso = toIso(new Date());

  /** People a campaign can be made accountable to - from IAM, within the caller's scope. */
  private readonly owners = computed<Owner[]>(() =>
    this.people.staffAssignable().map((p) => ({ id: p.reference, name: p.name, role: p.context })));

  protected readonly owner = computed(() => this.owners().find((o) => o.id === this.form().ownerId) ?? null);

  protected readonly filteredOwners = computed(() => {
    const q = this.ownerQuery().trim().toLowerCase();
    return q ? this.owners().filter((o) => (o.name + ' ' + o.role).toLowerCase().includes(q)) : this.owners();
  });

  protected readonly filteredCountries = computed(() => {
    const q = this.countryQuery().trim().toLowerCase();
    const names = this.countryRows().filter((c) => c.status === 'active').map((c) => c.name);
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  });

  protected readonly states = computed(() => this.stateRows().filter((r) => r.status === 'active').map((r) => r.name));

  protected readonly cities = computed(() => this.cityRows().filter((r) => r.status === 'active').map((r) => r.name));

  protected readonly calTitle = computed(() => {
    const m = this.calMonth();
    return `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
  });

  protected readonly calDays = computed<CalDay[]>(() => {
    const month = this.calMonth();
    const which = this.openMenu();
    const f = this.form();
    const selected = which === 'end-date' ? f.endDate : f.startDate;
    const min = which === 'end-date' ? (f.startDate ?? this.todayIso) : this.todayIso;
    const offset = (month.getDay() + 6) % 7; // Monday first
    const days: CalDay[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(month.getFullYear(), month.getMonth(), 1 - offset + i);
      const iso = toIso(d);
      days.push({
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === month.getMonth(),
        today: iso === this.todayIso,
        selected: iso === selected,
        disabled: which === 'end-date' ? iso <= min : iso < min
      });
    }
    return days;
  });

  /** Error per field (null = fine). Shown once the field is touched or after Launch. */
  protected readonly errors = computed<Record<FieldKey, string | null>>(() => {
    const f = this.form();
    const t = this.editorText();
    const amount = Number(f.amount);
    const target = Number(f.target);
    const days = f.daysBefore.trim();
    return {
      name: !f.name.trim() ? 'Enter the campaign name.' : f.name.length > 120 ? 'Keep the name under 120 characters.' : null,
      code: !f.code ? 'Enter a campaign code.' : !CODE.test(f.code) ? 'Use 3–20 capital letters, numbers or hyphens.' : null,
      startDate: !f.startDate ? 'Pick a start date.' : null,
      endDate: !f.endDate ? 'Pick an end date.' : f.startDate && f.endDate <= f.startDate ? 'End date must be after the start date.' : null,
      amount: !f.amount ? 'Enter the campaign amount.' : !MONEY.test(f.amount) || amount <= 0 ? 'Enter an amount like 5000 or 5000.50.' : null,
      target: !f.target
        ? 'Enter the target amount.'
        : !MONEY.test(f.target) || target <= 0
          ? 'Enter an amount like 1000000.'
          : MONEY.test(f.amount) && target < amount ? 'Target can’t be lower than the campaign amount.' : null,
      fund: !f.fund.trim() ? 'Enter the fund or programme.' : null,
      owner: !f.ownerId ? 'Choose an eligible owner.' : null,
      purpose: !t.purpose.trim() ? 'Describe the purpose.' : t.purpose.length > 1000 ? 'Keep it within 1000 characters.' : null,
      country: !f.country ? 'Choose a country.' : null,
      zip: !f.zip.trim() ? 'Enter the zip code.' : !ZIP.test(f.zip.trim()) ? 'Enter a valid zip / postal code.' : null,
      daysBefore: !days ? 'Enter the number of days.' : !/^\d{1,3}$/.test(days) || Number(days) > 365 ? 'Use a whole number from 0 to 365.' : null,
      reminder: !f.remHour || !f.remMinute ? 'Pick the reminder time.' : null,
      publicDescription: !t.publicDescription.trim() ? 'Write the public description.' : t.publicDescription.length > 2000 ? 'Keep it within 2000 characters.' : null,
      terms: !t.terms.trim() ? 'Write the terms and notice.' : t.terms.length > 20000 ? 'Keep it within 20,000 characters.' : null
    };
  });

  /** Required inputs that have something in them (presence only). */
  protected readonly filledCount = computed(() => {
    const f = this.form();
    const t = this.editorText();
    return [
      f.name.trim(), f.code, f.startDate, f.endDate, f.amount, f.target, f.fund.trim(), f.ownerId, t.purpose.trim(),
      f.country, f.zip.trim(), f.daysBefore.trim(), f.remHour && f.remMinute, t.publicDescription.trim(), t.terms.trim()
    ].filter(Boolean).length;
  });

  protected readonly invalidCount = computed(() => Object.values(this.errors()).filter(Boolean).length);
  protected readonly ready = computed(() => this.invalidCount() === 0);

  // ---- review figures ----
  protected readonly reviewPurpose = computed(() => this.clip(this.editorText().purpose, 160));
  protected readonly reviewPublic = computed(() => this.clip(this.editorText().publicDescription, 260));
  protected readonly reviewTerms = computed(() => this.clip(this.editorText().terms, 260));

  protected readonly reviewLocation = computed(() => {
    const f = this.form();
    const parts = [f.city, f.state, f.country].filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  });

  protected readonly reviewReminder = computed(() => {
    const f = this.form();
    const days = f.daysBefore.trim() || '0';
    const time = f.remHour && f.remMinute ? `${f.remHour}:${f.remMinute} ${f.remPeriod}` : '—';
    return `${days} day${days === '1' ? '' : 's'} before start, at ${time}`;
  });

  constructor() {
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      // older browsers - formatting still works
    }

    this.geo.getCountries().subscribe((c) => this.countryRows.set(c));

    // edit mode: /campaign-wizard?code=XXX pre-fills the wizard from the campaign's full record
    const code = this.route.snapshot.queryParamMap.get('code');
    this.editingCode = code;
    const meta = code ? this.store.findCampaign(code) : undefined;
    if (code && meta?.id) this.loadForEdit(meta.id);
    else if (code) {
      // the register has not finished loading: find the campaign once it has
      const stop = setInterval(() => {
        const m = this.store.findCampaign(code);
        if (m?.id) { clearInterval(stop); this.loadForEdit(m.id); }
      }, 300);
      this.destroyRef.onDestroy(() => clearInterval(stop));
    }

    // left index follows the section in view
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      const io = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          const id = visible?.target.getAttribute('data-section') as SectionId | null;
          if (id) this.currentSection.set(id);
        },
        { rootMargin: '-20% 0px -60% 0px' }
      );
      this.host.nativeElement.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
      this.destroyRef.onDestroy(() => io.disconnect());
    });

    this.destroyRef.onDestroy(() => clearTimeout(this.toastTimer));
  }

  private loadForEdit(id: string): void {
    this.api.getCampaign(id).subscribe({
      next: (d) => {
        this.editDetail = d;
        this.isEdit.set(true);
        const hm = /^(\d{1,2}):(\d{2})/.exec(d.reminderTime ?? '');
        const h24 = hm ? Number(hm[1]) : 10;
        this.form.set({
          name: d.name, code: d.code, startDate: d.startDate.slice(0, 10), endDate: d.endDate.slice(0, 10),
          amount: String(d.campaignAmount), target: String(d.targetAmount), fund: d.fundOrProgramme,
          ownerId: d.ownerIds[0] ?? null, purpose: d.purposeHtml ?? d.purpose,
          country: d.countryName, state: d.stateName, city: d.cityName, zip: d.zipCode ?? '',
          activation: d.lifecycleActivation, daysBefore: String(d.daysBeforeStart ?? ''),
          remHour: String(((h24 + 11) % 12) + 1).padStart(2, '0'), remMinute: hm ? hm[2] : '00', remPeriod: h24 < 12 ? 'AM' : 'PM',
          publicDescription: d.publicDescription ?? '', terms: d.termsAndNotice ?? ''
        });
        this.editorText.set({ purpose: d.purpose, publicDescription: d.publicDescription ?? '', terms: d.termsAndNotice ?? '' });
        setTimeout(() => {
          const els = this.editorEls();
          const html = [d.purposeHtml ?? d.purpose, d.publicDescription ?? '', d.termsAndNotice ?? ''];
          els.forEach((r, i) => { if (html[i] !== undefined) r.nativeElement.innerHTML = html[i]; });
        });
        const country = this.countryRows().find((c) => c.id === d.countryId);
        if (d.countryId) this.geo.getStates(d.countryId).subscribe((r) => this.stateRows.set(r));
        if (d.stateId) this.geo.getCities(d.stateId, d.countryId).subscribe((r) => this.cityRows.set(r));
        void country;
      },
      error: (e) => this.showToast(apiErrorMessage(e, 'The campaign could not be loaded.'), 'warn'),
    });
  }

  // =================================================================================================
  // helpers
  // =================================================================================================
  protected icon(name: IconName): string {
    return ICONS[name];
  }

  protected showError(key: FieldKey): string | null {
    return this.submitted() || this.touched().has(key) ? this.errors()[key] : null;
  }

  protected sectionFilled(s: Section): number {
    return s.fields.filter((k) => !this.errors()[k]).length;
  }

  protected sectionDone(s: Section): boolean {
    return s.id === 'review' ? this.ready() : s.fields.every((k) => !this.errors()[k]);
  }

  protected sectionHasError(s: Section): boolean {
    return this.submitted() && s.fields.some((k) => this.errors()[k]);
  }

  protected displayDate(iso: string | null): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }

  protected shortDate(iso: string | null): string {
    if (!iso) return '—';
    return fromIso(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  protected money(value: string): string {
    if (!MONEY.test(value)) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
  }

  protected charCount(key: EditorKey): number {
    return this.editorText()[key].length;
  }

  /** Bold / italic / underline state for the toolbar buttons. */
  protected isMarked(key: EditorKey, mark: 'b' | 'i' | 'u'): boolean {
    return this.marks()[key][mark];
  }

  /** Current block style label ("Normal", "Heading", "Quote"). */
  protected blockOf(key: EditorKey): string {
    return this.blockLabel()[key];
  }

  protected isPreview(key: EditorKey): boolean {
    return this.previewing().has(key);
  }

  private clip(text: string, max: number): string {
    const t = text.trim().replace(/\s+/g, ' ');
    if (!t) return '—';
    return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
  }

  private patch(p: Partial<CampaignForm>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected touch(key: FieldKey): void {
    if (this.touched().has(key)) return;
    this.touched.update((s) => new Set(s).add(key));
  }

  // =================================================================================================
  // plain inputs
  // =================================================================================================
  protected setText(key: 'name' | 'fund' | 'zip', event: Event): void {
    this.patch({ [key]: (event.target as HTMLInputElement).value } as Partial<CampaignForm>);
  }

  /** Code is upper-case, letters / digits / hyphen only. */
  protected setCode(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    if (clean !== input.value) input.value = clean;
    this.patch({ code: clean });
  }

  /** Money fields keep digits and one decimal point with two places. */
  protected setMoney(key: 'amount' | 'target', event: Event): void {
    const input = event.target as HTMLInputElement;
    let clean = input.value.replace(/[^\d.]/g, '');
    const dot = clean.indexOf('.');
    if (dot >= 0) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    if (clean !== input.value) input.value = clean;
    this.patch({ [key]: clean } as Partial<CampaignForm>);
  }

  protected setDays(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.replace(/\D/g, '').slice(0, 3);
    if (clean !== input.value) input.value = clean;
    this.patch({ daysBefore: clean });
  }

  protected setActivation(value: Activation): void {
    this.patch({ activation: value });
  }

  protected setPeriod(value: Period): void {
    this.patch({ remPeriod: value });
  }

  // =================================================================================================
  // custom dropdowns
  // =================================================================================================
  protected toggleMenu(id: string, event?: Event): void {
    event?.stopPropagation();
    if (this.openMenu() === id) {
      this.closeMenu();
      return;
    }
    this.openMenuFor(id);
  }

  private openMenuFor(id: string): void {
    if (this.openMenu() && this.openMenu() !== id) this.closeMenu();
    this.openMenu.set(id);
    this.activeIndex.set(0);
    if (id === 'start-date' || id === 'end-date') {
      const f = this.form();
      const base = (id === 'end-date' ? f.endDate ?? f.startDate : f.startDate) ?? this.todayIso;
      const d = fromIso(base);
      this.calMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  protected closeMenu(): void {
    const id = this.openMenu();
    if (!id) return;
    this.openMenu.set(null);
    if (id === 'owner') {
      this.ownerQuery.set('');
      this.touch('owner');
    }
    if (id === 'country') {
      this.countryQuery.set('');
      this.touch('country');
    }
    if (id === 'start-date') this.touch('startDate');
    if (id === 'end-date') this.touch('endDate');
    if (id === 'hour' || id === 'minute') this.touch('reminder');
  }

  /** Searchable combos: typing opens the list and filters it. */
  protected search(id: 'owner' | 'country', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    (id === 'owner' ? this.ownerQuery : this.countryQuery).set(value);
    if (this.openMenu() !== id) this.openMenu.set(id);
    this.activeIndex.set(0);
  }

  protected openCombo(id: 'owner' | 'country'): void {
    if (this.openMenu() !== id) this.openMenuFor(id);
  }

  protected pickOwner(o: Owner): void {
    this.patch({ ownerId: o.id });
    this.closeMenu();
  }

  protected pickCountry(name: string): void {
    if (name !== this.form().country) {
      this.patch({ country: name, state: null, city: null });
      this.stateRows.set([]);
      this.cityRows.set([]);
      const id = this.countryRows().find((c) => c.name === name)?.id;
      if (id) this.geo.getStates(id).subscribe((r) => this.stateRows.set(r));
    }
    this.closeMenu();
  }

  protected pickState(name: string): void {
    if (name !== this.form().state) {
      this.patch({ state: name, city: null });
      this.cityRows.set([]);
      const id = this.stateRows().find((r) => r.name === name)?.id;
      const countryId = this.countryRows().find((c) => c.name === this.form().country)?.id;
      if (id) this.geo.getCities(id, countryId).subscribe((r) => this.cityRows.set(r));
    }
    this.closeMenu();
  }

  protected pickCity(name: string): void {
    this.patch({ city: name });
    this.closeMenu();
  }

  protected pickHour(h: string): void {
    this.patch({ remHour: h });
    this.closeMenu();
  }

  protected pickMinute(m: string): void {
    this.patch({ remMinute: m });
    this.closeMenu();
  }

  /** Arrow / Enter / Escape on any open list. */
  protected menuKey(event: KeyboardEvent, id: string): void {
    const list = this.menuList(id);
    if (!list) return;
    const isOpen = this.openMenu() === id;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        this.openMenuFor(id);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const n = list.count;
      if (n) this.activeIndex.update((i) => (i + step + n) % n);
      this.scrollActiveIntoView();
    } else if (event.key === 'Enter') {
      if (!isOpen || !list.count) return;
      event.preventDefault();
      list.pick(this.activeIndex());
    } else if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      this.closeMenu();
    } else if (event.key === 'Tab' && isOpen) {
      this.closeMenu();
    }
  }

  private menuList(id: string): { count: number; pick: (i: number) => void } | null {
    switch (id) {
      case 'owner': return { count: this.filteredOwners().length, pick: (i) => this.pickOwner(this.filteredOwners()[i]) };
      case 'country': return { count: this.filteredCountries().length, pick: (i) => this.pickCountry(this.filteredCountries()[i]) };
      case 'state': return { count: this.states().length, pick: (i) => this.pickState(this.states()[i]) };
      case 'city': return { count: this.cities().length, pick: (i) => this.pickCity(this.cities()[i]) };
      case 'hour': return { count: HOURS.length, pick: (i) => this.pickHour(HOURS[i]) };
      case 'minute': return { count: MINUTES.length, pick: (i) => this.pickMinute(MINUTES[i]) };
      default: return null;
    }
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() => {
      this.host.nativeElement.querySelector('.cp-menu .is-active')?.scrollIntoView({ block: 'nearest' });
    });
  }

  // =================================================================================================
  // date picker
  // =================================================================================================
  protected shiftMonth(step: number, event: Event): void {
    event.stopPropagation();
    const m = this.calMonth();
    this.calMonth.set(new Date(m.getFullYear(), m.getMonth() + step, 1));
  }

  protected pickDate(day: CalDay): void {
    if (day.disabled) return;
    if (this.openMenu() === 'end-date') {
      this.patch({ endDate: day.iso });
    } else {
      const end = this.form().endDate;
      this.patch({ startDate: day.iso, endDate: end && end <= day.iso ? null : end });
    }
    this.closeMenu();
  }

  protected pickToday(): void {
    const which = this.openMenu();
    if (which === 'start-date') this.pickDate({ iso: this.todayIso, day: 0, inMonth: true, today: true, selected: false, disabled: false });
  }

  protected clearDate(): void {
    this.patch(this.openMenu() === 'end-date' ? { endDate: null } : { startDate: null });
    this.closeMenu();
  }

  // =================================================================================================
  // rich text editors
  // =================================================================================================
  protected onEditorInput(key: EditorKey, el: HTMLElement): void {
    // an editor left with only <br> / empty blocks counts as empty (shows the placeholder again)
    if (!el.textContent?.trim() && !el.querySelector('li')) el.innerHTML = '';
    this.patch({ [key]: el.innerHTML } as Partial<CampaignForm>);
    this.editorText.update((t) => ({ ...t, [key]: el.textContent ?? '' }));
    this.readMarks(key);
  }

  /** Stop typing once the character limit is reached. */
  protected onBeforeInput(key: EditorKey, event: Event): void {
    const type = (event as InputEvent).inputType ?? '';
    if (!type.startsWith('insert') || type === 'insertParagraph' || type === 'insertLineBreak') return;
    const sel = window.getSelection();
    const replacing = sel && !sel.isCollapsed ? sel.toString().length : 0;
    if (this.charCount(key) - replacing >= this.editors[key].max) event.preventDefault();
  }

  /** Paste as plain text, trimmed to the remaining space. */
  protected onPaste(key: EditorKey, event: Event): void {
    event.preventDefault();
    const text = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    const sel = window.getSelection();
    const replacing = sel && !sel.isCollapsed ? sel.toString().length : 0;
    const room = this.editors[key].max - this.charCount(key) + replacing;
    if (room > 0) document.execCommand('insertText', false, text.slice(0, room));
  }

  protected exec(key: EditorKey, el: HTMLElement, command: string, value?: string): void {
    if (this.isPreview(key)) return;
    if (document.activeElement !== el) el.focus();
    document.execCommand(command, false, value);
    this.onEditorInput(key, el);
  }

  protected pickBlock(key: EditorKey, el: HTMLElement, choice: MenuChoice): void {
    this.exec(key, el, 'formatBlock', `<${choice.value}>`);
    this.blockLabel.update((b) => ({ ...b, [key]: choice.label }));
    this.closeMenu();
  }

  protected pickEditorChoice(key: EditorKey, el: HTMLElement, command: 'fontSize' | 'fontName', choice: MenuChoice): void {
    this.exec(key, el, command, choice.value);
    this.closeMenu();
  }

  protected readMarks(key: EditorKey): void {
    try {
      this.marks.update((m) => ({
        ...m,
        [key]: {
          b: document.queryCommandState('bold'),
          i: document.queryCommandState('italic'),
          u: document.queryCommandState('underline')
        }
      }));
    } catch {
      // queryCommandState unsupported - leave the buttons as they are
    }
  }

  protected togglePreview(key: EditorKey): void {
    this.previewing.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    this.closeMenu();
  }

  protected editorBlur(key: EditorKey): void {
    this.touch(key);
  }

  // =================================================================================================
  // navigation + actions
  // =================================================================================================
  protected goTo(id: SectionId): void {
    this.currentSection.set(id);
    this.host.nativeElement.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected launch(): void {
    this.submitted.set(true);
    this.closeMenu();

    if (!this.ready()) {
      const first = this.sections.find((s) => s.fields.some((k) => this.errors()[k]));
      if (first) this.goTo(first.id);
      const n = this.invalidCount();
      this.showToast(`${n} required detail${n === 1 ? '' : 's'} still need attention.`, 'warn');
      return;
    }

    if (this.saving()) return;
    const f = this.form();
    const country = this.countryRows().find((c) => c.name === f.country);
    const state = this.stateRows().find((r) => r.name === f.state);
    const city = this.cityRows().find((r) => r.name === f.city);
    const h12 = Number(f.remHour ?? 12) % 12;
    const h24 = f.remPeriod === 'PM' ? h12 + 12 : h12;
    const t = this.editorText();
    const channels = (this.store.reference()?.channels ?? []).filter((c) => c.isActive).map((c) => c.id);
    const shared = {
      name: f.name.trim(), purpose: t.purpose.trim(), purposeHtml: f.purpose || null, fundOrProgramme: f.fund.trim(),
      startDate: f.startDate ?? '', endDate: f.endDate ?? '', campaignAmount: Number(f.amount), targetAmount: Number(f.target),
      countryId: country?.id ?? '', ownerIds: f.ownerId ? [f.ownerId] : [], stateId: state?.id ?? '', cityId: city?.id ?? '',
      zipCode: f.zip.trim(), lifecycleActivation: f.activation, daysBeforeStart: Number(f.daysBefore),
      reminderTime: `${String(h24).padStart(2, '0')}:${f.remMinute ?? '00'}`,
      publicDescription: t.publicDescription.trim(), termsAndNotice: t.terms.trim(),
    };
    this.saving.set(true);
    const done = (code: string): void => {
      this.saving.set(false);
      this.store.reload();
      this.router.navigate([CW_PATHS.detailFor(code)]);
    };
    const fail = (e: unknown): void => {
      this.saving.set(false);
      this.showToast(apiErrorMessage(e, 'The campaign could not be saved.'), 'warn');
    };
    const editing = this.editDetail;
    if (editing) {
      this.api.updateCampaign(editing.id, {
        ...shared, expectedVersion: editing.version, currencyId: editing.currencyId,
        channelIds: editing.channelIds.length ? editing.channelIds : channels,
      }).subscribe({ next: (d) => done(d.code), error: fail });
      return;
    }
    // The wizard has no currency or channel step: the country's default currency and every active
    // channel are used, and both can be changed on the campaign afterwards.
    const currencyId = country?.defaultCurrencyId ?? '';
    const create = (currency: string): void => {
      this.api.createCampaign({ ...shared, code: f.code, currencyId: currency, channelIds: channels }).subscribe({
        next: (d) => done(d.code), error: fail,
      });
    };
    if (currencyId) create(currencyId);
    else this.geo.getCurrencies(country?.id).subscribe({ next: (list) => create(list[0]?.id ?? ''), error: fail });
  }

  protected discard(): void {
    this.form.set({ ...EMPTY_FORM });
    this.editorText.set({ purpose: '', publicDescription: '', terms: '' });
    this.editorEls().forEach((r) => (r.nativeElement.innerHTML = ''));
    this.touched.set(new Set());
    this.submitted.set(false);
    this.previewing.set(new Set());
    this.blockLabel.set({ purpose: 'Normal', publicDescription: 'Normal', terms: 'Normal' });
    this.closeMenu();
    this.goTo('basic');
    // FULL-PAGE FLOW: back to the register list page.
    this.router.navigate([CW_PATHS.register]);
  }

  /** Header Back button → register list (full page, no popup). */
  protected goBack(): void {
    this.router.navigate([CW_PATHS.register]);
  }

  private showToast(text: string, tone: 'ok' | 'warn'): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ text, tone });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3600);
  }

  // close any open list when clicking elsewhere
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.openMenu()) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-menu]')) this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}