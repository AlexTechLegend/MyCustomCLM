import { db, newId, nowIso } from '../db.js';
import type { IdentityTemplate, KeyMode } from '../types.js';

interface IdentityRow {
  id: string;
  name: string;
  description: string;
  country: string;
  state: string;
  locality: string;
  organisation: string;
  organisational_unit: string;
  email: string;
  default_key_mode: KeyMode;
  default_validity_days: number;
  created_at: string;
  updated_at: string;
}

const KEY_MODES: KeyMode[] = ['reuse', 'rsa-2048', 'rsa-3072', 'rsa-4096', 'ec-p256', 'ec-p384'];

function mapRow(r: IdentityRow): IdentityTemplate {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    country: r.country,
    state: r.state,
    locality: r.locality,
    organisation: r.organisation,
    organisationalUnit: r.organisational_unit,
    email: r.email,
    defaultKeyMode: KEY_MODES.includes(r.default_key_mode) ? r.default_key_mode : 'rsa-2048',
    defaultValidityDays: r.default_validity_days,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normaliseKeyMode(v: unknown): KeyMode {
  return typeof v === 'string' && KEY_MODES.includes(v as KeyMode) ? (v as KeyMode) : 'rsa-2048';
}

export function listIdentityTemplates(): IdentityTemplate[] {
  const rows = db().prepare('SELECT * FROM identity_templates ORDER BY name COLLATE NOCASE').all() as IdentityRow[];
  return rows.map(mapRow);
}

export function getIdentityTemplate(id: string): IdentityTemplate | null {
  const row = db().prepare('SELECT * FROM identity_templates WHERE id = ?').get(id) as IdentityRow | undefined;
  return row ? mapRow(row) : null;
}

export function createIdentityTemplate(input: Partial<IdentityTemplate>): IdentityTemplate {
  const now = nowIso();
  const row: IdentityRow = {
    id: newId('idt'),
    name: (input.name ?? '').trim() || 'Untitled identity',
    description: input.description ?? '',
    country: (input.country ?? '').trim(),
    state: (input.state ?? '').trim(),
    locality: (input.locality ?? '').trim(),
    organisation: (input.organisation ?? '').trim(),
    organisational_unit: (input.organisationalUnit ?? '').trim(),
    email: (input.email ?? '').trim(),
    default_key_mode: normaliseKeyMode(input.defaultKeyMode),
    default_validity_days: Math.min(3650, Math.max(1, Math.round(input.defaultValidityDays || 397))),
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare(
      `INSERT INTO identity_templates (id, name, description, country, state, locality, organisation, organisational_unit, email, default_key_mode, default_validity_days, created_at, updated_at)
       VALUES (@id, @name, @description, @country, @state, @locality, @organisation, @organisational_unit, @email, @default_key_mode, @default_validity_days, @created_at, @updated_at)`,
    )
    .run(row);
  return mapRow(row);
}

export function updateIdentityTemplate(id: string, input: Partial<IdentityTemplate>): IdentityTemplate | null {
  const existing = getIdentityTemplate(id);
  if (!existing) return null;
  db()
    .prepare(
      `UPDATE identity_templates SET name = ?, description = ?, country = ?, state = ?, locality = ?, organisation = ?, organisational_unit = ?, email = ?, default_key_mode = ?, default_validity_days = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      input.description ?? existing.description,
      (input.country ?? existing.country).trim(),
      (input.state ?? existing.state).trim(),
      (input.locality ?? existing.locality).trim(),
      (input.organisation ?? existing.organisation).trim(),
      (input.organisationalUnit ?? existing.organisationalUnit).trim(),
      (input.email ?? existing.email).trim(),
      normaliseKeyMode(input.defaultKeyMode ?? existing.defaultKeyMode),
      Math.min(3650, Math.max(1, Math.round(input.defaultValidityDays ?? existing.defaultValidityDays))),
      nowIso(),
      id,
    );
  return getIdentityTemplate(id);
}

export function deleteIdentityTemplate(id: string): boolean {
  return db().prepare('DELETE FROM identity_templates WHERE id = ?').run(id).changes > 0;
}
