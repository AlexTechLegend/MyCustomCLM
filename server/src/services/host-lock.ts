import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

interface Lease {
  owner: string;
  expiresAt: string;
}

function lockPath(hostId: string): string {
  return path.join(config.dataDir, 'locks', `host-${safe(hostId)}.json`);
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function ensureLockDir(): void {
  fs.mkdirSync(path.join(config.dataDir, 'locks'), { recursive: true });
}

function readLease(file: string): Lease | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Lease;
    if (!raw?.owner || !raw?.expiresAt) return null;
    return raw;
  } catch {
    return null;
  }
}

export function acquireHostLock(hostId: string, owner: string, ttlSeconds = config.leaseSeconds): boolean {
  ensureLockDir();
  const file = lockPath(hostId);
  const now = Date.now();
  const existing = fs.existsSync(file) ? readLease(file) : null;
  if (existing && new Date(existing.expiresAt).getTime() > now && existing.owner !== owner) {
    return false;
  }
  const lease: Lease = { owner, expiresAt: new Date(now + ttlSeconds * 1000).toISOString() };
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lease), { mode: 0o600 });
  try {
    fs.renameSync(tmp, file);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    const raced = readLease(file);
    if (raced && raced.owner !== owner && new Date(raced.expiresAt).getTime() > Date.now()) return false;
    fs.writeFileSync(file, JSON.stringify(lease), { mode: 0o600 });
  }
  const confirm = readLease(file);
  return !!confirm && confirm.owner === owner;
}

export function releaseHostLock(hostId: string, owner: string): void {
  const file = lockPath(hostId);
  const lease = fs.existsSync(file) ? readLease(file) : null;
  if (!lease || lease.owner !== owner) return;
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
}

export function refreshHostLock(hostId: string, owner: string, ttlSeconds = config.leaseSeconds): boolean {
  const file = lockPath(hostId);
  const lease = fs.existsSync(file) ? readLease(file) : null;
  if (!lease || lease.owner !== owner) return false;
  fs.writeFileSync(file, JSON.stringify({ owner, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() }), {
    mode: 0o600,
  });
  return true;
}

/**
 * Serialise work against one host. A dead holder expires after `leaseSeconds`
 * (same clock the job queue uses). No hostId → no lock.
 */
export async function withHostLock<T>(hostId: string | null | undefined, owner: string, fn: () => Promise<T>): Promise<T> {
  if (!hostId) return fn();
  const deadline = Date.now() + config.leaseSeconds * 1000;
  while (!acquireHostLock(hostId, owner)) {
    if (Date.now() >= deadline) {
      throw new Error(`Host ${hostId} is locked by another pipeline; retry when the lease expires.`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  try {
    return await fn();
  } finally {
    releaseHostLock(hostId, owner);
  }
}
