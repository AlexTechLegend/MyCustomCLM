import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

export const copyStep: StepHandler = {
  type: 'copy',
  async run(step, ctx) {
    const source = resolvePathTemplate(String(step.config.source || ''), ctx);
    const destDir = resolvePathTemplate(String(step.config.destination || ''), ctx);
    if (!source || !destDir) throw new Error('copy requires config.source and config.destination');

    const t = ctx.transport;
    const copied: string[] = [];
    if (ctx.dryRun) {
      return { outputs: { destination: destDir, files: [source] }, stdout: `Would copy ${source} → ${destDir}` };
    }

    await t.mkdir(destDir);
    const st = await t.stat(source);
    if (st.isDirectory) {
      const entries = await t.readdir(source);
      for (const name of entries) {
        const from = t.join(source, name);
        const to = t.join(destDir, name);
        await t.copy(from, to);
        copied.push(to);
      }
    } else {
      const to = t.join(destDir, basename(source));
      await t.copy(source, to);
      copied.push(to);
    }
    return { outputs: { destination: destDir, files: copied }, stdout: `Copied ${copied.length} file(s) to ${destDir}` };
  },
};

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}
