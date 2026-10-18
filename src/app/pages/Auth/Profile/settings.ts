import { Component, DestroyRef, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import {
  FONT_CHOICES, FONT_SIZES, FONT_WEIGHTS, HEADING_COLORS, ICON_COLORS, MAX_TEMPLATES, PALETTES, PROFILE_IMAGES,
  SECONDARY_COLORS, SIDEBAR_BGS, STATUS_KEYS, StatusTone, TEMPLATE_NAME_MAX, THEME_COLORS, TemplateClock,
  ThemePalette, ThemePrefs, ThemeSettingsService, ThemeTemplate,
  bestInk, contrastRatio, darken, matchedInk, normalizeHex, paletteById, profileImageSrc, resolveMode, tint
} from './theme-settings';
import { ClockPresentation, ClockSettingsService } from '../../../Shared/studio/data/clock-settings';

type SwatchKey = 'themeColor' | 'secondaryColor' | 'iconColor' | 'headingColor';

/** Keys of the Custom colour controls hexes: primary states + menu pill, card outline,
    header tints, and the secondary button's hover / pressed / menu-selection tones. */
type CcKey =
  | 'ccBtn' | 'ccBtnHover' | 'ccBtnPress' | 'ccMenuSel'
  | 'ccCardOutline' | 'ccGridHead' | 'ccTopHead'
  | 'ccSecHover' | 'ccSecPress' | 'ccSecMenuSel';

/** Status colour keys (Info · Success · Warning · Danger · Neutral). */
type StatusKey = 'statusInfo' | 'statusSuccess' | 'statusWarning' | 'statusDanger' | 'statusNeutral';

/** Keys with an editable hex field: the three swatch colours, the ten custom controls, the five statuses. */
type HexKey = Exclude<SwatchKey, 'themeColor'> | CcKey | StatusKey;

/** One status colour field + its preview chip. */
interface StatusField {
  key: StatusKey;
  tone: StatusTone;
  label: string;
  icon: IconName;
}

/** Message under the template name field. */
interface TemplateNote {
  text: string;
  tone: 'ok' | 'error' | 'info';
}

/** One labelled field of the Custom colour controls grid (the thirteen custom
    hexes plus Secondary / Icon / Heading, which live in the same grid). */
interface CcField {
  key: HexKey;
  label: string;
  /** While the checkbox is off this field stays editable (Secondary / Icon / Heading keep old behaviour). */
  always?: boolean;
}

/** The five tabs of the settings panel (icon over label). Templates sit at the end of Colour,
    the clock lives in Layout. */
type SettingsTab = 'colour' | 'layout' | 'type' | 'shape' | 'images';

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: IconName;
}

interface ModeOption {
  id: ThemePrefs['mode'];
  label: string;
  note: string;
}

interface WidthOption {
  id: ThemePrefs['contentWidth'];
  label: string;
  note: string;
}

/** One-click corner style: card radius + button radius together. */
interface CornerPreset {
  id: 'sharp' | 'soft' | 'round';
  label: string;
  radius: number;
  button: number;
}

/** Colours shown on a template / palette strip: main button, hover, pressed, selected tint. */
interface ToneStrip {
  main: string;
  hover: string;
  pressed: string;
  tint: string;
}

type IconName =
  | 'settings' | 'close' | 'palette' | 'droplet' | 'layout' | 'type' | 'size' | 'moon'
  | 'sidebar' | 'star' | 'heading' | 'shadow' | 'user' | 'upload' | 'check' | 'pen'
  | 'reset' | 'save' | 'sun' | 'rows' | 'columns' | 'ban' | 'brush' | 'spacing' | 'clock' | 'workspace'
  | 'info' | 'x' | 'file' | 'template' | 'download'
  | 'swatch' | 'window' | 'shape' | 'image' | 'monitor' | 'motion';

interface FontGroup {
  key: 'menuFont' | 'headingFont' | 'numberFont' | 'bodyFont';
  label: string;
}

interface DensityOption {
  id: ThemePrefs['navDensity'];
  label: string;
  note: string;
}

interface ClockOption {
  id: ClockPresentation;
  label: string;
  note: string;
}

const ICONS: Record<IconName, string> = {
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  close: 'M6 6l12 12M18 6L6 18',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22zM7.5 11.5h.01M10.5 7.5h.01M15.5 8.5h.01',
  droplet: 'M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z',
  layout: 'M3 3h18v18H3zM3 9h18M9 21V9',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  size: 'M3 7V5h10v2M8 5v14M6 19h4M14 13v-2h7v2M17.5 11v8M16 19h3',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sidebar: 'M3 3h18v18H3zM9 3v18',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  heading: 'M6 4v16M18 4v16M6 12h12',
  shadow: 'M4 4h12v12H4zM8 20h12V8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  check: 'M20 6L9 17l-5-5',
  pen: 'M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  reset: 'M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10',
  save: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3',
  rows: 'M3 6h18M3 12h18M3 18h18',
  columns: 'M4 4h16v16H4zM9 4v16',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  brush: 'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z',
  spacing: 'M3 5h18M3 19h18M8 9h8M8 15h8M12 9v6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  workspace: 'M3 4h18v12H3zM8 20h8M12 16v4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  x: 'M18 6L6 18M6 6l12 12',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  template: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 17.5h7M17.5 14v7',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  // tab icons
  swatch: 'M7 21a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12a4 4 0 0 1-4 4zM11 7.5l2.1-2.1a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L10 19.5M7 21h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2.5M7 17h.01',
  window: 'M3 4h18v16H3zM3 9h18M6.5 6.5h.01M9.5 6.5h.01',
  shape: 'M6 6h12v12H6zM3 3h3v3H3zM18 3h3v3h-3zM3 18h3v3H3zM18 18h3v3h-3z',
  image: 'M3 4h18v16H3zM8.5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 15l-5-5L5 20',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4M12 4v12',
  motion: 'M13 2L4 14h7l-1 8 9-12h-7z'
};

