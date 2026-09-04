import path from 'node:path';
import { config } from '../config.js';
import { db, newId, nowIso, parseJson } from '../db.js';
import type { Pipeline, PipelineRun, PipelineRunState, PipelineStep, PipelineStepResult } from '../types.js';
import { writeAudit } from './audit.js';
import { getCertificate } from './certificates.js';
import { withHostLock } from './host-lock.js';
import { emitNotification } from './notifications.js';
import { assertStepImplemented, getStepHandler, runPipelinePreflight, UNIMPLEMENTED_STEP_TYPES } from './steps/index.js';
import type { StepContext } from './steps/types.js';
import { resolveTransport } from './transport/index.js';

export const STAGING_PRESET_ID = 'pipe_staging_swap';

const DEFAULT_OUTPUTS = [
  {
    id: 'fullchain',
    label: 'Full chain',
    filename: '{cn}.cer',
    format: 'pem-fullchain',
    lineEnding: 'lf',
    includeRoot: false,
    keyEncoding: 'pkcs8',
    password: '',
    friendlyName: '{cn}',
    legacyPkcs12: false,
    trailingNewline: true,
    detected: null,
  },
  {
    id: 'key',
    label: 'Decrypted private key',
    filename: '{cn}.key',
    format: 'pem-key',
    lineEnding: 'lf',
    includeRoot: false,
    keyEncoding: 'pkcs8',
    password: '',
    friendlyName: '{cn}',
    legacyPkcs12: false,
    trailingNewline: true,
    detected: null,
  },
];

function builtinSteps(): PipelineStep[] {
  return [
    {
      id: 'render',
      type: 'render-output',
      name: 'Render staging files',
      config: { stagingDir: '{stagingDir}', outputs: DEFAULT_OUTPUTS },
      continueOnError: false,
      condition: 'always',
    },
    {
      id: 'backup',
      type: 'backup',
      name: 'Backup live directory',
      config: { source: '{prodDir}', backupRoot: '{backupRoot}' },
      continueOnError: false,
      condition: 'always',
    },
    {
      id: 'swap',
      type: 'swap',
      name: 'Atomic swap staging over live',
      config: { renderStepId: 'render', destination: '{prodDir}' },
      continueOnError: false,
      condition: 'always',
    },
    {
      id: 'verify',
      type: 'verify',
      name: 'Verify deploy',
      config: {
        backupStepId: 'backup',
        assertions: [
          { type: 'file-exists', path: '{prodDir}' },
          { type: 'key-matches-cert' },
          { type: 'backup-contains' },
        ],
      },
      continueOnError: false,
      condition: 'always',
    },
    {
      id: 'reload',
      type: 'run-command',
      name: 'Post-deploy command',
      config: { command: '{reloadCommand}', args: [], shell: 'bash', timeoutMs: 60_000 },
      continueOnError: false,
      condition: 'on-success',
    },
  ];
}

