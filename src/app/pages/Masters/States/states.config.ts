/* =====================================================================================================
   STATES - master configuration and sample rows
   Drives the states list page (states.html) and the create / edit page (state-form.html):
   table columns, filters, overview metrics, form sections with their rules, live preview and the
   view-drawer details. Records come from the API (see MastersStore).
   ===================================================================================================== */
import {
  MasterConfig, statusMetrics, MasterRow, MasterStatus, STATUS_DAI, STATUS_LABEL, dash, notes, numOr, s, sortOrder, statusChoice, statusColumn, statusFilter, yesNo
} from '../../../Shared/Masters/masters.types';

export const STATE: MasterConfig = {
  key: 'state',
  route: '/app/masters/state',
  plural: 'States',
  singular: 'state',
  eyebrow: 'Master data / Geography',
  subtitle: 'States, provinces and territories grouped by country, with their tax and postal rules.',
  registerTitle: 'Regional divisions',
  registerNote: 'Each region belongs to one country; GST codes apply to Indian states.',
  icon: 'map',
  searchLabel: 'Find a state',
  searchPlaceholder: 'Code, name or GST code',
  searchKeys: ['code', 'name', 'display', 'gst'],
  filters: [
    { key: 'country', title: 'Country', allLabel: 'All countries', optionsFrom: 'countries', match: (r, v) => r['country'] === v },
    { key: 'jurisdiction', title: 'Jurisdiction', allLabel: 'All jurisdictions', optionsFrom: 'jurisdictions', match: (r, v) => r['jurisdiction'] === v },
    statusFilter(STATUS_DAI)
  ],
  columns: [
    { key: 'name', label: 'State / province', kind: 'lead', width: 26, code: (r) => s(r, 'code'), sub: (r) => s(r, 'display'), sort: (r) => s(r, 'name') },
    { key: 'country', label: 'Country', kind: 'text', width: 15, value: (r, l) => l.countryName(s(r, 'country')), sort: (r) => s(r, 'country') },
    { key: 'jurisdiction', label: 'Jurisdiction', kind: 'muted', width: 14, sort: (r) => s(r, 'jurisdiction') },
    { key: 'gst', label: 'GST', kind: 'chip', width: 8, sort: (r) => s(r, 'gst') },
    { key: 'timezone', label: 'Time zone', kind: 'muted', width: 15, value: (r) => dash(s(r, 'timezone')) },
    statusColumn
  ],
  defaultSort: { key: 'country', dir: 'asc' },
  metrics: (c) => [
    { label: 'Regions', value: String(c.total), note: 'Across all countries' },
    ...statusMetrics(c, 'regions'),
    { label: 'Federal', value: String(c.extra), note: 'Federal jurisdictions' }
  ],
  formTitle: 'New state',
  formSubtitle: 'Add a state, province or territory under its country, with tax and postal rules.',
  introTitle: 'State register',
  introNote: 'Choose the country first; postal and tax rules belong to the region.',
  codeKey: 'code',
  nameKey: 'name',
  sections: [
    {
      no: '01', title: 'Identity', note: 'The short code and the names people see.',
      fields: [
        { key: 'code', label: 'Code', hint: 'Letters, digits, _ and -', kind: 'text', required: true, upper: true, short: true, maxlength: 10, placeholder: 'TN', pattern: /^[A-Z0-9_-]{1,10}$/, patternMsg: 'Use up to 10 letters, digits, _ or -.', lockOnEdit: true },
        { key: 'name', label: 'Name', kind: 'text', required: true, maxlength: 80, placeholder: 'Tamil Nadu' },
        { key: 'display', label: 'Display name', hint: 'Shown in dropdowns', kind: 'text', maxlength: 100, placeholder: 'Tamil Nadu (TN)' }
      ]
    },
    {
      no: '02', title: 'Country & jurisdiction', note: 'Where the region sits and what kind of division it is.',
      fields: [
        { key: 'country', label: 'Country', kind: 'select', required: true, optionsFrom: 'countries', placeholder: 'Select country' },
        { key: 'jurisdiction', label: 'Jurisdiction type', kind: 'select', required: true, optionsFrom: 'jurisdictions', placeholder: 'Select jurisdiction type' },
        { key: 'federal', label: 'Federal jurisdiction', hint: 'Governed directly by the union', kind: 'choice', options: yesNo('Federal', 'Not federal') }
      ]
    },
    {
      no: '03', title: 'Address & postal rules', note: 'Checked when an address in this region is captured.',
      fields: [
        { key: 'postal', label: 'Postal code pattern', hint: 'Regular expression', kind: 'text', mono: true, regex: true, maxlength: 120, placeholder: '^6[0-4][0-9]{4}$' },
        { key: 'addressFormat', label: 'Address format', hint: 'Shown when capturing', kind: 'text', maxlength: 160, placeholder: 'Door No, Street, Area, City - PIN', wide: true }
      ]
    },
    {
      no: '04', title: 'Compliance & tax', note: 'GST state codes apply to India; other countries may use a state tax code.',
      fields: [
        { key: 'gst', label: 'GST state code', hint: 'Two digits', kind: 'text', short: true, maxlength: 2, placeholder: '33', pattern: /^[0-9]{2}$/, patternMsg: 'Use 2 digits, e.g. 33.' },
        { key: 'taxCode', label: 'State tax code', hint: 'Where states levy tax', kind: 'text', short: true, upper: true, maxlength: 12, placeholder: 'CA-001' },
        { key: 'timezone', label: 'Default time zone', kind: 'select', optionsFrom: 'timezones', placeholder: 'Select time zone' }
      ]
    },
    {
      no: '05', title: 'Status & notes', note: 'Drafts are saved but not offered in address forms yet.',
      fields: [statusChoice(STATUS_DAI), sortOrder, notes('state')]
    }
  ],
  defaults: { code: '', name: '', display: '', country: '', jurisdiction: '', federal: 'no', postal: '', addressFormat: '', gst: '', taxCode: '', timezone: '', status: 'active', sort: '0', notes: '' },
  preview: (v, lookup) => ({
    mark: v['code'] || '··',
    title: v['name'] || 'State name',
    sub: v['country'] ? lookup.countryName(v['country']) : 'Country',
    facts: [
      { label: 'Type', value: v['jurisdiction'] || '—' },
      { label: 'GST', value: v['gst'] || '—' },
      { label: 'Status', value: STATUS_LABEL[(v['status'] || 'active') as MasterStatus], tone: v['status'] === 'active' ? 'ok' : v['status'] === 'draft' ? 'warn' : 'muted' }
    ]
  }),
  toRow: (v, id) => ({
    id, code: v['code'], name: v['name'].trim(), display: v['display'].trim() || `${v['name'].trim()} (${v['code']})`,
    country: v['country'], jurisdiction: v['jurisdiction'], federal: v['federal'] === 'yes', postal: v['postal'],
    addressFormat: v['addressFormat'], gst: v['gst'], taxCode: v['taxCode'], timezone: v['timezone'], status: v['status'],
    sort: numOr(v['sort'], 0), notes: v['notes']
  }),
  toForm: (r) => ({
    code: s(r, 'code'), name: s(r, 'name'), display: s(r, 'display'), country: s(r, 'country'), jurisdiction: s(r, 'jurisdiction'),
    federal: r['federal'] ? 'yes' : 'no', postal: s(r, 'postal'), addressFormat: s(r, 'addressFormat'), gst: s(r, 'gst'),
    taxCode: s(r, 'taxCode'), timezone: s(r, 'timezone'), status: s(r, 'status'), sort: s(r, 'sort'), notes: s(r, 'notes')
  }),
  details: (r, lookup) => [
    { label: 'Display name', value: dash(s(r, 'display')) },
    { label: 'Country', value: lookup.countryName(s(r, 'country')) },
    { label: 'Jurisdiction', value: `${s(r, 'jurisdiction')}${r['federal'] ? ' · federal' : ''}` },
    { label: 'GST state code', value: dash(s(r, 'gst')) },
    { label: 'State tax code', value: dash(s(r, 'taxCode')) },
    { label: 'Default time zone', value: dash(s(r, 'timezone')) },
    { label: 'Postal code pattern', value: dash(s(r, 'postal')) },
    { label: 'Address format', value: dash(s(r, 'addressFormat')) },
    { label: 'Notes', value: dash(s(r, 'notes')) }
  ],
  footnote: 'GST state codes follow the Indian GST state code list. The region code is locked after creation.'
};