/* ---------- built-in colour picker (HEX by default) ---------- */

/** The browser's own picker opens on RGB and cannot be changed, so the panel draws its own. */
type PickerMode = 'hex' | 'rgb';

interface Rgb { r: number; g: number; b: number }

const PICKER_W = 272;
const PICKER_H = 420;

const clampN = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const rgbToHex = ({ r, g, b }: Rgb): string =>
  '#' + [r, g, b].map((c) => Math.round(clampN(c, 0, 255)).toString(16).padStart(2, '0')).join('');

const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt((normalizeHex(hex) ?? '#000000').slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** h 0-360, s 0-1, v 0-1 */
const hsvToRgb = (h: number, s: number, v: number): Rgb => {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
};

const rgbToHsv = ({ r, g, b }: Rgb): { h: number; s: number; v: number } => {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
};

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BYTES = 1024 * 1024;

const CC_FIELDS: CcField[] = [
  { key: 'ccBtn', label: 'Primary button' },
  { key: 'ccBtnHover', label: 'Hover state' },
  { key: 'ccBtnPress', label: 'Pressed state' },
  { key: 'ccMenuSel', label: 'Menu selection' },
  { key: 'secondaryColor', label: 'Secondary button', always: true },
  { key: 'ccSecHover', label: 'Secondary hover' },
  { key: 'ccSecPress', label: 'Secondary pressed' },
  { key: 'ccSecMenuSel', label: 'Secondary menu' },
  { key: 'ccCardOutline', label: 'Card outline' },
  { key: 'ccGridHead', label: 'Grid header tint' },
  { key: 'ccTopHead', label: 'Top header tint' },
  { key: 'iconColor', label: 'Icon colour', always: true },
  { key: 'headingColor', label: 'Heading colour', always: true },
];

const STATUS_FIELDS: StatusField[] = [
  { key: STATUS_KEYS.info, tone: 'info', label: 'Info', icon: 'info' },
  { key: STATUS_KEYS.success, tone: 'success', label: 'Success', icon: 'check' },
  { key: STATUS_KEYS.warning, tone: 'warning', label: 'Warning', icon: 'clock' },
  { key: STATUS_KEYS.danger, tone: 'danger', label: 'Danger', icon: 'x' },
  { key: STATUS_KEYS.neutral, tone: 'neutral', label: 'Neutral', icon: 'file' }
];

/** Quick picks for the custom controls: every palette's accent, hover and pressed tones (no repeats). */
const PALETTE_PICKS: string[] = [...new Set(PALETTES.flatMap((p) => [p.accent, p.hover, p.pressed]))];

/** Quick picks for the status colours: calm, readable defaults for each meaning. */
const STATUS_PICKS: string[] = ['#3c62a3', '#2f6fb0', '#3d7a68', '#2e7d4f', '#976821', '#b0701c', '#b34455', '#a8323f', '#5a637a', '#6a7083'];

/** One layer of a tab icon. Tones come from the live theme (settings.css .ts-tab):
    main = primary colour · alt = secondary colour · deep = pressed tone · fill = soft primary wash. */
interface IconLayer {
  d: string;
  tone: 'main' | 'alt' | 'deep' | 'fill';
}

/** Multi-colour tab icons: every palette / custom colour change repaints them at once. */
const TAB_ICONS: Record<SettingsTab, IconLayer[]> = {
  colour: [
    { tone: 'fill', d: 'M5 3h4a2 2 0 0 1 2 2v12a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2z' },
    { tone: 'main', d: 'M5 3h4a2 2 0 0 1 2 2v12a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2zM7 17h.01' },
    { tone: 'alt', d: 'M11 7.5l2.1-2.1a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L10 19.5' },
    { tone: 'deep', d: 'M7 21h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2.5' }
  ],
  layout: [
    { tone: 'fill', d: 'M3 4h18v5H3z' },
    { tone: 'main', d: 'M3 4h18v16H3zM3 9h18' },
    { tone: 'alt', d: 'M9 9v11' },
    { tone: 'deep', d: 'M6 6.5h.01M8.5 6.5h.01' }
  ],
  type: [
    { tone: 'fill', d: 'M4 4h16v3H4z' },
    { tone: 'main', d: 'M4 7V4h16v3M12 4v16' },
    { tone: 'alt', d: 'M9 20h6' }
  ],
  shape: [
    { tone: 'fill', d: 'M6 6h12v12H6z' },
    { tone: 'main', d: 'M6 6h12v12H6z' },
    { tone: 'alt', d: 'M3 3h3v3H3zM18 3h3v3h-3zM3 18h3v3H3zM18 18h3v3h-3z' }
  ],
  images: [
    { tone: 'fill', d: 'M21 15l-5-5L5 20h16z' },
    { tone: 'main', d: 'M3 4h18v16H3zM21 15l-5-5L5 20' },
    { tone: 'alt', d: 'M8.5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' }
  ]
};

const TABS: TabDef[] = [
  { id: 'colour', label: 'Colour', icon: 'swatch' },
  { id: 'layout', label: 'Layout', icon: 'window' },
  { id: 'type', label: 'Typography', icon: 'type' },
  { id: 'shape', label: 'Shape', icon: 'shape' },
  { id: 'images', label: 'Images', icon: 'image' }
];

const CORNER_PRESETS: CornerPreset[] = [
  { id: 'sharp', label: 'Sharp', radius: 2, button: 2 },
  { id: 'soft', label: 'Soft', radius: 8, button: 6 },
  { id: 'round', label: 'Round', radius: 16, button: 20 }
];

/** Main / hover / pressed / tint exactly as applyTheme renders them for a set of prefs:
    the custom hexes while Custom colour controls are on, else the palette (or derived) tones. */
const toneStrip = (p: ThemePrefs): ToneStrip => {
  if (p.customColourControls) {
    return { main: p.ccBtn, hover: p.ccBtnHover, pressed: p.ccBtnPress, tint: tint(p.ccMenuSel, 0.86) };
  }
  const pal = paletteById(p.palette);
  return {
    main: p.themeColor,
    hover: pal?.hover ?? darken(p.themeColor, 0.12),
    pressed: pal?.pressed ?? darken(p.themeColor, 0.22),
    tint: tint(p.themeColor, 0.86)
  };
};

const isStatusKey = (key: HexKey): key is StatusKey => STATUS_FIELDS.some((f) => f.key === key);


/** Current typed text for every hex field, read from the applied colours. */
const hexOf = (prefs: ThemePrefs): Record<HexKey, string> => {
  const out = {} as Record<HexKey, string>;
  for (const f of CC_FIELDS) out[f.key] = prefs[f.key];
  out['secondaryColor'] = prefs.secondaryColor;
  out['iconColor'] = prefs.iconColor;
  out['headingColor'] = prefs.headingColor;
  for (const f of STATUS_FIELDS) out[f.key] = prefs[f.key];
  return out;
};

@Component({
  selector: 'app-theme-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class ThemeSettings {
  private readonly service = inject(ThemeSettingsService);
  /** The header clock - its presentation is changed from the Workspace tab. */
  protected readonly clock = inject(ClockSettingsService);

  readonly closed = output<void>();

  /** Colour · Layout · Typography · Shape · Images - opens on Colour. */
  protected readonly tab = signal<SettingsTab>('colour');
  protected readonly tabs = TABS;
  protected readonly tabIcons = TAB_ICONS;

  protected readonly modeOptions: ModeOption[] = [
    { id: 'light', label: 'Light', note: 'Bright surfaces' },
    { id: 'dark', label: 'Dark', note: 'Easy on the eyes' },
    { id: 'system', label: 'System', note: 'Follows this device' }
  ];

  protected readonly widthOptions: WidthOption[] = [
    { id: 'compact', label: 'Compact', note: '1440 px, centred' },
    { id: 'normal', label: 'Normal', note: '2100 px, centred' },
    { id: 'wide', label: 'Wide', note: 'Full screen width' }
  ];

  protected readonly cornerPresets = CORNER_PRESETS;

  /** Corner preset matching the current sliders; null once they are tuned by hand. */
  protected readonly activeCorner = computed(() => {
    const p = this.prefs();
    return CORNER_PRESETS.find((c) => c.radius === p.borderRadius && c.button === p.buttonRadius)?.id ?? null;
  });

  // ---- data from the store module ----
  // Base swatches + any custom colours the user picked (kept in prefs so they survive reload).
  protected readonly themeColors = computed(() => this.withCustom(THEME_COLORS, this.prefs().customThemeColors));
  protected readonly fonts = FONT_CHOICES;
  protected readonly sizes = FONT_SIZES;
  protected readonly weights = FONT_WEIGHTS;
  protected readonly sidebarBgs = SIDEBAR_BGS;
  protected readonly images = PROFILE_IMAGES;
  protected readonly palettes = PALETTES;

  protected readonly fontGroups: FontGroup[] = [
    { key: 'menuFont', label: 'Menu font' },
    { key: 'headingFont', label: 'Heading font' },
    { key: 'numberFont', label: 'Number font' },
    { key: 'bodyFont', label: 'Other font' }
  ];

  protected readonly densities: DensityOption[] = [
    { id: 'comfortable', label: 'Comfortable', note: 'Roomy menu rows' },
    { id: 'compact', label: 'Compact', note: 'More menu on screen' }
  ];

  protected readonly clockOptions: ClockOption[] = [
    { id: 'quiet', label: 'Quiet', note: 'Minute display' },
    { id: 'detailed', label: 'Detailed', note: 'With seconds' },
    { id: 'hidden', label: 'Hidden', note: 'No clock in the header' }
  ];

  /** One-line description of the current clock presentation. */
  protected readonly clockNote = computed(
    () => this.clockOptions.find((o) => o.id === this.clock.presentation())?.note ?? ''
  );

  protected readonly prefs = this.service.prefs;

  private saved: ThemePrefs = { ...this.service.prefs() };

  protected readonly dirty = computed(() => JSON.stringify(this.prefs()) !== JSON.stringify(this.saved));

  /** Sidebar background set from an uploaded file (not one of the presets). */
  protected readonly isCustomBg = computed(() => {
    const v = this.prefs().sidebarBg;
    return v !== null && !this.sidebarBgs.some((b) => b.value === v);
  });

  /** Selected avatar src for the live preview; null = initials. */
  protected readonly avatarSrc = computed(() => profileImageSrc(this.prefs().profileImage));

  /** Palette shown as selected: none while Custom colour controls are on, because the custom
      hexes - not the palette - drive the theme then. Picking a palette turns the controls off again. */
  protected readonly activePaletteId = computed(() => (this.prefs().customColourControls ? null : this.prefs().palette));

  /** Name of the selected palette, or null while a custom Theme Color / custom colours are used. */
  protected readonly paletteName = computed(() => PALETTES.find((p) => p.id === this.activePaletteId())?.name ?? null);

  // ---- custom colour controls ----
  protected readonly ccFields = CC_FIELDS;

  // ---- status colours ----
  protected readonly statusFields = STATUS_FIELDS;

  // ---- built-in colour picker (one popover, shared by every swatch) ----
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  /** Field the picker is editing; null = closed. */
  protected readonly pickerKey = signal<HexKey | null>(null);
  protected readonly pickerLabel = signal('');
  protected readonly pickerMode = signal<PickerMode>('hex');
  protected readonly pickerPos = signal({ top: 0, left: 0 });
  protected readonly pkHue = signal(0);
  protected readonly pkSat = signal(0);
  protected readonly pkVal = signal(0);
  /** Colour the picker opened with ("Before"; Reset goes back to it). */
  protected readonly pkOriginal = signal('#000000');
  protected readonly pkHexText = signal('');
  protected readonly pkHexBad = signal(false);
  protected readonly pkCurrent = computed(() => rgbToHex(hsvToRgb(this.pkHue(), this.pkSat(), this.pkVal())));
  protected readonly pkRgb = computed(() => hexToRgb(this.pkCurrent()));
  /** Pure hue - the background of the saturation area. */
  protected readonly pkHueColor = computed(() => rgbToHex(hsvToRgb(this.pkHue(), 1, 1)));
  protected readonly pkSwatches = computed(() => {
    const key = this.pickerKey();
    return key ? this.quickPicks(key).slice(0, 30) : [];
  });
  private pkFrame = 0;
  private pkPending: string | null = null;
  protected readonly pct = (n: number): string => `${(n * 100).toFixed(2)}%`;
  protected readonly round = Math.round;

  constructor() {
    // scroll does not bubble: listen in the capture phase so scrolling the panel closes the
    // fixed-position picker instead of leaving it floating in the wrong place
    const onScroll = (event: Event): void => {
      const pop = this.host.nativeElement.querySelector('.ts-cp');
      if (this.pickerKey() && !pop?.contains(event.target as Node)) this.closePicker();
    };
    document.addEventListener('scroll', onScroll, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', onScroll, true);
      cancelAnimationFrame(this.pkFrame);
    });
  }

  // ---- custom templates ----
  protected readonly templates = this.service.templates;
  protected readonly maxTemplates = MAX_TEMPLATES;
  protected readonly nameMax = TEMPLATE_NAME_MAX;
  protected readonly templateName = signal('');
  protected readonly templateNote = signal<TemplateNote | null>(null);
  /** Template currently shown as a preview (not applied until "Apply changes"). */
  protected readonly previewingId = signal<string | null>(null);
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameText = signal('');
  /** Delete asks once: the first click arms it, the second removes the template. */
  protected readonly confirmDeleteId = signal<string | null>(null);
  protected readonly atTemplateLimit = computed(() => this.templates().length >= MAX_TEMPLATES);
  /** Clock presentation before a template preview, restored if the panel closes without applying. */
  private clockBefore: TemplateClock | null = null;

  /** Typing buffer for the hex inputs; refreshed whenever a colour is set from outside. */
  protected readonly hexText = signal<Record<HexKey, string>>(hexOf(this.service.prefs()));
  /** Key of the field whose typed value is not a usable colour yet. */
  protected readonly hexError = signal<HexKey | null>(null);

  /** Preview title: "Custom colours" once the controls drive the theme, else "Preview · <palette>". */
  protected readonly previewTitle = computed(() =>
    this.prefs().customColourControls ? 'Custom colours' : `Preview · ${this.paletteName() ?? 'Theme Color'}`
  );

  /** Effective colours for the live preview - the custom hexes when the controls are on,
      otherwise exactly what applyTheme renders (theme colour + the active palette's tones). */
  protected readonly effBtn = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccBtn : p.themeColor;
  });

  protected readonly effHover = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccBtnHover : paletteById(p.palette)?.hover ?? darken(p.themeColor, 0.12);
  });

  protected readonly effPress = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccBtnPress : paletteById(p.palette)?.pressed ?? darken(p.themeColor, 0.22);
  });

  protected readonly effMenu = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccMenuSel : p.themeColor;
  });

  /** Secondary button preview: base is always Secondary colour; hover / pressed follow the
      custom tones while the controls are on, else the button's own derived tones. */
  protected readonly effSecBtn = computed(() => {
    const p = this.prefs();
    return p.palette ? paletteById(p.palette)?.hover ?? p.secondaryColor : p.secondaryColor;
  });

  protected readonly effSecHover = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccSecHover : darken(this.effSecBtn(), 0.12);
  });

  protected readonly effSecPress = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccSecPress : darken(this.effSecBtn(), 0.22);
  });

  protected readonly effSecMenu = computed(() => {
    const p = this.prefs();
    return p.customColourControls ? p.ccSecMenuSel : this.effSecBtn();
  });

  // ---- helpers ----
  protected iconPath(name: IconName): string {
    return ICONS[name];
  }

  /** The palette's light selected tint, shown as the last stripe of its preview. */
  protected selectedTint(p: ThemePalette): string {
    return tint(p.accent, 0.86);
  }

  /** Light wash for a preview chip: the colour mixed into white at the ratio the menu uses. */
  protected chipBg(hex: string, wash: number): string {
    return tint(hex, 1 - wash);
  }

  /** Chip label ink: the colour itself when it still reads on its own wash, else auto ink. */
  protected chipInk(hex: string, wash: number): string {
    const bg = tint(hex, 1 - wash);
    return contrastRatio(hex, bg) >= 3.4 ? hex : bestInk(bg);
  }

  /** Button label ink for a background (near-white or near-black - WCAG auto contrast). */
  protected solidInk(hex: string): string {
    return matchedInk(hex);
  }

  /** "5.99:1" - the contrast a button label gets against that background. */
  protected contrastOf(hex: string): string {
    return `${contrastRatio(hex, matchedInk(hex)).toFixed(2)}:1`;
  }

  /** "Custom colours" or "Palette · Blueberry & Slate" - the same rule as the live preview title. */
  protected templateSubtitle(t: ThemeTemplate): string {
    if (t.prefs.customColourControls) return 'Custom colours';
    return `Palette · ${PALETTES.find((p) => p.id === t.prefs.palette)?.name ?? 'Theme Color'}`;
  }

  /** The palette-style strip on a template card: button · hover · pressed · selected tint. */
  protected templateStrip(t: ThemeTemplate): ToneStrip {
    return toneStrip(t.prefs);
  }

  /** "Light · Normal width" - the mode and width a template brings with it. */
  protected templateMeta(t: ThemeTemplate): string {
    const mode = this.modeOptions.find((m) => m.id === t.prefs.mode)?.label ?? 'Light';
    const width = this.widthOptions.find((w) => w.id === t.prefs.contentWidth)?.label ?? 'Wide';
    return `${mode} · ${width} width`;
  }

  /** The strip for what is on screen now - shown next to "Save template". */
  protected readonly currentStrip = computed(() => toneStrip(this.prefs()));

  /** True when the template holds exactly the appearance on screen. */
  protected matchesPreview(t: ThemeTemplate): boolean {
    return JSON.stringify(t.prefs) === JSON.stringify(this.prefs()) && t.clock.presentation === this.clock.presentation();
  }

  // ---- built-in colour picker ----

  /** Swatch click: open the picker under it (or above when there is no room), HEX first. */
  protected openPicker(key: HexKey, label: string, event: Event): void {
    const trigger = event.currentTarget as HTMLElement;
    if (this.pickerKey() === key) {
      this.closePicker();
      return;
    }
    this.flushPicker();
    const hex = normalizeHex(this.prefs()[key]) ?? '#000000';
    this.pkOriginal.set(hex);
    this.pkSetFromHex(hex);
    this.pickerMode.set('hex');
    this.pickerLabel.set(label);
    this.pickerPos.set(this.pickerPlace(trigger));
    this.pickerKey.set(key);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('.ts-cp-hex input')?.select());
  }

  /**
   * Where the picker goes: under the swatch (above when there is no room below), and always inside
   * the scrolling panel body - never under its scrollbar or past the screen edge.
   * clientWidth / clientHeight leave scrollbars out, unlike window.innerWidth.
   */
  private pickerPlace(trigger: HTMLElement): { top: number; left: number } {
    const r = trigger.getBoundingClientRect();
    const body = this.host.nativeElement.querySelector<HTMLElement>('.ts-body');
    const box = body?.getBoundingClientRect();
    const gutter = 10;
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;
    // inner edges of the panel body (its own scrollbar excluded), else the window
    const minLeft = Math.max(gutter, (box ? box.left : 0) + gutter);
    const maxRight = Math.min(viewW - gutter, box ? box.left + (body?.clientWidth ?? box.width) - gutter : viewW - gutter);
    const width = Math.min(PICKER_W, maxRight - minLeft);
    // line the popover up with the swatch, slide it left when it would cross the right edge
    const left = clampN(r.left, minLeft, Math.max(minLeft, maxRight - width));
    const below = r.bottom + 8;
    const top = below + PICKER_H <= viewH - gutter ? below : Math.max(gutter, r.top - PICKER_H - 8);
    return { top, left };
  }

  protected closePicker(): void {
    this.flushPicker();
    this.pickerKey.set(null);
  }

  /** Apply the picked colour at most once per frame while dragging. */
  private pkEmit(): void {
    this.pkPending = this.pkCurrent();
    if (this.pkFrame) return;
    this.pkFrame = requestAnimationFrame(() => {
      this.pkFrame = 0;
      this.flushPicker();
    });
  }

  private flushPicker(): void {
    const key = this.pickerKey();
    if (key && this.pkPending && this.pkPending !== this.prefs()[key]) this.onPick(key, this.pkPending);
    this.pkPending = null;
  }

  private pkSetFromHex(hex: string): void {
    const { h, s, v } = rgbToHsv(hexToRgb(hex));
    if (s > 0 && v > 0) this.pkHue.set(h); // greys keep the hue so the slider does not jump
    this.pkSat.set(s);
    this.pkVal.set(v);
    this.pkHexText.set(hex);
    this.pkHexBad.set(false);
  }

  private pkChanged(): void {
    this.pkHexText.set(this.pkCurrent());
    this.pkHexBad.set(false);
    this.pkEmit();
  }

  protected onPkAreaDown(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    this.pkMoveArea(event, el);
  }

  protected onPkAreaMove(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) this.pkMoveArea(event, el);
  }

  private pkMoveArea(event: PointerEvent, el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    this.pkSat.set(clampN((event.clientX - r.left) / r.width, 0, 1));
    this.pkVal.set(1 - clampN((event.clientY - r.top) / r.height, 0, 1));
    this.pkChanged();
  }

  /** Arrow keys move 1% (10% with Shift). */
  protected onPkAreaKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]
    };
    const m = moves[event.key];
    if (!m) return;
    event.preventDefault();
    this.pkSat.set(clampN(this.pkSat() + m[0], 0, 1));
    this.pkVal.set(clampN(this.pkVal() + m[1], 0, 1));
    this.pkChanged();
  }

  protected onPkHueDown(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    this.pkMoveHue(event, el);
  }

  protected onPkHueMove(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) this.pkMoveHue(event, el);
  }

  private pkMoveHue(event: PointerEvent, el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    this.pkHue.set(clampN((event.clientX - r.left) / r.width, 0, 1) * 360);
    this.pkChanged();
  }

  protected onPkHueKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 1;
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : 0;
    if (!delta) return;
    event.preventDefault();
    this.pkHue.set((this.pkHue() + delta + 360) % 360);
    this.pkChanged();
  }

  protected onPkHexInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.pkHexText.set(raw);
    const hex = normalizeHex(raw);
    this.pkHexBad.set(!hex);
    if (hex) {
      this.pkSetFromHex(hex);
      this.pkHexText.set(raw);
      this.pkEmit();
    }
  }

  protected onPkHexBlur(): void {
    this.pkHexText.set(this.pkCurrent());
    this.pkHexBad.set(false);
  }

  protected onPkRgbInput(channel: keyof Rgb, event: Event): void {
    const n = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(n)) return;
    this.pkSetFromHex(rgbToHex({ ...this.pkRgb(), [channel]: clampN(n, 0, 255) }));
    this.pkEmit();
  }

  protected pkPick(hex: string): void {
    const clean = normalizeHex(hex);
    if (!clean) return;
    this.pkSetFromHex(clean);
    this.pkEmit();
  }

  protected pkCopy(): void {
    void navigator.clipboard?.writeText(this.pkCurrent()).catch(() => undefined);
  }

  /** Click outside the picker (and outside the swatch that opened it) closes it. */
  @HostListener('document:pointerdown', ['$event'])
  protected onDocPointerDown(event: Event): void {
    if (!this.pickerKey()) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.ts-cp') && !target?.closest('.ts-cc-swatch')) this.closePicker();
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    if (this.pickerKey()) this.closePicker();
  }

  /** Quick picks inside the colour picker: the preset list for that colour, else the palette tones. */
  protected quickPicks(key: HexKey): string[] {
    switch (key) {
      case 'secondaryColor': return SECONDARY_COLORS;
      case 'iconColor': return ICON_COLORS;
      case 'headingColor': return HEADING_COLORS;
      case 'statusInfo': case 'statusSuccess': case 'statusWarning': case 'statusDanger': case 'statusNeutral':
        return STATUS_PICKS;
      default: return PALETTE_PICKS;
    }
  }

  /** Export templates: downloads every template as one JSON file. */
  protected exportTemplates(): void {
    if (!this.templates().length) {
      this.note('There are no templates to export yet.', 'info');
      return;
    }
    const blob = new Blob([this.service.exportTemplates()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otosolve-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const n = this.templates().length;
    this.note(`Exported ${n} template${n === 1 ? '' : 's'}. Import the file in another browser to use them there.`, 'ok');
  }

  /** Import templates: reads a file made with Export templates and adds its templates. */
  protected importTemplates(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      this.note('This file is too large for a template export (max 1 MB).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => this.note('The file could not be read. Try again.', 'error');
    reader.onload = () => {
      const r = this.service.importTemplates(String(reader.result ?? ''));
      if (r.error) {
        this.note(r.error, 'error');
        return;
      }
      const parts = [`Imported ${r.added} template${r.added === 1 ? '' : 's'}.`];
      if (r.renamed) parts.push(`${r.renamed} renamed to avoid duplicate names.`);
      if (r.skippedLimit) parts.push(`${r.skippedLimit} skipped - the limit is ${MAX_TEMPLATES}.`);
      if (r.skippedInvalid) parts.push(`${r.skippedInvalid} skipped - not valid.`);
      this.note(parts.join(' '), r.skippedLimit || r.skippedInvalid ? 'info' : 'ok');
    };
    reader.readAsText(file);
  }

  /** "16 Oct 2026, 14:04" */
  protected savedOn(t: ThemeTemplate): string {
    const d = new Date(t.savedAt);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** Base swatch list with the user's custom picks appended (newest last, de-duplicated). */
  private withCustom(base: string[], custom: readonly string[]): string[] {
    const extra = custom.filter((c) => !base.includes(c));
    return [...base, ...extra];
  }

  /** The prefs key holding the custom swatches for a colour row. */
  private customKeyFor(key: SwatchKey): keyof ThemePrefs {
    switch (key) {
      case 'themeColor': return 'customThemeColors';
      case 'secondaryColor': return 'customSecondaryColors';
      case 'iconColor': return 'customIconColors';
      case 'headingColor': return 'customHeadingColors';
    }
  }

  // ---- edits ----
  /**
   * Apply a change, persist it straight away and refresh the snapshot the footer compares against.
   * Theme edits therefore stick the moment they are picked - no Save required - and closing the
   * panel never rolls them back (the old preview-only flow silently reverted every change).
   */
  private apply(partial: Partial<ThemePrefs>): void {
    this.service.patch(partial);
    this.service.save();
    this.saved = { ...this.service.prefs() };
  }

  protected set<K extends keyof ThemePrefs>(key: K, value: ThemePrefs[K]): void {
    this.apply({ [key]: value } as Partial<ThemePrefs>);
  }

  /** Apply the colour; a non-preset pick is remembered in the custom swatch list (persisted immediately). */
  protected setSwatch(key: SwatchKey, value: string): void {
    const base = this.baseFor(key);
    const patch: Record<string, unknown> = { [key]: value };

    // remember custom colours so they show up as swatches and survive a reload
    if (!base.includes(value)) {
      const customKey = this.customKeyFor(key);
      const current = (this.prefs()[customKey] as string[]) ?? [];
      const next = current.includes(value) ? current : [...current, value];
      patch[customKey] = next;
    }

    // a hand-picked theme / secondary colour replaces the appearance palette
    // (while a palette is active --teal renders from palette.hover,
    // so a secondary pick would otherwise look like nothing happened)
    if (key === 'themeColor' || key === 'secondaryColor') patch['palette'] = null;

    this.apply(patch as Partial<ThemePrefs>);
  }

  /** Appearance palette: sets the theme colour plus the palette's own hover and pressed tones.
      Picking a palette turns the Custom colour controls back off so the palette drives the theme. */
  protected setPalette(p: ThemePalette): void {
    this.apply({ palette: p.id, themeColor: p.accent, secondaryColor: p.hover, customColourControls: false });
    this.hexError.set(null);
    this.syncHex();
  }

  /** Back to a plain Theme Color (keeps the current colour, drops the palette's hover / pressed tones). */
  protected clearPalette(): void {
    this.apply({ palette: null });
  }

  /**
   * Checkbox on: seed the hexes from the look already on screen (so nothing jumps), then
   * switch the controls on. Off: keep the colours - the palette / theme tones take over again.
   */
  protected toggleCc(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    if (on) {
      const p = this.prefs();
      const palette = paletteById(p.palette);
      const sec = palette ? palette.hover : p.secondaryColor;
      this.apply({
        customColourControls: true,
        ccBtn: p.themeColor,
        ccBtnHover: palette ? palette.hover : darken(p.themeColor, 0.12),
        ccBtnPress: palette ? palette.pressed : darken(p.themeColor, 0.22),
        ccMenuSel: p.themeColor,
        ccSecHover: darken(sec, 0.12),
        ccSecPress: darken(sec, 0.22),
        ccSecMenuSel: sec,
        ccCardOutline: resolveMode(p.mode) === 'dark' ? '#2c3240' : '#e8e9ee',
        ccGridHead: resolveMode(p.mode) === 'dark' ? '#171b24' : '#fdfdfe',
        ccTopHead: resolveMode(p.mode) === 'dark' ? '#1b1f2a' : '#ffffff'
      });
    } else {
      this.apply({ customColourControls: false });
    }
    this.hexError.set(null);
    this.syncHex();
  }

  /** Typing in a hex field: remember the raw text; apply the moment it parses as a colour. */
  protected onHexInput(key: HexKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.setHexText(key, raw);
    const hex = normalizeHex(raw);
    if (hex) {
      this.hexError.set(null);
      this.applyHex(key, hex);
      this.setHexText(key, hex);
    } else {
      this.hexError.set(key);
    }
  }

  /** Leaving a field that never parsed restores the colour that is actually applied. */
  protected onHexBlur(key: HexKey): void {
    if (this.hexError() === key) {
      this.syncHex();
      this.hexError.set(null);
    }
  }

  /** The swatch picker always carries a valid colour. */
  protected onPick(key: HexKey, value: string): void {
    const hex = normalizeHex(value);
    if (!hex) return;
    this.applyHex(key, hex);
    this.setHexText(key, hex);
    if (this.hexError() === key) this.hexError.set(null);
  }

  /** One applied hex: swatch colours keep their preset memory / palette clearing, the rest are
      custom controls (same record-then-cast pattern as setSwatch). */
  private applyHex(key: HexKey, value: string): void {
    if (key === 'secondaryColor' || key === 'iconColor' || key === 'headingColor') {
      this.setSwatch(key, value);
    } else if (isStatusKey(key)) {
      this.set(key, value);
    } else {
      this.setCc(key, value);
    }
  }

  private setCc(key: CcKey, value: string): void {
    const patch: Record<string, unknown> = { [key]: value };
    this.apply(patch as Partial<ThemePrefs>);
  }

  private setHexText(key: HexKey, value: string): void {
    this.hexText.update((t) => ({ ...t, [key]: value }) as Record<HexKey, string>);
  }

  /** Refresh the typing buffers from the applied colours (toggle, reset, revert on close). */
  private syncHex(): void {
    this.hexText.set(hexOf(this.service.prefs()));
  }

  /** Corner preset: sets card and button radius together (sliders stay available below). */
  protected setCorner(c: CornerPreset): void {
    this.apply({ borderRadius: c.radius, buttonRadius: c.button });
  }

  /** Reduce motion switch. */
  protected toggleMotion(event: Event): void {
    this.set('reduceMotion', (event.target as HTMLInputElement).checked);
  }

  /** Clock presentation applies straight away (the clock keeps its own saved settings). */
  protected setClock(value: ClockPresentation): void {
    this.clock.setPresentation(value);
  }

  private baseFor(key: SwatchKey): string[] {
    switch (key) {
      case 'themeColor': return THEME_COLORS;
      case 'secondaryColor': return SECONDARY_COLORS;
      case 'iconColor': return ICON_COLORS;
      case 'headingColor': return HEADING_COLORS;
    }
  }

  /** Custom sidebar background from a local image file (max 2 MB). */
  protected uploadSidebarBg(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      alert('Please choose an image under 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.set('sidebarBg', `url("${String(reader.result)}") center / cover no-repeat, #1e2228`);
    };
    reader.readAsDataURL(file);
  }

  // ---- custom templates ----

  /** The header clock as it is now (stored with a template). */
  private clockSnapshot(): TemplateClock {
    return { presentation: this.clock.presentation(), zoneId: this.clock.zone()?.id ?? null };
  }

  private restoreClock(c: TemplateClock): void {
    this.clock.setPresentation(c.presentation as ClockPresentation);
    const zone = c.zoneId ? this.clock.zones.find((z) => z.id === c.zoneId) : undefined;
    if (zone) this.clock.zone.set(zone);
  }

  private note(text: string, tone: TemplateNote['tone']): void {
    this.templateNote.set({ text, tone });
  }

  protected onTemplateName(event: Event): void {
    this.templateName.set((event.target as HTMLInputElement).value);
    if (this.templateNote()?.tone === 'error') this.templateNote.set(null);
  }

  /** Save template: the whole appearance on screen (colours, layout, type, clock) under a new name. */
  protected saveTemplate(): void {
    const name = this.templateName().trim();
    const error = this.service.addTemplate(name, this.clockSnapshot());
    if (error) {
      this.note(error, 'error');
      return;
    }
    this.templateName.set('');
    this.note(`Template "${name}" saved. Stored in this browser.`, 'ok');
  }

  /** Use template: preview it everywhere. "Apply changes" keeps it; closing the panel goes back. */
  protected useTemplate(t: ThemeTemplate): void {
    if (!this.previewingId()) this.clockBefore = this.clockSnapshot();
    this.service.patch({ ...t.prefs });
    this.restoreClock(t.clock);
    this.previewingId.set(t.id);
    this.confirmDeleteId.set(null);
    this.hexError.set(null);
    this.syncHex();
    this.note(`Previewing "${t.name}". Choose Apply changes to keep it, or close the panel to go back.`, 'info');
  }

  /** Replace: overwrite the template with the appearance on screen. */
  protected replaceTemplate(t: ThemeTemplate): void {
    const error = this.service.replaceTemplate(t.id, this.clockSnapshot());
    this.note(error ?? `Template "${t.name}" now matches the current appearance.`, error ? 'error' : 'ok');
    this.confirmDeleteId.set(null);
  }

  protected startRename(t: ThemeTemplate): void {
    this.renamingId.set(t.id);
    this.renameText.set(t.name);
    this.confirmDeleteId.set(null);
    // focus the field once it is drawn
    setTimeout(() => document.querySelector<HTMLInputElement>('.ts-tpl-rename input')?.select());
  }

  protected onRenameText(event: Event): void {
    this.renameText.set((event.target as HTMLInputElement).value);
  }

  protected commitRename(t: ThemeTemplate): void {
    const name = this.renameText().trim();
    if (name === t.name) {
      this.cancelRename();
      return;
    }
    const error = this.service.renameTemplate(t.id, name);
    if (error) {
      this.note(error, 'error');
      return;
    }
    this.renamingId.set(null);
    this.note(`Renamed to "${name}".`, 'ok');
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameText.set('');
  }

  /** First click arms the delete, the second removes the template. */
  protected deleteTemplate(t: ThemeTemplate): void {
    if (this.confirmDeleteId() !== t.id) {
      this.confirmDeleteId.set(t.id);
      return;
    }
    const error = this.service.deleteTemplate(t.id);
    this.confirmDeleteId.set(null);
    if (this.previewingId() === t.id) this.previewingId.set(null);
    this.note(error ?? `Template "${t.name}" deleted.`, error ? 'error' : 'ok');
  }

  /** Apply changes: keep what is on screen (including a template preview) and close. */
  protected save(): void {
    this.service.save();
    this.saved = { ...this.service.prefs() };
    this.previewingId.set(null);
    this.clockBefore = null;
    this.closed.emit();
  }

  protected reset(): void {
    this.previewingId.set(null);
    this.clockBefore = null;
    this.service.reset();
    this.service.save();
    this.saved = { ...this.service.prefs() };
    this.hexError.set(null);
    this.syncHex();
  }

  protected close(): void {
    this.closePicker();
    if (this.dirty()) this.service.patch(this.saved);
    if (this.clockBefore) this.restoreClock(this.clockBefore);
    this.clockBefore = null;
    this.previewingId.set(null);
    this.syncHex();
    this.hexError.set(null);
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Esc closes an open colour picker first
    if (this.pickerKey()) {
      this.closePicker();
      return;
    }
    // Esc first leaves an open rename field, then closes the panel
    if (this.renamingId()) {
      this.cancelRename();
      return;
    }
    this.close();
  }
}