export function ensureBuiltinPipelines(): void {
  const existing = db().prepare('SELECT id FROM pipelines WHERE id = ?').get(STAGING_PRESET_ID) as { id: string } | undefined;
  const now = nowIso();
  if (existing) return;
  db()
    .prepare(
      `INSERT INTO pipelines (id, name, description, steps, is_builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      STAGING_PRESET_ID,
      'Staging → backup → swap → verify → reload',
      'Built-in local deploy. Parameters (not literals): stagingDir, prodDir, backupRoot, reloadCommand. Example shape: staging C:\\windows\\temp\\staging, prod C:\\windows\\temp\\prod, backup C:\\windows\\temp\\backup\\{timestamp}.',
      JSON.stringify(builtinSteps()),
      now,
      now,
    );
}

function normaliseStep(raw: Partial<PipelineStep>, index: number): PipelineStep {
  return {
    id: raw.id || `step_${index + 1}`,
    type: raw.type as PipelineStep['type'],
    name: raw.name || raw.type || `Step ${index + 1}`,
    config: raw.config ?? {},
    continueOnError: Boolean(raw.continueOnError),
    condition: raw.condition || 'always',
  };
}

interface PipelineRow {
  id: string;
  name: string;
  description: string;
  steps: string;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

function mapPipeline(r: PipelineRow): Pipeline {
  const steps = parseJson<Partial<PipelineStep>[]>(r.steps, []).map(normaliseStep);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    steps,
    isBuiltin: !!r.is_builtin,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface RunRow {
  id: string;
  pipeline_id: string;
  renewal_id: string | null;
  certificate_id: string | null;
  host_id: string | null;
  state: PipelineRunState;
  steps: string;
  params: string;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function mapRun(r: RunRow): PipelineRun {
  const pipeline = getPipeline(r.pipeline_id);
  return {
    id: r.id,
    pipelineId: r.pipeline_id,
    pipelineName: pipeline?.name ?? r.pipeline_id,
    renewalId: r.renewal_id,
    certificateId: r.certificate_id,
    hostId: r.host_id,
    state: r.state,
    steps: parseJson(r.steps, []),
    params: parseJson(r.params, {}),
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    createdAt: r.created_at,
  };
}

export function listPipelines(): Pipeline[] {
  ensureBuiltinPipelines();
  return (db().prepare('SELECT * FROM pipelines ORDER BY name COLLATE NOCASE').all() as PipelineRow[]).map(mapPipeline);
}

export function getPipeline(id: string): Pipeline | null {
  ensureBuiltinPipelines();
  const row = db().prepare('SELECT * FROM pipelines WHERE id = ?').get(id) as PipelineRow | undefined;
  return row ? mapPipeline(row) : null;
}

export function createPipeline(input: { name?: string; description?: string; steps?: Partial<PipelineStep>[] }): Pipeline {
  const now = nowIso();
  const id = newId('pipe');
  const steps = (input.steps ?? []).map(normaliseStep);
  db()
    .prepare(
      `INSERT INTO pipelines (id, name, description, steps, is_builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(id, (input.name ?? '').trim() || 'Untitled pipeline', input.description ?? '', JSON.stringify(steps), now, now);
  writeAudit({ action: 'pipeline.create', entityType: 'pipeline', entityId: id, after: { name: input.name } });
  return getPipeline(id)!;
}

export function updatePipeline(
  id: string,
  input: { name?: string; description?: string; steps?: Partial<PipelineStep>[] },
): Pipeline | null {
  const existing = getPipeline(id);
  if (!existing) return null;
  if (existing.isBuiltin && input.steps) {
    throw new Error('Built-in preset steps cannot be rewritten. Clone the pipeline and edit the copy.');
  }
  db()
    .prepare(`UPDATE pipelines SET name = ?, description = ?, steps = ?, updated_at = ? WHERE id = ?`)
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      input.description ?? existing.description,
      JSON.stringify((input.steps ?? existing.steps).map(normaliseStep)),
      nowIso(),
      id,
    );
  writeAudit({ action: 'pipeline.update', entityType: 'pipeline', entityId: id });
  return getPipeline(id);
}

export function deletePipeline(id: string): boolean {
  const existing = getPipeline(id);
  if (!existing) return false;
  if (existing.isBuiltin) throw new Error('Cannot delete the built-in staging pipeline.');
  db().prepare('DELETE FROM pipelines WHERE id = ?').run(id);
  writeAudit({ action: 'pipeline.delete', entityType: 'pipeline', entityId: id, before: { name: existing.name } });
  return true;
}

export function listPipelineRuns(opts: { certificateId?: string; pipelineId?: string; limit?: number } = {}): PipelineRun[] {
  const limit = opts.limit ?? 200;
  if (opts.certificateId) {
    return (db().prepare('SELECT * FROM pipeline_runs WHERE certificate_id = ? ORDER BY created_at DESC LIMIT ?').all(opts.certificateId, limit) as RunRow[]).map(mapRun);
  }
  if (opts.pipelineId) {
    return (db().prepare('SELECT * FROM pipeline_runs WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT ?').all(opts.pipelineId, limit) as RunRow[]).map(mapRun);
  }
  return (db().prepare('SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?').all(limit) as RunRow[]).map(mapRun);
}

export function getPipelineRun(id: string): PipelineRun | null {
  const row = db().prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id) as RunRow | undefined;
  return row ? mapRun(row) : null;
}

