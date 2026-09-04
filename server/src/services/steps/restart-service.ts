import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

/**
 * Restart a Windows service (Restart-Service) or a systemd unit
 * (systemctl restart). Driven through Transport.exec.
 */
export const restartServiceStep: StepHandler = {
  type: 'restart-service',
  async run(step, ctx) {
    const name = resolvePathTemplate(String(step.config.service || step.config.name || ''), ctx);
    if (!name) throw new Error('restart-service requires config.service');
    const platform = String(step.config.platform || ctx.params.platform || 'windows');

    if (ctx.dryRun) {
      return { outputs: { service: name }, stdout: `Would restart ${name} (${platform})` };
    }

    const timeoutMs = Math.min(600_000, Number(step.config.timeoutMs) || 60_000);
    if (platform === 'linux' || platform === 'systemd') {
      const result = await ctx.transport.exec('systemctl', ['restart', name], { timeoutMs });
      if (result.code !== 0) throw new Error(`systemctl restart ${name} exited ${result.code}: ${result.stderr}`);
      return { outputs: { service: name, exitCode: result.code }, stdout: result.stdout, stderr: result.stderr };
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const result = await ctx.transport.exec(
      shell,
      ['-NoProfile', '-NonInteractive', '-Command', 'Restart-Service', '-Name', name, '-Force'],
      { timeoutMs },
    );
    if (result.code !== 0) throw new Error(`Restart-Service ${name} exited ${result.code}: ${result.stderr || result.stdout}`);
    return { outputs: { service: name, exitCode: result.code }, stdout: result.stdout, stderr: result.stderr };
  },
};
