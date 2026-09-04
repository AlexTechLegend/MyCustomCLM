import type { PipelineStep, PipelineStepResult, PipelineStepType } from '../../types.js';
import type { Transport } from '../transport/types.js';

export interface StepContext {
  runId: string;
  certificateId: string | null;
  hostId: string | null;
  renewalId: string | null;
  /** Blueprint / caller parameters (stagingDir, prodDir, backupRoot, …). */
  params: Record<string, unknown>;
  /** Outputs keyed by step id from earlier steps. */
  prior: Record<string, Record<string, unknown>>;
  dryRun: boolean;
  /** Filesystem + exec adapter for this host. Local by default. */
  transport: Transport;
}

export interface StepHandler {
  type: PipelineStepType;
  run(step: PipelineStep, ctx: StepContext): Promise<Partial<PipelineStepResult> & { outputs?: Record<string, unknown> }>;
}

export function resolvePathTemplate(template: string, ctx: StepContext, extras: Record<string, unknown> = {}): string {
  const bag: Record<string, unknown> = { ...ctx.params, ...extras };
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key: string) => {
    if (key.startsWith('steps.')) {
      const [, stepId, ...rest] = key.split('.');
      const out = ctx.prior[stepId];
      const val = rest.reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), out);
      return val == null ? '' : String(val);
    }
    const v = bag[key];
    return v == null ? '' : String(v);
  });
}
