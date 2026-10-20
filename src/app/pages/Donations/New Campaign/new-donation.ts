import { Component, HostListener, computed, signal } from '@angular/core';
type NdMenu = 'cause' | 'currency' | 'country' | 'state' | 'city' | null;
type NdErr = 'cause' | 'currency' | 'amount' | 'mobile' | 'pan' | 'line1' | 'country' | 'state' | 'city' | 'pin' | 'privacy';

interface NdCause { code: string; name: string; org: string; }
interface NdCurrency { code: string; symbol: string; label: string; }
interface NdCountry { name: string; dial: string; states: { name: string; cities: string[] }[]; }

const CAUSES: NdCause[] = [
  { code: 'HAI-ELDERCARE-2026', name: 'Care for the Elderly - Annual Appeal', org: 'Unity for Change' },
  { code: 'HAI-PHYSIO-2026', name: 'Mobile Healthcare Units - Care at the Doorstep', org: 'Unity for Change' },
  { code: 'HAI-CATARACT-2026', name: 'Cataract Surgery Drive', org: 'Unity for Change' },
  { code: 'HAI-HELPLINE-2026', name: 'Elder Helpline - Keep the Line Open', org: 'Unity for Change' },
  { code: 'HAI-DAYCARE-2026', name: 'Adopt a Day-Care Centre', org: 'Unity for Change' },
  { code: 'HAI-WATER-2026', name: 'Village Water Points', org: 'Community Care' }
];

const CURRENCIES: NdCurrency[] = [
  { code: 'INR', symbol: '₹', label: 'Indian rupee' },
  { code: 'USD', symbol: '$', label: 'US dollar' },
  { code: 'GBP', symbol: '£', label: 'Pound sterling' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'AED', symbol: 'AED', label: 'UAE dirham' }
];

const COUNTRIES: NdCountry[] = [
  {
    name: 'India', dial: '+91', states: [
      { name: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tirunelveli', 'Tenkasi'] },
      { name: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Mangaluru'] },
      { name: 'Kerala', cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode'] },
      { name: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nagpur'] },
      { name: 'West Bengal', cities: ['Kolkata', 'Siliguri'] }
    ]
  },
  {
    name: 'United States', dial: '+1', states: [
      { name: 'California', cities: ['San Francisco', 'Los Angeles', 'San Diego'] },
      { name: 'New York', cities: ['New York City', 'Buffalo'] }
    ]
  },
  {
    name: 'United Kingdom', dial: '+44', states: [
      { name: 'England', cities: ['London', 'Manchester', 'Birmingham'] },
      { name: 'Scotland', cities: ['Edinburgh', 'Glasgow'] }
    ]
  },
  {
    name: 'United Arab Emirates', dial: '+971', states: [
      { name: 'Dubai', cities: ['Dubai'] },
      { name: 'Abu Dhabi', cities: ['Abu Dhabi', 'Al Ain'] }
    ]
  }
];

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

@Component({
  selector: 'app-new-donation',
  standalone: true,
  templateUrl: './new-donation.html',
  styleUrls: ['./new-donation.css']
})
export class NewDonation {
  protected readonly donorName = 'Vikram Anand';
  protected readonly donorEmail = 'vikram.anand@ngoplanet.test';

  protected readonly causes = CAUSES;
  protected readonly currencies = CURRENCIES;
  protected readonly countries = COUNTRIES;
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
  protected readonly causeInfo = computed(() => CAUSES.find((c) => c.code === this.cause()) ?? null);
  protected readonly causeList = computed(() => {
    const q = this.causeQuery().trim().toLowerCase();
    return q ? CAUSES.filter((c) => `${c.name} ${c.code} ${c.org}`.toLowerCase().includes(q)) : CAUSES;
  });
  protected readonly currencyInfo = computed(() => CURRENCIES.find((c) => c.code === this.currency()) ?? null);
  protected readonly countryInfo = computed(() => COUNTRIES.find((c) => c.name === this.country()) ?? null);
  protected readonly stateList = computed(() => this.countryInfo()?.states ?? []);
  protected readonly cityList = computed(() => this.stateList().find((s) => s.name === this.state())?.cities ?? []);
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
  }
  pickState(s: string): void { if (this.state() !== s) this.city.set(null); this.state.set(s); this.menu.set(null); }
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
    // TODO: POST the pledge, then hand over to the payment provider's secure checkout.
    const id = 'PLG-2026-' + String(Math.floor(100000 + Math.random() * 899999));
    setTimeout(() => {
      this.pledgeId.set(id);
      this.saving.set(false);
      this.flash(`Pledge ${id} recorded. Opening secure checkout…`);
    }, 600);
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