function persistRun(run: PipelineRun): void {
  db()
    .prepare(
      `UPDATE pipeline_runs
       SET state = ?, steps = ?, params = ?, approved_by = ?, approved_at = ?, started_at = ?, finished_at = ?
       WHERE id = ?`,
    )
    .run(
      run.state,
      JSON.stringify(run.steps),
      JSON.stringify(run.params),
      run.approvedBy,
      run.approvedAt,
      run.startedAt,
      run.finishedAt,
      run.id,
    );
}

function pendingResult(step: PipelineStep): PipelineStepResult {
  return {
    stepId: step.id,
    type: step.type,
    name: step.name,
    state: 'pending',
    startedAt: null,
    finishedAt: null,
    stdout: '',
    stderr: '',
    error: null,
    outputs: {},
  };
}

async function restoreFromBackup(ctx: StepContext): Promise<string | null> {
  const backup = Object.values(ctx.prior).find((o) => typeof o.backupDir === 'string') as { backupDir?: string; files?: string[] } | undefined;
  const dest = String(ctx.params.prodDir || ctx.prior.swap?.destination || '');
  if (!backup?.backupDir || !dest) return null;
  const t = ctx.transport;
  let names: string[] = [];
  try {
    names = await t.readdir(backup.backupDir);
  } catch {
    return null;
  }
  await t.mkdir(dest);
  for (const name of names) {
    const from = t.join(backup.backupDir, name);
    try {
      const st = await t.stat(from);
      if (st.isFile) await t.copy(from, t.join(dest, name));
    } catch {
      /* skip unreadable backup entry */
    }
  }
  return `Restored ${names.length} file(s) from ${backup.backupDir} → ${dest}`;
}

export type RunPipelineInput = {
  pipelineId: string;
  certificateId?: string | null;
  hostId?: string | null;
  renewalId?: string | null;
  params?: Record<string, unknown>;
  dryRun?: boolean;
  /** Resume an existing run after approval. */
  resumeRunId?: string;
  actorUserId?: string | null;
};

