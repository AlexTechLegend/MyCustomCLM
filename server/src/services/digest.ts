import { db, nowIso } from '../db.js';
import { enqueueJob, listJobs } from './jobs.js';
import { listNotificationTargets } from './notifications.js';

export interface DigestSummary {
  kind: 'digest';
  title: string;
  text: string;
  generatedAt: string;
  renewalsCompleted: number;
  renewalsFailed: number;
  upcomingWindows: number;
  pipelineFailures: number;
  driftFindings: number;
  coverage: { certificates: number; linkedToHost: number };
}

export function buildDigestPayload(): DigestSummary {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const weekAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const renewalsCompleted = count(`SELECT COUNT(*) AS n FROM renewals WHERE status = 'completed' AND completed_at >= ?`, weekAgo);
  const renewalsFailed = count(`SELECT COUNT(*) AS n FROM renewals WHERE status = 'failed' AND created_at >= ?`, weekAgo);
  const upcomingWindows = count(
    `SELECT COUNT(*) AS n FROM certificates WHERE next_renewal_at IS NOT NULL AND next_renewal_at <= ?`,
    weekAhead,
  );
  const pipelineFailures = count(
    `SELECT COUNT(*) AS n FROM pipeline_runs WHERE state IN ('failed', 'rolled-back') AND created_at >= ?`,
    weekAgo,
  );
  const certificates = count(`SELECT COUNT(*) AS n FROM certificates`);
  const linkedToHost = count(`SELECT COUNT(DISTINCT certificate_id) AS n FROM certificate_hosts`);

  const driftFindings = count(
    `SELECT COUNT(*) AS n FROM jobs WHERE type = 'drift-scan' AND state = 'succeeded' AND finished_at >= ?`,
    weekAgo,
  );

  const lines = [
    `Renewals completed (7d): ${renewalsCompleted}`,
    `Renewals failed (7d): ${renewalsFailed}`,
    `Upcoming window load (7d): ${upcomingWindows}`,
    `Pipeline failures (7d): ${pipelineFailures}`,
    `Blueprint drift findings: ${driftFindings}`,
    `Coverage: ${linkedToHost}/${certificates} certificates linked to a host`,
  ];

  return {
    kind: 'digest',
    title: 'Vigil weekly digest',
    text: lines.join('\n'),
    generatedAt: nowIso(),
    renewalsCompleted,
    renewalsFailed,
    upcomingWindows,
    pipelineFailures,
    driftFindings,
    coverage: { certificates, linkedToHost },
  };
}

function count(sql: string, param?: string): number {
  try {
    const row = (param ? db().prepare(sql).get(param) : db().prepare(sql).get()) as { n: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

function nextMondayIso(from = new Date()): string {
  const d = new Date(from);
  const day = d.getUTCDay();
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(8, 0, 0, 0);
  return d.toISOString();
}

/**
 * Ensure one weekly digest notification job exists per active target.
 * Reuses `type: 'notification'` with `body.kind === 'digest'` because JobType
 * cannot be extended here (server-core owns types.ts / scheduler.ts).
 */
export function ensureDigestJob(): void {
  const targets = listNotificationTargets().filter((t) => t.isActive);
  if (!targets.length) return;

  const queued = listJobs({ limit: 200 }).filter((j) => {
    if (j.type !== 'notification') return false;
    if (j.state !== 'queued' && j.state !== 'claimed' && j.state !== 'running') return false;
    const body = (j.payload.body as Record<string, unknown> | undefined) ?? {};
    return body.kind === 'digest';
  });
  const have = new Set(queued.map((j) => String(j.payload.targetId ?? '')));
  const when = nextMondayIso();
  const summary = buildDigestPayload();

  for (const t of targets) {
    if (have.has(t.id)) continue;
    enqueueJob({
      type: 'notification',
      payload: { targetId: t.id, event: 'renewal.succeeded', body: summary },
      priority: 90,
      scheduledFor: when,
    });
  }
}
