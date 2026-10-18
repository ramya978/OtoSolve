import { Injectable, signal } from '@angular/core';

export interface ThemePrefs {
  themeColor: string;
  secondaryColor: string;
  layout: 'vertical' | 'horizontal';
  menuFont: string;
  headingFont: string;
  numberFont: string;
  bodyFont: string;
  fontSize: number;
  fontWeight: 'light' | 'regular' | 'medium' | 'bold';
  lineHeight: number;
  /** 'system' follows the device setting (prefers-color-scheme) and updates live. */
  mode: 'light' | 'dark' | 'system';
  sidebarBg: string | null;
  iconColor: string;
  headingColor: string;
  shadow: number;
  borderRadius: number;
  buttonRadius: number;
  profileImage: number;
  customThemeColors: string[];
  customSecondaryColors: string[];
  customIconColors: string[];
  customHeadingColors: string[];
  palette: string | null;
  navDensity: 'comfortable' | 'compact';
  /** How wide page content may grow: compact 1440 px, normal 2100 px (page only - the top header stays full width), wide = full width. */
  contentWidth: 'compact' | 'normal' | 'wide';
  /** Switches off decorative animation and transitions across the app. */
  reduceMotion: boolean;
  /* Custom colour controls: primary button's three states + menu pill, card outline,
     two header tints, and the secondary button's hover / pressed / menu-selection tones
     (the secondary base IS secondaryColor). customColourControls is the checkbox;
     when it is off every --cc-* token is removed again. */
  customColourControls: boolean;
  ccBtn: string;
  ccBtnHover: string;
  ccBtnPress: string;
  ccMenuSel: string;
  ccCardOutline: string;
  ccGridHead: string;
  ccTopHead: string;
  ccSecHover: string;
  ccSecPress: string;
  ccSecMenuSel: string;
  /* Status colours: one base hex per meaning. Background washes and readable text shades are
     derived in applyTheme (--status-<tone>, --status-<tone>-bg, --status-<tone>-ink, --status-<tone>-line). */
  statusInfo: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
  statusNeutral: string;
}

/** The five status meanings, in display order. */
export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** Prefs key holding each status colour. */
export const STATUS_KEYS: Record<StatusTone, 'statusInfo' | 'statusSuccess' | 'statusWarning' | 'statusDanger' | 'statusNeutral'> = {
  info: 'statusInfo',
  success: 'statusSuccess',
  warning: 'statusWarning',
  danger: 'statusDanger',
  neutral: 'statusNeutral'
};

/** Clock part of a template (kept as plain strings so this module does not depend on the clock store). */
export interface TemplateClock {
  presentation: string;
  zoneId: string | null;
}

/** A saved appearance: every theme preference plus the header clock presentation. */
export interface ThemeTemplate {
  id: string;
  name: string;
  prefs: ThemePrefs;
  clock: TemplateClock;
  /** ISO timestamp of the last save / replace. */
  savedAt: string;
}

export const MAX_TEMPLATES = 20;
export const TEMPLATE_NAME_MAX = 40;

export interface SidebarBgOption {
  label: string;
  value: string | null;
  tone: 'light' | 'dark';
}

export interface ProfileImageOption {
  label: string;
  src: string;
}

export interface ThemePalette {
  id: string;
  name: string;
  accent: string;
  hover: string;
  pressed: string;
}

export const THEME_COLORS: string[] = ['#c78028', '#bd4d53', '#7c3348', '#8763bd', '#138879', '#e0559b'];

export const SECONDARY_COLORS: string[] = ['#c78028', '#bd4d53', '#7c3348', '#4169c4', '#138879', '#232b3e'];

export const ICON_COLORS: string[] = ['#6a7083', '#c78028', '#bd4d53', '#138879', '#4169c4', '#232b3e'];

export const HEADING_COLORS: string[] = ['#202333', '#7c3348', '#138879', '#4169c4', '#e0559b'];

export const PALETTES: ThemePalette[] = [
  { id: 'classic', name: 'Original Navy & Teal', accent: '#087e8b', hover: '#066a75', pressed: '#075762' },
  { id: 'ocean', name: 'Blueberry & Slate', accent: '#2f3a55', hover: '#5c6b8a', pressed: '#6e6f73' },
  { id: 'sapphire', name: 'Lemon & Leaf', accent: '#2f4a1f', hover: '#f4c430', pressed: '#e0a91f' },
  { id: 'forest', name: 'Citrus & Cocoa', accent: '#4f1d02', hover: '#f3c01e', pressed: '#c49f6c' },
  { id: 'violet', name: 'Coastal Blue', accent: '#2f3d4d', hover: '#6d8fa3', pressed: '#93acaa' },
  { id: 'mineral', name: 'Mineral & Cocoa', accent: '#5b6f7f', hover: '#3e2a23', pressed: '#d8c9b5' },
  { id: 'scandinavian', name: 'Scandinavian Slate', accent: '#67707a', hover: '#7c7b72', pressed: '#2c2c2a' },
  { id: 'earth', name: 'Earth & Ocean', accent: '#5b6a73', hover: '#ae6139', pressed: '#887668' },
  { id: 'calm', name: 'Calm Forest', accent: '#15201c', hover: '#9a4e28', pressed: '#343635' }
];

