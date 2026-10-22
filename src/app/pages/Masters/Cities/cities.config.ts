/* =====================================================================================================
   CITIES - master configuration and sample rows
   Drives the cities list page (cities.html) and the create / edit page (city-form.html):
   table columns, filters, overview metrics, form sections with their rules, live preview and the
   view-drawer details. Records come from the API (see MastersStore).
   ===================================================================================================== */
import {
  MasterConfig, statusMetrics, MasterRow, MasterStatus, STATUS_DAI, STATUS_LABEL, count, dash, notes, numOr, s, statusChoice, statusColumn, statusFilter, yesNo
} from '../../../Shared/Masters/masters.types';

export const CITY: MasterConfig = {
  key: 'city',
  route: '/app/masters/city',
  plural: 'Cities',
  singular: 'city',
  eyebrow: 'Master data / Geography',
  subtitle: 'Cities mapped to their state and country, used for addresses, reporting and analytics.',
  registerTitle: 'City directory',
  registerNote: 'Pick a country to narrow the state filter to its regions.',
  icon: 'pin',
  searchLabel: 'Find a city',
  searchPlaceholder: 'City code or name',
  searchKeys: ['code', 'name', 'display'],
  filters: [
    { key: 'country', title: 'Country', allLabel: 'All countries', optionsFrom: 'countries', match: (r, v) => r['country'] === v },
    { key: 'state', title: 'State', allLabel: 'All states', optionsFrom: 'states', dependsOn: 'country', match: (r, v) => r['state'] === v },
    statusFilter(STATUS_DAI)
  ],
  columns: [
    { key: 'name', label: 'City', kind: 'lead', width: 24, code: (r) => s(r, 'code'), sub: (r) => (r['metro'] ? 'Metro' : 'Non-metro'), sort: (r) => s(r, 'name') },
    { key: 'state', label: 'State', kind: 'text', width: 16, value: (r, l) => l.stateName(`${s(r, 'country')}|${s(r, 'state')}`), sort: (r) => s(r, 'state') },
    { key: 'country', label: 'Country', kind: 'muted', width: 14, value: (r, l) => l.countryName(s(r, 'country')), sort: (r) => s(r, 'country') },
    { key: 'coords', label: 'Coordinates', kind: 'muted', width: 16, value: (r) => `${Number(r['lat']).toFixed(4)}, ${Number(r['lng']).toFixed(4)}` },
    statusColumn
  ],
  defaultSort: { key: 'country', dir: 'asc' },
  metrics: (rows) => [
    { label: 'Cities', value: String(rows.length), note: `Mapped to ${new Set(rows.map((r) => `${r['country']}-${r['state']}`)).size} states` },
    ...statusMetrics(rows, 'cities'),
    { label: 'Metro cities', value: String(count(rows, 'metro', true)), note: 'Used in analytics' }
  ],
  formTitle: 'New city',
  formSubtitle: 'Add a city under its state, with postal pattern and map position.',
  introTitle: 'City register',
  introNote: 'Choose the country, then one of its states.',
  codeKey: 'code',
  nameKey: 'name',
  sections: [
    {
      no: '01', title: 'Identity', note: 'The short code and the names people see.',
      fields: [
        { key: 'code', label: 'City code', hint: '2–6 letters', kind: 'text', required: true, upper: true, short: true, maxlength: 6, placeholder: 'CBE', pattern: /^[A-Z]{2,6}$/, patternMsg: 'Use 2–6 letters.', lockOnEdit: true },
        { key: 'name', label: 'City name', kind: 'text', required: true, maxlength: 80, placeholder: 'Coimbatore' },
        { key: 'display', label: 'Display name', hint: 'Shown in dropdowns', kind: 'text', maxlength: 100, placeholder: 'Coimbatore (CBE)' }
      ]
    },
    {
      no: '02', title: 'Location', note: 'The state list follows the chosen country.',
      fields: [
        { key: 'country', label: 'Country', kind: 'select', required: true, optionsFrom: 'countries', placeholder: 'Select country' },
        { key: 'state', label: 'State / province', hint: 'Of the chosen country', kind: 'select', required: true, optionsFrom: 'states', dependsOn: 'country', placeholder: 'Select state / province', dependsPlaceholder: 'Select country first' },
        { key: 'metro', label: 'Metro city', hint: 'Used in analytics', kind: 'choice', options: yesNo('Metro', 'Not metro') }
      ]
    },
    {
      no: '03', title: 'Postal & geography', note: 'A city pattern overrides the state’s postal rule.',
      fields: [
        { key: 'postal', label: 'Postal code pattern', hint: 'Overrides the state’s', kind: 'text', mono: true, regex: true, maxlength: 120, placeholder: '^641[0-9]{3}$', wide: true },
        { key: 'lat', label: 'Latitude', hint: '−90 to 90', kind: 'number', short: true, min: -90, max: 90, placeholder: '11.0168' },
        { key: 'lng', label: 'Longitude', hint: '−180 to 180', kind: 'number', short: true, min: -180, max: 180, placeholder: '76.9558' }
      ]
    },
    {
      no: '04', title: 'Status & notes', note: 'Drafts are saved but not offered in address forms yet.',
      fields: [statusChoice(STATUS_DAI), notes('city')]
    }
  ],
  defaults: { code: '', name: '', display: '', country: '', state: '', metro: 'no', postal: '', lat: '', lng: '', status: 'active', notes: '' },
  preview: (v, lookup) => ({
    mark: v['code'] || '··',
    title: v['name'] || 'City name',
    sub: [v['state'] ? lookup.stateName(`${v['country']}|${v['state']}`) : '', v['country'] ? lookup.countryName(v['country']) : ''].filter(Boolean).join(', ') || 'State, country',
    facts: [
      { label: 'Type', value: v['metro'] === 'yes' ? 'Metro' : 'Non-metro' },
      { label: 'Position', value: v['lat'] && v['lng'] ? `${v['lat']}, ${v['lng']}` : '—' },
      { label: 'Status', value: STATUS_LABEL[(v['status'] || 'active') as MasterStatus], tone: v['status'] === 'active' ? 'ok' : v['status'] === 'draft' ? 'warn' : 'muted' }
    ]
  }),
  toRow: (v, id) => ({
    id, code: v['code'], name: v['name'].trim(), display: v['display'].trim() || `${v['name'].trim()} (${v['code']})`,
    country: v['country'], state: v['state'], metro: v['metro'] === 'yes', postal: v['postal'],
    lat: numOr(v['lat'], 0), lng: numOr(v['lng'], 0), status: v['status'], notes: v['notes']
  }),
  toForm: (r) => ({
    code: s(r, 'code'), name: s(r, 'name'), display: s(r, 'display'), country: s(r, 'country'), state: s(r, 'state'),
    metro: r['metro'] ? 'yes' : 'no', postal: s(r, 'postal'), lat: s(r, 'lat'), lng: s(r, 'lng'), status: s(r, 'status'), notes: s(r, 'notes')
  }),
  details: (r, lookup) => [
    { label: 'Display name', value: dash(s(r, 'display')) },
    { label: 'State / province', value: lookup.stateName(`${s(r, 'country')}|${s(r, 'state')}`) },
    { label: 'Country', value: lookup.countryName(s(r, 'country')) },
    { label: 'Metro city', value: r['metro'] ? 'Metro' : 'Not metro' },
    { label: 'Latitude, longitude', value: `${s(r, 'lat')}, ${s(r, 'lng')}` },
    { label: 'Postal code pattern', value: dash(s(r, 'postal')) },
    { label: 'Notes', value: dash(s(r, 'notes')) }
  ],
  footnote: 'Coordinates use decimal degrees (WGS 84). The city code is locked after creation.'
};
