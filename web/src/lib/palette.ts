export type Palette =
  | 'steel'
  | 'console'
  | 'aubergine'
  | 'ember'
  | 'indigo'
  | 'arctic'
  | 'moss'
  | 'signal'
  | 'graphite'
  | 'parchment';

export interface PaletteMeta {
  id: Palette;
  label: string;
  description: string;
  accent: string;
  ok: string;
  warn: string;
  crit: string;
  dead: string;
  canvas: string;
  surface: string;
}

export const PALETTE_STORAGE_KEY = 'vigil:palette';

export const PALETTES: PaletteMeta[] = [
  {
    id: 'steel',
    label: 'Steel',
    description: 'Cool blue-gray with a navy accent.',
    accent: '#245691',
    ok: '#2e7d5b',
    warn: '#a8701c',
    crit: '#b8455c',
    dead: '#64748b',
    canvas: '#d7e0ea',
    surface: '#ffffff',
  },
  {
    id: 'console',
    label: 'Console',
    description: 'Terminal teal — the default shape language.',
    accent: '#1f5d52',
    ok: '#2e7d5b',
    warn: '#a8701c',
    crit: '#b8455c',
    dead: '#475569',
    canvas: '#eef0ee',
    surface: '#fbfcfb',
  },
  {
    id: 'aubergine',
    label: 'Aubergine',
    description: 'Warm violet on a soft paper ground.',
    accent: '#6b3f8f',
    ok: '#2e7d5b',
    warn: '#a8701c',
    crit: '#b8455c',
    dead: '#7c7486',
    canvas: '#f0eef2',
    surface: '#fdfcfe',
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Burnt orange; status hues are shifted off the accent.',
    accent: '#b2542a',
    ok: '#2f7a4f',
    warn: '#9a8214',
    crit: '#a82f52',
    dead: '#82888f',
    canvas: '#edeeef',
    surface: '#ffffff',
  },
  {
    id: 'indigo',
    label: 'Indigo',
    description: 'Deep indigo on a cool slate page.',
    accent: '#3b3fa8',
    ok: '#2e7d5b',
    warn: '#a8701c',
    crit: '#b8455c',
    dead: '#6c7288',
    canvas: '#eceef5',
    surface: '#ffffff',
  },
  {
    id: 'arctic',
    label: 'Arctic',
    description: 'Icy cyan against a frost-blue canvas.',
    accent: '#0f7391',
    ok: '#2f7a52',
    warn: '#9c6a14',
    crit: '#b23a56',
    dead: '#6b8593',
    canvas: '#e8f0f4',
    surface: '#ffffff',
  },
  {
    id: 'moss',
    label: 'Moss',
    description: 'Olive green; ok is shifted toward teal.',
    accent: '#5a6b34',
    ok: '#1f6f66',
    warn: '#9a6c12',
    crit: '#a8354e',
    dead: '#87887a',
    canvas: '#eeeee7',
    surface: '#fcfcf8',
  },
  {
    id: 'signal',
    label: 'Signal',
    description: 'High-contrast orange on a neutral gray page.',
    accent: '#c2410c',
    ok: '#2f7a4f',
    warn: '#a08800',
    crit: '#b01e46',
    dead: '#7d7d7d',
    canvas: '#eeeeee',
    surface: '#ffffff',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Near-monochrome; status stays fully saturated.',
    accent: '#222222',
    ok: '#1f7a4d',
    warn: '#a86f00',
    crit: '#b81d42',
    dead: '#8a8a8a',
    canvas: '#ececec',
    surface: '#fafafa',
  },
  {
    id: 'parchment',
    label: 'Parchment',
    description: 'Warm paper with a teal-ink accent.',
    accent: '#1f5f6b',
    ok: '#3a6b3a',
    warn: '#8a6414',
    crit: '#a03348',
    dead: '#877f70',
    canvas: '#f2efe8',
    surface: '#fdfbf6',
  },
];

const IDS = new Set<Palette>(PALETTES.map((p) => p.id));

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && IDS.has(value as Palette);
}

export function readPalette(): Palette {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (isPalette(stored)) return stored;
  } catch {
    // Private mode / blocked storage.
  }
  return 'console';
}

export function applyPalette(palette: Palette): void {
  document.documentElement.setAttribute('data-palette', palette);
  syncThemeColor();
}

export function persistPalette(palette: Palette): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {
    // Ignore quota / private-mode failures; the in-session stamp still applies.
  }
  applyPalette(palette);
  broadcastAppearance();
}

/** Same-tab sync — `storage` only fires in other windows. */
export function broadcastAppearance(): void {
  window.dispatchEvent(new Event('vigil:appearance'));
}

/** Mobile browser chrome. Follows --canvas so it tracks palette + light/dark. */
export function syncThemeColor(): void {
  if (typeof document === 'undefined') return;
  try {
    const canvas = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && canvas) meta.setAttribute('content', canvas);
  } catch {
    // Computed style unavailable during early boot; the pre-paint meta stays.
  }
}