export const paletteById = (id: string | null): ThemePalette | null =>
  (id && PALETTES.find((p) => p.id === id)) || null;

export const FONT_CHOICES: string[] = ['Inter', 'Roboto', 'Poppins', 'Nunito', 'Georgia', 'Times', 'Courier', 'Montserrat', 'Lato'];

export const FONT_SIZES: number[] = [12, 13, 14, 15, 16, 18];

export const FONT_WEIGHTS: { id: 'light' | 'regular' | 'medium' | 'bold'; label: string; value: number }[] = [
  { id: 'light', label: 'Light', value: 300 },
  { id: 'regular', label: 'Regular', value: 400 },
  { id: 'medium', label: 'Medium', value: 500 },
  { id: 'bold', label: 'Bold', value: 700 }
];


const svgUrl = (svg: string): string => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const bgImage = (svg: string, base: string): string => `${svgUrl(svg)} center / cover no-repeat, ${base}`;

const SIDE_OPEN = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 640' preserveAspectRatio='xMidYMid slice'>`;

const waves = (top: string, bottom: string, stroke: string, opacity: number): string => `${SIDE_OPEN}
  <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0' stop-color='${top}'/><stop offset='1' stop-color='${bottom}'/>
  </linearGradient></defs>
  <rect width='240' height='640' fill='url(#g)'/>
  <g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.2'>
    ${Array.from({ length: 10 }, (_, i) =>
      `<path d='M-20 ${300 + i * 26} C 50 ${255 + i * 26}, 150 ${360 + i * 26}, 260 ${295 + i * 26}'/>`).join('')}
  </g>
</svg>`;

const geo = (base: string, a: string, b: string, c: string): string => `${SIDE_OPEN}
  <rect width='240' height='640' fill='${base}'/>
  <polygon points='0,0 240,0 0,220' fill='${a}'/>
  <polygon points='240,0 240,300 60,160' fill='${b}' fill-opacity='.7'/>
  <polygon points='0,220 180,380 0,520' fill='${c}' fill-opacity='.45'/>
  <polygon points='240,300 240,640 90,520' fill='${a}' fill-opacity='.85'/>
  <polygon points='0,520 140,640 0,640' fill='${b}' fill-opacity='.6'/>
</svg>`;

const contour = (base: string, stroke: string, opacity: number): string => `${SIDE_OPEN}
  <rect width='240' height='640' fill='${base}'/>
  <g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.1'>
    ${Array.from({ length: 11 }, (_, i) =>
      `<ellipse cx='70' cy='430' rx='${24 + i * 22}' ry='${16 + i * 17}'/>`).join('')}
  </g>
</svg>`;

const aurora = `${SIDE_OPEN}
  <defs><filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='38'/></filter></defs>
  <rect width='240' height='640' fill='#130f26'/>
  <g filter='url(#b)'>
    <circle cx='40' cy='130' r='95' fill='#7b3fe4' fill-opacity='.85'/>
    <circle cx='210' cy='330' r='105' fill='#1fb5a5' fill-opacity='.7'/>
    <circle cx='60' cy='540' r='95' fill='#e0457b' fill-opacity='.65'/>
  </g>
</svg>`;

const sunset = `${SIDE_OPEN}
  <defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0' stop-color='#ff9f66'/><stop offset='.45' stop-color='#a8355e'/><stop offset='1' stop-color='#2a1540'/>
  </linearGradient></defs>
  <rect width='240' height='640' fill='url(#s)'/>
  <circle cx='165' cy='290' r='42' fill='#ffd9a3' fill-opacity='.8'/>
  <path d='M0 470 Q60 420 120 455 T240 440 V640 H0z' fill='#5a2150'/>
  <path d='M0 530 Q70 490 140 520 T240 510 V640 H0z' fill='#3a1840'/>
  <path d='M0 590 Q80 560 160 585 T240 580 V640 H0z' fill='#22102c'/>
</svg>`;

