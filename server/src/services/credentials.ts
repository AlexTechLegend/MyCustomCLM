import { db, newId, nowIso } from '../db.js';
import type { CredentialKind, CredentialMeta } from '../types.js';
import { decryptSecret, encryptSecret, reencryptSecret } from './crypto.js';

interface CredRow {
  id: string;
  name: string;
  kind: CredentialKind;
  username: string;
  secret_encrypted: string;
  secret_iv: string;
  secret_tag: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function mapMeta(r: CredRow): CredentialMeta {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    username: r.username,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hasSecret: !!(r.secret_encrypted && r.secret_iv && r.secret_tag),
  };
}

export function listCredentials(): CredentialMeta[] {
  return (db().prepare('SELECT * FROM credentials ORDER BY name COLLATE NOCASE').all() as CredRow[]).map(mapMeta);
}

export function getCredentialMeta(id: string): CredentialMeta | null {
  const row = db().prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredRow | undefined;
  return row ? mapMeta(row) : null;
}

/** Decrypt for in-job use only — never expose via HTTP. */
export function revealCredentialSecret(id: string): { username: string; secret: string; kind: CredentialKind } | null {
  const row = db().prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredRow | undefined;
  if (!row || !row.secret_encrypted) return null;
  return {
    username: row.username,
    kind: row.kind,
    secret: decryptSecret(row.secret_encrypted, row.secret_iv, row.secret_tag),
  };
}

export function createCredential(input: {
  name?: string;
  kind?: CredentialKind;
  username?: string;
  secret?: string;
  description?: string;
}): CredentialMeta {
  if (!input.secret?.trim()) throw new Error('A secret is required when creating a credential.');
  const enc = encryptSecret(input.secret);
  const now = nowIso();
  const row: CredRow = {
    id: newId('crd'),
    name: (input.name ?? '').trim() || 'Untitled credential',
    kind: input.kind ?? 'password',
    username: input.username ?? '',
    secret_encrypted: enc.ciphertext,
    secret_iv: enc.iv,
    secret_tag: enc.tag,
    description: input.description ?? '',
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare(
      `INSERT INTO credentials (id, name, kind, username, secret_encrypted, secret_iv, secret_tag, description, created_at, updated_at)
       VALUES (@id, @name, @kind, @username, @secret_encrypted, @secret_iv, @secret_tag, @description, @created_at, @updated_at)`,
    )
    .run(row);
  return mapMeta(row);
}

export function updateCredential(
  id: string,
  input: { name?: string; kind?: CredentialKind; username?: string; secret?: string; description?: string },
): CredentialMeta | null {
  const row = db().prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredRow | undefined;
  if (!row) return null;
  let enc = { ciphertext: row.secret_encrypted, iv: row.secret_iv, tag: row.secret_tag };
  if (input.secret !== undefined) {
    if (!input.secret.trim()) throw new Error('Secret cannot be empty. Omit the field to leave it unchanged.');
    enc = encryptSecret(input.secret);
  }
  db()
    .prepare(
      `UPDATE credentials SET name = ?, kind = ?, username = ?, secret_encrypted = ?, secret_iv = ?, secret_tag = ?, description = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      (input.name ?? row.name).trim() || row.name,
      input.kind ?? row.kind,
      input.username ?? row.username,
      enc.ciphertext,
      enc.iv,
      enc.tag,
      input.description ?? row.description,
      nowIso(),
      id,
    );
  return getCredentialMeta(id);
}

export function deleteCredential(id: string): boolean {
  return db().prepare('DELETE FROM credentials WHERE id = ?').run(id).changes > 0;
}

/** Re-encrypt every stored secret under a new key. Old key must decrypt every row. */
export function rotateCredentialKeys(oldKey: Buffer, newKey: Buffer): number {
  const rows = db().prepare('SELECT id, secret_encrypted, secret_iv, secret_tag FROM credentials').all() as CredRow[];
  let n = 0;
  const update = db().prepare(
    `UPDATE credentials SET secret_encrypted = ?, secret_iv = ?, secret_tag = ?, updated_at = ? WHERE id = ?`,
  );
  const tx = () => {
    for (const row of rows) {
      if (!row.secret_encrypted) continue;
      const enc = reencryptSecret(row.secret_encrypted, row.secret_iv, row.secret_tag, oldKey, newKey);
      update.run(enc.ciphertext, enc.iv, enc.tag, nowIso(), row.id);
      n += 1;
    }
  };
  db().exec('BEGIN');
  try {
    tx();
    db().exec('COMMIT');
  } catch (err) {
    db().exec('ROLLBACK');
    throw err;
  }
  return n;
}
