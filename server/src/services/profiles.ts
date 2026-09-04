import path from 'node:path';
import { db, newId, nowIso, parseJson } from '../db.js';
import { defaultExtension } from '../openssl.js';
import type { OutputSpec, Profile, ProfileScope } from '../types.js';

interface ProfileRow {
  id: string;
  name: string;
  description: string;
  destination_path: string;
  outputs: string;
  scope: ProfileScope;
  server_tags: string;
  certificate_ids: string;
  created_at: string;
  updated_at: string;
}

function mapRow(r: ProfileRow): Profile {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    destinationPath: r.destination_path,
    outputs: parseJson<OutputSpec[]>(r.outputs, []),
    scope: r.scope === 'specialized' ? 'specialized' : 'general',
    serverTags: parseJson<string[]>(r.server_tags, []),
    certificateIds: parseJson<string[]>(r.certificate_ids, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function withCounts(profiles: Profile[]): Profile[] {
  const rows = db().prepare('SELECT profile_ids FROM certificates').all() as { profile_ids: string }[];
  const counts = new Map<string, number>();
  for (const r of rows) for (const id of parseJson<string[]>(r.profile_ids, [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  return profiles.map((p) => ({ ...p, certificateCount: counts.get(p.id) ?? 0 }));
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}

export function profileAppliesTo(
  profile: Profile,
  cert: { id: string; tags: string[]; profileIds?: string[] },
): boolean {
  if (profile.scope !== 'specialized') return true;
  if (profile.certificateIds.includes(cert.id)) return true;
  if (cert.profileIds?.includes(profile.id)) return true;
  const tags = new Set(cert.tags.map((t) => t.toLowerCase()));
  return profile.serverTags.some((t) => tags.has(t.toLowerCase()));
}

export function listProfiles(): Profile[] {
  const rows = db().prepare('SELECT * FROM profiles ORDER BY name COLLATE NOCASE').all() as ProfileRow[];
  return withCounts(rows.map(mapRow));
}

export function getProfile(id: string): Profile | null {
  const row = db().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
  return row ? withCounts([mapRow(row)])[0] : null;
}

/**
 * Batched form of getProfile for the common "resolve a certificate's linked
 * profile ids" case. A single `WHERE id IN (...)` plus one certificateCount
 * pass, instead of N round trips each re-scanning the whole certificates
 * table via withCounts -- see certificates.routes.ts and renewals.ts, which
 * both previously did `profileIds.map((id) => getProfile(id))`. Order
 * follows the input array; unknown ids are silently dropped, matching the
 * `.filter(Boolean)` the two call sites already did.
 */
export function getProfiles(ids: string[]): Profile[] {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(',');
  const rows = db()
    .prepare(`SELECT * FROM profiles WHERE id IN (${placeholders})`)
    .all(...unique) as ProfileRow[];
  const byId = new Map(withCounts(rows.map(mapRow)).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Profile => !!p);
}

export function normaliseSpec(input: Partial<OutputSpec>, existing?: OutputSpec): OutputSpec {
  const format = input.format ?? existing?.format ?? 'pem-cert';
  const lineEnding = input.lineEnding === 'crlf' ? 'crlf' : 'lf';
  const filename = (input.filename ?? existing?.filename ?? '').trim() || `{cn_safe}${defaultExtension(format, lineEnding)}`;
  return {
    id: existing?.id ?? input.id ?? newId('out'),
    label: (input.label ?? existing?.label ?? '').trim() || filename,
    filename,
    format,
    lineEnding,
    includeRoot: !!(input.includeRoot ?? existing?.includeRoot),
    keyEncoding: input.keyEncoding === 'pkcs1' || input.keyEncoding === 'sec1' ? input.keyEncoding : 'pkcs8',
    password: input.password ?? existing?.password ?? '',
    friendlyName: (input.friendlyName ?? existing?.friendlyName ?? '{cn}') || '{cn}',
    legacyPkcs12: !!(input.legacyPkcs12 ?? existing?.legacyPkcs12),
    trailingNewline: input.trailingNewline === undefined ? existing?.trailingNewline ?? true : !!input.trailingNewline,
    detected: input.detected ?? existing?.detected ?? null,
  };
}

export function validateDestination(p: string) {
  const trimmed = p.trim();
  if (!trimmed) return '';
  // Blank tokens so "{cn_safe}" does not look relative.
  const withTokensBlanked = trimmed.replace(/\{[a-z_]+\}/gi, 'x');
  const isWinAbs = /^[A-Za-z]:[\\/]/.test(withTokensBlanked) || withTokensBlanked.startsWith('\\\\');
  if (!path.isAbsolute(withTokensBlanked) && !isWinAbs) {
    throw new Error(
      'Deploy path must be absolute or a UNC share (for example /etc/ssl/webfarm, C:\\Windows\\Temp, D:\\Certs\\{cn_safe}, or \\\\fileserver\\certs\\web).',
    );
  }
  return trimmed;
}

function scopeOf(input: Partial<Profile>, fallback: ProfileScope = 'general'): ProfileScope {
  return input.scope === 'specialized' || input.scope === 'general' ? input.scope : fallback;
}

export function createProfile(input: Partial<Profile>): Profile {
  const now = nowIso();
  const row: ProfileRow = {
    id: newId('prf'),
    name: (input.name ?? '').trim() || 'Untitled profile',
    description: input.description ?? '',
    destination_path: validateDestination(input.destinationPath ?? ''),
    outputs: JSON.stringify((input.outputs ?? []).map((o) => normaliseSpec(o))),
    scope: scopeOf(input),
    server_tags: JSON.stringify(cleanList(input.serverTags)),
    certificate_ids: JSON.stringify(cleanList(input.certificateIds)),
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare(
      'INSERT INTO profiles (id, name, description, destination_path, outputs, scope, server_tags, certificate_ids, created_at, updated_at) VALUES (@id, @name, @description, @destination_path, @outputs, @scope, @server_tags, @certificate_ids, @created_at, @updated_at)',
    )
    .run(row);
  return mapRow(row);
}

export function updateProfile(id: string, input: Partial<Profile>): Profile | null {
  const existing = getProfile(id);
  if (!existing) return null;
  const outputs = input.outputs
    ? input.outputs.map((o) => normaliseSpec(o, existing.outputs.find((e) => e.id === o.id)))
    : existing.outputs;
  db()
    .prepare(
      'UPDATE profiles SET name = ?, description = ?, destination_path = ?, outputs = ?, scope = ?, server_tags = ?, certificate_ids = ?, updated_at = ? WHERE id = ?',
    )
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      input.description ?? existing.description,
      validateDestination(input.destinationPath ?? existing.destinationPath),
      JSON.stringify(outputs),
      scopeOf(input, existing.scope),
      JSON.stringify(input.serverTags !== undefined ? cleanList(input.serverTags) : existing.serverTags),
      JSON.stringify(input.certificateIds !== undefined ? cleanList(input.certificateIds) : existing.certificateIds),
      nowIso(),
      id,
    );
  return getProfile(id);
}

export function deleteProfile(id: string): boolean {
  const res = db().prepare('DELETE FROM profiles WHERE id = ?').run(id);
  if (res.changes > 0) {
    const rows = db().prepare('SELECT id, profile_ids FROM certificates').all() as { id: string; profile_ids: string }[];
    const upd = db().prepare('UPDATE certificates SET profile_ids = ? WHERE id = ?');
    for (const r of rows) {
      const ids = parseJson<string[]>(r.profile_ids, []);
      if (ids.includes(id)) upd.run(JSON.stringify(ids.filter((x) => x !== id)), r.id);
    }
  }
  return res.changes > 0;
}
