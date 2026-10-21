import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentApiService } from '../../../Service/payment-api.service';
import { GeoMasterService } from '../../../Shared/services/geo-master.service';
import { GatewayCheckoutService } from '../../../Shared/services/gateway-checkout.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { AuthTokenService } from '../../../Shared/services/auth-token.service';
import { CheckoutSession, PublicCampaignSummary, PublicDonationFormSettings } from '../../../Shared/models/payment.model';
import { CountryLookup } from '../../../Shared/models/geo-lookup.model';
import { MasterLookup } from '../../../Shared/models/global-master.model';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
type NdMenu = 'cause' | 'currency' | 'country' | 'state' | 'city' | null;
type NdErr = 'cause' | 'currency' | 'amount' | 'mobile' | 'pan' | 'line1' | 'country' | 'state' | 'city' | 'pin' | 'privacy';

interface NdCause { code: string; name: string; org: string; id: string; }
interface NdCurrency { code: string; symbol: string; label: string; }
interface NdCountry { name: string; dial: string; id: string; }

/** The symbol a currency code is written with ("INR" -> "₹"); the code itself when the browser has none. */
function symbolOf(code: string): string {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((x) => x.type === 'currency');
    return part?.value ?? code;
  } catch {
    return code;
  }
}

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

@Component({
  selector: 'app-new-donation',
  standalone: true,
  templateUrl: './new-donation.html',
  styleUrls: ['./new-donation.css']
})
export class NewDonation implements OnInit {
  private readonly api = inject(PaymentApiService);
  private readonly geo = inject(GeoMasterService);
  private readonly checkout = inject(GatewayCheckoutService);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly tokens = inject(AuthTokenService);
  private readonly router = inject(Router);

  protected get donorName(): string { return this.auth.user()?.name ?? ''; }
  protected get donorEmail(): string { return this.auth.user()?.email ?? ''; }

  private readonly causeRows = signal<NdCause[]>([]);
  private readonly currencyRows = signal<NdCurrency[]>([]);
  private readonly countryRows = signal<(NdCountry & { raw: CountryLookup })[]>([]);
  private readonly stateRows = signal<MasterLookup[]>([]);
  private readonly cityRows = signal<MasterLookup[]>([]);
  private settings: PublicDonationFormSettings | null = null;
  private campaigns: PublicCampaignSummary[] = [];

  protected get causes(): NdCause[] { return this.causeRows(); }
  protected get currencies(): NdCurrency[] { return this.currencyRows(); }
  protected get countries(): NdCountry[] { return this.countryRows(); }
  protected readonly quickAmounts = QUICK_AMOUNTS;

  /* ---------- form ---------- */
  protected readonly cause = signal<string | null>(null);
  protected readonly causeQuery = signal('');
  protected readonly currency = signal<string | null>('INR');
  protected readonly amount = signal('');
  protected readonly mobile = signal('');
  protected readonly pan = signal('');
  protected readonly line1 = signal('');
  protected readonly line2 = signal('');
  protected readonly country = signal<string | null>('India');
  protected readonly state = signal<string | null>(null);
  protected readonly city = signal<string | null>(null);
  protected readonly pin = signal('');
  protected readonly privacy = signal(false);

  protected readonly menu = signal<NdMenu>(null);
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly pledgeId = signal<string | null>(null);
  protected readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- derived ---------- */
  protected readonly causeInfo = computed(() => this.causeRows().find((c) => c.code === this.cause()) ?? null);
  protected readonly causeList = computed(() => {
    const q = this.causeQuery().trim().toLowerCase();
    return q ? this.causeRows().filter((c) => `${c.name} ${c.code} ${c.org}`.toLowerCase().includes(q)) : this.causeRows();
  });
  protected readonly currencyInfo = computed(() => this.currencyRows().find((c) => c.code === this.currency()) ?? null);
  protected readonly countryInfo = computed(() => this.countryRows().find((c) => c.name === this.country()) ?? null);
  protected readonly stateList = computed(() => this.stateRows().filter((r) => r.status === 'active').map((r) => ({ name: r.name })));
  protected readonly cityList = computed(() => this.cityRows().filter((r) => r.status === 'active').map((r) => r.name));
  protected readonly isIndia = computed(() => this.country() === 'India');

