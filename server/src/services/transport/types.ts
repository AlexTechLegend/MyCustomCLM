export type TransportKind = 'local' | 'agent' | 'winrm' | 'ssh';

export interface ExecOpts {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  expectedExit?: number;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface PathStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
}

/**
 * Filesystem + process operations used by every deploy step.
 * `local` wraps the previous direct-fs behaviour so existing pipelines stay identical.
 */
export interface Transport {
  kind: TransportKind;
  writeFile(path: string, data: Buffer, mode?: number): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<PathStat>;
  exec(cmd: string, args: string[], opts?: ExecOpts): Promise<ExecResult>;
  join(...parts: string[]): string;
  /** Cheap liveness check used by preflight. Throws when the host does not answer. */
  ping(): Promise<void>;
}
