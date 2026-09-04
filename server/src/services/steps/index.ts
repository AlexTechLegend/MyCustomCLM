import type { PipelineStepType } from '../../types.js';
import { approvalStep } from './approval.js';
import { backupStep } from './backup.js';
import { copyStep } from './copy.js';
import { iisRebindStep } from './iis-rebind.js';
import { remoteCopyStep } from './remote-copy.js';
import { renderOutputStep } from './render-output.js';
import { restartServiceStep } from './restart-service.js';
import { runCommandStep } from './run-command.js';
import { swapStep } from './swap.js';
import type { StepHandler } from './types.js';
import { verifyStep } from './verify.js';
import { webhookStep } from './webhook.js';

const handlers: StepHandler[] = [
  renderOutputStep,
  copyStep,
  backupStep,
  swapStep,
  verifyStep,
  runCommandStep,
  webhookStep,
  approvalStep,
  remoteCopyStep,
  iisRebindStep,
  restartServiceStep,
];

const byType = new Map(handlers.map((h) => [h.type, h]));

export function getStepHandler(type: PipelineStepType): StepHandler | null {
  return byType.get(type) ?? null;
}

/** Every PipelineStepType now has a handler. Kept as an empty list for callers. */
export const UNIMPLEMENTED_STEP_TYPES: PipelineStepType[] = [];

export function assertStepImplemented(type: PipelineStepType) {
  if (!byType.has(type)) throw new Error(`Unknown step type: ${type}`);
}

export { runPipelinePreflight } from './preflight.js';
export type { PreflightCheck, PreflightReport } from './preflight.js';
