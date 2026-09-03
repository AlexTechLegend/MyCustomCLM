import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

export const copyStep: StepHandler = {
  type: 'copy',
  async run(step, ctx) {
    const source = resolvePathTemplate(String(step.config.source || ''), ctx);
    const destDir = resolvePathTemplate(String(step.config.destination || ''), ctx);
    if (!source || !destDir) throw new Error('copy requires config.source and config.destination');

    const copied: string[] = [];
    if (ctx.dryRun) {
      return { outputs: { destination: destDir, files: [source] }, stdout: `Would copy ${source} → ${destDir}` };
    }

    await fs.mkdir(destDir, { recursive: true });
    const st = await fs.stat(source);
    if (st.isDirectory()) {
      const entries = await fs.readdir(source);
      for (const name of entries) {
        const from = path.join(source, name);
        const to = path.join(destDir, name);
        await fs.copyFile(from, to);
        copied.push(to);
      }
    } else {
      const to = path.join(destDir, path.basename(source));
      await fs.copyFile(source, to);
      copied.push(to);
    }
    return { outputs: { destination: destDir, files: copied }, stdout: `Copied ${copied.length} file(s) to ${destDir}` };
  },
};