export async function executePipeline(input: RunPipelineInput): Promise<PipelineRun> {
  let pipeline = getPipeline(input.pipelineId);
  if (!pipeline) throw new Error('Pipeline not found');
  if (input.certificateId && !getCertificate(input.certificateId)) throw new Error('Certificate not found');

  const incomingParams = input.params ?? {};
  if (incomingParams.requiresApproval && !pipeline.steps.some((s) => s.type === 'approval')) {
    const approval: PipelineStep = {
      id: 'approval',
      type: 'approval',
      name: 'Approval required',
      config: { message: 'Blueprint policy requires approval before this pipeline continues.' },
      continueOnError: false,
      condition: 'always',
    };
    pipeline = { ...pipeline, steps: [approval, ...pipeline.steps] };
  }

  const cert = input.certificateId ? getCertificate(input.certificateId) : null;
  const defaultParams: Record<string, unknown> = {
    stagingDir: path.join(config.stagingDir, 'staging'),
    prodDir: path.join(config.stagingDir, 'prod'),
    backupRoot: path.join(config.stagingDir, 'backup'),
    reloadCommand: '',
    cn: cert?.commonName ?? '',
    commonName: cert?.commonName ?? '',
    serial: cert?.serial ?? '',
  };

  let run: PipelineRun;
  if (input.resumeRunId) {
    const existing = getPipelineRun(input.resumeRunId);
    if (!existing) throw new Error('Pipeline run not found');
    run = existing;
    run.state = 'running';
    run.params = { ...defaultParams, ...existing.params, ...input.params };
    persistRun(run);
  } else {
    const now = nowIso();
    run = {
      id: newId('prun'),
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      renewalId: input.renewalId ?? null,
      certificateId: input.certificateId ?? null,
      hostId: input.hostId ?? null,
      state: 'running',
      steps: pipeline.steps.map(pendingResult),
      params: { ...defaultParams, ...input.params, dryRun: Boolean(input.dryRun) },
      approvedBy: null,
      approvedAt: null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
    };
    db()
      .prepare(
        `INSERT INTO pipeline_runs
          (id, pipeline_id, renewal_id, certificate_id, host_id, state, steps, params, approved_by, approved_at, started_at, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.pipelineId,
        run.renewalId,
        run.certificateId,
        run.hostId,
        run.state,
        JSON.stringify(run.steps),
        JSON.stringify(run.params),
        null,
        null,
        run.startedAt,
        null,
        run.createdAt,
      );
  }

  const dryRun = Boolean(run.params.dryRun);
  const resolved = await resolveTransport(run.hostId);
  const ctx: StepContext = {
    runId: run.id,
    certificateId: run.certificateId,
    hostId: run.hostId,
    renewalId: run.renewalId,
    params: run.params,
    prior: {},
    dryRun,
    transport: resolved.transport,
  };

  for (const result of run.steps) {
    if (result.state === 'succeeded' || result.state === 'skipped') {
      ctx.prior[result.stepId] = result.outputs;
    }
  }

  let hadFailure = run.steps.some((s) => s.state === 'failed');
  let verificationsPassed = !run.steps.some((s) => s.type === 'verify' && s.state === 'failed');
  let resumeArmed = !input.resumeRunId;

  const lockOwner = `pipe:${run.id}`;
  return withHostLock(run.hostId, lockOwner, async () => {
  try {
    if (!input.resumeRunId || run.steps.every((s) => s.state === 'pending' || s.state === 'running')) {
      const preflight = await runPipelinePreflight(ctx);
      run.params = { ...run.params, __preflight: preflight };
      persistRun(run);
      if (!preflight.ok) {
        const detail = preflight.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ');
        run.state = 'failed';
        run.finishedAt = nowIso();
        persistRun(run);
        emitNotification('pipeline.step_failed', {
          runId: run.id,
          stepId: 'preflight',
          type: 'preflight',
          error: detail,
          certificateId: run.certificateId,
        });
        return getPipelineRun(run.id)!;
      }
    }

    for (let i = 0; i < pipeline.steps.length; i += 1) {
      const def = pipeline.steps[i];
      const state = run.steps[i];

      if (!resumeArmed) {
        if (state.state === 'awaiting-approval' && run.params.__approved === true) {
          resumeArmed = true;
        } else if (state.state === 'succeeded' || state.state === 'skipped') {
          continue;
        } else {
          continue;
        }
      }

      if (state.state === 'succeeded' || state.state === 'skipped') continue;

      const cond = def.condition || 'always';
      if (cond === 'on-success' && hadFailure) {
        state.state = 'skipped';
        state.stdout = 'Skipped because a previous step failed.';
        persistRun(run);
        continue;
      }
      if (cond === 'on-failure' && !hadFailure) {
        state.state = 'skipped';
        state.stdout = 'Skipped because previous steps succeeded.';
        persistRun(run);
        continue;
      }

      if (def.type === 'run-command' && !verificationsPassed) {
        state.state = 'skipped';
        state.stdout = 'Blocked — a preceding verify step failed.';
        persistRun(run);
        continue;
      }

      if (UNIMPLEMENTED_STEP_TYPES.includes(def.type)) {
        throw new Error(
          `Step type "${def.type}" is an extension point and is not implemented yet. Remote execution needs a transport decision (WinRM/SSH vs installed agent).`,
        );
      }
      assertStepImplemented(def.type);
      const handler = getStepHandler(def.type);
      if (!handler) throw new Error(`Unknown step type: ${def.type}`);

      state.state = 'running';
      state.startedAt = nowIso();
      persistRun(run);

      try {
        const out = await handler.run(def, ctx);
        state.stdout = out.stdout ?? '';
        state.stderr = out.stderr ?? '';
        state.outputs = out.outputs ?? {};
        state.state = out.outputs?.skipped ? 'skipped' : 'succeeded';
        state.finishedAt = nowIso();
        ctx.prior[def.id] = state.outputs;
        writeAudit({
          actorUserId: input.actorUserId,
          actorType: input.actorUserId ? 'user' : 'scheduler',
          action: 'pipeline.step',
          entityType: 'pipeline_run',
          entityId: run.id,
          after: { stepId: def.id, type: def.type, state: state.state },
          commandTrail: state.stdout ? [state.stdout] : [],
        });
      } catch (error) {
        const err = error as Error & { code?: string; messageDetail?: string };
        if (err.code === 'AWAITING_APPROVAL' || err.message === 'AWAITING_APPROVAL') {
          state.state = 'awaiting-approval';
          state.error = err.messageDetail || 'Manual approval required before continuing.';
          state.finishedAt = nowIso();
          run.state = 'awaiting-approval';
          persistRun(run);
          emitNotification('approval.requested', {
            runId: run.id,
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            certificateId: run.certificateId,
            message: state.error,
          });
          return getPipelineRun(run.id)!;
        }

        state.state = 'failed';
        state.error = err.message;
        state.finishedAt = nowIso();
        hadFailure = true;
        if (def.type === 'verify') verificationsPassed = false;

        emitNotification('pipeline.step_failed', {
          runId: run.id,
          stepId: def.id,
          type: def.type,
          error: state.error,
          certificateId: run.certificateId,
        });
        writeAudit({
          actorType: 'scheduler',
          action: 'pipeline.step_failed',
          entityType: 'pipeline_run',
          entityId: run.id,
          after: { stepId: def.id, error: state.error },
        });

        if (!def.continueOnError) {
          if (def.type === 'verify' && !dryRun) {
            const restored = await restoreFromBackup(ctx);
            run.state = 'rolled-back';
            run.finishedAt = nowIso();
            if (restored) state.stdout = `${state.stdout}\n${restored}`.trim();
            persistRun(run);
            return getPipelineRun(run.id)!;
          }
          run.state = 'failed';
          run.finishedAt = nowIso();
          persistRun(run);
          return getPipelineRun(run.id)!;
        }
      }

      persistRun(run);
    }

    run.state = hadFailure ? 'failed' : 'succeeded';
    run.finishedAt = nowIso();
    persistRun(run);
    void import('./digest.js').then((m) => m.ensureDigestJob()).catch(() => undefined);
    return getPipelineRun(run.id)!;
  } catch (error) {
    run.state = 'failed';
    run.finishedAt = nowIso();
    persistRun(run);
    throw error;
  }
  });
}

export async function planPipeline(input: Omit<RunPipelineInput, 'dryRun' | 'resumeRunId'>): Promise<{
  run: PipelineRun;
  plan: string[];
}> {
  const run = await executePipeline({ ...input, dryRun: true });
  const plan = run.steps.map((s) => `${s.name} (${s.type}): ${s.stdout || s.error || s.state}`);
  return { run, plan };
}

export async function approvePipelineRun(
  runId: string,
  actor: { userId?: string | null; reject?: boolean },
): Promise<PipelineRun> {
  const run = getPipelineRun(runId);
  if (!run) throw new Error('Pipeline run not found');
  if (run.state !== 'awaiting-approval') throw new Error('Run is not awaiting approval.');
  if (actor.reject) {
    run.state = 'rejected';
    run.finishedAt = nowIso();
    run.approvedBy = actor.userId ?? 'unknown';
    run.approvedAt = nowIso();
    const waiting = run.steps.find((s) => s.state === 'awaiting-approval');
    if (waiting) {
      waiting.state = 'failed';
      waiting.error = 'Rejected';
      waiting.finishedAt = run.approvedAt;
    }
    persistRun(run);
    writeAudit({
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'pipeline.reject',
      entityType: 'pipeline_run',
      entityId: runId,
    });
    return getPipelineRun(runId)!;
  }
  run.approvedBy = actor.userId ?? 'unknown';
  run.approvedAt = nowIso();
  persistRun(run);
  writeAudit({
    actorUserId: actor.userId,
    actorType: 'user',
    action: 'pipeline.approve',
    entityType: 'pipeline_run',
    entityId: runId,
  });
  return executePipeline({
    pipelineId: run.pipelineId,
    certificateId: run.certificateId,
    hostId: run.hostId,
    renewalId: run.renewalId,
    params: {
      ...run.params,
      __approved: true,
      __approvedBy: run.approvedBy,
      __approvedAt: run.approvedAt,
    },
    resumeRunId: run.id,
    actorUserId: actor.userId,
  });
}

export function describeStepLibrary(): Array<{ type: string; implemented: boolean }> {
  const types = [
    'render-output',
    'copy',
    'backup',
    'swap',
    'verify',
    'run-command',
    'webhook',
    'approval',
    'remote-copy',
    'iis-rebind',
    'restart-service',
  ];
  return types.map((type) => ({ type, implemented: !UNIMPLEMENTED_STEP_TYPES.includes(type as never) }));
}
