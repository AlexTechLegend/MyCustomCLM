import type { PipelineStepType } from '../../types.js';
import { approvalStep } from './approval.js';
import { backupStep } from './backup.js';
import { copyStep } from './copy.js';
import { renderOutputStep } from './render-output.js';
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
];

const byType = new Map(handlers.map((h) => [h.type, h]));

export function getStepHandler(type: PipelineStepType): StepHandler | null {
  return byType.get(type) ?? null;
}

/**
 * Extension points — not implemented in this task (transport undecided: WinRM/SSH vs agent).
 * remote-copy, iis-rebind, restart-service
 */
export const UNIMPLEMENTED_STEP_TYPES: PipelineStepType[] = ['remote-copy', 'iis-rebind', 'restart-service'];

export function assertStepImplemented(type: PipelineStepType) {
  if (UNIMPLEMENTED_STEP_TYPES.includes(type)) {
    throw new Error(
      `Step type "${type}" is an extension point and is not implemented yet. ` +
        `Remote execution needs a transport decision (WinRM/SSH vs installed agent) before it can ship.`,
    );
  }
  if (!byType.has(type)) throw new Error(`Unknown step type: ${type}`);
}
