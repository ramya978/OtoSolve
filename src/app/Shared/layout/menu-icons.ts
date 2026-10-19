
const rect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1-${r} ${r}` +
  `h-${w - 2 * r}a${r} ${r} 0 0 1-${r}-${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r}-${r}z`;

const ellipse = (cx: number, cy: number, rx: number, ry = rx): string =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0 ${rx} ${ry} 0 1 0-${2 * rx} 0`;

const QUEUE = `${rect(4, 3, 16, 18, 2)} M8 8h8 M8 12h8 M8 16h5`;
const DOCUMENT = 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h5';
const BUILDING = 'M4 21V4h10v17 M14 9h6v12 M2 21h20 M7 8h4 M7 12h4 M8 21v-5h3v5 M17 12v2 M17 17v1';
const FLAG = 'M4 22V3c5-4 11 4 16 0v11c-5 4-11-4-16 0';
const PEOPLE = `${ellipse(9, 7, 3)} M3 21v-3a6 6 0 0 1 12 0v3 M16 4a3 3 0 0 1 0 6 M18 13a5 5 0 0 1 3 5v3`;
const PIN = `M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0z ${ellipse(12, 10, 2.5)}`;

export const MENU_ICONS: Record<string, string> = {
  grid: `${rect(3, 3, 6, 6, 1)} ${rect(15, 3, 6, 6, 1)} ${rect(3, 15, 6, 6, 1)} ${rect(15, 15, 6, 6, 1)}`,
  globe: `${ellipse(12, 12, 9)} ${ellipse(12, 12, 4, 9)} M3 12h18`,
  building: BUILDING,
  'plus-circle': `${ellipse(12, 12, 9)} M12 8v8 M8 12h8`,
  'check-circle': 'M21 11v1a9 9 0 1 1-5-8 M9 11l3 3 9-10',
  briefcase: `${rect(3, 7, 18, 14, 2)} M8 7V3h8v4 M3 12c5 3 13 3 18 0 M10 13v3h4v-3`,
  key: `${ellipse(7, 15, 4)} M10 12l9-9 3 3-3 3-2-2 M14 8l2 2`,
  list: 'M8 6h13 M8 12h10 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z',
  heart: 'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 1 10 8 16 7-6 13-11 8-16z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z',
  queue: QUEUE,
  filter: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
  funnel: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
  clipboard: `${rect(5, 4, 14, 18, 2)} ${rect(9, 2, 6, 4, 1)} M9 11h6 M9 15h6 M9 19h3`,
  user: `${ellipse(12, 7, 3.5)} M5 21v-3a7 7 0 0 1 14 0v3`,
  'dollar-sign': 'M12 1.5v20 M17.5 5H9.5a3.75 3.75 0 0 0 0 7.5h5a3.75 3.75 0 0 1 0 7.5H6',
  'message-circle': 'M21 11a9 9 0 0 1-9 9H3l1-6a9 9 0 1 1 17-3z M8 9h8 M8 13h5',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  info: `${ellipse(12, 12, 9)} M12 16v-4 M12 8h.01`,
  'git-branch': `M6 3v12 ${ellipse(18, 6, 3)} ${ellipse(6, 18, 3)} M18 9a9 9 0 0 1-9 9`,
  'map-pin': PIN,
  pin: PIN,
  sliders: 'M4 6h16 M4 12h16 M4 18h16 M9 4v4 M15 10v4 M8 16v4',
  users: PEOPLE,
  people: PEOPLE,
  'file-text': DOCUMENT,
  database: `${ellipse(12, 5, 8, 3)} M4 5v14c0 4 16 4 16 0V5 M4 12c0 4 16 4 16 0`,
  flag: FLAG,
  map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16',
  clock: `${ellipse(12, 12, 9)} M12 6v6l4 2`,
  eye: `M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z ${ellipse(12, 12, 3)}`,
  wand: 'M3 21 14 10 M12.5 8.5l3 3 M15 2v3 M15 13v3 M9 8h3 M18 8h3 M10.8 3.8l1.7 1.7 M17.5 10.5l1.7 1.7 M19.2 3.8l-1.7 1.7',

  settings: `${ellipse(12, 12, 3)} M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z`,
  calendar: `${rect(3, 5, 18, 16, 2)} M7 2v6 M17 2v6 M3 10h18 M7 14h3 M14 14h3`,
  'bar-chart': 'M12 20V10 M18 20V4 M6 20v-4',
  'pie-chart': 'M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z',
  'trending-up': 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  target: `${ellipse(12, 12, 9)} ${ellipse(12, 12, 5.5)} ${ellipse(12, 12, 2)}`,
  layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  /* Template catalogue */
  mail: `${rect(3, 5, 18, 14, 2)} M3 6l9 7 9-7`,
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  'credit-card': `${rect(2, 5, 20, 14, 2)} M2 10h20`,
  gift: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  file: DOCUMENT,
  search: `${ellipse(11, 11, 8)} M21 21l-4.35-4.35`,
  lock: `${rect(3, 11, 18, 11, 2)} M7 11V7a5 5 0 0 1 10 0v4`,
  'user-plus': `${ellipse(9, 7, 3.5)} M2 21v-3a7 7 0 0 1 14 0v3 M19 8v6 M22 11h-6`,
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  'log-out': 'M9 4H4v16h5 M9 12h12 M17 8l4 4-4 4',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12l4 4L19 6'
};

export const MENU_ICON_FALLBACK = ellipse(12, 12, 9);