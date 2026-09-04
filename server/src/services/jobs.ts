import { config } from '../config.js';
import { db, newId, nowIso, parseJson } from '../db.js';
import type { Job, JobState, JobType } from '../types.js';

interface JobRow {
  id: string;
  type: JobType;
  payload: string;
  state: JobState;
  priority: number;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  result: string | null;
  certificate_id: string | null;
  created_at: string;
}

function mapRow(r: JobRow): Job {
  return {
    id: r.id,
    type: r.type,
    payload: parseJson(r.payload, {}),
    state: r.state,
    priority: r.priority,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    leaseOwner: r.lease_owner,
    leaseExpiresAt: r.lease_expires_at,
    scheduledFor: r.scheduled_for,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    error: r.error,
    result: r.result ? parseJson(r.result, {}) : null,
    certificateId: r.certificate_id,
    createdAt: r.created_at,
  };
}

export function enqueueJob(input: {
  type: JobType;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  scheduledFor?: string;
  certificateId?: string | null;
}): Job {
  const now = nowIso();
  const row: JobRow = {
    id: newId('job'),
    type: input.type,
    payload: JSON.stringify(input.payload ?? {}),
    state: 'queued',
    priority: input.priority ?? 100,
    attempts: 0,
    max_attempts: input.maxAttempts ?? 5,
    lease_owner: null,
    lease_expires_at: null,
    scheduled_for: input.scheduledFor ?? now,
    started_at: null,
    finished_at: null,
    error: null,
    result: null,
    certificate_id: input.certificateId ?? null,
    created_at: now,
  };
  db()
    .prepare(
      `INSERT INTO jobs (id, type, payload, state, priority, attempts, max_attempts, lease_owner, lease_expires_at, scheduled_for, started_at, finished_at, error, result, certificate_id, created_at)
       VALUES (@id, @type, @payload, @state, @priority, @attempts, @max_attempts, @lease_owner, @lease_expires_at, @scheduled_for, @started_at, @finished_at, @error, @result, @certificate_id, @created_at)`,
    )
    .run(row);
  return mapRow(row);
}

export function getJob(id: string): Job | null {
  const row = db().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function listJobs(opts: { state?: string; limit?: number } = {}): Job[] {
  const limit = opts.limit ?? 100;
  if (opts.state) {
    return (db().prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC LIMIT ?').all(opts.state, limit) as JobRow[]).map(mapRow);
  }
  return (db().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit) as JobRow[]).map(mapRow);
}

/** Reclaim jobs whose lease expired while claimed/running. */
export function reclaimExpiredLeases(now = nowIso()): number {
  const res = db()
    .prepare(
      `UPDATE jobs SET state = 'queued', lease_owner = NULL, lease_expires_at = NULL
       WHERE state IN ('claimed', 'running') AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`,
    )
    .run(now);
  return Number(res.changes);
}

/**
 * Atomically claim up to `limit` queued jobs that are due.
 * Concurrency guard is the conditional UPDATE — no external lock.
 */
export function claimJobs(owner: string, limit: number, now = nowIso()): Job[] {
  const leaseUntil = new Date(Date.now() + config.leaseSeconds * 1000).toISOString();
  const candidates = db()
    .prepare(
      `SELECT id FROM jobs WHERE state = 'queued' AND scheduled_for <= ? ORDER BY priority ASC, scheduled_for ASC LIMIT ?`,
    )
    .all(now, limit) as { id: string }[];

  const claimed: Job[] = [];
  const claim = db().prepare(
    `UPDATE jobs SET state = 'claimed', lease_owner = ?, lease_expires_at = ?, attempts = attempts + 1
     WHERE id = ? AND state = 'queued'`,
  );
  for (const c of candidates) {
    const res = claim.run(owner, leaseUntil, c.id);
    if (Number(res.changes) > 0) {
      const job = getJob(c.id);
      if (job) claimed.push(job);
    }
  }
  return claimed;
}

export function markJobRunning(id: string) {
  const leaseUntil = new Date(Date.now() + config.leaseSeconds * 1000).toISOString();
  db()
    .prepare(`UPDATE jobs SET state = 'running', started_at = COALESCE(started_at, ?), lease_expires_at = ? WHERE id = ?`)
    .run(nowIso(), leaseUntil, id);
}

export function refreshJobLease(id: string) {
  const leaseUntil = new Date(Date.now() + config.leaseSeconds * 1000).toISOString();
  db().prepare(`UPDATE jobs SET lease_expires_at = ? WHERE id = ? AND state IN ('claimed', 'running')`).run(leaseUntil, id);
}

export function completeJob(id: string, result: Record<string, unknown> | null = null) {
  db()
    .prepare(`UPDATE jobs SET state = 'succeeded', finished_at = ?, result = ?, error = NULL, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`)
    .run(nowIso(), result ? JSON.stringify(result) : null, id);
}

export function failJob(id: string, error: string, retry = true): Job | null {
  const job = getJob(id);
  if (!job) return null;
  if (retry && job.attempts < job.maxAttempts) {
    const backoffSec = Math.min(3600, 2 ** Math.min(job.attempts, 10) * 15);
    const scheduledFor = new Date(Date.now() + backoffSec * 1000).toISOString();
    db()
      .prepare(
        `UPDATE jobs SET state = 'queued', error = ?, scheduled_for = ?, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`,
      )
      .run(error, scheduledFor, id);
  } else {
    db()
      .prepare(
        `UPDATE jobs SET state = 'failed', error = ?, finished_at = ?, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`,
      )
      .run(error, nowIso(), id);
  }
  return getJob(id);
}

export function cancelJob(id: string): Job | null {
  const job = getJob(id);
  if (!job) return null;
  if (job.state === 'succeeded' || job.state === 'cancelled') return job;
  db()
    .prepare(`UPDATE jobs SET state = 'cancelled', finished_at = ?, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`)
    .run(nowIso(), id);
  return getJob(id);
}

export function retryJob(id: string): Job | null {
  const job = getJob(id);
  if (!job) return null;
  if (job.state !== 'failed' && job.state !== 'cancelled') return job;
  db()
    .prepare(
      `UPDATE jobs SET state = 'queued', scheduled_for = ?, error = NULL, finished_at = NULL, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`,
    )
    .run(nowIso(), id);
  return getJob(id);
}

export function hasActiveRenewalJob(certificateId: string): boolean {
  const row = db()
    .prepare(
      `SELECT id FROM jobs WHERE certificate_id = ? AND type = 'renewal' AND state IN ('queued', 'claimed', 'running') LIMIT 1`,
    )
    .get(certificateId) as { id: string } | undefined;
  return !!row;
}

export function tryAcquireCertLock(certificateId: string, owner: string, ttlSeconds = 600): boolean {
  const now = nowIso();
  db().prepare(`DELETE FROM certificate_locks WHERE expires_at < ?`).run(now);
  const existing = db().prepare(`SELECT owner, expires_at FROM certificate_locks WHERE certificate_id = ?`).get(certificateId) as
    | { owner: string; expires_at: string }
    | undefined;
  if (existing && existing.expires_at >= now && existing.owner !== owner) return false;
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  db()
    .prepare(
      `INSERT INTO certificate_locks (certificate_id, owner, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(certificate_id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at`,
    )
    .run(certificateId, owner, expires);
  return true;
}

export function releaseCertLock(certificateId: string, owner: string) {
  db().prepare(`DELETE FROM certificate_locks WHERE certificate_id = ? AND owner = ?`).run(certificateId, owner);
}
