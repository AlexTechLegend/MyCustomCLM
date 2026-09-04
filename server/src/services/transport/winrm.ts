import { spawnCaptured } from './local.js';
import type { ExecOpts, ExecResult, PathStat, Transport } from './types.js';

/**
 * WinRM adapter. Uses `pwsh`/`powershell` locally to invoke a remote
 * session (`Invoke-Command -ComputerName`). Secrets travel as env vars
 * (`VIGIL_WINRM_*`), never argv. Fallback when an agent is not installed.
 */
export interface WinRmOptions {
  hostname: string;
  username?: string;
  secret?: string;
  timeoutMs?: number;
}

export class WinRmTransport implements Transport {
  readonly kind = 'winrm' as const;
  private readonly hostname: string;
  private readonly username?: string;
  private readonly secret?: string;
  private readonly timeoutMs: number;

  constructor(opts: WinRmOptions) {
    this.hostname = opts.hostname;
    this.username = opts.username;
    this.secret = opts.secret;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  private remoteEnv(): Record<string, string> {
    const env: Record<string, string> = { VIGIL_WINRM_HOST: this.hostname };
    if (this.username) env.VIGIL_WINRM_USERNAME = this.username;
    if (this.secret) env.VIGIL_WINRM_SECRET = this.secret;
    return env;
  }

  private async remote(script: string, extraEnv?: Record<string, string>): Promise<ExecResult> {
    const wrapped = `
$ErrorActionPreference = 'Stop'
$hostName = $env:VIGIL_WINRM_HOST
$sec = $null
if ($env:VIGIL_WINRM_SECRET) {
  $sec = ConvertTo-SecureString $env:VIGIL_WINRM_SECRET -AsPlainText -Force
}
$cred = $null
if ($env:VIGIL_WINRM_USERNAME -and $sec) {
  $cred = New-Object System.Management.Automation.PSCredential($env:VIGIL_WINRM_USERNAME, $sec)
}
$script = { ${script} }
if ($cred) {
  Invoke-Command -ComputerName $hostName -Credential $cred -ScriptBlock $script
} else {
  Invoke-Command -ComputerName $hostName -ScriptBlock $script
}
`.trim();
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    return spawnCaptured(shell, ['-NoProfile', '-NonInteractive', '-Command', wrapped], {
      timeoutMs: this.timeoutMs,
      env: { ...this.remoteEnv(), ...(extraEnv ?? {}) },
    });
  }

  private ensureOk(result: ExecResult, op: string): void {
    if (result.code !== 0) {
      throw new Error(`winrm ${op} failed (${result.code}): ${result.stderr || result.stdout}`);
    }
  }

  async writeFile(path: string, data: Buffer, mode?: number): Promise<void> {
    void mode;
    const result = await this.remote(
      `Set-Content -Path $env:VIGIL_WINRM_PATH -Value ([Convert]::FromBase64String($env:VIGIL_WINRM_B64)) -Encoding Byte`,
      { VIGIL_WINRM_B64: data.toString('base64'), VIGIL_WINRM_PATH: path },
    );
    this.ensureOk(result, 'writeFile');
  }

  async readFile(path: string): Promise<Buffer> {
    const result = await this.remote(
      `[Convert]::ToBase64String([IO.File]::ReadAllBytes($env:VIGIL_WINRM_PATH))`,
      { VIGIL_WINRM_PATH: path },
    );
    this.ensureOk(result, 'readFile');
    return Buffer.from(result.stdout.trim(), 'base64');
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.remote(`if (Test-Path -LiteralPath $env:VIGIL_WINRM_PATH) { '1' } else { '0' }`, {
      VIGIL_WINRM_PATH: path,
    });
    this.ensureOk(result, 'exists');
    return result.stdout.trim() === '1';
  }

  async mkdir(path: string): Promise<void> {
    const result = await this.remote(`New-Item -ItemType Directory -Force -Path $env:VIGIL_WINRM_PATH | Out-Null`, {
      VIGIL_WINRM_PATH: path,
    });
    this.ensureOk(result, 'mkdir');
  }

  async copy(from: string, to: string): Promise<void> {
    const result = await this.remote(`Copy-Item -LiteralPath $env:VIGIL_WINRM_FROM -Destination $env:VIGIL_WINRM_TO -Force`, {
      VIGIL_WINRM_FROM: from,
      VIGIL_WINRM_TO: to,
    });
    this.ensureOk(result, 'copy');
  }

  async rename(from: string, to: string): Promise<void> {
    const result = await this.remote(`Move-Item -LiteralPath $env:VIGIL_WINRM_FROM -Destination $env:VIGIL_WINRM_TO -Force`, {
      VIGIL_WINRM_FROM: from,
      VIGIL_WINRM_TO: to,
    });
    this.ensureOk(result, 'rename');
  }

  async unlink(path: string): Promise<void> {
    const result = await this.remote(`Remove-Item -LiteralPath $env:VIGIL_WINRM_PATH -Force`, { VIGIL_WINRM_PATH: path });
    this.ensureOk(result, 'unlink');
  }

  async readdir(path: string): Promise<string[]> {
    const result = await this.remote(`(Get-ChildItem -LiteralPath $env:VIGIL_WINRM_PATH -Name) -join "\`n"`, {
      VIGIL_WINRM_PATH: path,
    });
    this.ensureOk(result, 'readdir');
    return result.stdout.trim() ? result.stdout.trim().split('\n') : [];
  }

  async stat(path: string): Promise<PathStat> {
    const result = await this.remote(
      `if (-not (Test-Path -LiteralPath $env:VIGIL_WINRM_PATH)) { throw 'ENOENT' }; $i = Get-Item -LiteralPath $env:VIGIL_WINRM_PATH; "$($i.Length)|$([int](-not $i.PSIsContainer))|$([int]$i.PSIsContainer)"`,
      { VIGIL_WINRM_PATH: path },
    );
    this.ensureOk(result, 'stat');
    const [size, file, dir] = result.stdout.trim().split('|');
    return { size: Number(size), isFile: file === '1', isDirectory: dir === '1' };
  }

  join(...parts: string[]): string {
    return parts.filter(Boolean).join('\\').replace(/\\{2,}/g, '\\');
  }

  async ping(): Promise<void> {
    const result = await this.remote(`'pong'`);
    this.ensureOk(result, 'ping');
    if (!result.stdout.includes('pong')) throw new Error('winrm ping: unexpected response');
  }

  async exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
    const quoted = [cmd, ...args].map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
    return this.remote(`& @(${quoted})`, opts.env);
  }
}
