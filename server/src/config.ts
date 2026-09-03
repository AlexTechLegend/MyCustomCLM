import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src or server/dist → repo root
const repoRoot = path.resolve(here, '..', '..');

const dataDir = process.env.VIGIL_DATA_DIR
  ? path.resolve(process.env.VIGIL_DATA_DIR)
  : path.join(repoRoot, 'data');

/**
 * Candidate OpenSSL binaries, most preferred first. The plain `openssl` on PATH is tried
 * last on macOS because the system binary there is LibreSSL, which lacks several OpenSSL 3
 * options Vigil relies on (-legacy, -copy_extensions).
 */
function opensslCandidates(): string[] {
  const c: string[] = [];
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] ?? '';
    c.push(
      'openssl',
      path.join(pf, 'OpenSSL-Win64', 'bin', 'openssl.exe'),
      path.join(pf, 'OpenSSL', 'bin', 'openssl.exe'),
      path.join(pf86, 'OpenSSL-Win32', 'bin', 'openssl.exe'),
      path.join(pf, 'Git', 'usr', 'bin', 'openssl.exe'),
      path.join(pf, 'Git', 'mingw64', 'bin', 'openssl.exe'),
      path.join(local, 'Programs', 'Git', 'usr', 'bin', 'openssl.exe'),
      'C:\\msys64\\usr\\bin\\openssl.exe',
      'C:\\Strawberry\\c\\bin\\openssl.exe',
    );
  } else if (process.platform === 'darwin') {
    c.push('/opt/homebrew/opt/openssl@3/bin/openssl', '/usr/local/opt/openssl@3/bin/openssl', '/opt/homebrew/bin/openssl', '/usr/local/bin/openssl', '/opt/local/bin/openssl', 'openssl');
  } else {
    c.push('openssl', '/usr/bin/openssl', '/usr/local/bin/openssl');
  }
  return c;
}

export function probeOpenssl(bin: string): string | null {
  try {
    const r = spawnSync(bin, ['version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (r.status === 0 && r.stdout) return r.stdout.trim();
  } catch {
    /* not runnable */
  }
  return null;
}

function resolveOpensslBin(): { bin: string; version: string | null } {
  if (process.env.OPENSSL_BIN) return { bin: process.env.OPENSSL_BIN, version: probeOpenssl(process.env.OPENSSL_BIN) };
  let fallback: { bin: string; version: string } | null = null;
  for (const bin of opensslCandidates()) {
    const v = probeOpenssl(bin);
    if (!v) continue;
    if (/^OpenSSL 3/.test(v)) return { bin, version: v };
    fallback ??= { bin, version: v };
  }
  return fallback ?? { bin: 'openssl', version: null };
}

const openssl = resolveOpensslBin();

/** Master key for AES-256-GCM credential encryption. Never persisted. */
export function secretKeyMaterial(): Buffer | null {
  const raw = process.env.VIGIL_SECRET_KEY?.trim();
  if (!raw) return null;
  // Accept 64-hex (32 bytes) or any passphrase (hashed via SHA-256).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return createHash('sha256').update(raw).digest();
}

export function requireSecretKey(): Buffer {
  const key = secretKeyMaterial();
  if (!key) {
    throw new Error(
      'VIGIL_SECRET_KEY is not set. Credential encryption refuses to run without it. Set a 64-char hex key or a strong passphrase in the environment (never store it in the database).',
    );
  }
  return key;
}

export const config = {
  port: Number(process.env.PORT ?? 4180),
  repoRoot,
  dataDir,
  dbPath: path.join(dataDir, 'vigil.sqlite'),
  vaultDir: path.join(dataDir, 'vault'),
  renewalsDir: path.join(dataDir, 'renewals'),
  caDir: path.join(dataDir, 'ca'),
  tmpDir: path.join(dataDir, 'tmp'),
  stagingDir: path.join(dataDir, 'staging'),
  webDist: path.join(repoRoot, 'web', 'dist'),
  opensslBin: openssl.bin,
  opensslVersion: openssl.version,
  /** Tick every N ms. Default 45s. */
  schedulerIntervalMs: Math.max(15_000, Number(process.env.VIGIL_SCHEDULER_INTERVAL_MS ?? 45_000) || 45_000),
  /** Max jobs claimed per tick. */
  schedulerBatchSize: Math.max(1, Number(process.env.VIGIL_SCHEDULER_BATCH ?? 3) || 3),
  schedulerEnabled: process.env.VIGIL_SCHEDULER !== '0',
  authEnabled: process.env.VIGIL_AUTH === '1',
  leaseSeconds: Math.max(30, Number(process.env.VIGIL_JOB_LEASE_SECONDS ?? 120) || 120),
};

export function ensureDirs() {
  for (const d of [config.dataDir, config.vaultDir, config.renewalsDir, config.caDir, config.tmpDir, config.stagingDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/** Human-readable preflight. Returns null when everything is fine. */
export function preflightProblems(): string[] {
  const problems: string[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    problems.push(`Node ${process.versions.node} is too old. Vigil needs Node 20 LTS or newer. Install it from https://nodejs.org, re-open your terminal, then run  npm install  again.`);
  }
  if (!config.opensslVersion) {
    const hint =
      process.platform === 'win32'
        ? 'Install it with  winget install ShiningLight.OpenSSL.Light  (or use the one bundled with Git for Windows), then re-open your terminal. You can also point Vigil at it with  set OPENSSL_BIN=C:\\path\\to\\openssl.exe'
        : process.platform === 'darwin'
          ? 'Install it with  brew install openssl@3  and re-run. You can also set OPENSSL_BIN=/opt/homebrew/opt/openssl@3/bin/openssl'
          : 'Install it with your package manager (apt install openssl / dnf install openssl) or set OPENSSL_BIN to the binary path.';
    problems.push(`OpenSSL was not found (tried "${config.opensslBin}"). ${hint}`);
  } else if (!/^OpenSSL 3/.test(config.opensslVersion)) {
    problems.push(`Found "${config.opensslVersion}" at "${config.opensslBin}" but Vigil needs OpenSSL 3.x (LibreSSL and OpenSSL 1.1 lack -legacy and -copy_extensions). Install OpenSSL 3 and/or set OPENSSL_BIN to it.`);
  }
  return problems;
}
