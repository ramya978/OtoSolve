import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, filter, forkJoin, map, of, switchMap, take, tap } from 'rxjs';
import { MasterService } from '../../Service/master.service';
import { apiErrorMessage, apiFieldErrors } from '../models/api-response.model';
import {
  CityDetail, CityListItem, CountryDetail, CountryListItem, CurrencyDetail, CurrencyListItem, EnumOption,
  GlobalMasterReferenceData, MasterDataStatus, StateProvinceDetail, StateProvinceListItem, TimeZoneDetail, TimeZoneListItem
} from '../models/global-master.model';
import { fetchPages } from '../services/paging';
import {
  CURRENCY_TYPES, JURISDICTIONS, Lookup, MasterKey, MasterRow, MasterStatus, Option, OptionSource, REGIONS, ROUNDING_MODES, fmtOffset
} from './masters.types';

/** Last change, shown as a notice on the list page after a create / save / delete. */
export interface MasterNotice {
  key: MasterKey;
  text: string;
  tone: 'ok' | 'info';
}

/** What a failed write tells the form: a message for the page and a message per field (by form key). */
export interface MasterWriteError {
  message: string;
  fields: Record<string, string>;
}

const KEYS: MasterKey[] = ['country', 'state', 'city', 'currency', 'timezone'];

/** The most rows a grid will hold. The API caps a page at 100; further pages are fetched in parallel. */
const FETCH_LIMIT = 5000;

/** "northAmerica" -> "North America" (used only when the server's option list has not arrived). */
const humanize = (code: string): string =>
  code.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