/** Sidebar backgrounds: "None" first, then light images, then dark images. */
export const SIDEBAR_BGS: SidebarBgOption[] = [
  { label: 'None', value: null, tone: 'light' },
  { label: 'Pearl', value: bgImage(waves('#f8f9fc', '#e9ecf3', '#b9c2d6', 0.55), '#eef0f5'), tone: 'light' },
  { label: 'Blush', value: bgImage(geo('#fbf1f4', '#f5dfe7', '#efd0dc', '#e6bccd'), '#f8e9ee'), tone: 'light' },
  { label: 'Mint', value: bgImage(contour('#eef8f4', '#8cc9b6', 0.5), '#eef8f4'), tone: 'light' },
  { label: 'Midnight', value: bgImage(waves('#1d2746', '#0c1120', '#4a5d9a', 0.45), '#0c1120'), tone: 'dark' },
  { label: 'Aurora', value: bgImage(aurora, '#130f26'), tone: 'dark' },
  { label: 'Maroon', value: bgImage(geo('#3a1424', '#5a1d33', '#7a2a45', '#9b3b5a'), '#3a1424'), tone: 'dark' },
  { label: 'Sunset', value: bgImage(sunset, '#2a1540'), tone: 'dark' }
];

const LEGACY_SIDEBAR_BGS: string[] = [
  'linear-gradient(180deg,#f6f7fa,#e8e9ee)',
  'linear-gradient(180deg,#fbf0f3,#f3dde5)',
  'radial-gradient(circle at 30% 12%, #e9f6f2, #d8ebe5)',
  'repeating-linear-gradient(135deg,#f6f7fa 0 10px,#edeff4 10px 20px)',
  'repeating-linear-gradient(0deg,#f6f7fa 0 12px,#eceef3 12px 13px)',
  'linear-gradient(180deg,#eef2fd,#dfe7f9)'
];

export const sidebarTone = (value: string | null): 'light' | 'dark' => {
  if (!value) return 'light';
  return SIDEBAR_BGS.find((b) => b.value === value)?.tone ?? 'dark';
};

const nature = (id: number): string => `https://picsum.photos/id/${id}/240/240`;

export const PROFILE_IMAGES: ProfileImageOption[] = [
  { label: 'Forest', src: nature(10) },
  { label: 'River', src: nature(15) },
  { label: 'Meadow', src: nature(17) },
  { label: 'Woods', src: nature(28) },
  { label: 'Peaks', src: nature(29) },
  { label: 'Valley', src: nature(1015) },
  { label: 'Canyon', src: nature(1016) },
  { label: 'Ridge', src: nature(1018) },
  { label: 'Snowfall', src: nature(1036) },
  { label: 'Waterfall', src: nature(1039) }
];

export const profileImageSrc = (index: number): string | null =>
  index >= 0 ? PROFILE_IMAGES[index]?.src ?? null : null;

export const THEME_DEFAULTS: ThemePrefs = {
  themeColor: '#7c3348',
  secondaryColor: '#c78028',
  layout: 'vertical',
  menuFont: 'Inter',
  headingFont: 'Inter',
  numberFont: 'Inter',
  bodyFont: 'Inter',
  fontSize: 13,
  fontWeight: 'regular',
  lineHeight: 1.5,
  mode: 'light',
  sidebarBg: null,
  iconColor: '#6a7083',
  headingColor: '#202333',
  shadow: 12,
  borderRadius: 13,
  buttonRadius: 8,
  profileImage: -1,
  customThemeColors: [],
  customSecondaryColors: [],
  customIconColors: [],
  customHeadingColors: [],
  palette: null,
  navDensity: 'comfortable',
  contentWidth: 'wide',
  reduceMotion: false,
  customColourControls: false,
  ccBtn: '#7c3348',
  ccBtnHover: '#6d2d3f',
  ccBtnPress: '#612838',
  ccMenuSel: '#7c3348',
  ccCardOutline: '#e8e9ee',
  ccGridHead: '#fdfdfe',
  ccTopHead: '#ffffff',
  ccSecHover: '#b47223',
  ccSecPress: '#a3651f',
  ccSecMenuSel: '#c78028',
  statusInfo: '#3c62a3',
  statusSuccess: '#3d7a68',
  statusWarning: '#976821',
  statusDanger: '#b34455',
  statusNeutral: '#5a637a'
};


const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const tint = (hex: string, t: number): string => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const num = Number.parseInt(full, 16);
  const mix = (ch: number): string => Math.round(ch + (255 - ch) * t).toString(16).padStart(2, '0');
  const r = mix((num >> 16) & 255);
  const g = mix((num >> 8) & 255);
  const b = mix(num & 255);
  return `#${r}${g}${b}`;
};

/** Accepts "#abc" / "#aabbcc" (with or without the #) and returns a lowercase six-digit hex,
   or null when the text is not a usable colour. */
export const normalizeHex = (value: string): string | null => {
  const raw = value.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toLowerCase()}` : null;
};

/** Mix towards black by t (0…1) - the JS twin of the CSS colour-mix(…, #000) button tones. */
export const darken = (hex: string, t: number): string => {
  const normalized = normalizeHex(hex) ?? '#000000';
  const num = Number.parseInt(normalized.slice(1), 16);
  const mix = (ch: number): string => Math.round(ch * (1 - t)).toString(16).padStart(2, '0');
  return `#${mix((num >> 16) & 255)}${mix((num >> 8) & 255)}${mix(num & 255)}`;
};

