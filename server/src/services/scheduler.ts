import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { currentLeader, tryAcquireLeadership } from '../lib/leader.js';
import { log, runWithContext } from '../lib/logger.js';
import type { Job, SchedulerHeartbeat } from '../types.js';
import { getBlueprint } from './blueprints.js';
import { listDueForRenewal } from './certificates.js';
import { claimJobs, completeJob, failJob, hasActiveRenewalJob, markJobRunning, reclaimExpiredLeases, refreshJobLease } from './jobs.js';
import { enqueueJob } from './jobs.js';
import { deliverNotification } from './notifications.js';
import { emitNotification } from './notifications.js';
import { executePipeline } from './pipelines.js';
import { runRenewalJob } from './renewals.js';

function owner(): string {
  return config.instanceId;
}

const heartbeat: SchedulerHeartbeat = {
  lastTickAt: null,
  lastEnqueueAt: null,
  lastClaimAt: null,
  ticks: 0,
  owner: '',
  enabled: config.schedulerEnabled,
};

let timer: ReturnType<typeof setInterval> | undefined;
let ticking = false;

function persistHeartbeat() {
  db()
    .prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('scheduler.heartbeat', JSON.stringify(heartbeat));
}

export function getSchedulerHeartbeat(): SchedulerHeartbeat {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get('scheduler.heartbeat') as { value: string } | undefined;
  if (!row) return { ...heartbeat, enabled: config.schedulerEnabled };
  try {
    return { ...JSON.parse(row.value), enabled: config.schedulerEnabled, owner: heartbeat.owner || owner() };
  } catch {
    return { ...heartbeat, enabled: config.schedulerEnabled };
  }
}

function enqueueDueRenewals(): number {
  let n = 0;
  for (const cert of listDueForRenewal()) {
    if (hasActiveRenewalJob(cert.id)) continue;
    const blueprint = cert.blueprintId ? getBlueprint(cert.blueprintId) : null;
    enqueueJob({
      type: 'renewal',
      certificateId: cert.id,
      payload: {
        certificateId: cert.id,
        method: blueprint?.issuanceMethod && blueprint.issuanceMethod !== 'csr' ? blueprint.issuanceMethod : 'internal-ca',
        keyMode: blueprint?.keyMode ?? 'reuse',
        validityDays: blueprint?.validityDays,
        profileIds: blueprint?.profileIds ?? cert.profileIds,
        deploy: false,
        pipelineId: blueprint?.pipelineId ?? null,
        requiresApproval: blueprint?.renewalPolicy.requiresApproval ?? false,
      },
      priority: 80,
    });
    n += 1;
  }
  if (n) heartbeat.lastEnqueueAt = nowIso();
  return n;
}

async function handleJob(job: Job): Promise<void> {
  refreshJobLease(job.id);
  markJobRunning(job.id);
  const payload = job.payload;
  switch (job.type) {
    case 'renewal': {
      const result = await runRenewalJob(job.id, payload);
      completeJob(job.id, result);
      break;
    }
    case 'pipeline-run': {
      const run = await executePipeline({
        pipelineId: String(payload.pipelineId ?? ''),
        certificateId: payload.certificateId ? String(payload.certificateId) : job.certificateId,
        hostId: payload.hostId ? String(payload.hostId) : undefined,
        renewalId: payload.renewalId ? String(payload.renewalId) : undefined,
        params: (payload.params as Record<string, unknown> | undefined) ?? {},
        dryRun: Boolean(payload.dryRun),
      });
      completeJob(job.id, { runId: run.id, state: run.state });
      break;
    }
    case 'notification': {
      const delivered = await deliverNotification(
        String(payload.targetId ?? ''),
        payload.event as never,
        (payload.body as Record<string, unknown>) ?? {},
      );
      completeJob(job.id, delivered);
      break;
    }
    case 'drift-scan': {
      const { detectBlueprintDrift } = await import('./blueprints.js');
      const blueprintId = String(payload.blueprintId ?? '');
      const report = detectBlueprintDrift(blueprintId);
      completeJob(job.id, { drifted: report.drifted, findings: report.findings.length });
      break;
    }
    default:
      throw new Error(`Unknown job type: ${String(job.type)}`);
  }
}

export async function schedulerTick(): Promise<SchedulerHeartbeat> {
  if (ticking) return getSchedulerHeartbeat();
  ticking = true;
  try {
    heartbeat.ticks += 1;
    heartbeat.lastTickAt = nowIso();
    heartbeat.enabled = config.schedulerEnabled;
    heartbeat.owner = owner();
    const leader = tryAcquireLeadership(owner());
    const held = currentLeader();
    heartbeat.leader = leader;
    heartbeat.leaderOwner = held?.owner ?? null;
    if (!leader) {
      persistHeartbeat();
      return { ...heartbeat };
    }
    reclaimExpiredLeases();
    enqueueDueRenewals();
    const claimed = claimJobs(owner(), config.schedulerBatchSize);
    if (claimed.length) heartbeat.lastClaimAt = nowIso();
    persistHeartbeat();
    for (const job of claimed) {
      try {
        await runWithContext({ jobId: job.id }, () => handleJob(job));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('job failed', { jobId: job.id, error: message });
        failJob(job.id, message);
        emitNotification('renewal.failed', { jobId: job.id, type: job.type, error: message });
      }
    }
    persistHeartbeat();
    return { ...heartbeat };
  } finally {
    ticking = false;
  }
}

export function startScheduler(): void {
  if (!config.schedulerEnabled) {
    heartbeat.enabled = false;
    persistHeartbeat();
    log.info('scheduler disabled (VIGIL_SCHEDULER=0)');
    return;
  }
  if (timer) return;
  log.info('scheduler starting', { owner: owner(), intervalMs: config.schedulerIntervalMs });
  void schedulerTick();
  timer = setInterval(() => {
    void schedulerTick();
  }, config.schedulerIntervalMs);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
