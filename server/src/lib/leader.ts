import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { log } from './logger.js';

export function currentLeader(): { owner: string; expiresAt: string } | null {
  const row = db().prepare(`SELECT owner, expires_at FROM instance_leases WHERE id = 'scheduler'`).get() as
    | { owner: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (row.expires_at < nowIso()) return null;
  return { owner: row.owner, expiresAt: row.expires_at };
}

/**
 * Single-row lease. Only one instance against a SQLite file should tick jobs.
 * Returns true when this owner holds leadership after the call.
 */
export function tryAcquireLeadership(owner: string, ttlMs = config.leaderTtlMs): boolean {
  const now = nowIso();
  const expires = new Date(Date.now() + ttlMs).toISOString();
  const existing = db().prepare(`SELECT owner, expires_at FROM instance_leases WHERE id = 'scheduler'`).get() as
    | { owner: string; expires_at: string }
    | undefined;

  if (!existing) {
    db()
      .prepare(`INSERT INTO instance_leases (id, owner, expires_at, updated_at) VALUES ('scheduler', ?, ?, ?)`)
      .run(owner, expires, now);
    log.info('scheduler leadership acquired', { owner });
    return true;
  }

  if (existing.owner === owner) {
    db().prepare(`UPDATE instance_leases SET expires_at = ?, updated_at = ? WHERE id = 'scheduler' AND owner = ?`).run(expires, now, owner);
    return true;
  }

  if (existing.expires_at < now) {
    const res = db()
      .prepare(
        `UPDATE instance_leases SET owner = ?, expires_at = ?, updated_at = ? WHERE id = 'scheduler' AND expires_at < ?`,
      )
      .run(owner, expires, now, now);
    if (Number(res.changes) > 0) {
      log.warn('scheduler leadership taken over after expired lease', { owner, previous: existing.owner });
      return true;
    }
  }

  return false;
}
