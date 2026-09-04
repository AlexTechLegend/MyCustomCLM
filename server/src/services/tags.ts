import { db, newId, nowIso, parseJson } from '../db.js';
import { ttlMemo } from '../lib/memo.js';
import type { TagGroup } from '../types.js';
import { listCertificates } from './certificates.js';

interface GroupRow {
  id: string;
  name: string;
  description: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

function mapGroup(r: GroupRow): TagGroup {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    tags: normaliseTagList(parseJson<string[]>(r.tags, [])),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function normaliseTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ');
}

export function normaliseTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = normaliseTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** All unique tags currently in use across certificates, sorted. */
function computeDistinctTags(): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const c of listCertificates()) {
    for (const raw of c.tags) {
      const t = normaliseTag(raw);
      if (!t) continue;
      const key = t.toLowerCase();
      const cur = counts.get(key);
      if (cur) cur.count++;
      else counts.set(key, { tag: t, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

// Same reasoning as services/dashboard.ts: a full certificates scan on every
// call, hit by every page that shows a tag filter, so a short TTL collapses
// concurrent callers without needing write-invalidation wired through every
// mutation route.
export const listDistinctTags = ttlMemo(computeDistinctTags, 5_000);

export function listTagGroups(): TagGroup[] {
  const rows = db().prepare('SELECT * FROM tag_groups ORDER BY name COLLATE NOCASE').all() as GroupRow[];
  const groups = rows.map(mapGroup);
  const certs = listCertificates();
  return groups.map((g) => {
    const set = new Set(g.tags.map((t) => t.toLowerCase()));
    return { ...g, certificateCount: certs.filter((c) => c.tags.some((t) => set.has(t.toLowerCase()))).length };
  });
}

export function getTagGroup(id: string): TagGroup | null {
  const row = db().prepare('SELECT * FROM tag_groups WHERE id = ?').get(id) as GroupRow | undefined;
  if (!row) return null;
  const g = mapGroup(row);
  const set = new Set(g.tags.map((t) => t.toLowerCase()));
  g.certificateCount = listCertificates().filter((c) => c.tags.some((t) => set.has(t.toLowerCase()))).length;
  return g;
}

export function createTagGroup(input: Partial<TagGroup>): TagGroup {
  const now = nowIso();
  const row: GroupRow = {
    id: newId('tg'),
    name: (input.name ?? '').trim() || 'Untitled group',
    description: input.description ?? '',
    tags: JSON.stringify(normaliseTagList(input.tags ?? [])),
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare('INSERT INTO tag_groups (id, name, description, tags, created_at, updated_at) VALUES (@id, @name, @description, @tags, @created_at, @updated_at)')
    .run(row);
  return getTagGroup(row.id)!;
}

export function updateTagGroup(id: string, input: Partial<TagGroup>): TagGroup | null {
  const existing = getTagGroup(id);
  if (!existing) return null;
  db()
    .prepare('UPDATE tag_groups SET name = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?')
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      input.description ?? existing.description,
      JSON.stringify(normaliseTagList(input.tags ?? existing.tags)),
      nowIso(),
      id,
    );
  return getTagGroup(id);
}

export function deleteTagGroup(id: string): boolean {
  return db().prepare('DELETE FROM tag_groups WHERE id = ?').run(id).changes > 0;
}
