import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

export const backupStep: StepHandler = {
  type: 'backup',
  async run(step, ctx) {
    const sourceDir = resolvePathTemplate(String(step.config.source || ctx.params.prodDir || ''), ctx);
    const backupRoot = resolvePathTemplate(String(step.config.backupRoot || ctx.params.backupRoot || ''), ctx);
    if (!sourceDir || !backupRoot) throw new Error('backup requires config.source (or params.prodDir) and config.backupRoot');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(backupRoot, stamp);

    if (ctx.dryRun) {
      return { outputs: { backupDir, files: [] }, stdout: `Would back up ${sourceDir} → ${backupDir}` };
    }

    await fs.mkdir(backupDir, { recursive: true });
    let entries: string[] = [];
    try {
      entries = await fs.readdir(sourceDir);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { outputs: { backupDir, files: [], empty: true }, stdout: `Source ${sourceDir} did not exist — empty backup created.` };
      }
      throw e;
    }
    const files: string[] = [];
    for (const name of entries) {
      const from = path.join(sourceDir, name);
      const to = path.join(backupDir, name);
      const st = await fs.stat(from);
      if (st.isFile()) {
        await fs.copyFile(from, to);
        files.push(name);
      }
    }
    return { outputs: { backupDir, files }, stdout: `Backed up ${files.length} file(s) to ${backupDir}` };
  },
};
