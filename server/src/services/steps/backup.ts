import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

export const backupStep: StepHandler = {
  type: 'backup',
  async run(step, ctx) {
    const sourceDir = resolvePathTemplate(String(step.config.source || ctx.params.prodDir || ''), ctx);
    const backupRoot = resolvePathTemplate(String(step.config.backupRoot || ctx.params.backupRoot || ''), ctx);
    if (!sourceDir || !backupRoot) throw new Error('backup requires config.source (or params.prodDir) and config.backupRoot');

    const t = ctx.transport;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = t.join(backupRoot, stamp);

    if (ctx.dryRun) {
      return { outputs: { backupDir, files: [] }, stdout: `Would back up ${sourceDir} → ${backupDir}` };
    }

    await t.mkdir(backupDir);
    let entries: string[] = [];
    try {
      entries = await t.readdir(sourceDir);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT' || /ENOENT|did not exist|no such file/i.test(String(err.message))) {
        return { outputs: { backupDir, files: [], empty: true }, stdout: `Source ${sourceDir} did not exist — empty backup created.` };
      }
      throw e;
    }
    const files: string[] = [];
    for (const name of entries) {
      const from = t.join(sourceDir, name);
      const to = t.join(backupDir, name);
      const st = await t.stat(from);
      if (st.isFile) {
        await t.copy(from, to);
        files.push(name);
      }
    }
    return { outputs: { backupDir, files }, stdout: `Backed up ${files.length} file(s) to ${backupDir}` };
  },
};
