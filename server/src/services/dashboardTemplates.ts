import { db, newId, nowIso, parseJson } from '../db.js';
import type { UserRole } from '../types.js';

export type GridPos = { id: string; x: number; y: number; w: number; h: number };
export type GridCols = 12 | 24 | 36;

export type DashboardLayout = {
  version: 2;
  cols: GridCols;
  rows: number;
  items: GridPos[];
};

export type DashboardTemplate = {
  id: string;
  name: string;
  layout: DashboardLayout;
};

export type DashboardTemplateStore = {
  templates: DashboardTemplate[];
  roleAssignments: Partial<Record<UserRole, string>>;
  userAssignments: Record<string, string>;
  defaultId: string;
};

const EMPTY: DashboardTemplateStore = {
  templates: [],
  roleAssignments: {},
  userAssignments: {},
  defaultId: 'default',
};

const ROLES: UserRole[] = ['viewer', 'operator', 'approver', 'admin'];

function isCols(n: unknown): n is GridCols {
  return n === 12 || n === 24 || n === 36;
}

function coerceLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DashboardLayout>;
  if (r.version !== 2 || !isCols(r.cols) || !Array.isArray(r.items)) return null;
  const items: GridPos[] = [];
  for (const it of r.items) {
    if (!it || typeof it.id !== 'string') continue;
    items.push({
      id: it.id,
      x: Math.max(0, Math.round(Number(it.x) || 0)),
      y: Math.max(0, Math.round(Number(it.y) || 0)),
      w: Math.max(1, Math.round(Number(it.w) || 1)),
      h: Math.max(1, Math.round(Number(it.h) || 1)),
    });
  }
  return { version: 2, cols: r.cols, rows: Math.max(12, Math.round(Number(r.rows) || 12)), items };
}

function coerceStore(raw: unknown): DashboardTemplateStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY, roleAssignments: {}, userAssignments: {} };
  const r = raw as Partial<DashboardTemplateStore>;
  const templates: DashboardTemplate[] = [];
  for (const t of Array.isArray(r.templates) ? r.templates : []) {
    if (!t || typeof t.id !== 'string' || typeof t.name !== 'string') continue;
    const layout = coerceLayout(t.layout);
    if (!layout) continue;
    templates.push({ id: t.id, name: t.name.trim() || 'Untitled', layout });
  }
  const roleAssignments: Partial<Record<UserRole, string>> = {};
  const rawRoles = r.roleAssignments && typeof r.roleAssignments === 'object' ? r.roleAssignments : {};
  for (const role of ROLES) {
    const id = (rawRoles as Record<string, unknown>)[role];
    if (typeof id === 'string' && id) roleAssignments[role] = id;
  }
  const userAssignments: Record<string, string> = {};
  const rawUsers = r.userAssignments && typeof r.userAssignments === 'object' ? r.userAssignments : {};
  for (const [uid, tid] of Object.entries(rawUsers as Record<string, unknown>)) {
    if (typeof tid === 'string' && tid) userAssignments[uid] = tid;
  }
  return {
    templates,
    roleAssignments,
    userAssignments,
    defaultId: typeof r.defaultId === 'string' && r.defaultId ? r.defaultId : 'default',
  };
}

export function getTemplateStore(): DashboardTemplateStore {
  const row = db().prepare('SELECT payload FROM dashboard_template_store WHERE id = 1').get() as { payload: string } | undefined;
  return coerceStore(row ? parseJson(row.payload, EMPTY) : EMPTY);
}

export function saveTemplateStore(input: unknown): DashboardTemplateStore {
  const store = coerceStore(input);
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO dashboard_template_store (id, payload, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(store), now);
  return store;
}

export function createTemplate(name: string, layout: unknown): DashboardTemplateStore {
  const store = getTemplateStore();
  const parsed = coerceLayout(layout);
  if (!parsed) throw Object.assign(new Error('Invalid layout'), { status: 400 });
  store.templates.push({
    id: newId('dash'),
    name: name.trim() || 'Untitled',
    layout: parsed,
  });
  return saveTemplateStore(store);
}

export function resolveTemplateId(store: DashboardTemplateStore, user: { id: string; role: UserRole } | null | undefined): string {
  if (user?.id && store.userAssignments[user.id]) return store.userAssignments[user.id]!;
  if (user?.role && store.roleAssignments[user.role]) return store.roleAssignments[user.role]!;
  return store.defaultId || 'default';
}