/** WCAG 2.1 relative luminance of a colour. */
const luminance = (hex: string): number => {
  const num = Number.parseInt((normalizeHex(hex) ?? '#000000').slice(1), 16);
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((num >> 16) & 255) + 0.7152 * ch((num >> 8) & 255) + 0.0722 * ch(num & 255);
};

/** WCAG contrast ratio between two colours (1 … 21). */
export const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Readable ink for a background: near-white or near-black, whichever contrasts more.
   Drives the automatic label colour on the custom button / menu / header colours. */
export const bestInk = (bg: string): string =>
  contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#141821') ? '#ffffff' : '#141821';

/** Text colour for a coloured fill. Preference order:
    1. on a dark fill a very light tint of the same hue (stepped until 4.5:1, WCAG AA);
    2. on a saturated mid-tone (a green / blue that white still reads on at >= 3:1)
       plain white - a clean label instead of a near-black shade of the hue;
    3. only for pale fills (yellow, cream - white would wash out) a deep shade of the
       same hue, stepped until it reads at 4.5:1. Falls back to bestInk if the hue
       cannot reach it. */
export const matchedInk = (bg: string): string => {
  const hex = normalizeHex(bg);
  if (!hex) return bestInk(bg);
  if (bestInk(hex) === '#ffffff') {
    for (let t = 0.86; t <= 1.0001; t += 0.02) {
      const ink = tint(hex, Math.min(t, 1));
      if (contrastRatio(ink, hex) >= 4.5) return ink;
    }
    return '#ffffff';
  }
  if (contrastRatio(hex, '#ffffff') >= 3) return '#ffffff';
  for (let t = 0.55; t <= 0.951; t += 0.05) {
    const ink = darken(hex, t);
    if (contrastRatio(ink, hex) >= 4.5) return ink;
  }
  return bestInk(hex);
};

/** Light wash used behind a status label (badge / alert background). */
export const statusBg = (hex: string): string => tint(hex, 0.9);

/** Status text shade: the colour itself, darkened step by step until it reads at 4.5:1 on its wash. */
export const statusInk = (hex: string): string => {
  const bg = statusBg(hex);
  let ink = normalizeHex(hex) ?? '#141821';
  for (let i = 0; i < 12 && contrastRatio(ink, bg) < 4.5; i++) ink = darken(ink, 0.12);
  return contrastRatio(ink, bg) >= 4.5 ? ink : bestInk(bg);
};


/** Content column for each width option (consumed as --page-max in theme.css / styles.css).
    Only the routed page follows the column; the top header keeps the full screen width.
    The horizontal menu strip still mirrors the column through --content-outer so it stays flush with the page. */
export const PAGE_WIDTHS: Record<ThemePrefs['contentWidth'], string> = {
  compact: '1440px',
  normal: '2100px',
  wide: 'none'
};

/** Dark-mode surface (matches --white under html[data-mode="dark"] in styles.css). */
export const DARK_SURFACE = '#1b1f2a';
/** Dark-mode body text (matches --ink under html[data-mode="dark"]). */
export const DARK_INK = '#e8eaf2';

/** Custom-control surface defaults per mode: a light default is swapped for the dark one
    (and back) so ticking Custom colour controls in one mode never leaves white bars in the other. */
const CC_SURFACES: { key: 'ccCardOutline' | 'ccGridHead' | 'ccTopHead'; light: string; dark: string }[] = [
  { key: 'ccCardOutline', light: '#e8e9ee', dark: '#2c3240' },
  { key: 'ccGridHead', light: '#fdfdfe', dark: '#171b24' },
  { key: 'ccTopHead', light: '#ffffff', dark: '#1b1f2a' }
];

const surfaceFor = (prefs: ThemePrefs, key: 'ccCardOutline' | 'ccGridHead' | 'ccTopHead', mode: 'light' | 'dark'): string => {
  const v = prefs[key].toLowerCase();
  const d = CC_SURFACES.find((c) => c.key === key)!;
  if (mode === 'dark' && v === d.light) return d.dark;
  if (mode === 'light' && v === d.dark) return d.light;
  return prefs[key];
};