/** "Half up" -> "halfUp": the JSON spelling of an enum member, from its label. */
const camel = (label: string): string =>
  label
    .trim()
    .split(/\s+/)
    .map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('');

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * The five masters, held in memory and kept in step with the IAM API (/masters/...).
 *
 * The list and form pages read signals from here and call the write methods; every record is
 * loaded from the server (all pages), every create / save / delete / activate goes to the server,
 * and dependent dropdowns (a state's country, a city's state, a country's currency) are built from
 * the rows loaded here - so a record created in one master is offered by the others at once.
 *
 * Rows keep the shape the pages were designed around (display labels such as "North America" or
 * "Half up"); the translation to and from the API's codes (`northAmerica`, `halfUp`) and ids
 * happens only in this file, using the server's own option lists when they have arrived.
 */
@Injectable({ providedIn: 'root' })
export class MastersStore {
  private readonly api = inject(MasterService);

  private readonly data: Record<MasterKey, WritableSignal<MasterRow[]>> = {
    country: signal<MasterRow[]>([]),
    state: signal<MasterRow[]>([]),
    city: signal<MasterRow[]>([]),
    currency: signal<MasterRow[]>([]),
    timezone: signal<MasterRow[]>([])
  };

  readonly notice = signal<MasterNotice | null>(null);

  /** True until every master has been read once. */
  readonly loading = signal(false);
  /** Set when the last read failed; the page may show it. */
  readonly loadError = signal<string | null>(null);
  /** True when the grid is showing fewer rows than the server holds. */
  readonly truncated = signal(false);

  private readonly reference = signal<GlobalMasterReferenceData | null>(null);
  private loadedOnce = false;
  private inFlight: Subscription | null = null;
  private readonly ready$ = new BehaviorSubject(false);

  /** Emits once the masters have been read (immediately when they already were). */
  whenReady(): Observable<void> {
    return this.ready$.pipe(filter(Boolean), take(1), map(() => undefined));
  }

  // =========================================================================================
  // Reading
  // =========================================================================================

  /**
   * Reads every master (and the server's option lists) once. Pages call it from ngOnInit; calling
   * it again is a no-op unless `force` is set, which a write does so the next screen sees the change.
   */
  ensureLoaded(force = false): void {
    if (this.loadedOnce && !force) return;
    if (this.inFlight && !this.inFlight.closed) {
      if (!force) return;
      this.inFlight.unsubscribe();
    }

    this.loading.set(true);
    this.loadError.set(null);

    const all = <T>(fetch: (page: number, size: number) => Observable<{ items: T[]; totalCount: number; pageSize: number; page: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean }>) =>
      fetchPages<T>(fetch, 100, FETCH_LIMIT);

    this.inFlight = forkJoin({
      ref: this.api.getReferenceData(),
      countries: all<CountryListItem>((page, pageSize) => this.api.searchCountries({ page, pageSize, sort: 'sortOrder' })),
      states: all<StateProvinceListItem>((page, pageSize) => this.api.searchStates({ page, pageSize })),
      cities: all<CityListItem>((page, pageSize) => this.api.searchCities({ page, pageSize })),
      currencies: all<CurrencyListItem>((page, pageSize) => this.api.searchCurrencies({ page, pageSize })),
      zones: all<TimeZoneListItem>((page, pageSize) => this.api.searchTimeZones({ page, pageSize }))
    }).subscribe({
      next: (r) => {
        this.reference.set(r.ref);
        // Zones first: states point at them; countries before states and cities for the same reason.
        this.data.timezone.set(r.zones.items.map((i) => this.zoneRow(i)));
        this.data.currency.set(r.currencies.items.map((i) => this.currencyRow(i)));
        this.data.country.set(r.countries.items.map((i) => this.countryRow(i)));
        this.data.state.set(r.states.items.map((i) => this.stateRow(i)));
        this.data.city.set(r.cities.items.map((i) => this.cityRow(i)));
        this.truncated.set(
          [r.countries, r.states, r.cities, r.currencies, r.zones].some((p) => p.totalCount > p.items.length)
        );
        this.loadedOnce = true;
        this.ready$.next(true);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(error, 'The master data could not be loaded.'));
      }
    });
  }

  rows(key: MasterKey): MasterRow[] {
    return this.data[key]();
  }

  find(key: MasterKey, id: string): MasterRow | null {
    return this.data[key]().find((r) => r.id === id) ?? null;
  }

  /**
   * Reads the full record (the list omits notes, postal patterns, rounding ...) and merges it into
   * the grid. The view drawer and the edit form call it for the row they open.
   */
  loadDetail(key: MasterKey, id: string): Observable<MasterRow | null> {
    let request: Observable<MasterRow>;
    switch (key) {
      case 'country': request = this.api.getCountry(id).pipe(map((d) => this.countryRow(d, d))); break;
      case 'state': request = this.api.getState(id).pipe(map((d) => this.stateRow(d, d))); break;
      case 'city': request = this.api.getCity(id).pipe(map((d) => this.cityRow(d, d))); break;
      case 'currency': request = this.api.getCurrency(id).pipe(map((d) => this.currencyRow(d, d))); break;
      case 'timezone': request = this.api.getTimeZone(id).pipe(map((d) => this.zoneRow(d, d))); break;
    }
    return request.pipe(
      tap((row) => this.data[key].update((rows) => (rows.some((r) => r.id === id) ? rows.map((r) => (r.id === id ? row : r)) : [row, ...rows])))
    );
  }

  /** True when another record already uses this code (case-insensitive). The server also enforces it. */
  isDuplicate(key: MasterKey, field: string, value: string, exceptId: string | null, scope?: { field: string; value: string }): boolean {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    return this.data[key]().some(
      (r) =>
        r.id !== exceptId &&
        String(r[field] ?? '').toLowerCase() === v &&
        (!scope || String(r[scope.field] ?? '') === scope.value)
    );
  }

  // =========================================================================================
  // Writing
  // =========================================================================================

  /**
   * Creates a record, or saves changes to `editing`. The row is the form's values turned into a
   * row by the master's `toRow`. Errors carry the server's message and per-field messages.
   */
  save(key: MasterKey, row: MasterRow, editing: MasterRow | null): Observable<MasterRow> {
    const op = editing ? this.update(key, row, editing) : this.create(key, row);
    return op.pipe(
      tap((saved) => {
        this.data[key].update((rows) => (rows.some((r) => r.id === saved.id) ? rows.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...rows]));
        this.afterWrite();
      })
    );
  }

  /** Power button: Active <-> Inactive (a draft becomes active). Returns the row's new status. */
  toggleStatus(key: MasterKey, row: MasterRow): Observable<MasterStatus> {
    const next: MasterStatus = row['status'] === 'active' ? 'inactive' : 'active';
    return this.changeStatus(key, row.id, Number(row['version'] ?? 0), next).pipe(
      switchMap(() => this.loadDetail(key, row.id)),
      tap(() => this.afterWrite()),
      map(() => next)
    );
  }

  /** Deletes a record (the server refuses when it is still in use, and says why). */
  remove(key: MasterKey, row: MasterRow): Observable<void> {
    const body = { expectedVersion: Number(row['version'] ?? 0) };
    const call: Observable<unknown> =
      key === 'country' ? this.api.deleteCountry(row.id, body)
      : key === 'state' ? this.api.deleteState(row.id, body)
      : key === 'city' ? this.api.deleteCity(row.id, body)
      : key === 'currency' ? this.api.deleteCurrency(row.id, body)
      : this.api.deleteTimeZone(row.id, body);
    return call.pipe(
      tap(() => {
        this.data[key].update((rows) => rows.filter((r) => r.id !== row.id));
        this.afterWrite();
      }),
      map(() => undefined)
    );
  }

  /** Turns an error from any write into the message + field messages the form shows. */
  describeError(key: MasterKey, error: unknown): MasterWriteError {
    const raw = apiFieldErrors(error);
    const fields: Record<string, string> = {};
    for (const [apiField, message] of Object.entries(raw)) {
      const formKey = FIELD_MAP[key][apiField.replace(/^\$?\.?/, '').toLowerCase()];
      if (formKey && !fields[formKey]) fields[formKey] = message;
    }
    return { message: apiErrorMessage(error, 'That could not be saved. Please try again.'), fields };
  }

  private afterWrite(): void {
    // Dropdowns elsewhere (country/currency/time-zone pickers) must not offer a stale catalogue.
    this.api.invalidateReferenceData();
  }

  private create(key: MasterKey, row: MasterRow): Observable<MasterRow> {
    switch (key) {
      case 'country':
        return this.api.createCountry({
          countryCode: str(row['alpha2']), countryName: str(row['name']), iso2: str(row['alpha2']),
          officialName: str(row['official']) || null, region: this.regionCode(str(row['region'])) as never,
          iso3: str(row['alpha3']) || null, numericCode: str(row['numeric']) || null,
          defaultCurrencyCode: str(row['currency']) || null, hasStates: !!row['subdivisions'],
          postalCodePattern: str(row['postal']) || null, phoneCountryCode: str(row['phone']) || null,
          status: row['status'] as MasterDataStatus, sortOrder: Number(row['sort'] ?? 0), notes: null
        }).pipe(map((d) => this.countryRow(d, d)));
      case 'state':
        return this.api.createState({
          stateProvinceCode: str(row['code']), stateProvinceName: str(row['name']), countryId: this.countryId(str(row['country'])),
          displayName: str(row['display']) || null, jurisdictionType: this.enumCode('jurisdictionTypes', str(row['jurisdiction'])) as never,
          isFederalJurisdiction: !!row['federal'], gstStateCode: str(row['gst']) || null, stateTaxJurisdictionCode: str(row['taxCode']) || null,
          defaultTimeZoneId: this.zoneId(str(row['timezone'])), postalCodePattern: str(row['postal']) || null,
          addressFormatHint: str(row['addressFormat']) || null, status: row['status'] as MasterDataStatus,
          sortOrder: Number(row['sort'] ?? 0), notes: str(row['notes']) || null
        }).pipe(map((d) => this.stateRow(d, d)));
      case 'city': {
        const coords = this.coordinates(row);
        return this.api.createCity({
          cityCode: str(row['code']), cityName: str(row['name']), stateProvinceId: this.stateId(str(row['country']), str(row['state'])),
          displayName: str(row['display']) || null, defaultPostalCodePattern: str(row['postal']) || null, isMetro: !!row['metro'],
          latitude: coords?.lat ?? null, longitude: coords?.lng ?? null, status: row['status'] as MasterDataStatus,
          sortOrder: 0, notes: str(row['notes']) || null
        }).pipe(map((d) => this.cityRow(d, d)));
      }
      case 'currency':
        return this.api.createCurrency({
          currencyCode: str(row['code']), currencyName: str(row['name']), numericCode: this.int(row['numeric']),
          currencyType: this.enumCode('currencyTypes', str(row['type'])) as never, symbol: str(row['symbol']) || null,
          symbolPosition: (str(row['symbolPosition']) || 'prefix') as never, displayFormat: str(row['displayFormat']) || null,
          decimalPlaces: Number(row['decimals'] ?? 2), minorUnitName: str(row['minor']) || null,
          roundingMode: this.enumCode('roundingModes', str(row['rounding'])) as never, roundingStep: this.step(row['step']),
          status: row['status'] as MasterDataStatus, sortOrder: 0, notes: str(row['notes']) || null
        }).pipe(map((d) => this.currencyRow(d, d)));
      case 'timezone':
        return this.api.createTimeZone({
          timeZoneKey: str(row['zone']), displayName: str(row['display']), standardUtcOffsetMinutes: Number(row['offset'] ?? 0),
          shortName: str(row['short']) || null, supportsDaylightSaving: !!row['dst'], daylightSavingRuleNote: str(row['dstNote']) || null,
          isDefaultRecommended: !!row['recommended'], status: row['status'] as MasterDataStatus,
          sortOrder: Number(row['sort'] ?? 0), notes: str(row['notes']) || null
        }).pipe(map((d) => this.zoneRow(d, d)));
    }
  }

  private update(key: MasterKey, row: MasterRow, editing: MasterRow): Observable<MasterRow> {
    const id = editing.id;
    const expectedVersion = Number(editing['version'] ?? 0);
    let put: Observable<{ version?: number }>;

    switch (key) {
      case 'country':
        put = this.api.updateCountry(id, {
          expectedVersion, countryName: str(row['name']), officialName: str(row['official']) || null,
          region: this.regionCode(str(row['region'])) as never, iso2: str(row['alpha2']), iso3: str(row['alpha3']) || null,
          numericCode: str(row['numeric']) || null, defaultCurrencyCode: str(row['currency']) || null, hasStates: !!row['subdivisions'],
          postalCodePattern: str(row['postal']) || null, phoneCountryCode: str(row['phone']) || null,
          sortOrder: Number(row['sort'] ?? 0), notes: str(editing['notes']) || null
        });
        break;
      case 'state':
        put = this.api.updateState(id, {
          expectedVersion, stateProvinceName: str(row['name']), displayName: str(row['display']) || null,
          jurisdictionType: this.enumCode('jurisdictionTypes', str(row['jurisdiction'])) as never, isFederalJurisdiction: !!row['federal'],
          gstStateCode: str(row['gst']) || null, stateTaxJurisdictionCode: str(row['taxCode']) || null,
          defaultTimeZoneId: this.zoneId(str(row['timezone'])), postalCodePattern: str(row['postal']) || null,
          addressFormatHint: str(row['addressFormat']) || null, sortOrder: Number(row['sort'] ?? 0), notes: str(row['notes']) || null
        });
        break;
      case 'city': {
        const coords = this.coordinates(row);
        put = this.api.updateCity(id, {
          expectedVersion, cityName: str(row['name']), displayName: str(row['display']) || null,
          defaultPostalCodePattern: str(row['postal']) || null, isMetro: !!row['metro'],
          latitude: coords?.lat ?? null, longitude: coords?.lng ?? null, clearCoordinates: !coords, notes: str(row['notes']) || null
        });
        break;
      }
      case 'currency':
        put = this.api.updateCurrency(id, {
          expectedVersion, currencyName: str(row['name']), numericCode: this.int(row['numeric']),
          currencyType: this.enumCode('currencyTypes', str(row['type'])) as never, symbol: str(row['symbol']) || null,
          symbolPosition: (str(row['symbolPosition']) || 'prefix') as never, displayFormat: str(row['displayFormat']) || null,
          decimalPlaces: Number(row['decimals'] ?? 2), minorUnitName: str(row['minor']) || null,
          roundingMode: this.enumCode('roundingModes', str(row['rounding'])) as never, roundingStep: this.step(row['step']),
          clearRoundingStep: this.step(row['step']) === null, notes: str(row['notes']) || null
        });
        break;
      case 'timezone':
        put = this.api.updateTimeZone(id, {
          expectedVersion, displayName: str(row['display']), shortName: str(row['short']) || null,
          standardUtcOffsetMinutes: Number(row['offset'] ?? 0), supportsDaylightSaving: !!row['dst'],
          daylightSavingRuleNote: str(row['dstNote']) || null, isDefaultRecommended: !!row['recommended'],
          sortOrder: Number(row['sort'] ?? 0), notes: str(row['notes']) || null
        });
        break;
    }

    return put.pipe(
      // The status is changed by its own endpoints (activate / deactivate), after the field update.
      switchMap((outcome) =>
        row['status'] !== editing['status'] && (row['status'] === 'active' || row['status'] === 'inactive')
          ? this.changeStatus(key, id, outcome.version ?? expectedVersion + 1, row['status'] as MasterStatus)
          : of(outcome)
      ),
      switchMap(() => this.loadDetail(key, id)),
      map((saved) => saved ?? row)
    );
  }

  private changeStatus(key: MasterKey, id: string, expectedVersion: number, to: MasterStatus): Observable<{ version?: number }> {
    const body = { expectedVersion };
    const on = to === 'active';
    switch (key) {
      case 'country': return on ? this.api.activateCountry(id, body) : this.api.deactivateCountry(id, body);
      case 'state': return on ? this.api.activateState(id, body) : this.api.deactivateState(id, body);
      case 'city': return on ? this.api.activateCity(id, body) : this.api.deactivateCity(id, body);
      case 'currency': return on ? this.api.activateCurrency(id, body) : this.api.deactivateCurrency(id, body);
      case 'timezone': return on ? this.api.activateTimeZone(id, body) : this.api.deactivateTimeZone(id, body);
    }
  }

  // =========================================================================================
  // Row <-> API translation
  // =========================================================================================

  private countryRow(i: CountryListItem, d?: CountryDetail): MasterRow {
    const cur = this.data.country().find((r) => r.id === i.id);
    return {
      id: i.id, version: i.version, platform: i.isPlatformRow,
      code: i.iso2 || i.countryCode, alpha2: i.iso2 || i.countryCode, alpha3: i.iso3 ?? '',
      numeric: d ? str(d.numericCode) : str(cur?.['numeric']),
      name: i.countryName, official: i.officialName ?? '', region: this.regionLabel(i.region),
      currency: i.defaultCurrencyCode ?? '', phone: i.phoneCountryCode ?? '',
      postal: d ? str(d.postalCodePattern) : str(cur?.['postal']), subdivisions: i.hasStates,
      status: i.status, sort: i.sortOrder, notes: d ? str(d.notes) : str(cur?.['notes'])
    };
  }

  private stateRow(i: StateProvinceListItem, d?: StateProvinceDetail): MasterRow {
    const cur = this.data.state().find((r) => r.id === i.id);
    const country = this.data.country().find((c) => c.id === i.countryId);
    const zone = d?.defaultTimeZoneId ? this.data.timezone().find((z) => z.id === d.defaultTimeZoneId) : null;
    return {
      id: i.id, version: i.version, platform: i.isPlatformRow, countryId: i.countryId,
      code: i.stateProvinceCode, name: i.stateProvinceName,
      display: i.displayName || `${i.stateProvinceName} (${i.stateProvinceCode})`,
      country: str(country?.['alpha2']) || i.countryCode, jurisdiction: this.enumLabel('jurisdictionTypes', i.jurisdictionType, i.jurisdictionDescription),
      federal: i.isFederalJurisdiction, gst: i.gstStateCode ?? '',
      postal: d ? str(d.postalCodePattern) : str(cur?.['postal']),
      addressFormat: d ? str(d.addressFormatHint) : str(cur?.['addressFormat']),
      taxCode: d ? str(d.stateTaxJurisdictionCode) : str(cur?.['taxCode']),
      timezone: d ? str(zone?.['zone']) : str(cur?.['timezone']),
      status: i.status, sort: i.sortOrder, notes: d ? str(d.notes) : str(cur?.['notes'])
    };
  }

  private cityRow(i: CityListItem, d?: CityDetail): MasterRow {
    const cur = this.data.city().find((r) => r.id === i.id);
    const country = this.data.country().find((c) => c.id === i.countryId);
    return {
      id: i.id, version: i.version, platform: i.isPlatformRow, stateId: i.stateProvinceId,
      code: i.cityCode, name: i.cityName, display: i.displayName || `${i.cityName} (${i.cityCode})`,
      country: str(country?.['alpha2']) || i.countryCode, state: i.stateProvinceCode, metro: i.isMetro,
      lat: i.latitude ?? 0, lng: i.longitude ?? 0,
      postal: d ? str(d.defaultPostalCodePattern) : str(cur?.['postal']), status: i.status,
      notes: d ? str(d.notes) : str(cur?.['notes'])
    };
  }

  private currencyRow(i: CurrencyListItem, d?: CurrencyDetail): MasterRow {
    const cur = this.data.currency().find((r) => r.id === i.id);
    return {
      id: i.id, version: i.version, platform: i.isPlatformRow,
      code: i.currencyCode, name: i.currencyName, numeric: i.numericCode === null ? '' : String(i.numericCode),
      type: this.enumLabel('currencyTypes', i.currencyType), symbol: i.symbol ?? '', symbolPosition: i.symbolPosition,
      displayFormat: d ? str(d.displayFormat) : str(cur?.['displayFormat']), decimals: i.decimalPlaces,
      minor: d ? str(d.minorUnitName) : str(cur?.['minor']),
      rounding: d ? this.enumLabel('roundingModes', d.roundingMode) : str(cur?.['rounding']) || this.enumLabel('roundingModes', 'halfUp'),
      step: d ? (d.roundingStep === null || d.roundingStep === undefined ? 'none' : String(d.roundingStep)) : str(cur?.['step']) || 'none',
      status: i.status, sort: i.sortOrder, notes: d ? str(d.notes) : str(cur?.['notes'])
    };
  }

  private zoneRow(i: TimeZoneListItem, d?: TimeZoneDetail): MasterRow {
    const cur = this.data.timezone().find((r) => r.id === i.id);
    return {
      id: i.id, version: i.version, platform: i.isPlatformRow,
      zone: i.timeZoneKey, display: i.displayName, short: i.shortName ?? '', offset: i.standardUtcOffsetMinutes,
      dst: i.supportsDaylightSaving, dstNote: d ? str(d.daylightSavingRuleNote) : str(cur?.['dstNote']),
      recommended: i.isDefaultRecommended, sort: i.sortOrder, status: i.status,
      notes: d ? str(d.notes) : str(cur?.['notes'])
    };
  }

  // ---- enum lists: the server's own, with the built-in labels as the fallback ----

  private enumList(kind: 'regions' | 'jurisdictionTypes' | 'currencyTypes' | 'roundingModes'): EnumOption[] {
    return this.reference()?.[kind] ?? [];
  }

  /** The label a person reads for an API code ("northAmerica" -> "North America"). */
  private enumLabel(kind: 'regions' | 'jurisdictionTypes' | 'currencyTypes' | 'roundingModes', code: string | null | undefined, fallback?: string | null): string {
    if (!code) return '';
    const hit = this.enumList(kind).find((o) => o.value === code || o.value.toLowerCase() === code.toLowerCase());
    return hit?.label || fallback || humanize(code);
  }

  /** The API code for a label ("North America" -> "northAmerica"). */
  private enumCode(kind: 'regions' | 'jurisdictionTypes' | 'currencyTypes' | 'roundingModes', label: string): string {
    const hit = this.enumList(kind).find((o) => o.label === label || o.value === label);
    return hit?.value ?? camel(label);
  }

  private regionLabel(code: string | null | undefined): string {
    return this.enumLabel('regions', code);
  }

  private regionCode(label: string): string | null {
    return label ? this.enumCode('regions', label) : null;
  }

  // ---- ids behind the codes the pages work with ----

  private countryId(alpha2: string): string {
    return str(this.data.country().find((r) => r['alpha2'] === alpha2)?.id);
  }

  private stateId(countryAlpha2: string, stateCode: string): string {
    return str(this.data.state().find((r) => r['country'] === countryAlpha2 && r['code'] === stateCode)?.id);
  }

  private zoneId(zoneKey: string): string | null {
    return zoneKey ? (this.data.timezone().find((r) => r['zone'] === zoneKey)?.id ?? null) : null;
  }

  private int(v: unknown): number | null {
    const n = Number(str(v));
    return str(v).trim() !== '' && Number.isFinite(n) ? Math.trunc(n) : null;
  }

  private step(v: unknown): number | null {
    const text = str(v).trim();
    if (!text || text === 'none') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  /** (0, 0) is how the form says "no coordinates". */
  private coordinates(row: MasterRow): { lat: number; lng: number } | null {
    const lat = Number(row['lat'] ?? 0);
    const lng = Number(row['lng'] ?? 0);
    return lat === 0 && lng === 0 ? null : { lat, lng };
  }

  // =========================================================================================
  // Dropdown sources
  // =========================================================================================

  private readonly countryOptions = computed<Option[]>(() =>
    this.data.country()
      .filter((r) => r['status'] !== 'inactive')
      .sort((a, b) => String(a['name']).localeCompare(String(b['name'])))
      .map((r) => ({ value: String(r['alpha2']), label: String(r['name']), hint: String(r['alpha2']) }))
  );

  private readonly stateOptions = computed<(Option & { parent: string })[]>(() =>
    this.data.state()
      .filter((r) => r['status'] !== 'inactive')
      .sort((a, b) => String(a['name']).localeCompare(String(b['name'])))
      .map((r) => ({ value: String(r['code']), label: String(r['name']), hint: String(r['code']), parent: String(r['country']) }))
  );

  private readonly currencyOptions = computed<Option[]>(() =>
    this.data.currency()
      .filter((r) => r['status'] === 'active')
      .sort((a, b) => String(a['code']).localeCompare(String(b['code'])))
      .map((r) => ({ value: String(r['code']), label: `${r['code']} · ${r['name']}`, hint: String(r['symbol'] ?? '') }))
  );

  private readonly timezoneOptions = computed<Option[]>(() =>
    this.data.timezone()
      .filter((r) => r['status'] === 'active')
      .sort((a, b) => Number(b['recommended']) - Number(a['recommended']) || Number(a['offset']) - Number(b['offset']))
      .map((r) => ({ value: String(r['zone']), label: String(r['zone']), hint: 'UTC' + fmtOffset(Number(r['offset'])) }))
  );

  /** The server's option list, labelled as the pages show it; the built-in list until it arrives. */
  private serverOptions(kind: 'regions' | 'jurisdictionTypes' | 'currencyTypes' | 'roundingModes', fallback: Option[]): Option[] {
    const list = this.enumList(kind);
    return list.length ? list.map((o) => ({ value: o.label, label: o.label })) : fallback;
  }

  options(source: OptionSource, parent?: string): Option[] {
    switch (source) {
      case 'countries': return this.countryOptions();
      case 'currencies': return this.currencyOptions();
      case 'timezones': return this.timezoneOptions();
      case 'states': return this.stateOptions().filter((o) => !parent || o.parent === parent);
      case 'regions': return this.serverOptions('regions', REGIONS);
      case 'jurisdictions': return this.serverOptions('jurisdictionTypes', JURISDICTIONS);
      case 'currencyTypes': return this.serverOptions('currencyTypes', CURRENCY_TYPES);
      case 'roundingModes': return this.serverOptions('roundingModes', ROUNDING_MODES);
    }
  }

  /* ---- names for codes ---- */

  readonly lookup: Lookup = {
    countryName: (code: string) => String(this.data.country().find((r) => r['alpha2'] === code)?.['name'] ?? (code || '—')),
    /** "IN|TN" -> "Tamil Nadu" */
    stateName: (key: string) => {
      const [country, code] = key.split('|');
      return String(this.data.state().find((r) => r['country'] === country && r['code'] === code)?.['name'] ?? (code || '—'));
    }
  };

  /** Not used by the pages; kept so the keys stay enumerable for callers that iterate the masters. */
  static readonly KEYS = KEYS;
}

