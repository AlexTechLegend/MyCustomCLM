import { spawnCaptured } from './local.js';
import type { ExecOpts, ExecResult, PathStat, Transport } from './types.js';

/**
 * SSH adapter via the system `ssh` binary. Identity material is passed as
 * `-i`; passwords are never placed on argv.
 */
export interface SshOptions {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  timeoutMs?: number;
}

export class SshTransport implements Transport {
  readonly kind = 'ssh' as const;
  private readonly hostname: string;
  private readonly username?: string;
  private readonly port: number;
  private readonly identityFile?: string;
  private readonly timeoutMs: number;

  constructor(opts: SshOptions) {
    this.hostname = opts.hostname;
    this.username = opts.username;
    this.port = opts.port ?? 22;
    this.identityFile = opts.identityFile;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  private target(): string {
    return this.username ? `${this.username}@${this.hostname}` : this.hostname;
  }

  private sshArgs(remoteCmd: string): string[] {
    const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-p', String(this.port)];
    if (this.identityFile) args.push('-i', this.identityFile);
    args.push(this.target(), remoteCmd);
    return args;
  }

  private async ssh(remoteCmd: string, opts?: ExecOpts): Promise<ExecResult> {
    return spawnCaptured('ssh', this.sshArgs(remoteCmd), {
      timeoutMs: opts?.timeoutMs ?? this.timeoutMs,
      env: opts?.env,
      cwd: opts?.cwd,
    });
  }

  private ensureOk(result: ExecResult, op: string): void {
    if (result.code !== 0) {
      throw new Error(`ssh ${op} failed (${result.code}): ${result.stderr || result.stdout}`);
    }
  }

  async writeFile(path: string, data: Buffer, _mode?: number): Promise<void> {
    const b64 = data.toString('base64');
    const result = await this.ssh(
      `mkdir -p "$(dirname -- ${shellQuote(path)})" && printf '%s' ${shellQuote(b64)} | base64 -d > ${shellQuote(path)}`,
    );
    this.ensureOk(result, 'writeFile');
  }

  async readFile(path: string): Promise<Buffer> {
    const result = await this.ssh(`base64 ${shellQuote(path)}`);
    this.ensureOk(result, 'readFile');
    return Buffer.from(result.stdout.replace(/\s+/g, ''), 'base64');
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.ssh(`test -e ${shellQuote(path)} && echo 1 || echo 0`);
    this.ensureOk(result, 'exists');
    return result.stdout.trim() === '1';
  }

  async mkdir(path: string): Promise<void> {
    const result = await this.ssh(`mkdir -p ${shellQuote(path)}`);
    this.ensureOk(result, 'mkdir');
  }

  async copy(from: string, to: string): Promise<void> {
    const result = await this.ssh(`cp -a ${shellQuote(from)} ${shellQuote(to)}`);
    this.ensureOk(result, 'copy');
  }

  async rename(from: string, to: string): Promise<void> {
    const result = await this.ssh(`mv ${shellQuote(from)} ${shellQuote(to)}`);
    this.ensureOk(result, 'rename');
  }

  async unlink(path: string): Promise<void> {
    const result = await this.ssh(`rm -f ${shellQuote(path)}`);
    this.ensureOk(result, 'unlink');
  }

  async readdir(path: string): Promise<string[]> {
    const result = await this.ssh(`ls -1 ${shellQuote(path)}`);
    this.ensureOk(result, 'readdir');
    return result.stdout.trim() ? result.stdout.trim().split('\n') : [];
  }

  async stat(path: string): Promise<PathStat> {
    const result = await this.ssh(
      `if [ ! -e ${shellQuote(path)} ]; then echo ENOENT; exit 2; fi; if [ -d ${shellQuote(path)} ]; then echo "0 0 1"; else wc -c < ${shellQuote(path)} | awk '{print $1" 1 0"}'; fi`,
    );
    this.ensureOk(result, 'stat');
    const [size, file, dir] = result.stdout.trim().split(/\s+/);
    return { size: Number(size), isFile: file === '1', isDirectory: dir === '1' };
  }

  join(...parts: string[]): string {
    return parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/');
  }

  async ping(): Promise<void> {
    const result = await this.ssh('echo pong');
    this.ensureOk(result, 'ping');
    if (!result.stdout.includes('pong')) throw new Error('ssh ping: unexpected response');
  }

  async exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
    const remote = [cmd, ...args].map(shellQuote).join(' ');
    return this.ssh(remote, opts);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
