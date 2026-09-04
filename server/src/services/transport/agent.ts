import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ExecOpts, ExecResult, PathStat, Transport } from './types.js';

/**
 * Installed per-host agent transport (primary remote adapter).
 *
 * The agent binary is out of scope. This module is the server-side session:
 * enqueue a job, wait for a polled result, apply a per-job timeout.
 *
 * Wire format (JSON over HTTPS, bearer token = host agent credential):
 *
 *   GET  /agent/v1/poll
 *     Authorization: Bearer <token>
 *     → 204  no work
 *     → 200  { jobId, op, args, timeoutMs, createdAt }
 *
 *   POST /agent/v1/result
 *     Authorization: Bearer <token>
 *     { jobId, stdout, stderr, exitCode, error?, files?: [{ path, b64 }],
 *       stat?, exists?: boolean }
 *
 *   POST /agent/v1/stream  (optional chunked progress)
 *     { jobId, channel: "stdout"|"stderr", chunk: "<utf8>" }
 *
 * `op` is one of: writeFile | readFile | exists | mkdir | copy | rename |
 * unlink | readdir | stat | exec | ping.
 *
 * HTTP routes are owned by server-core (Task 8). Until they are mounted,
 * jobs sit in this in-memory queue so a test poller — or a future route —
 * can complete them. A misconfigured host that never polls times out
 * rather than silently falling through to the local filesystem.
 */

export const AGENT_WIRE_FORMAT = {
  version: 1,
  pollPath: '/agent/v1/poll',
  resultPath: '/agent/v1/result',
  streamPath: '/agent/v1/stream',
  auth: 'Authorization: Bearer <agent-token>',
  ops: [
    'writeFile',
    'readFile',
    'exists',
    'mkdir',
    'copy',
    'rename',
    'unlink',
    'readdir',
    'stat',
    'exec',
    'ping',
  ],
} as const;

export interface AgentJob {
  jobId: string;
  op: string;
  args: Record<string, unknown>;
  timeoutMs: number;
  createdAt: string;
}

export interface AgentResult {
  jobId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  files?: Array<{ path: string; b64: string }>;
  stat?: PathStat | null;
  exists?: boolean;
}

const pending = new Map<string, AgentJob>();
const results = new Map<string, AgentResult>();
const waiters = new EventEmitter();
waiters.setMaxListeners(200);

export function enqueueAgentJob(job: AgentJob): void {
  pending.set(job.jobId, job);
}

export function pollAgentJob(): AgentJob | null {
  const next = pending.values().next().value as AgentJob | undefined;
  if (!next) return null;
  pending.delete(next.jobId);
  return next;
}

export function completeAgentJob(result: AgentResult): void {
  results.set(result.jobId, result);
  waiters.emit(result.jobId, result);
}

async function waitForResult(jobId: string, timeoutMs: number): Promise<AgentResult> {
  const existing = results.get(jobId);
  if (existing) {
    results.delete(jobId);
    return existing;
  }
  return new Promise<AgentResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.off(jobId, onResult);
      reject(new Error(`Agent job ${jobId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const onResult = (result: AgentResult) => {
      clearTimeout(timer);
      results.delete(jobId);
      resolve(result);
    };
    waiters.once(jobId, onResult);
  });
}

export interface AgentTransportOptions {
  hostId: string;
  tokenHint?: string;
  timeoutMs?: number;
}

export class AgentTransport implements Transport {
  readonly kind = 'agent' as const;
  readonly hostId: string;
  private readonly timeoutMs: number;

  constructor(opts: AgentTransportOptions) {
    this.hostId = opts.hostId;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  private async dispatch(op: string, args: Record<string, unknown>): Promise<AgentResult> {
    const jobId = randomUUID();
    enqueueAgentJob({
      jobId,
      op,
      args,
      timeoutMs: this.timeoutMs,
      createdAt: new Date().toISOString(),
    });
    return waitForResult(jobId, this.timeoutMs);
  }

  private ensureOk(result: AgentResult, op: string): void {
    if (result.error) throw new Error(`agent ${op}: ${result.error}`);
    if (result.exitCode !== 0) {
      throw new Error(`agent ${op} exited ${result.exitCode}: ${result.stderr || result.stdout}`);
    }
  }

  async writeFile(path: string, data: Buffer, mode?: number): Promise<void> {
    const result = await this.dispatch('writeFile', {
      path,
      b64: data.toString('base64'),
      mode: mode ?? null,
    });
    this.ensureOk(result, 'writeFile');
  }

  async readFile(path: string): Promise<Buffer> {
    const result = await this.dispatch('readFile', { path });
    this.ensureOk(result, 'readFile');
    const file = result.files?.[0];
    if (!file?.b64) throw new Error(`agent readFile: no payload for ${path}`);
    return Buffer.from(file.b64, 'base64');
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.dispatch('exists', { path });
    if (result.error) throw new Error(`agent exists: ${result.error}`);
    return Boolean(result.exists);
  }

  async mkdir(path: string): Promise<void> {
    const result = await this.dispatch('mkdir', { path });
    this.ensureOk(result, 'mkdir');
  }

  async copy(from: string, to: string): Promise<void> {
    const result = await this.dispatch('copy', { from, to });
    this.ensureOk(result, 'copy');
  }

  async rename(from: string, to: string): Promise<void> {
    const result = await this.dispatch('rename', { from, to });
    this.ensureOk(result, 'rename');
  }

  async unlink(path: string): Promise<void> {
    const result = await this.dispatch('unlink', { path });
    this.ensureOk(result, 'unlink');
  }

  async readdir(path: string): Promise<string[]> {
    const result = await this.dispatch('readdir', { path });
    this.ensureOk(result, 'readdir');
    const listing = result.stdout.trim();
    return listing ? listing.split('\n') : [];
  }

  async stat(path: string): Promise<PathStat> {
    const result = await this.dispatch('stat', { path });
    this.ensureOk(result, 'stat');
    if (!result.stat) throw new Error(`agent stat: no metadata for ${path}`);
    return result.stat;
  }

  join(...parts: string[]): string {
    return parts
      .filter((p) => p.length > 0)
      .join('/')
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/');
  }

  async ping(): Promise<void> {
    const result = await this.dispatch('ping', {});
    this.ensureOk(result, 'ping');
  }

  async exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
    const result = await this.dispatch('exec', {
      cmd,
      args,
      cwd: opts.cwd ?? null,
      env: opts.env ?? {},
      timeoutMs: opts.timeoutMs ?? this.timeoutMs,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.exitCode,
    };
  }
}

export function agentJobFingerprint(job: AgentJob): string {
  return createHash('sha256').update(JSON.stringify({ op: job.op, args: job.args })).digest('hex');
}