/** API field name (lower-case) -> the form's field key, per master, for field-level server messages. */
const FIELD_MAP: Record<MasterKey, Record<string, string>> = {
  country: {
    countrycode: 'alpha2', iso2: 'alpha2', iso3: 'alpha3', countryname: 'name', officialname: 'official', region: 'region',
    numericcode: 'numeric', defaultcurrencycode: 'currency', phonecountrycode: 'phone', postalcodepattern: 'postal',
    hasstates: 'subdivisions', sortorder: 'sort', status: 'status', notes: 'notes'
  },
  state: {
    stateprovincecode: 'code', stateprovincename: 'name', displayname: 'display', countryid: 'country',
    jurisdictiontype: 'jurisdiction', isfederaljurisdiction: 'federal', gststatecode: 'gst', statetaxjurisdictioncode: 'taxCode',
    defaulttimezoneid: 'timezone', postalcodepattern: 'postal', addressformathint: 'addressFormat', sortorder: 'sort',
    status: 'status', notes: 'notes'
  },
  city: {
    citycode: 'code', cityname: 'name', displayname: 'display', stateprovinceid: 'state', ismetro: 'metro',
    latitude: 'lat', longitude: 'lng', defaultpostalcodepattern: 'postal', status: 'status', notes: 'notes'
  },
  currency: {
    currencycode: 'code', currencyname: 'name', numericcode: 'numeric', currencytype: 'type', symbol: 'symbol',
    symbolposition: 'symbolPosition', displayformat: 'displayFormat', decimalplaces: 'decimals', minorunitname: 'minor',
    roundingmode: 'rounding', roundingstep: 'step', status: 'status', notes: 'notes'
  },
  timezone: {
    timezonekey: 'zone', displayname: 'display', shortname: 'short', standardutcoffsetminutes: 'offset',
    supportsdaylightsaving: 'dst', daylightsavingrulenote: 'dstNote', isdefaultrecommended: 'recommended',
    sortorder: 'sort', status: 'status', notes: 'notes'
  }
};
