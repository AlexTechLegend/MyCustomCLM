import { TILE_BY_ID } from '@/components/tiles/registry';
import { clamp, clampRows, isGridCols, MIN_ROWS, packFlow } from '@/lib/gridGeometry';
import { readJson, writeJson } from '@/lib/safeStorage';
import type { User, UserRole } from '@/types';
import { USER_ROLES } from '@/types';

export { USER_ROLES };
export type { UserRole };

export type GridPos = { id: string; x: number; y: number; w: number; h: number };
export type GridCols = 12 | 24 | 36;

export type DashboardLayout = {
  version: 2;
  cols: GridCols;
  rows: number; // any integer ≥ 12; the canvas grows one row at a time
  items: GridPos[];
};

export type SavedDashboard = {
  id: string;
  name: string;
  layout: DashboardLayout;
  builtin?: boolean;
};

/** Empty canvas used when opening the builder. */
export const BLANK_LAYOUT: DashboardLayout = { version: 2, cols: 12, rows: 12, items: [] };

/** The pre-grid shape: a flow of widths in twelfths, in display order. */
type LegacyItem = { id: string; size: number };

function grid(cols: GridCols, rows: number, items: GridPos[]): DashboardLayout {
  return { version: 2, cols, rows, items };
}

export const DEFAULT_LAYOUT: DashboardLayout = grid(12, 24, [
  { id: 'overview-stats', x: 0, y: 0, w: 12, h: 3 },
  { id: 'expiring-soon', x: 0, y: 3, w: 8, h: 6 },
  { id: 'fleet-health', x: 8, y: 3, w: 4, h: 4 },
  { id: 'expiry-horizon', x: 8, y: 7, w: 4, h: 4 },
  { id: 'time-reclaimed', x: 0, y: 9, w: 8, h: 7 },
  { id: 'issuers', x: 8, y: 11, w: 4, h: 4 },
  { id: 'recent-activity', x: 0, y: 16, w: 8, h: 5 },
]);

const OPERATIONS_LAYOUT: DashboardLayout = grid(12, 24, [
  { id: 'expiring-soon', x: 0, y: 0, w: 8, h: 6 },
  { id: 'renewals-30d', x: 8, y: 0, w: 4, h: 3 },
  { id: 'without-key', x: 8, y: 3, w: 4, h: 3 },
  { id: 'fleet-health', x: 0, y: 6, w: 4, h: 4 },
  { id: 'expiry-horizon', x: 4, y: 6, w: 4, h: 4 },
  { id: 'expiring-by-tag', x: 8, y: 6, w: 4, h: 5 },
  { id: 'recent-activity', x: 0, y: 10, w: 8, h: 5 },
]);

const MANAGEMENT_LAYOUT: DashboardLayout = grid(12, 24, [
  { id: 'automation-coverage', x: 0, y: 0, w: 12, h: 4 },
  { id: 'overview-stats', x: 0, y: 4, w: 12, h: 3 },
  { id: 'time-reclaimed', x: 0, y: 7, w: 8, h: 7 },
  { id: 'time-quarter', x: 8, y: 7, w: 4, h: 3 },
  { id: 'issuer-concentration', x: 8, y: 10, w: 4, h: 4 },
  { id: 'issuers', x: 0, y: 14, w: 4, h: 4 },
]);

export const BUILTIN_DASHBOARDS: SavedDashboard[] = [
  { id: 'default', name: 'Default', layout: DEFAULT_LAYOUT, builtin: true },
  { id: 'operations', name: 'Operations', layout: OPERATIONS_LAYOUT, builtin: true },
  { id: 'management', name: 'Management', layout: MANAGEMENT_LAYOUT, builtin: true },
];

const LAYOUT_KEY = 'vigil:dashboard-layout';
const DASHBOARDS_KEY = 'vigil:dashboards';

// ---------------------------------------------------------------------------
// Migration and normalisation

/**
 * Pack a v1 flow layout into a 12-column grid. Widths come from the stored `size`,
 * heights from each tile's `defaultH`; unknown tiles are dropped.
 */
export function migrateV1(items: LegacyItem[]): DashboardLayout {
  const known = items.filter((i): i is LegacyItem => !!i && typeof i.id === 'string' && !!TILE_BY_ID[i.id]);
  const packed = packFlow(
    known.map((i) => ({ id: i.id, w: clamp(Number(i.size) || TILE_BY_ID[i.id].defaultW, 1, 12) })),
    (id) => TILE_BY_ID[id].defaultH,
    12,
  );
  return grid(12, packed.rows, packed.items);
}

let warnedDuplicate = false;

