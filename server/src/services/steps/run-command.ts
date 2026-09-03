import { spawn } from 'node:child_process';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';
import { revealCredentialSecret } from '../credentials.js';

const MAX_CAPTURE = 64 * 1024;

/**
 * Spawn with an argument array — never a concatenated shell string.
 * Shell selection only picks the interpreter binary; args remain an array.
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

    // Optional credential — exposed only as env VIGIL_CRED_* for the child, never argv.
    const env = { ...process.env };
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

    const result = await spawnCaptured(bin, binArgs, { cwd, env, timeoutMs });
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

function spawnCaptured(
  bin: string,
  args: string[],
  opts: { cwd?: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const onChunk = (buf: Buffer, which: 'out' | 'err') => {
      const s = buf.toString('utf8');
      if (which === 'out') {
        stdout = (stdout + s).slice(0, MAX_CAPTURE);
      } else {
        stderr = (stderr + s).slice(0, MAX_CAPTURE);
      }
    };
    child.stdout?.on('data', (b) => onChunk(b, 'out'));
    child.stderr?.on('data', (b) => onChunk(b, 'err'));

    const timer = setTimeout(() => {
      killTree(child.pid);
      reject(new Error(`Command timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}
