export interface SavedView {
  id: string;
  name: string;
  query: string;
  builtin?: boolean;
}

const STORAGE_KEY = 'vigil:saved-views';

export const BUILTIN_VIEWS: SavedView[] = [
  { id: 'needs-attention', name: 'Needs attention', query: 'status=critical', builtin: true },
  { id: 'unprofiled', name: 'No profile linked', query: 'unprofiled=true', builtin: true },
];

function readStore(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        !!v && typeof v === 'object' && typeof (v as SavedView).id === 'string' && typeof (v as SavedView).name === 'string' && typeof (v as SavedView).query === 'string',
    );
  } catch {
    return [];
  }
}

function writeStore(views: SavedView[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views.map(({ id, name, query }) => ({ id, name, query }))));
  } catch {
    // Private mode / quota — fail silently; the page still renders.
  }
}

export function loadSavedViews(): SavedView[] {
  const user = readStore().filter((v) => !BUILTIN_VIEWS.some((b) => b.id === v.id));
  return [...BUILTIN_VIEWS, ...user];
}

export function saveView(name: string, query: string): SavedView {
  const view: SavedView = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `view-${Date.now()}`,
    name: name.trim(),
    query: normalizeQuery(query),
  };
  writeStore([...readStore(), view]);
  return view;
}

export function deleteView(id: string): void {
  if (BUILTIN_VIEWS.some((v) => v.id === id)) return;
  writeStore(readStore().filter((v) => v.id !== id));
}

/** Canonical query string for comparing / storing views. Drops pagination. */
export function normalizeQuery(query: string): string {
  const raw = query.startsWith('?') ? query.slice(1) : query;
  const params = new URLSearchParams(raw);
  params.delete('page');
  params.delete('pageSize');
  const next = new URLSearchParams();
  for (const key of [...params.keys()].sort()) {
    const value = params.get(key);
    if (value && value !== 'all') next.set(key, value);
  }
  return next.toString();
}

export function viewsEqual(a: string, b: string): boolean {
  return normalizeQuery(a) === normalizeQuery(b);
}
