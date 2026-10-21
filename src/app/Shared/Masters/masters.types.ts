/* =====================================================================================================
   MASTER DATA - shared types, option lists and helpers.
   Each master page (Countries · States · Cities · Currencies · Time_Zones) has its own folder with its
   config (<name>.config.ts: columns, filters, metrics, form sections, sample rows), its list page and
   its create / edit page. This file holds only what the five share.
   ===================================================================================================== */

export type MasterKey = 'country' | 'state' | 'city' | 'currency' | 'timezone';
export type MasterStatus = 'active' | 'inactive' | 'draft';
export type CellValue = string | number | boolean | null;

/** One record. Every value is a plain primitive so a row can be copied, compared and stored. */
export type MasterRow = { id: string } & Record<string, CellValue>;

export interface Option {
  value: string;
  label: string;
  /** Small grey text on the right of the option (code, offset ...). */
  hint?: string;
}

/** Lists that come from another master (a state's country, a city's state ...). */
export type OptionSource =
  | 'countries' | 'states' | 'currencies' | 'timezones'
  /** The server's own option lists (labels as the API names them). */
  | 'regions' | 'jurisdictions' | 'currencyTypes' | 'roundingModes';

export interface FieldDef {
  key: string;
  label: string;
  /** Grey help line under the label. */
  hint?: string;
  kind: 'text' | 'number' | 'select' | 'choice' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: Option[];
  optionsFrom?: OptionSource;
  /** For a dependent list: only options whose parent matches this field (state -> country). */
  dependsOn?: string;
  /** Placeholder while the parent field is still empty. */
  dependsPlaceholder?: string;
  pattern?: RegExp;
  patternMsg?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Letters are upper-cased while typing (codes). */
  upper?: boolean;
  maxlength?: number;
  /** Short controls keep a narrow input (codes, numbers). */
  short?: boolean;
  /** Monospace value (regular expressions, codes). */
  mono?: boolean;
  /** The value must compile as a regular expression. */
  regex?: boolean;
  /** The value must contain this token (display format -> {amount}). */
  mustInclude?: string;
  /** Takes the whole row of the section instead of one lane. */
  wide?: boolean;
  /** Locked once the record exists (stable references). */
  lockOnEdit?: boolean;
}

export interface SectionDef {
  no: string;
  title: string;
  note: string;
  fields: FieldDef[];
}

export type ColumnKind = 'lead' | 'text' | 'chip' | 'status' | 'muted' | 'accent' | 'num' | 'flag';

export interface ColumnDef {
  key: string;
  label: string;
  kind: ColumnKind;
  /** Main text; defaults to row[key]. */
  value?: (r: MasterRow, lookup: Lookup) => string;
  /** Grey line under the main text (lead column). */
  sub?: (r: MasterRow) => string;
  /** Code tile in the lead column. */
  code?: (r: MasterRow) => string;
  /** Sort key; columns without one are not sortable. */
  sort?: (r: MasterRow) => string | number;
  align?: 'center' | 'right';
  /** Relative width (the actions column is fixed). */
  width?: number;
}

export interface FilterDef {
  key: string;
  /** Label above the control ("Region"). */
  title: string;
  /** First option ("All regions"). */
  allLabel: string;
  options?: Option[];
  optionsFrom?: OptionSource;
  /** Narrows the options to the value of another filter (states of the chosen country). */
  dependsOn?: string;
  match: (r: MasterRow, value: string) => boolean;
}

export interface Metric {
  label: string;
  value: string;
  note: string;
  /** Tinted card (the one figure that matters most). */
  accent?: boolean;
}

export interface PreviewFact {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'muted';
}

export interface Preview {
  mark: string;
  title: string;
  sub: string;
  facts: PreviewFact[];
}

export type FormValues = Record<string, string>;

/** Read-only lookups a preview may need (a city's state name ...). */
export interface Lookup {
  countryName(code: string): string;
  stateName(code: string): string;
}

export interface MasterConfig {
  key: MasterKey;
  route: string;
  /** List title ("Countries"). */
  plural: string;
  /** Lower-case singular for messages ("country"). */
  singular: string;
  eyebrow: string;
  subtitle: string;
  registerTitle: string;
  registerNote: string;
  icon: IconName;
  searchLabel: string;
  searchPlaceholder: string;
  searchKeys: string[];
  filters: FilterDef[];
  columns: ColumnDef[];
  defaultSort: { key: string; dir: 'asc' | 'desc' };
  metrics: (rows: MasterRow[]) => Metric[];
  /** Form */
  formTitle: string;
  formSubtitle: string;
  introTitle: string;
  introNote: string;
  sections: SectionDef[];
  defaults: FormValues;
  /** Field holding the unique code (duplicate check) and the display name (messages). */
  codeKey: string;
  nameKey: string;
  preview: (v: FormValues, lookup: Lookup) => Preview;
  /** Form values -> stored row (numbers and booleans typed). */
  toRow: (v: FormValues, id: string) => MasterRow;
  /** Stored row -> form values (edit). */
  toForm: (r: MasterRow) => FormValues;
  /** Labelled facts for the view drawer. */
  details: (r: MasterRow, lookup: Lookup) => { label: string; value: string }[];
  footnote: string;
}

