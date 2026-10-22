import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../Shared/Auth/auth.service';
import { ToastService } from '../../../Shared/services/toast.service';

interface CurrencyRow { code: string; symbol: string; label: string; }

const CURRENCIES: CurrencyRow[] = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (INR)' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
];

const QUICK_AMOUNTS = [500, 1000, 2500, 5000, 10000];
const CAMPAIGNS = ['General Fund', 'Education Appeal', 'Healthcare Fund', 'Emergency Relief', 'Child Welfare'];
type ReceiptMode = 'e-mail' | 'sms' | 'print';
const RECEIPT_MODES: ReceiptMode[] = ['e-mail', 'sms', 'print'];

@Component({
  selector: 'app-donorform',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './donorform.html',
  styleUrl: './donorform.css',
})
export class DonorForm implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly currencies = CURRENCIES;
  protected readonly quickAmounts = QUICK_AMOUNTS;
  protected readonly campaigns = CAMPAIGNS;
  protected readonly receiptModes = RECEIPT_MODES;

  /* ---------- top summary ---------- */
  protected readonly campaign = signal<string>('Not selected');
  protected readonly amount = signal('');
  protected readonly currency = signal<CurrencyRow>(CURRENCIES[0]);
  protected readonly receipt = signal<ReceiptMode>('e-mail');

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

  /* ---------- dropdown menus ---------- */
  protected readonly campaignMenu = signal(false);
  protected readonly currencyMenu = signal(false);
  protected readonly countryMenu = signal(false);

  protected readonly donorLabel = computed(() => this.fullName() || 'Not entered');
  protected readonly currencyLabel = computed(() => this.currency().label);
  protected readonly totalLabel = computed(() => {
    const a = this.amountValue();
    return a ? `${this.currency().symbol}${a}` : '—';
  });

  protected readonly amountValue = computed(() => this.amount().replace(/[^0-9.]/g, ''));

  /* ---------- section progress (drives the numbered badges) ---------- */
  protected readonly campaignChosen = computed(() => this.campaign() !== 'Not selected');
  protected readonly doneCampaign = computed(() => this.campaignChosen() && !!this.amountValue());
  protected readonly doneDonor = computed(() => !!this.fullName().trim() && this.email().includes('@'));
  protected readonly doneAddress = computed(() => !!(this.street().trim() || this.city().trim() || this.pin().trim()));
  protected readonly stepsDone = computed(() => [this.doneCampaign(), this.doneDonor(), this.privacy()].filter(Boolean).length);

  protected readonly canSubmit = computed(
    () =>
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

  protected selectCampaign(name: string): void {
    this.campaign.set(name);
  }

  protected setReceipt(mode: ReceiptMode): void { this.receipt.set(mode); }

  /** A click anywhere else on the page closes every open drop-down. */
  @HostListener('document:click')
  protected closeAllMenus(): void {
    this.campaignMenu.set(false); this.currencyMenu.set(false); this.countryMenu.set(false);
  }

  protected setAmount(value: number): void {
    this.amount.set(String(value));
  }

  protected toggleCampaign(event: Event): void {
    event.stopPropagation();
    this.campaignMenu.set(!this.campaignMenu());
    if (this.campaignMenu()) { this.currencyMenu.set(false); this.countryMenu.set(false); }
  }
  protected closeMenu(): void { this.campaignMenu.set(false); }

  protected toggleCurrency(event: Event): void {
    event.stopPropagation();
    this.currencyMenu.set(!this.currencyMenu());
    if (this.currencyMenu()) { this.campaignMenu.set(false); this.countryMenu.set(false); }
  }
  protected closeCurrencyMenu(): void { this.currencyMenu.set(false); }
  protected pickCurrency(c: CurrencyRow): void { this.currency.set(c); this.closeCurrencyMenu(); }

  protected toggleCountry(event: Event): void {
    event.stopPropagation();
    this.countryMenu.set(!this.countryMenu());
    if (this.countryMenu()) { this.campaignMenu.set(false); this.currencyMenu.set(false); }
  }
  protected closeCountryMenu(): void { this.countryMenu.set(false); }
  protected pickCountry(c: string): void { this.country.set(c); this.closeCountryMenu(); }

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.submitError.set('');

    // Record the pledge/donation intent. Replace with your real API call.
    setTimeout(() => {
      this.saving.set(false);
      this.router.navigate(['/give/result'], {
        queryParams: { intent: 'DF-' + Math.floor(100000 + Math.random() * 900000) },
      });
    }, 700);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}