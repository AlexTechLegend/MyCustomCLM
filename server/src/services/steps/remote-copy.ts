import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

/**
 * Push files from a local path (typically render-output staging) onto the
 * host via Transport. Destination directories are created as needed.
 */
export const remoteCopyStep: StepHandler = {
  type: 'remote-copy',
  async run(step, ctx) {
    const source = resolvePathTemplate(String(step.config.source || ctx.params.stagingDir || ''), ctx);
    const destDir = resolvePathTemplate(String(step.config.destination || ctx.params.prodDir || ''), ctx);
    if (!source || !destDir) throw new Error('remote-copy requires config.source and config.destination');

    const t = ctx.transport;
    if (ctx.dryRun) {
      return { outputs: { destination: destDir, files: [source] }, stdout: `Would remote-copy ${source} → ${destDir}` };
    }

    await t.mkdir(destDir);
    const copied: string[] = [];
    const st = await fs.stat(source);
    if (st.isDirectory()) {
      for (const name of await fs.readdir(source)) {
        const from = path.join(source, name);
        const fileStat = await fs.stat(from);
        if (!fileStat.isFile()) continue;
        const to = t.join(destDir, name);
        await t.writeFile(to, await fs.readFile(from));
        copied.push(to);
      }
    } else {
      const to = t.join(destDir, path.basename(source));
      await t.writeFile(to, await fs.readFile(source));
      copied.push(to);
    }
    return { outputs: { destination: destDir, files: copied }, stdout: `Remote-copied ${copied.length} file(s) to ${destDir}` };
  },
};
