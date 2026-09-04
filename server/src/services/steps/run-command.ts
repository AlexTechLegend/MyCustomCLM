import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';
import { revealCredentialSecret } from '../credentials.js';

/**
 * Spawn with an argument array — never a concatenated shell string.
 * Shell selection only picks the interpreter binary; args remain an array.
 * Execution goes through the host Transport so the same step is local or remote.
 */
export const runCommandStep: StepHandler = {
  type: 'run-command',
  async run(step, ctx) {
    const shell = String(step.config.shell || 'bash') as 'powershell' | 'cmd' | 'bash';
    const command = resolvePathTemplate(String(step.config.command || ''), ctx);
    const args = ((step.config.args as string[]) ?? []).map((a) => resolvePathTemplate(String(a), ctx));
    const cwd = step.config.cwd ? resolvePathTemplate(String(step.config.cwd), ctx) : undefined;
    const timeoutMs = Math.min(600_000, Math.max(1_000, Number(step.config.timeoutMs) || 60_000));
    const expectedExit = step.config.expectedExitCode === undefined ? 0 : Number(step.config.expectedExitCode);

    if (!command.trim()) {
      return { outputs: { skipped: true }, stdout: 'Skipped — no command configured.' };
    }

    if (ctx.dryRun) {
      return {
        outputs: { command, args, cwd },
        stdout: `Would run: ${command} ${args.join(' ')}`,
      };
    }

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    if (step.config.credentialId) {
      const secret = revealCredentialSecret(String(step.config.credentialId));
      if (secret) {
        env.VIGIL_CRED_USERNAME = secret.username;
        env.VIGIL_CRED_SECRET = secret.secret;
      }
    }

    let bin = command;
    let binArgs = args;
    if (shell === 'powershell') {
      bin = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
      binArgs = ['-NoProfile', '-NonInteractive', '-Command', command, ...args];
    } else if (shell === 'cmd') {
      bin = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      binArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : ['-lc', [command, ...args].join(' ')];
    }

    const result = await ctx.transport.exec(bin, binArgs, { cwd, env, timeoutMs });
    if (result.code !== expectedExit) {
      throw new Error(`Command exited ${result.code}, expected ${expectedExit}. stderr: ${result.stderr.slice(0, 400)}`);
    }
    return {
      outputs: { exitCode: result.code },
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};