/** Drop unknown tiles, resolve duplicate ids / coordinates, and keep every tile inside the canvas. */
export function normalizeLayout(layout: DashboardLayout): DashboardLayout {
  const byId = new Map<string, GridPos>();
  const byCell = new Map<string, string>();
  let dupes = 0;
  for (const raw of layout.items) {
    if (!raw || typeof raw.id !== 'string' || !TILE_BY_ID[raw.id]) continue;
    const item: GridPos = {
      id: raw.id,
      x: Math.max(0, Math.round(Number(raw.x) || 0)),
      y: Math.max(0, Math.round(Number(raw.y) || 0)),
      w: Math.max(1, Math.round(Number(raw.w) || 1)),
      h: Math.max(1, Math.round(Number(raw.h) || 1)),
    };
    item.w = Math.min(item.w, layout.cols);
    item.x = Math.min(item.x, layout.cols - item.w);
    const cell = `${item.x},${item.y}`;
    const prior = byCell.get(cell);
    if (prior && prior !== item.id) {
      byId.delete(prior);
      dupes++;
    }
    if (byId.has(item.id)) dupes++;
    byId.set(item.id, item);
    byCell.set(cell, item.id);
  }
  if (dupes && !warnedDuplicate) {
    warnedDuplicate = true;
    console.warn(`[dashboard] resolved ${dupes} duplicate tile placement${dupes === 1 ? '' : 's'}; the last one won`);
  }
  const items = [...byId.values()];
  const needed = items.reduce((n, i) => Math.max(n, i.y + i.h), MIN_ROWS);
  const rows = Math.max(needed, clampRows(layout.rows));
  return grid(layout.cols, rows, items);
}

function coerceLayout(raw: unknown): DashboardLayout | null {
  if (Array.isArray(raw)) return raw.length ? migrateV1(raw as LegacyItem[]) : null;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DashboardLayout>;
  if (r.version === 2 && Array.isArray(r.items) && isGridCols(r.cols)) {
    return normalizeLayout({ version: 2, cols: r.cols, rows: Number(r.rows) || MIN_ROWS, items: r.items });
  }
  return null;
}

function cloneLayout(l: DashboardLayout): DashboardLayout {
  return { ...l, items: l.items.map((i) => ({ ...i })) };
}

// ---------------------------------------------------------------------------
// Store

type Store = {
  activeId: string;
  defaultId: string;
  custom: SavedDashboard[];
  roleAssignments: Partial<Record<UserRole, string>>;
  userAssignments: Record<string, string>;
};

type RawSaved = { id?: unknown; name?: unknown; items?: unknown; layout?: unknown; builtin?: unknown };

const EMPTY_STORE: Store = { activeId: 'default', defaultId: 'default', custom: [], roleAssignments: {}, userAssignments: {} };

function coerceAssignments(raw: unknown): Partial<Record<UserRole, string>> {
  const out: Partial<Record<UserRole, string>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const role of USER_ROLES) {
    const id = (raw as Record<string, unknown>)[role];
    if (typeof id === 'string' && id) out[role] = id;
  }
  return out;
}

function coerceUserAssignments(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [uid, tid] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof tid === 'string' && tid) out[uid] = tid;
  }
  return out;
}

function coerceSaved(raw: RawSaved): SavedDashboard | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const layout = coerceLayout(raw.layout) ?? coerceLayout(raw.items);
  if (!layout) return null;
  return { id: raw.id, name: raw.name, layout };
}

function loadStore(): Store {
  const raw = readJson<{
    activeId?: unknown;
    defaultId?: unknown;
    custom?: unknown;
    roleAssignments?: unknown;
    userAssignments?: unknown;
  }>(DASHBOARDS_KEY);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STORE, roleAssignments: {}, userAssignments: {} };
  const custom = Array.isArray(raw.custom) ? (raw.custom as RawSaved[]).map(coerceSaved).filter((d): d is SavedDashboard => d !== null) : [];
  return {
    activeId: typeof raw.activeId === 'string' ? raw.activeId : 'default',
    defaultId: typeof raw.defaultId === 'string' ? raw.defaultId : 'default',
    custom,
    roleAssignments: coerceAssignments(raw.roleAssignments),
    userAssignments: coerceUserAssignments(raw.userAssignments),
  };
}

function saveStore(store: Store) {
  writeJson(DASHBOARDS_KEY, store);
}

export function allDashboards(): SavedDashboard[] {
  return [...BUILTIN_DASHBOARDS, ...loadStore().custom];
}

export function loadLayout(): DashboardLayout {
  const raw = readJson<unknown>(LAYOUT_KEY);
  const stored = coerceLayout(raw);
  if (stored && stored.items.length) {
    // A v1 array was just migrated; write the grid form back so it only happens once.
    if (Array.isArray(raw)) persistLayout(stored);
    return stored;
  }
  const store = loadStore();
  const dash = allDashboards().find((d) => d.id === store.defaultId) ?? BUILTIN_DASHBOARDS[0];
  return cloneLayout(dash.layout);
}

export function persistLayout(layout: DashboardLayout) {
  writeJson(LAYOUT_KEY, layout);
}

export function activeDashboardId(): string {
  return loadStore().activeId;
}