export type IconName =
  | 'globe' | 'map' | 'pin' | 'coins' | 'clock' | 'plus' | 'search' | 'sort' | 'eye' | 'edit' | 'power'
  | 'trash' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'x' | 'check' | 'reset' | 'save' | 'info'
  | 'download' | 'lock' | 'back' | 'filter';

/* ---------------------------------------------------------------------------------------------------
   shared option lists
   --------------------------------------------------------------------------------------------------- */
export const STATUS_LABEL: Record<MasterStatus, string> = { active: 'Active', inactive: 'Inactive', draft: 'Draft' };

export const STATUS_AI: Option[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];
export const STATUS_DAI: Option[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];
export const STATUS_AD: Option[] = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' }
];

export const REGIONS: Option[] = [
  { value: 'Africa', label: 'Africa' },
  { value: 'Asia', label: 'Asia' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Middle East', label: 'Middle East' },
  { value: 'North America', label: 'North America' },
  { value: 'Oceania', label: 'Oceania' },
  { value: 'South America', label: 'South America' }
];

export const JURISDICTIONS: Option[] = [
  { value: 'State', label: 'State' },
  { value: 'Province', label: 'Province' },
  { value: 'Union territory', label: 'Union territory' },
  { value: 'Territory', label: 'Territory' },
  { value: 'Constituent country', label: 'Constituent country' },
  { value: 'Region', label: 'Region' }
];

export const CURRENCY_TYPES: Option[] = [
  { value: 'Fiat', label: 'Fiat', hint: 'Government currency' },
  { value: 'Commodity', label: 'Commodity', hint: 'Gold, silver' },
  { value: 'Digital', label: 'Digital', hint: 'Central-bank digital' },
  { value: 'Internal', label: 'Internal', hint: 'Points, credits' }
];

export const ROUNDING_MODES: Option[] = [
  { value: 'Half up', label: 'Half up', hint: '2.5 → 3' },
  { value: 'Half even', label: 'Half even', hint: '2.5 → 2 (banker’s)' },
  { value: 'Up', label: 'Up', hint: 'Always away from zero' },
  { value: 'Down', label: 'Down', hint: 'Always towards zero' }
];

export const yesNo = (yes: string, no: string): Option[] => [
  { value: 'yes', label: yes },
  { value: 'no', label: no }
];

/* ---------------------------------------------------------------------------------------------------
   helpers
   --------------------------------------------------------------------------------------------------- */
export const s = (r: MasterRow, k: string): string => {
  const v = r[k];
  return v === null || v === undefined ? '' : String(v);
};
export const dash = (v: string): string => (v && v.trim() ? v : '—');
export const count = (rows: MasterRow[], k: string, v: CellValue): number => rows.filter((r) => r[k] === v).length;
export const numOr = (v: string, fallback: number | null = null): number | null => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : fallback;
};

/** "+05:30" from minutes. */
export const fmtOffset = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : '+';
  const m = Math.abs(minutes);
  return `${sign}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Current local time in a zone ("15:42"), or null when the zone id is unknown. */
export const localTime = (zone: string): string | null => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  } catch {
    return null;
  }
};

/** 12345.678 shown with a currency's symbol, position and decimals. */
export const sampleAmount = (v: FormValues): string => {
  const d = Math.min(4, Math.max(0, Number(v['decimals'] || 2)));
  const n = new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(12345.678);
  const sym = v['symbol'] || '';
  if (v['displayFormat'] && v['displayFormat'].includes('{amount}')) return v['displayFormat'].replace('{amount}', n);
  if (!sym) return n;
  return v['symbolPosition'] === 'suffix' ? `${n} ${sym}` : `${sym}${n}`;
};

/* ---------------------------------------------------------------------------------------------------
   shared column, filter, metric and field pieces
   --------------------------------------------------------------------------------------------------- */
export const statusColumn: ColumnDef = {
  key: 'status', label: 'Status', kind: 'status', width: 12,
  sort: (r) => ({ active: 0, draft: 1, inactive: 2 } as Record<string, number>)[s(r, 'status')] ?? 3
};

export const statusFilter = (options: Option[]): FilterDef => ({
  key: 'status', title: 'Status', allLabel: 'All statuses', options,
  match: (r, v) => r['status'] === v
});

export const statusMetrics = (rows: MasterRow[], noun: string, draft = true): Metric[] => {
  const out: Metric[] = [
    { label: `Active ${noun}`, value: String(count(rows, 'status', 'active')), note: 'Offered in dropdowns', accent: true }
  ];
  if (draft) out.push({ label: 'Draft', value: String(count(rows, 'status', 'draft')), note: 'Prepared, not offered yet' });
  out.push({ label: 'Inactive', value: String(count(rows, 'status', 'inactive')), note: 'Kept for existing records' });
  return out;
};

export const statusChoice = (options: Option[], hint = ''): FieldDef => ({
  key: 'status', label: 'Status', kind: 'choice', required: true, options, hint
});

export const sortOrder: FieldDef = {
  key: 'sort', label: 'Sort order', hint: 'Lower shows first', kind: 'number', short: true, integer: true, min: 0, max: 9999, placeholder: '0'
};

export const notes = (thing: string): FieldDef => ({
  key: 'notes', label: 'Notes', hint: 'Internal only', kind: 'textarea', maxlength: 500, wide: true,
  placeholder: `Anything the team should know about this ${thing}`
});
