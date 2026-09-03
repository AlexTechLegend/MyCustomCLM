import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

/**
 * Write each staging file to a sibling temp name in the destination directory,
 * then rename over the live file (atomic on the same volume).
 */
export const swapStep: StepHandler = {
  type: 'swap',
  async run(step, ctx) {
    const stagingDir = resolvePathTemplate(
      String(step.config.stagingDir || `{steps.${step.config.renderStepId || 'render'}.stagingDir}`),
      ctx,
    );
    // Prefer prior render step outputs when present.
    const fromPrior = step.config.renderStepId ? ctx.prior[String(step.config.renderStepId)]?.stagingDir : undefined;
    const sourceDir = String(fromPrior || stagingDir || ctx.params.stagingDir || '');
    const destDir = resolvePathTemplate(String(step.config.destination || ctx.params.prodDir || ''), ctx);
    if (!sourceDir || !destDir) throw new Error('swap requires staging source and destination (params.prodDir)');

    if (ctx.dryRun) {
      return { outputs: { destination: destDir, swapped: [] }, stdout: `Would swap ${sourceDir} → ${destDir}` };
    }

    await fs.mkdir(destDir, { recursive: true });
    const entries = await fs.readdir(sourceDir);
    const swapped: string[] = [];
    for (const name of entries) {
      const from = path.join(sourceDir, name);
      const st = await fs.stat(from);
      if (!st.isFile()) continue;
      const live = path.join(destDir, name);
      const tmp = path.join(destDir, `.${name}.swap-${process.pid}`);
      await fs.copyFile(from, tmp);
      await fs.rename(tmp, live);
      swapped.push(live);
    }
    return { outputs: { destination: destDir, swapped }, stdout: `Swapped ${swapped.length} file(s) into ${destDir}` };
  },
};