export function defaultDashboardId(): string {
  return loadStore().defaultId;
}

export function setActiveDashboard(id: string): DashboardLayout {
  const dash = allDashboards().find((d) => d.id === id) ?? BUILTIN_DASHBOARDS[0];
  const store = loadStore();
  store.activeId = dash.id;
  saveStore(store);
  const layout = cloneLayout(dash.layout);
  persistLayout(layout);
  return layout;
}

export function setDefaultDashboard(id: string) {
  const store = loadStore();
  store.defaultId = id;
  saveStore(store);
}

export function saveNamedDashboard(name: string, layout: DashboardLayout): SavedDashboard {
  const dash: SavedDashboard = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dash-${Date.now()}`,
    name: name.trim() || 'Untitled',
    layout: cloneLayout(layout),
  };
  const store = loadStore();
  store.custom = [...store.custom, dash];
  store.activeId = dash.id;
  saveStore(store);
  persistLayout(dash.layout);
  return dash;
}

export function updateNamedDashboard(id: string, patch: { name?: string; layout?: DashboardLayout }): SavedDashboard | null {
  if (BUILTIN_DASHBOARDS.some((d) => d.id === id)) return null;
  const store = loadStore();
  const idx = store.custom.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const next: SavedDashboard = {
    ...store.custom[idx],
    name: patch.name?.trim() || store.custom[idx].name,
    layout: patch.layout ? cloneLayout(patch.layout) : store.custom[idx].layout,
  };
  store.custom = store.custom.map((d, i) => (i === idx ? next : d));
  saveStore(store);
  if (store.activeId === id && patch.layout) persistLayout(next.layout);
  return next;
}

export function roleAssignments(): Partial<Record<UserRole, string>> {
  return { ...loadStore().roleAssignments };
}

export function userAssignments(): Record<string, string> {
  return { ...loadStore().userAssignments };
}

export function setAssignments(next: { roleAssignments?: Partial<Record<UserRole, string>>; userAssignments?: Record<string, string>; defaultId?: string }) {
  const store = loadStore();
  if (next.roleAssignments) store.roleAssignments = { ...next.roleAssignments };
  if (next.userAssignments) store.userAssignments = { ...next.userAssignments };
  if (next.defaultId) store.defaultId = next.defaultId;
  saveStore(store);
}

export function mergeServerTemplates(input: {
  templates: SavedDashboard[];
  roleAssignments: Partial<Record<UserRole, string>>;
  userAssignments: Record<string, string>;
  defaultId: string;
}) {
  const store = loadStore();
  const byId = new Map(store.custom.map((d) => [d.id, d]));
  for (const t of input.templates) {
    if (!t.id || BUILTIN_DASHBOARDS.some((b) => b.id === t.id)) continue;
    byId.set(t.id, { id: t.id, name: t.name, layout: cloneLayout(t.layout) });
  }
  store.custom = [...byId.values()];
  store.roleAssignments = { ...input.roleAssignments };
  store.userAssignments = { ...input.userAssignments };
  if (input.defaultId) store.defaultId = input.defaultId;
  saveStore(store);
}

export function exportCustomStore(): {
  templates: SavedDashboard[];
  roleAssignments: Partial<Record<UserRole, string>>;
  userAssignments: Record<string, string>;
  defaultId: string;
} {
  const store = loadStore();
  return {
    templates: store.custom.map((d) => ({ ...d, layout: cloneLayout(d.layout) })),
    roleAssignments: { ...store.roleAssignments },
    userAssignments: { ...store.userAssignments },
    defaultId: store.defaultId,
  };
}

/** User-specific assignment, then that user's role, then the estate default. */
export function resolveDashboardId(user: Pick<User, 'id' | 'role'> | null | undefined): string {
  const store = loadStore();
  if (user?.id && store.userAssignments[user.id]) return store.userAssignments[user.id]!;
  if (user?.role && store.roleAssignments[user.role]) return store.roleAssignments[user.role]!;
  return store.defaultId;
}

export function findDashboard(id: string): SavedDashboard | undefined {
  return allDashboards().find((d) => d.id === id);
}

export function deleteDashboard(id: string) {
  if (BUILTIN_DASHBOARDS.some((d) => d.id === id)) return;
  const store = loadStore();
  store.custom = store.custom.filter((d) => d.id !== id);
  if (store.activeId === id) store.activeId = 'default';
  if (store.defaultId === id) store.defaultId = 'default';
  saveStore(store);
}

export function resetLayout(): DashboardLayout {
  const layout = cloneLayout(DEFAULT_LAYOUT);
  persistLayout(layout);
  const store = loadStore();
  store.activeId = 'default';
  saveStore(store);
  return layout;
}

const SETUP_KEY = 'vigil:setup-dismissed';

export function setupDismissed(): boolean {
  return readJson<boolean>(SETUP_KEY) === true;
}

export function setSetupDismissed(v: boolean) {
  writeJson(SETUP_KEY, v);
}
