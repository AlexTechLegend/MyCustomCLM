import { readJson, writeJson } from '@/lib/safeStorage';

export type TileSize = 3 | 4 | 6 | 8 | 12;
export type LayoutItem = { id: string; size: TileSize };

export type SavedDashboard = {
  id: string;
  name: string;
  items: LayoutItem[];
  builtin?: boolean;
};

export const TILE_SIZES: TileSize[] = [3, 4, 6, 8, 12];

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'overview-stats', size: 12 },
  { id: 'expiring-soon', size: 8 },
  { id: 'fleet-health', size: 4 },
  { id: 'time-reclaimed', size: 8 },
  { id: 'expiry-horizon', size: 4 },
  { id: 'issuers', size: 4 },
  { id: 'recent-activity', size: 8 },
];

const OPERATIONS_LAYOUT: LayoutItem[] = [
  { id: 'expiring-soon', size: 8 },
  { id: 'renewals-30d', size: 4 },
  { id: 'without-key', size: 4 },
  { id: 'fleet-health', size: 4 },
  { id: 'expiry-horizon', size: 4 },
  { id: 'recent-activity', size: 8 },
  { id: 'expiring-by-tag', size: 4 },
];

const MANAGEMENT_LAYOUT: LayoutItem[] = [
  { id: 'automation-coverage', size: 12 },
  { id: 'overview-stats', size: 12 },
  { id: 'time-reclaimed', size: 8 },
  { id: 'time-quarter', size: 4 },
  { id: 'issuer-concentration', size: 8 },
  { id: 'issuers', size: 4 },
];

export const BUILTIN_DASHBOARDS: SavedDashboard[] = [
  { id: 'default', name: 'Default', items: DEFAULT_LAYOUT, builtin: true },
  { id: 'operations', name: 'Operations', items: OPERATIONS_LAYOUT, builtin: true },
  { id: 'management', name: 'Management', items: MANAGEMENT_LAYOUT, builtin: true },
];

const LAYOUT_KEY = 'vigil:dashboard-layout';
const DASHBOARDS_KEY = 'vigil:dashboards';

type Store = {
  activeId: string;
  defaultId: string;
  custom: SavedDashboard[];
};

const EMPTY_STORE: Store = { activeId: 'default', defaultId: 'default', custom: [] };

function loadStore(): Store {
  const raw = readJson<Partial<Store>>(DASHBOARDS_KEY);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STORE };
  return {
    activeId: typeof raw.activeId === 'string' ? raw.activeId : 'default',
    defaultId: typeof raw.defaultId === 'string' ? raw.defaultId : 'default',
    custom: Array.isArray(raw.custom)
      ? raw.custom.filter((d): d is SavedDashboard => !!d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.items))
      : [],
  };
}

function saveStore(store: Store) {
  writeJson(DASHBOARDS_KEY, store);
}

export function allDashboards(): SavedDashboard[] {
  return [...BUILTIN_DASHBOARDS, ...loadStore().custom];
}

export function loadLayout(): LayoutItem[] {
  const stored = readJson<LayoutItem[]>(LAYOUT_KEY);
  if (Array.isArray(stored) && stored.length && stored.every((i) => i && typeof i.id === 'string' && TILE_SIZES.includes(i.size))) {
    return stored;
  }
  const store = loadStore();
  const dash = allDashboards().find((d) => d.id === store.defaultId) ?? BUILTIN_DASHBOARDS[0];
  return dash.items.map((i) => ({ ...i }));
}

export function persistLayout(items: LayoutItem[]) {
  writeJson(LAYOUT_KEY, items);
}

export function activeDashboardId(): string {
  return loadStore().activeId;
}

export function defaultDashboardId(): string {
  return loadStore().defaultId;
}

export function setActiveDashboard(id: string): LayoutItem[] {
  const dash = allDashboards().find((d) => d.id === id) ?? BUILTIN_DASHBOARDS[0];
  const store = loadStore();
  store.activeId = dash.id;
  saveStore(store);
  const items = dash.items.map((i) => ({ ...i }));
  persistLayout(items);
  return items;
}

export function setDefaultDashboard(id: string) {
  const store = loadStore();
  store.defaultId = id;
  saveStore(store);
}

export function saveNamedDashboard(name: string, items: LayoutItem[]): SavedDashboard {
  const dash: SavedDashboard = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dash-${Date.now()}`,
    name: name.trim() || 'Untitled',
    items: items.map((i) => ({ ...i })),
  };
  const store = loadStore();
  store.custom = [...store.custom, dash];
  store.activeId = dash.id;
  saveStore(store);
  persistLayout(dash.items);
  return dash;
}

export function deleteDashboard(id: string) {
  if (BUILTIN_DASHBOARDS.some((d) => d.id === id)) return;
  const store = loadStore();
  store.custom = store.custom.filter((d) => d.id !== id);
  if (store.activeId === id) store.activeId = 'default';
  if (store.defaultId === id) store.defaultId = 'default';
  saveStore(store);
}

export function resetLayout(): LayoutItem[] {
  const items = DEFAULT_LAYOUT.map((i) => ({ ...i }));
  persistLayout(items);
  const store = loadStore();
  store.activeId = 'default';
  saveStore(store);
  return items;
}

const SETUP_KEY = 'vigil:setup-dismissed';

export function setupDismissed(): boolean {
  return readJson<boolean>(SETUP_KEY) === true;
}

export function setSetupDismissed(v: boolean) {
  writeJson(SETUP_KEY, v);
}
