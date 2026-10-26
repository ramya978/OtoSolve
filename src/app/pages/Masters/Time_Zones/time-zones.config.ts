/* =====================================================================================================
   TIME ZONES - master configuration and sample rows
   Drives the time-zones list page (time-zones.html) and the create / edit page (time-zone-form.html):
   table columns, filters, overview metrics, form sections with their rules, live preview and the
   view-drawer details. Records come from the API (see MastersStore).
   ===================================================================================================== */
import {
  MasterConfig, statusMetrics, MasterRow, MasterStatus, STATUS_DAI, STATUS_LABEL, count, dash, fmtOffset, localTime, notes, numOr, s, sortOrder, statusChoice, statusColumn, statusFilter, yesNo
} from '../../../Shared/Masters/masters.types';

export const TIME_ZONE: MasterConfig = {
  key: 'timezone',
  route: '/app/masters/timezone',
  plural: 'Time zones',
  singular: 'time zone',
  eyebrow: 'Master data / Scheduling',
  subtitle: 'IANA time zones offered for organisations, states and scheduling, with their UTC offsets.',
  registerTitle: 'Time zone registry',
  registerNote: 'Offsets are standard time; daylight saving follows the IANA rules of each zone.',
  icon: 'clock',
  searchLabel: 'Find a time zone',
  searchPlaceholder: 'Zone, city or abbreviation',
  searchKeys: ['zone', 'display', 'short'],
  filters: [
    { key: 'dst', title: 'Daylight saving', allLabel: 'All DST', options: yesNo('Observes DST', 'No DST'), match: (r, v) => (v === 'yes') === r['dst'] },
    statusFilter(STATUS_DAI)
  ],
  columns: [
    { key: 'display', label: 'Time zone', kind: 'lead', width: 30, code: (r) => s(r, 'short'), sub: (r) => s(r, 'zone'), sort: (r) => Number(r['offset']) },
    { key: 'offset', label: 'UTC offset', kind: 'chip', width: 11, value: (r) => 'UTC' + fmtOffset(Number(r['offset'])), sort: (r) => Number(r['offset']) },
    { key: 'dst', label: 'DST', kind: 'accent', width: 9, value: (r) => (r['dst'] ? 'DST' : 'No DST') },
    { key: 'recommended', label: 'Default', kind: 'muted', width: 12, value: (r) => (r['recommended'] ? 'Recommended' : '—') },
    statusColumn
  ],
  defaultSort: { key: 'display', dir: 'asc' },
  metrics: (c) => [
    { label: 'Time zones', value: String(c.total), note: 'UTC offsets for scheduling' },
    ...statusMetrics(c, 'zones'),
    { label: 'Observe DST', value: String(c.extra), note: 'Clocks change during the year' }
  ],
  formTitle: 'New time zone',
  formSubtitle: 'Add an IANA time zone with its standard offset and daylight-saving behaviour.',
  introTitle: 'Time zone register',
  introNote: 'The preview shows the current local time once the zone ID is recognised.',
  codeKey: 'zone',
  nameKey: 'display',
  sections: [
    {
      no: '01', title: 'Identity', note: 'The IANA identifier and the label offered in dropdowns.',
      fields: [
        { key: 'zone', label: 'Time zone ID', hint: 'IANA · Area/Location', kind: 'text', required: true, maxlength: 60, placeholder: 'Asia/Kolkata', pattern: /^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/, patternMsg: 'Use Area/Location, e.g. Asia/Kolkata.', lockOnEdit: true },
        { key: 'display', label: 'Display name', kind: 'text', required: true, maxlength: 90, placeholder: '(UTC+05:30) India Standard Time' },
        { key: 'short', label: 'Short name', hint: 'Compact display', kind: 'text', short: true, upper: true, maxlength: 5, placeholder: 'IST' }
      ]
    },
    {
      no: '02', title: 'Offset & daylight saving', note: 'Standard offset in minutes from UTC.',
      fields: [
        { key: 'offset', label: 'UTC offset', hint: 'In minutes · India 330', kind: 'number', required: true, short: true, integer: true, min: -720, max: 840, placeholder: '330' },
        { key: 'dst', label: 'Daylight saving', kind: 'choice', options: yesNo('Observed', 'Not observed') },
        { key: 'dstNote', label: 'DST rule note', kind: 'text', maxlength: 120, placeholder: 'DST varies by year; follow IANA rules', wide: true }
      ]
    },
    {
      no: '03', title: 'Defaults & order', note: 'Recommended zones are offered first when a state is created.',
      fields: [
        { key: 'recommended', label: 'Recommended', hint: 'Offered first to states', kind: 'choice', options: yesNo('Recommended', 'Not a default') },
        sortOrder
      ]
    },
    {
      no: '04', title: 'Status & notes', note: 'Drafts are saved but not offered for scheduling yet.',
      fields: [statusChoice(STATUS_DAI), notes('zone')]
    }
  ],
  defaults: { zone: '', display: '', short: '', offset: '', dst: 'no', dstNote: '', recommended: 'no', sort: '0', status: 'active', notes: '' },
  preview: (v) => ({
    mark: (v['zone'] && localTime(v['zone'])) || '--:--',
    title: v['display'] || 'Display name',
    sub: v['zone'] || 'Area/Location',
    facts: [
      { label: 'Offset', value: v['offset'] !== '' && Number.isFinite(Number(v['offset'])) ? 'UTC' + fmtOffset(Number(v['offset'])) : 'UTC ±' },
      { label: 'Short', value: v['short'] || '—' },
      { label: 'DST', value: v['dst'] === 'yes' ? 'Yes' : 'No' },
      { label: 'Status', value: STATUS_LABEL[(v['status'] || 'active') as MasterStatus], tone: v['status'] === 'active' ? 'ok' : v['status'] === 'draft' ? 'warn' : 'muted' }
    ]
  }),
  toRow: (v, id) => ({
    id, zone: v['zone'].trim(), display: v['display'].trim(), short: v['short'], offset: numOr(v['offset'], 0),
    dst: v['dst'] === 'yes', dstNote: v['dstNote'], recommended: v['recommended'] === 'yes', sort: numOr(v['sort'], 0),
    status: v['status'], notes: v['notes']
  }),
  toForm: (r) => ({
    zone: s(r, 'zone'), display: s(r, 'display'), short: s(r, 'short'), offset: s(r, 'offset'), dst: r['dst'] ? 'yes' : 'no',
    dstNote: s(r, 'dstNote'), recommended: r['recommended'] ? 'yes' : 'no', sort: s(r, 'sort'), status: s(r, 'status'), notes: s(r, 'notes')
  }),
  details: (r) => [
    { label: 'IANA identifier', value: s(r, 'zone') },
    { label: 'Short name', value: dash(s(r, 'short')) },
    { label: 'UTC offset', value: `UTC${fmtOffset(Number(r['offset']))} · ${s(r, 'offset')} minutes` },
    { label: 'Local time now', value: localTime(s(r, 'zone')) ?? 'Unknown zone' },
    { label: 'Daylight saving', value: r['dst'] ? 'Observed' : 'Not observed' },
    { label: 'DST rule note', value: dash(s(r, 'dstNote')) },
    { label: 'Recommended', value: r['recommended'] ? 'Yes, offered first' : 'No' },
    { label: 'Notes', value: dash(s(r, 'notes')) }
  ],
  footnote: 'Identifiers follow the IANA time zone database. Offsets shown are standard time.'
};