/** Light or dark as actually shown: 'system' asks the device. */
export const resolveMode = (mode: ThemePrefs['mode']): 'light' | 'dark' => {
  if (mode !== 'system') return mode;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const fontStack = (name: string): string => {
  if (name === 'Georgia') return 'Georgia, "Times New Roman", serif';
  if (name === 'Times') return '"Times New Roman", Times, serif';
  if (name === 'Courier') return '"Courier New", Courier, monospace';
  return `"${name}", Inter, "Segoe UI", Arial, sans-serif`;
};


export function applyTheme(prefs: ThemePrefs): void {
  const el = document.documentElement;
  const set = (k: string, v: string): void => el.style.setProperty(k, v);

  const palette = paletteById(prefs.palette);
  const mode = resolveMode(prefs.mode);

  set('--accent', prefs.themeColor);
  set('--primary', prefs.themeColor);
  // dark mode: a deep accent wash that sits on the dark surfaces (appearance.css --white)
  set('--accentbg', mode === 'dark' ? `color-mix(in srgb, ${prefs.themeColor} 24%, ${DARK_SURFACE})` : tint(prefs.themeColor, 0.92));

  // secondary accent -> --teal (drives .btn-secondary / success tones).
  // With an appearance palette active the secondary follows the palette's SECOND
  // tone (its hover strip) - distinct from the accent that drives the primary colour.
  // Without a palette it is the user's picked Secondary colour.
  set('--teal', palette ? palette.hover : prefs.secondaryColor);
  // text on a primary / secondary fill: a shade of the same colour (not black / white)
  set('--primary-on', matchedInk(prefs.themeColor));
  set('--secondary-on', matchedInk(palette ? palette.hover : prefs.secondaryColor));
  // dark mode: a dark heading / icon colour picked for light mode would vanish on the dark
  // surface - fall back to readable light tones until a light enough colour is chosen
  set('--heading-color', mode === 'dark' && contrastRatio(prefs.headingColor, DARK_SURFACE) < 4.5 ? DARK_INK : prefs.headingColor);
  set('--icon-color', mode === 'dark' && contrastRatio(prefs.iconColor, DARK_SURFACE) < 3 ? '#b9bfce' : prefs.iconColor);

  const favTile = mode === 'dark' ? tint(prefs.themeColor, 0.78) : tint(prefs.themeColor, 0.92);
  const favSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="15" fill="${favTile}"/>` +
    `<circle cx="32" cy="32" r="15" fill="none" stroke="${prefs.themeColor}" stroke-width="9"/></svg>`;
  const favLink = document.querySelector<HTMLLinkElement>('link[rel~="icon"]:not([rel~="alternate"])');
  if (favLink) favLink.href = `data:image/svg+xml,${encodeURIComponent(favSvg)}`;

  if (palette) {
    set('--theme-hover', palette.hover);
    set('--theme-press', palette.pressed);
  } else {
    el.style.removeProperty('--theme-hover');
    el.style.removeProperty('--theme-press');
  }

  // Custom colour controls: the primary button's three states, the menu-selection pill,
  // card outline, the two header tints, and the secondary button's hover / pressed /
  // menu-selection tones. The secondary base IS secondaryColor (-> --teal), so only
  // its derivative tones need tokens here.
  // Every consumer declares these tokens WITH a fallback, so removing them restores the
  // palette / theme-derived look. The *-ink tokens flip text automatically for contrast.
  if (prefs.customColourControls) {
    set('--cc-btn', prefs.ccBtn);
    set('--cc-btn-hover', prefs.ccBtnHover);
    set('--cc-btn-press', prefs.ccBtnPress);
    set('--cc-btn-ink', matchedInk(prefs.ccBtn));
    set('--cc-btn-hover-ink', matchedInk(prefs.ccBtnHover));
    set('--cc-btn-press-ink', matchedInk(prefs.ccBtnPress));
    set('--cc-menu-sel', prefs.ccMenuSel);
    set('--cc-menu-ink', matchedInk(prefs.ccMenuSel));
    const outline = surfaceFor(prefs, 'ccCardOutline', mode);
    const gridHead = surfaceFor(prefs, 'ccGridHead', mode);
    const topHead = surfaceFor(prefs, 'ccTopHead', mode);
    set('--cc-card-outline', outline);
    set('--cc-grid-head', gridHead);
    set('--cc-grid-ink', bestInk(gridHead));
    set('--cc-top-head', topHead);
    set('--cc-top-ink', bestInk(topHead));
    set('--cc-sec-hover', prefs.ccSecHover);
    set('--cc-sec-hover-ink', matchedInk(prefs.ccSecHover));
    set('--cc-sec-press', prefs.ccSecPress);
    set('--cc-sec-press-ink', matchedInk(prefs.ccSecPress));
    set('--cc-sec-menu-sel', prefs.ccSecMenuSel);
    set('--cc-sec-menu-ink', matchedInk(prefs.ccSecMenuSel));
    el.setAttribute('data-cc', 'on');
  } else {
    for (const key of [
      '--cc-btn', '--cc-btn-hover', '--cc-btn-press', '--cc-btn-ink', '--cc-btn-hover-ink',
      '--cc-btn-press-ink', '--cc-menu-sel', '--cc-menu-ink', '--cc-card-outline',
      '--cc-grid-head', '--cc-grid-ink', '--cc-top-head', '--cc-top-ink',
      '--cc-sec-hover', '--cc-sec-hover-ink', '--cc-sec-press', '--cc-sec-press-ink',
      '--cc-sec-menu-sel', '--cc-sec-menu-ink'
    ]) el.style.removeProperty(key);
    el.removeAttribute('data-cc');
  }

  // status colours: base, light wash, readable text shade, hairline - always on (no checkbox)
  for (const tone of Object.keys(STATUS_KEYS) as StatusTone[]) {
    const base = prefs[STATUS_KEYS[tone]];
    set(`--status-${tone}`, base);
    if (mode === 'dark') {
      // dark: a deep wash of the colour with a lightened, readable text shade
      set(`--status-${tone}-bg`, `color-mix(in srgb, ${base} 22%, ${DARK_SURFACE})`);
      set(`--status-${tone}-ink`, tint(base, 0.5));
      set(`--status-${tone}-line`, `color-mix(in srgb, ${base} 48%, ${DARK_SURFACE})`);
    } else {
      set(`--status-${tone}-bg`, statusBg(base));
      set(`--status-${tone}-ink`, statusInk(base));
      set(`--status-${tone}-line`, tint(base, 0.62));
    }
  }

  // typography
  set('--font-body', fontStack(prefs.bodyFont));
  set('--font-menu', fontStack(prefs.menuFont));
  set('--font-heading', fontStack(prefs.headingFont));
  set('--font-number', fontStack(prefs.numberFont));
  set('--font-size', `${prefs.fontSize}px`);
  // every fixed px size in the app is written as calc(Npx * var(--font-scale)): 13 px = 1
  set('--font-scale', (prefs.fontSize / 13).toFixed(4));
  set('--font-weight', String(FONT_WEIGHTS.find((w) => w.id === prefs.fontWeight)?.value ?? 400));
  set('--line-height', String(prefs.lineHeight));

  // shape
  set('--radius', `${prefs.borderRadius}px`);
  set('--btn-radius', `${prefs.buttonRadius}px`);
  set('--shadow', `0 4px ${Math.round(prefs.shadow * 1.5)}px rgba(34,40,63,${clamp(prefs.shadow / 300, 0, 0.3).toFixed(3)})`);

  if (prefs.sidebarBg) set('--sidebar-bg', prefs.sidebarBg);
  else el.style.removeProperty('--sidebar-bg');

  el.dataset['sidebar'] = prefs.sidebarBg
    ? sidebarTone(prefs.sidebarBg)
    : mode === 'dark'
      ? 'dark'
      : 'light';

  // mode (resolved, so existing html[data-mode="dark"] rules keep working) + layout + spacing
  el.dataset['mode'] = mode;
  el.dataset['modeSetting'] = prefs.mode;
  el.dataset['layout'] = prefs.layout;
  el.dataset['density'] = prefs.navDensity;

  // page width + motion (rules live in theme.css / styles.css; only the page and the
  // horizontal menu strip follow --content-outer - the top header stays full width,
  // so only --page-max is set inline here)
  el.dataset['width'] = prefs.contentWidth;
  set('--page-max', PAGE_WIDTHS[prefs.contentWidth]);
  if (prefs.reduceMotion) el.dataset['motion'] = 'reduce';
  else delete el.dataset['motion'];
}

/* ---------- persistence ---------- */

const STORE_KEY = 'ydot-theme-settings';

function migrate(prefs: ThemePrefs): ThemePrefs {
  const next = { ...prefs };
  if (next.sidebarBg && LEGACY_SIDEBAR_BGS.includes(next.sidebarBg)) next.sidebarBg = null;
  if (next.profileImage >= PROFILE_IMAGES.length) next.profileImage = -1;
  next.customThemeColors = Array.isArray(next.customThemeColors) ? next.customThemeColors : [];
  next.customSecondaryColors = Array.isArray(next.customSecondaryColors) ? next.customSecondaryColors : [];
  next.customIconColors = Array.isArray(next.customIconColors) ? next.customIconColors : [];
  next.customHeadingColors = Array.isArray(next.customHeadingColors) ? next.customHeadingColors : [];
  if (!paletteById(next.palette)) next.palette = null;
  if (next.navDensity !== 'compact') next.navDensity = 'comfortable';
  if (!['light', 'dark', 'system'].includes(next.mode)) next.mode = 'light';
  if (!['compact', 'normal', 'wide'].includes(next.contentWidth)) next.contentWidth = 'wide';
  next.reduceMotion = next.reduceMotion === true;
  next.customColourControls = next.customColourControls === true;
  const hex = (v: unknown, fallback: string): string => (typeof v === 'string' ? normalizeHex(v) ?? fallback : fallback);
  next.ccBtn = hex(next.ccBtn, THEME_DEFAULTS.ccBtn);
  next.ccBtnHover = hex(next.ccBtnHover, THEME_DEFAULTS.ccBtnHover);
  next.ccBtnPress = hex(next.ccBtnPress, THEME_DEFAULTS.ccBtnPress);
  next.ccMenuSel = hex(next.ccMenuSel, THEME_DEFAULTS.ccMenuSel);
  next.ccCardOutline = hex(next.ccCardOutline, THEME_DEFAULTS.ccCardOutline);
  next.ccGridHead = hex(next.ccGridHead, THEME_DEFAULTS.ccGridHead);
  next.ccTopHead = hex(next.ccTopHead, THEME_DEFAULTS.ccTopHead);
  next.ccSecHover = hex(next.ccSecHover, THEME_DEFAULTS.ccSecHover);
  next.ccSecPress = hex(next.ccSecPress, THEME_DEFAULTS.ccSecPress);
  next.ccSecMenuSel = hex(next.ccSecMenuSel, THEME_DEFAULTS.ccSecMenuSel);
  for (const key of Object.values(STATUS_KEYS)) next[key] = hex(next[key], THEME_DEFAULTS[key]);
  return next;
}

export function loadTheme(): ThemePrefs {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved
      ? migrate({ ...THEME_DEFAULTS, ...(JSON.parse(saved) as Partial<ThemePrefs>) })
      : { ...THEME_DEFAULTS };
  } catch {
    return { ...THEME_DEFAULTS };
  }
}

export function saveTheme(prefs: ThemePrefs): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
  }
}

/* ---------- custom templates (this browser only) ---------- */

const TEMPLATE_KEY = 'ydot-theme-templates';

const newTemplateId = (): string =>
  `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** True for anything that looks like a stored template (a name and a prefs object). */
const isTemplateLike = (t: unknown): t is Partial<ThemeTemplate> =>
  !!t && typeof t === 'object' && typeof (t as ThemeTemplate).name === 'string' && !!(t as ThemeTemplate).name.trim()
  && !!(t as ThemeTemplate).prefs && typeof (t as ThemeTemplate).prefs === 'object';

/** Repairs one stored / imported template against the current defaults (unknown keys dropped by migrate). */
const repairTemplate = (t: Partial<ThemeTemplate>, freshId = false): ThemeTemplate => ({
  id: !freshId && typeof t.id === 'string' ? t.id : newTemplateId(),
  name: String(t.name).trim().slice(0, TEMPLATE_NAME_MAX),
  prefs: migrate({ ...THEME_DEFAULTS, ...pickKnown(t.prefs as Partial<ThemePrefs>) }),
  clock: {
    presentation: typeof t.clock?.presentation === 'string' ? t.clock.presentation : 'quiet',
    zoneId: typeof t.clock?.zoneId === 'string' ? t.clock.zoneId : null
  },
  savedAt: typeof t.savedAt === 'string' && !Number.isNaN(Date.parse(t.savedAt)) ? t.savedAt : new Date().toISOString()
});

/** Keeps only real preference keys with the same value type as the defaults (guards imported files). */
function pickKnown(prefs: Partial<ThemePrefs> | undefined): Partial<ThemePrefs> {
  const out: Record<string, unknown> = {};
  if (!prefs || typeof prefs !== 'object') return out as Partial<ThemePrefs>;
  for (const key of Object.keys(THEME_DEFAULTS) as (keyof ThemePrefs)[]) {
    const value = (prefs as Record<string, unknown>)[key];
    const sample = THEME_DEFAULTS[key];
    const sameType = Array.isArray(sample) ? Array.isArray(value)
      : key === 'sidebarBg' || key === 'palette' ? value === null || typeof value === 'string'
      : typeof value === typeof sample;
    if (value !== undefined && sameType) out[key] = value;
  }
  return out as Partial<ThemePrefs>;
}

/** Reads the saved templates; broken or older entries are repaired against the current defaults. */
export function loadTemplates(): ThemeTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(isTemplateLike).slice(0, MAX_TEMPLATES).map((t) => repairTemplate(t));
  } catch {
    return [];
  }
}

