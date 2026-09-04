import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

/**
 * Write each staging file to a sibling temp name in the destination directory,
 * then rename over the live file (atomic on the same volume).
 *
 * Staging from render-output stays on the Vigil server. Destination writes
 * go through Transport so the same swap works for a remote host.
 */
export const swapStep: StepHandler = {
  type: 'swap',
  async run(step, ctx) {
    const stagingDir = resolvePathTemplate(
      String(step.config.stagingDir || `{steps.${step.config.renderStepId || 'render'}.stagingDir}`),
      ctx,
    );
    const fromPrior = step.config.renderStepId ? ctx.prior[String(step.config.renderStepId)]?.stagingDir : undefined;
    const sourceDir = String(fromPrior || stagingDir || ctx.params.stagingDir || '');
    const destDir = resolvePathTemplate(String(step.config.destination || ctx.params.prodDir || ''), ctx);
    if (!sourceDir || !destDir) throw new Error('swap requires staging source and destination (params.prodDir)');

    const t = ctx.transport;
    if (ctx.dryRun) {
      return { outputs: { destination: destDir, swapped: [] }, stdout: `Would swap ${sourceDir} → ${destDir}` };
    }

    await t.mkdir(destDir);
    const localNames = await listLocalFiles(sourceDir);
    const swapped: string[] = [];

    if (localNames) {
      for (const name of localNames) {
        const from = path.join(sourceDir, name);
        const live = t.join(destDir, name);
        const tmp = t.join(destDir, `.${name}.swap-${process.pid}`);
        const buf = await fs.readFile(from);
        await t.writeFile(tmp, buf);
        await t.rename(tmp, live);
        swapped.push(live);
      }
    } else {
      const entries = await t.readdir(sourceDir);
      for (const name of entries) {
        const from = t.join(sourceDir, name);
        const st = await t.stat(from);
        if (!st.isFile) continue;
        const live = t.join(destDir, name);
        const tmp = t.join(destDir, `.${name}.swap-${process.pid}`);
        await t.copy(from, tmp);
        await t.rename(tmp, live);
        swapped.push(live);
      }
    }
    return { outputs: { destination: destDir, swapped }, stdout: `Swapped ${swapped.length} file(s) into ${destDir}` };
  },
};

async function listLocalFiles(dir: string): Promise<string[] | null> {
  try {
    const entries = await fs.readdir(dir);
    const files: string[] = [];
    for (const name of entries) {
      const st = await fs.stat(path.join(dir, name));
      if (st.isFile()) files.push(name);
    }
    return files;
  } catch {
    return null;
  }
}
