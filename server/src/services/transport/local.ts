import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExecOpts, ExecResult, Transport } from './types.js';

const MAX_CAPTURE = 64 * 1024;

function spawnCaptured(bin: string, args: string[], opts: ExecOpts): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (b: Buffer) => {
      stdout = (stdout + b.toString('utf8')).slice(0, MAX_CAPTURE);
    });
    child.stderr?.on('data', (b: Buffer) => {
      stderr = (stderr + b.toString('utf8')).slice(0, MAX_CAPTURE);
    });
    const timer = setTimeout(() => {
      killTree(child.pid);
      reject(new Error(`Command timed out after ${opts.timeoutMs ?? 60_000}ms`));
    }, opts.timeoutMs ?? 60_000);
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

export const localTransport: Transport = {
  kind: 'local',
  async writeFile(p, data, mode) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data, mode != null ? { mode } : undefined);
  },
  readFile: (p) => fs.readFile(p),
  async exists(p) {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: (p) => fs.mkdir(p, { recursive: true }).then(() => undefined),
  copy: (from, to) => fs.copyFile(from, to),
  rename: (from, to) => fs.rename(from, to),
  unlink: (p) => fs.unlink(p),
  readdir: (p) => fs.readdir(p),
  async stat(p) {
    const st = await fs.stat(p);
    return { isFile: st.isFile(), isDirectory: st.isDirectory(), size: st.size };
  },
  async exec(cmd, args, opts = {}) {
    return spawnCaptured(cmd, args, opts);
  },
  join: (...parts) => path.join(...parts),
  async ping() {
    /* local is always reachable */
  },
};

export { spawnCaptured };
