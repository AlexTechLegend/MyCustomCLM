import type { StepHandler } from './types.js';

/**
 * Pauses the pipeline run until POST /api/pipeline-runs/:id/approve (or /reject).
 * The engine sets run state to awaiting-approval and stops; resume continues after this step.
 */
export const approvalStep: StepHandler = {
  type: 'approval',
  async run(step, ctx) {
    if (ctx.dryRun) {
      return { outputs: { requiresApproval: true }, stdout: 'Would pause for approval' };
    }
    if (ctx.params.__approved === true) {
      return {
        outputs: { approved: true, approvedBy: ctx.params.__approvedBy, approvedAt: ctx.params.__approvedAt },
        stdout: `Approved by ${ctx.params.__approvedBy ?? 'unknown'}`,
      };
    }
    // Signal the engine to pause — thrown special error code.
    const err = new Error('AWAITING_APPROVAL') as Error & { code: string; messageDetail: string };
    err.code = 'AWAITING_APPROVAL';
    err.messageDetail = String(step.config.message || 'Manual approval required before continuing.');
    throw err;
  },
};
