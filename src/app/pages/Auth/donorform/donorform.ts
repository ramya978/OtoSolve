import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { ToastService } from '../../../Shared/services/toast.service';
import { PaymentApiService } from '../../../Service/payment-api.service';
import { GatewayCheckoutService } from '../../../Shared/services/gateway-checkout.service';
import { DonationRoutes } from '../../../Shared/services/donation-redirect.policy';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';
import { MasterLookup } from '../../../Shared/models/global-master.model';
import {
  CheckoutSession, ConfirmCheckoutRequest, DonationIntentResponse, PublicCampaignSummary, unpayableReason,
} from '../../../Shared/models/payment.model';

interface CurrencyRow { code: string; symbol: string; label: string; }

/** Used to label a currency until the organisation's currency list arrives (and kept if it cannot be read). */
const FALLBACK_CURRENCIES: CurrencyRow[] = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (INR)' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
];

const symbolOf = (code: string): string => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch { return code; }
};

const isGuid = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** The custom drop-downs on the page; only one is open at a time. */
type MenuName = 'campaign' | 'country' | 'state' | 'city';

@Component({
  selector: 'app-donorform',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './donorform.html',
  styleUrl: './donorform.css',
})
export class DonorForm implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly payments = inject(PaymentApiService);
  private readonly checkout = inject(GatewayCheckoutService);

  /** Padlock shown on fields the campaign fills in. */
  protected readonly lockIcon = 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4';

  private readonly currencyRows = signal<CurrencyRow[]>(FALLBACK_CURRENCIES);

  /** Active campaigns open for public donations (the public endpoint lists only those). */
  private readonly publicCampaigns = signal<readonly PublicCampaignSummary[]>([]);
  protected readonly campaigns = computed(() => this.publicCampaigns().map((c) => c.name));

  /* the link's context: tracking code, lead, an existing donation, a named campaign */
  private trackingReference = '';
  private leadId: string | null = null;
  private campaignFromLink = '';
  private intentReference = '';
  private consentVersion: string | null = null;
  private maxAmount = 0;
  private canSubmitDonation = true;
  private blockedReason = '';

  /* ---------- address masters (drive the country / state / city drop-downs) ---------- */
  protected readonly countryRows = signal<MasterLookup[]>([]);
  protected readonly stateRows = signal<MasterLookup[]>([]);
  protected readonly cityRows = signal<MasterLookup[]>([]);

  /* ---------- campaign & amount ---------- */
  protected readonly campaign = signal<string>('Not selected');
  protected readonly amount = signal('');
  protected readonly currency = signal<CurrencyRow>(FALLBACK_CURRENCIES[0]);

  /** True when the link (campaignCode / QR / a reopened donation) fixes the campaign: shown read-only. */
  protected readonly campaignLocked = signal(false);
  /** True when the chosen campaign states its own amount: the amount is then read-only. */
  private readonly amountFixed = signal(false);

  /* ---------- donor details ---------- */
  protected readonly fullName = signal(this.auth.user()?.name ?? '');
  protected readonly email = signal(this.auth.user()?.email ?? '');
  protected readonly mobile = signal('');
  protected readonly pan = signal('');

  /* ---------- address ---------- */
  protected readonly street = signal('');
  protected readonly country = signal('India');
  protected readonly state = signal('');
  protected readonly city = signal('');
  protected readonly pin = signal('');
  protected readonly addressExpanded = signal(false);

  /* ---------- consent ---------- */
  protected readonly privacy = signal(false);

  protected readonly saving = signal(false);
  protected readonly submitError = signal('');

  /* ---------- drop-down menus ---------- */
  protected readonly openMenu = signal<MenuName | null>(null);
  protected readonly menuQuery = signal('');

  protected readonly filteredCampaigns = computed(() => this.filterNames(this.campaigns()));
  protected readonly filteredCountries = computed(() => this.filterNames(this.countryRows().map((r) => r.name)));
  protected readonly filteredStates = computed(() => this.filterNames(this.stateRows().map((r) => r.name)));
  protected readonly filteredCities = computed(() => this.filterNames(this.cityRows().map((r) => r.name)));

  /* ---------- summary ---------- */
  protected readonly amountValue = computed(() => this.amount().replace(/[^0-9.]/g, ''));
  protected readonly donorLabel = computed(() => this.fullName() || 'Not entered');
  protected readonly currencyLabel = computed(() => this.currency().label);
  protected readonly totalLabel = computed(() => {
    const a = this.amountValue();
    return a ? `${this.currency().symbol}${a}` : '—';
  });

  /* ---------- section progress (drives the numbered badges) ---------- */
  protected readonly campaignChosen = computed(() => this.campaign() !== 'Not selected');
  protected readonly amountLocked = computed(() => this.campaignChosen() && this.amountFixed());
  protected readonly doneCampaign = computed(() => this.campaignChosen() && !!this.amountValue());
  protected readonly doneDonor = computed(() => !!this.fullName().trim() && this.email().includes('@'));
  protected readonly doneAddress = computed(() => !!(this.street().trim() || this.city().trim() || this.pin().trim()));

  protected readonly canSubmit = computed(
    () =>
      this.campaignChosen() &&
      !!this.fullName().trim() &&
      !!this.email().trim() &&
      !!this.amountValue() &&
      this.privacy() &&
      !this.saving()
  );

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  private flash(text: string): void {
    this.submitError.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.submitError.set(''), 4000);
  }

  private filterNames(names: string[]): string[] {
    const q = this.menuQuery().trim().toLowerCase();
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }

  /** The currency a campaign asks in: labelled from the organisation's list, else built from the code. */
  private useCurrency(code: string): void {
    const row = this.currencyRows().find((c) => c.code === code)
      ?? { code, symbol: symbolOf(code), label: code };
    this.currency.set(row);
  }

  /**
   * Selects a campaign. The campaign states what it asks for: its amount and currency are bound
   * here, and the amount is read-only while the campaign fixes it.
   */
  private selectCampaign(name: string): void {
    this.campaign.set(name);
    const picked = this.publicCampaigns().find((c) => c.name === name);
    if (!picked || this.intentReference) return;

    if (picked.campaignAmount > 0) {
      this.amount.set(String(picked.campaignAmount));
      this.amountFixed.set(true);
    } else {
      // No amount on the campaign: the donor types one in.
      this.amount.set('');
      this.amountFixed.set(false);
    }
    if (picked.currencyCode) this.useCurrency(picked.currencyCode);
  }

  /* ---------- drop-downs ---------- */

  protected toggleMenu(name: MenuName, event: Event): void {
    event.stopPropagation();
    const open = this.openMenu() === name ? null : name;
    this.openMenu.set(open);
    this.menuQuery.set('');
    if (open) setTimeout(() => document.querySelector<HTMLInputElement>('.df-menu .df-menu-search')?.focus());
  }

  /** A click anywhere else on the page (or Esc) closes the open drop-down. */
  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  protected closeMenus(): void {
    this.openMenu.set(null);
    this.menuQuery.set('');
  }

  protected pickCampaign(name: string): void {
    if (this.campaignLocked()) return;
    this.selectCampaign(name);
    this.closeMenus();
  }

  protected pickCountry(name: string): void {
    if (name !== this.country()) {
      this.country.set(name);
      this.state.set('');
      this.city.set('');
      this.loadStates();
    }
    this.closeMenus();
  }

  protected pickState(name: string): void {
    if (name !== this.state()) {
      this.state.set(name);
      this.city.set('');
      this.loadCities();
    }
    this.closeMenus();
  }

  protected pickCity(name: string): void {
    this.city.set(name);
    this.closeMenus();
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.trackingReference = (q.get('ref') ?? q.get('tracking') ?? '').trim();
    const lead = (q.get('lead') ?? '').trim();
    this.leadId = isGuid(lead) ? lead : null;
    this.campaignFromLink = (q.get('campaignCode') ?? q.get('campaign') ?? '').trim();
    this.intentReference = (q.get('intent') ?? '').trim();

    this.payments.getPublicCampaigns().subscribe({
      next: (rows) => {
        this.publicCampaigns.set(rows);
        this.bindCampaignFromLink();
        if (this.trackingReference) this.loadTrackingCampaign();
        if (this.intentReference) this.reopenIntent();
      },
      error: () => { this.publicCampaigns.set([]); if (this.intentReference) this.reopenIntent(); }
    });
    this.payments.getPublicFormSettings().subscribe({
      next: (st) => {
        this.consentVersion = st.consentNoticeVersion || null;
        this.maxAmount = st.maximumDonationAmount;
        this.canSubmitDonation = st.permittedActions.includes('Submit');
      },
      error: () => this.flash('The donation form settings could not be loaded.')
    });
    this.payments.getPublicCurrencies().subscribe({
      next: (rows) => {
        if (!rows.length) return;
        this.currencyRows.set(rows.map((r) => ({
          code: r.reference, symbol: symbolOf(r.reference), label: `${r.label.split(' - ')[1] ?? r.reference} (${r.reference})`
        })));
        // re-label the currency already in use with the organisation's own wording
        this.useCurrency(this.currency().code);
      },
      error: () => undefined
    });
    this.payments.getPublicCountries().subscribe({
      next: (rows) => { this.countryRows.set(rows); this.loadStates(); },
      error: () => undefined
    });
  }

  /**
   * ?campaignCode=SF-DIWALI-2026 → that campaign is bound and locked (read-only), its amount and
   * currency bound with it. ?campaignCode= (empty) or no code → the donor picks an active campaign.
   */
  private bindCampaignFromLink(): void {
    const want = this.campaignFromLink.toLowerCase();
    if (!want || this.campaignChosen()) return;
    const hit = this.publicCampaigns().find((c) =>
      c.code.toLowerCase() === want || c.name.toLowerCase() === want || c.id.toLowerCase() === want);
    if (hit) {
      this.selectCampaign(hit.name);
      this.campaignLocked.set(true);
    } else {
      this.flash('The campaign in this link is not open for donations. Choose an active campaign below.');
    }
  }

  /** A QR code names no campaign on its URL; the server says which one it gives to - and that one is fixed. */
  private loadTrackingCampaign(): void {
    this.payments.getPublicTrackingContext(this.trackingReference).subscribe({
      next: (ctx) => {
        if (ctx.campaign && !this.campaignChosen()) {
          const hit = this.publicCampaigns().find((c) => c.id === ctx.campaign!.id);
          this.selectCampaign(hit?.name ?? ctx.campaign.name);
          this.campaignLocked.set(true);
        }
      },
      error: () => undefined
    });
  }

  /** A donation being continued (from the payments queue or a failed result page): its figures are fixed. */
  private reopenIntent(): void {
    this.payments.getPublicIntent(this.intentReference).subscribe({
      next: (intent) => {
        this.fullName.set(intent.donorName);
        this.email.set(intent.email ?? '');
        this.mobile.set(intent.mobile ?? '');
        this.amount.set(String(intent.amount.amount));
        this.amountFixed.set(true);
        this.useCurrency(intent.amount.currencyCode);
        if (intent.campaignName) {
          this.campaign.set(intent.campaignName);
          this.campaignLocked.set(true);
        }
        this.privacy.set(true);
        this.blockedReason = unpayableReason(intent.status) ?? '';
        this.flash(this.blockedReason || `Donation ${intent.intentReference} is ready to be paid.`);
      },
      error: () => { this.intentReference = ''; }
    });
  }

  /* ---------- address masters: names picked are matched to master ids ---------- */
  private match(rows: MasterLookup[], name: string): MasterLookup | undefined {
    const n = name.trim().toLowerCase();
    return n ? rows.find((r) => r.name.toLowerCase() === n || r.code.toLowerCase() === n) : undefined;
  }

  private loadStates(): void {
    const country = this.match(this.countryRows(), this.country());
    this.stateRows.set([]);
    this.cityRows.set([]);
    if (!country) return;
    this.payments.getPublicStates(country.id).subscribe({
      next: (rows) => { this.stateRows.set(rows); this.loadCities(); },
      error: () => undefined
    });
  }

  private loadCities(): void {
    const st = this.match(this.stateRows(), this.state());
    this.cityRows.set([]);
    if (!st) return;
    this.payments.getPublicCities(st.id).subscribe({
      next: (rows) => this.cityRows.set(rows),
      error: () => undefined
    });
  }

  protected submit(): void {
    if (!this.canSubmit()) return;

    // A reopened donation is continued, never duplicated.
    if (this.intentReference) { this.continueToPayment(); return; }

    if (!this.canSubmitDonation) { this.flash('Donations cannot be submitted right now.'); return; }
    const amount = Number(this.amountValue());
    if (!(amount > 0)) { this.flash('Enter an amount greater than zero.'); return; }
    if (this.maxAmount > 0 && amount > this.maxAmount) { this.flash(`The largest gift accepted here is ${this.currency().symbol}${this.maxAmount}.`); return; }

    this.saving.set(true);
    this.submitError.set('');
    const picked = this.publicCampaigns().find((c) => c.name === this.campaign());
    const country = this.match(this.countryRows(), this.country());
    const st = this.match(this.stateRows(), this.state());
    const city = this.match(this.cityRows(), this.city());

    this.payments.initiateDonation({
      donorName: this.fullName().trim(),
      email: this.email().trim(),
      mobile: this.mobile().trim() || null,
      amount,
      currencyCode: this.currency().code,
      campaignId: picked?.id ?? (isGuid(this.campaignFromLink) ? this.campaignFromLink : null),
      trackingReference: this.trackingReference || null,
      leadReference: this.leadId,
      ...(this.leadId ? { sourceType: 'fundraiserLead' as const } : {}),
      taxIdentifier: this.pan().trim() || null,
      addressLine1: this.street().trim() || null,
      addressLine2: [this.city().trim(), this.state().trim(), this.country().trim()].filter(Boolean).join(', ') || null,
      countryId: country?.id ?? null,
      stateId: st?.id ?? null,
      cityId: city?.id ?? null,
      postalCode: this.pin().trim() || null,
      consentGiven: this.privacy(),
      consentVersion: this.consentVersion,
      allowPublicRecognition: true
    }).subscribe({
      next: (intent) => this.onIntentCreated(intent),
      error: (e: unknown) => {
        this.saving.set(false);
        this.toasts.show('Donation not started', apiErrorMessage(e, 'The donation could not be started.'), 'error');
      }
    });
  }

  private onIntentCreated(intent: DonationIntentResponse): void {
    this.intentReference = intent.intentReference;

    // An address that already has an account here signs in first, then pays - unless already signed in.
    if (intent.requiresSignIn && !this.auth.user()) {
      this.saving.set(false);
      this.toasts.show('Please sign in to continue',
        'This e-mail address already has an account with this organisation. Sign in and we will take you straight back to complete your donation.', 'info');
      void this.router.navigate([DonationRoutes.SignIn], {
        queryParams: { returnUrl: DonationRoutes.InAppDonation + '?intent=' + encodeURIComponent(intent.intentReference) + '&pay=1' }
      });
      return;
    }
    this.startPayment(intent.intentReference, intent.version);
  }

  private continueToPayment(): void {
    if (this.blockedReason) { this.toasts.show('Payment not available', this.blockedReason, 'warning'); return; }
    this.saving.set(true);
    this.payments.getPublicIntent(this.intentReference).subscribe({
      next: (d) => this.startPayment(d.intentReference, d.version),
      error: (e: unknown) => { this.saving.set(false); this.toasts.show('Payment unavailable', apiErrorMessage(e), 'error'); }
    });
  }

  /** Opens the organisation's own gateway; falls back to a payment link when it has no in-page form. */
  private startPayment(reference: string, expectedVersion: number): void {
    this.payments.createCheckoutSession(reference, { expectedVersion }).subscribe({
      next: (session) => this.openCheckout(session),
      error: () => this.fallbackToLink(reference)
    });
  }

  private openCheckout(session: CheckoutSession): void {
    void this.checkout.open(session, this.campaign() || 'Donation', {
      onSucceeded: (confirmation: ConfirmCheckoutRequest) => {
        // Started first so it is already in flight when this page goes away; the result page verifies with the provider.
        this.payments.confirmCheckout(session.intentReference, confirmation).subscribe({ next: () => undefined, error: () => undefined });
        this.goToResult(session.intentReference);
      },
      onFailed: () => this.goToResult(session.intentReference),
      onDismissed: () => {
        this.saving.set(false);
        this.toasts.show('Payment not completed', 'The payment form was closed. Your donation is saved - press the button when you are ready to pay it.', 'info');
      }
    }).then((outcome) => {
      if (outcome === 'opened') return;
      this.fallbackToLink(session.intentReference);
    });
  }

  private fallbackToLink(reference: string): void {
    this.payments.getPublicIntent(reference).subscribe({
      next: (d) => this.payments.createPaymentLink(d.intentReference, { expectedVersion: d.version }).subscribe({
        next: (link) => {
          this.toasts.show('Redirecting to payment', 'Opening the secure payment page.', 'success');
          window.location.assign(link.paymentLinkUrl);
        },
        error: (e: unknown) => {
          this.saving.set(false);
          this.toasts.show('Payment link unavailable', apiErrorMessage(e), 'error');
        }
      }),
      error: (e: unknown) => { this.saving.set(false); this.toasts.show('Payment unavailable', apiErrorMessage(e), 'error'); }
    });
  }

  private goToResult(reference: string): void {
    void this.router.navigate(['/give/result'], { queryParams: { intent: reference } });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}