  protected readonly amountValue = computed(() => {
    const n = Number(this.amount());
    return this.amount().trim() && isFinite(n) ? n : 0;
  });
  protected readonly amountLabel = computed(() => {
    const c = this.currencyInfo();
    const n = this.amountValue();
    const txt = n.toLocaleString(c?.code === 'INR' ? 'en-IN' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c ? (c.symbol.length > 1 ? `${c.symbol} ${txt}` : `${c.symbol}${txt}`) : txt;
  });

  protected readonly errors = computed<Record<NdErr, string>>(() => {
    const amt = this.amount().trim();
    const mob = this.mobile().replace(/\s+/g, '');
    const pin = this.pin().trim();
    return {
      cause: !this.cause() ? 'Choose a campaign or appeal.' : '',
      currency: !this.currency() ? 'Choose a currency.' : '',
      amount: !amt ? 'Enter an amount.'
        : !/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0 ? 'Enter an amount above zero, up to two decimals.' : '',
      mobile: !mob ? 'Enter a mobile number.'
        : this.isIndia() ? (!/^[6-9]\d{9}$/.test(mob) ? 'Enter a 10-digit Indian mobile number.' : '')
        : (!/^\d{6,14}$/.test(mob) ? 'Enter 6 to 14 digits.' : ''),
      pan: this.pan().trim() && this.isIndia() && !/^[A-Z]{5}\d{4}[A-Z]$/.test(this.pan().trim().toUpperCase()) ? 'PAN looks like ABCDE1234F.' : '',
      line1: !this.line1().trim() ? 'Enter the first address line.' : '',
      country: !this.country() ? 'Choose a country.' : '',
      state: !this.state() ? 'Choose a state.' : '',
      city: !this.city() ? 'Choose a city.' : '',
      pin: !pin ? 'Enter a PIN / ZIP code.'
        : this.isIndia() ? (!/^\d{6}$/.test(pin) ? 'Enter a 6-digit PIN code.' : '')
        : (!/^[A-Za-z0-9 -]{3,10}$/.test(pin) ? 'Enter a valid postal code.' : ''),
      privacy: !this.privacy() ? 'Please acknowledge the Privacy Notice.' : ''
    };
  });
  protected readonly missingCount = computed(() => Object.values(this.errors()).filter(Boolean).length);

  protected readonly progress = computed(() => {
    const e = this.errors();
    const count = (keys: NdErr[]) => keys.filter((k) => !e[k]).length;
    return {
      gift: { done: count(['cause', 'currency', 'amount']), total: 3 },
      you: { done: count(['mobile']) + 2, total: 3 },
      address: { done: count(['line1', 'country', 'state', 'city', 'pin']), total: 5 },
      confirm: { done: count(['privacy']), total: 1 }
    };
  });

  ngOnInit(): void {
    this.api.getPublicCampaigns().subscribe({
      next: (list) => {
        this.campaigns = list;
        const org = this.tokens.tenant()?.tenantName ?? '';
        this.causeRows.set(list.map((c) => ({ id: c.id, code: c.code, name: c.name, org })));
      },
      error: (e: unknown) => this.toasts.show('Campaigns unavailable', apiErrorMessage(e), 'error')
    });
    this.api.getPublicCurrencies().subscribe({
      next: (list) => this.currencyRows.set(list.map((c) => ({ code: c.reference, symbol: symbolOf(c.reference), label: c.label }))),
      error: (e: unknown) => this.toasts.show('Currencies unavailable', apiErrorMessage(e), 'error')
    });
    this.api.getPublicFormSettings().subscribe({ next: (r) => (this.settings = r), error: () => undefined });
    this.geo.getCountries().subscribe((list) => {
      this.countryRows.set(list.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name, dial: c.phoneCountryCode ?? '', raw: c })));
      this.loadStates();
    });
  }

  private loadStates(): void {
    const c = this.countryRows().find((x) => x.name === this.country());
    this.stateRows.set([]);
    this.cityRows.set([]);
    if (c) this.geo.getStates(c.id).subscribe((r) => this.stateRows.set(r));
  }

  private loadCities(): void {
    const c = this.countryRows().find((x) => x.name === this.country());
    const st = this.stateRows().find((x) => x.name === this.state());
    this.cityRows.set([]);
    if (st) this.geo.getCities(st.id, c?.id).subscribe((r) => this.cityRows.set(r));
  }

  /* ---------- helpers ---------- */
  bad(k: NdErr): string { return this.tried() ? this.errors()[k] : ''; }
  quickLabel(n: number): string {
    const c = this.currencyInfo();
    return `${c && c.symbol.length === 1 ? c.symbol : ''}${n.toLocaleString('en-IN')}`;
  }

  /* ---------- actions ---------- */
  toggleMenu(m: Exclude<NdMenu, null>, e: Event): void {
    e.stopPropagation();
    if ((m === 'state' && !this.country()) || (m === 'city' && !this.state())) return;
    if (m === 'cause' && this.menu() !== 'cause') this.causeQuery.set('');
    this.menu.set(this.menu() === m ? null : m);
  }
  pickCause(c: NdCause): void { this.cause.set(c.code); this.menu.set(null); }
  pickCurrency(c: NdCurrency): void { this.currency.set(c.code); this.menu.set(null); }
  pickCountry(c: NdCountry): void {
    if (this.country() !== c.name) { this.state.set(null); this.city.set(null); }
    this.country.set(c.name);
    this.menu.set(null);
    this.loadStates();
  }
  pickState(s: string): void {
    if (this.state() !== s) this.city.set(null);
    this.state.set(s);
    this.menu.set(null);
    this.loadCities();
  }
  pickCity(c: string): void { this.city.set(c); this.menu.set(null); }
  setQuick(n: number): void { this.amount.set(String(n)); }
  setText(sig: 'amount' | 'mobile' | 'pan' | 'line1' | 'line2' | 'pin' | 'causeQuery', e: Event): void {
    let v = (e.target as HTMLInputElement).value;
    if (sig === 'pan') v = v.toUpperCase().slice(0, 10);
    if (sig === 'mobile') v = v.replace(/[^\d ]/g, '').slice(0, 16);
    if (sig === 'amount') v = v.replace(/[^\d.]/g, '');
    this[sig].set(v);
  }

  submit(): void {
    this.tried.set(true);
    if (this.missingCount() || this.saving()) {
      this.flash(`${this.missingCount()} field${this.missingCount() === 1 ? ' needs' : 's need'} attention before you donate.`);
      return;
    }
    this.saving.set(true);
    const cause = this.causeInfo();
    const country = this.countryRows().find((x) => x.name === this.country());
    const state = this.stateRows().find((x) => x.name === this.state());
    const city = this.cityRows().find((x) => x.name === this.city());
    const mobile = this.mobile().replace(/\s+/g, '');
    this.api.initiateDonation({
      donorName: this.donorName,
      email: this.donorEmail,
      amount: this.amountValue(),
      currencyCode: this.currency()!,
      mobile: (country?.dial ?? '') + mobile,
      campaignId: cause?.id ?? null,
      taxIdentifier: this.pan().trim() || null,
      addressLine1: this.line1().trim(),
      addressLine2: this.line2().trim() || null,
      countryId: country?.id ?? null,
      stateId: state?.id ?? null,
      cityId: city?.id ?? null,
      postalCode: this.pin().trim(),
      consentGiven: this.privacy(),
      consentVersion: this.settings?.consentNoticeVersion ?? null
    }).subscribe({
      next: (intent) => {
        this.pledgeId.set(intent.intentReference);
        this.flash(`Pledge ${intent.intentReference} recorded. Opening secure checkout…`);
        this.startPayment(intent.intentReference, intent.version);
      },
      error: (e: unknown) => { this.saving.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  /** Opens the organisation's checkout; falls back to a payment link when there is no in-page form. */
  private startPayment(reference: string, version: number): void {
    this.api.createCheckoutSession(reference, { expectedVersion: version }).subscribe({
      next: (session) => this.openCheckout(session),
      error: () => this.fallbackToLink(reference)
    });
  }

  private openCheckout(session: CheckoutSession): void {
    void this.checkout.open(session, this.causeInfo()?.name || 'Donation', {
      onSucceeded: (confirmation) => {
        this.api.confirmCheckout(session.intentReference, confirmation).subscribe({ next: () => undefined, error: () => undefined });
        this.saving.set(false);
        this.router.navigate(['/give/result'], { queryParams: { intent: session.intentReference } });
      },
      onFailed: () => {
        this.saving.set(false);
        this.router.navigate(['/give/result'], { queryParams: { intent: session.intentReference } });
      },
      onDismissed: () => {
        this.saving.set(false);
        this.flash('The payment form was closed. Your pledge is saved - press Donate to pay it.');
      }
    }).then((outcome) => {
      if (outcome !== 'opened') this.fallbackToLink(session.intentReference);
    });
  }

  private fallbackToLink(reference: string): void {
    this.api.getPublicIntent(reference).subscribe({
      next: (detail) => this.api.createPaymentLink(reference, { expectedVersion: detail.version }).subscribe({
        next: (link) => window.location.assign(link.paymentLinkUrl),
        error: (e: unknown) => { this.saving.set(false); this.flash(apiErrorMessage(e)); }
      }),
      error: (e: unknown) => { this.saving.set(false); this.flash(apiErrorMessage(e)); }
    });
  }

  reset(): void {
    this.cause.set(null); this.currency.set('INR'); this.amount.set(''); this.mobile.set(''); this.pan.set('');
    this.line1.set(''); this.line2.set(''); this.country.set('India'); this.state.set(null); this.city.set(null);
    this.pin.set(''); this.privacy.set(false); this.tried.set(false); this.pledgeId.set(null); this.menu.set(null);
  }

  private flash(m: string): void {
    this.toast.set(m);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2800);
  }

  @HostListener('document:click')
  onDocClick(): void { this.menu.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.menu.set(null); }
}