/** Marker written into exported files so an import can recognise them. */
export const TEMPLATE_FILE_KIND = 'otosolve-theme-templates';

/** Result of an import: how many were added, how many were left out and why. */
export interface TemplateImportResult {
  added: number;
  renamed: number;
  skippedInvalid: number;
  skippedLimit: number;
  error: string | null;
}

/** Writes the templates; returns false when the browser refuses (storage full or blocked). */
export function saveTemplates(list: ThemeTemplate[]): boolean {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/* ---------- the store every component reads ---------- */

@Injectable({ providedIn: 'root' })
export class ThemeSettingsService {
  readonly prefs = signal<ThemePrefs>(loadTheme());
  readonly templates = signal<ThemeTemplate[]>(loadTemplates());

  /** Shared open state of the Appearance studio popup: the header's Preferences item and the
      Profile page's Appearance button open this same popup, wherever the user is. */
  readonly studioOpen = signal(false);

  constructor() {
    applyTheme(this.prefs());
    // "System" mode follows the device live: re-apply when the OS switches light / dark
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.prefs().mode === 'system') applyTheme(this.prefs());
      });
    } catch {
      // very old browsers: System is read once on load
    }
  }

  patch(partial: Partial<ThemePrefs>): void {
    const next = { ...this.prefs(), ...partial };
    this.prefs.set(next);
    applyTheme(next);
  }

  save(): void {
    saveTheme(this.prefs());
  }

  reset(): void {
    this.patch({ ...THEME_DEFAULTS });
  }

  // ---- custom templates: every method returns an error message, or null when it worked ----

  private commit(next: ThemeTemplate[]): string | null {
    if (!saveTemplates(next)) return 'This browser could not store the template. Free some space or allow site storage.';
    this.templates.set(next);
    return null;
  }

  private nameError(name: string, ignoreId: string | null): string | null {
    const clean = name.trim();
    if (!clean) return 'Give the template a name.';
    if (clean.length > TEMPLATE_NAME_MAX) return `Keep the name under ${TEMPLATE_NAME_MAX} characters.`;
    const taken = this.templates().some((t) => t.id !== ignoreId && t.name.toLowerCase() === clean.toLowerCase());
    return taken ? `A template called "${clean}" already exists. Use Replace on it to update it.` : null;
  }

  /** Saves the appearance on screen as a new template. */
  addTemplate(name: string, clock: TemplateClock): string | null {
    const error = this.nameError(name, null);
    if (error) return error;
    if (this.templates().length >= MAX_TEMPLATES) return `You can keep up to ${MAX_TEMPLATES} templates. Delete one to save a new one.`;
    const template: ThemeTemplate = {
      id: newTemplateId(),
      name: name.trim(),
      prefs: { ...this.prefs() },
      clock: { ...clock },
      savedAt: new Date().toISOString()
    };
    return this.commit([...this.templates(), template]);
  }

  /** Overwrites a template with the appearance on screen. */
  replaceTemplate(id: string, clock: TemplateClock): string | null {
    return this.commit(this.templates().map((t) =>
      t.id === id ? { ...t, prefs: { ...this.prefs() }, clock: { ...clock }, savedAt: new Date().toISOString() } : t));
  }

  renameTemplate(id: string, name: string): string | null {
    const error = this.nameError(name, id);
    if (error) return error;
    return this.commit(this.templates().map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));
  }

  deleteTemplate(id: string): string | null {
    return this.commit(this.templates().filter((t) => t.id !== id));
  }

  /** JSON text of every template, ready to download as a file. */
  exportTemplates(): string {
    return JSON.stringify({
      kind: TEMPLATE_FILE_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      templates: this.templates()
    }, null, 2);
  }

  /**
   * Adds templates from an exported file's text. Accepts the export format or a bare array.
   * Every import gets a new id; a name that is already taken gets " (2)", " (3)"…; nothing beyond
   * the 20-template limit is added. Existing templates are never changed.
   */
  importTemplates(text: string): TemplateImportResult {
    const result: TemplateImportResult = { added: 0, renamed: 0, skippedInvalid: 0, skippedLimit: 0, error: null };
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ...result, error: 'This file is not valid JSON. Choose a file made with Export templates.' };
    }
    const list: unknown = Array.isArray(data) ? data : (data as { templates?: unknown })?.templates;
    if (!Array.isArray(list)) return { ...result, error: 'No templates were found in this file.' };

    const next = [...this.templates()];
    const taken = new Set(next.map((t) => t.name.toLowerCase()));
    for (const item of list) {
      if (!isTemplateLike(item)) {
        result.skippedInvalid++;
        continue;
      }
      if (next.length >= MAX_TEMPLATES) {
        result.skippedLimit++;
        continue;
      }
      const t = repairTemplate(item, true);
      let name = t.name;
      for (let n = 2; taken.has(name.toLowerCase()); n++) {
        const suffix = ` (${n})`;
        name = t.name.slice(0, TEMPLATE_NAME_MAX - suffix.length) + suffix;
      }
      if (name !== t.name) result.renamed++;
      taken.add(name.toLowerCase());
      next.push({ ...t, name });
      result.added++;
    }
    if (!result.added) {
      return { ...result, error: result.skippedLimit ? `You already have ${MAX_TEMPLATES} templates. Delete some to import more.` : 'No valid templates were found in this file.' };
    }
    const error = this.commit(next);
    return error ? { ...result, added: 0, error } : result;
  }
}