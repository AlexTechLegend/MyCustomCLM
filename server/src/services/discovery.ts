import { listCertificates } from './certificates.js';
import { fingerprintsMatch, harvestTlsCertificate, normalizeFingerprint } from './tls-verify.js';

export const COMMON_TLS_PORTS = [443, 8443, 636, 993, 995, 465, 6443];

export type DiscoveryStatus = 'unknown' | 'known' | 'known-but-different';

export interface DiscoveryHit {
  host: string;
  port: number;
  fingerprintSha256: string;
  commonName: string;
  notAfter?: string;
  status: DiscoveryStatus;
  certificateId?: string;
  certificateName?: string;
  error?: string;
}

export interface DiscoveryScanInput {
  targets: string[];
  ports?: number[];
  concurrency?: number;
  delayMs?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const MAX_EXPANDED = 4096;

/** Expand IPv4 CIDRs and pass hostnames through. */
export function expandDiscoveryTargets(targets: string[], max = MAX_EXPANDED): string[] {
  const out: string[] = [];
  for (const raw of targets) {
    const t = raw.trim();
    if (!t) continue;
    if (t.includes('/')) {
      out.push(...expandCidr(t, max - out.length));
    } else {
      out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

export function expandCidr(cidr: string, remaining = MAX_EXPANDED): string[] {
  const [ip, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return [cidr];
  }
  const parts = ip.split('.').map(Number);
  if (parts.some((n) => n > 255)) return [cidr];
  const base = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  const network = (base & mask) >>> 0;
  const size = 2 ** (32 - bits);
  const start = bits >= 31 ? network : network + 1;
  const end = bits >= 31 ? network + size - 1 : network + size - 2;
  const hosts: string[] = [];
  for (let n = start; n <= end && hosts.length < remaining; n += 1) {
    hosts.push([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  return hosts;
}

/**
 * Scan targets, harvest served certificates, diff against the inventory.
 * Persistence is deferred until Task 8 adds `discovery_results`.
 * Scheduler wiring is also deferred (`JobType` has no `discovery`).
 */
export async function runDiscoveryScan(input: DiscoveryScanInput): Promise<DiscoveryHit[]> {
  const hosts = expandDiscoveryTargets(input.targets);
  const ports = input.ports?.length ? input.ports : COMMON_TLS_PORTS;
  const concurrency = Math.max(1, Math.min(32, input.concurrency ?? 8));
  const delayMs = Math.max(0, input.delayMs ?? 50);
  const timeoutMs = input.timeoutMs ?? 4_000;
  const inventory = listCertificates();
  const hits: DiscoveryHit[] = [];

  let cursor = 0;
  const work: Array<{ host: string; port: number }> = [];
  for (const host of hosts) for (const port of ports) work.push({ host, port });

  async function worker() {
    while (cursor < work.length) {
      if (input.signal?.aborted) return;
      const i = cursor;
      cursor += 1;
      const item = work[i];
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      try {
        const harvested = await harvestTlsCertificate({ host: item.host, port: item.port, timeoutMs });
        hits.push(classifyHit(item.host, item.port, harvested.fingerprint, harvested.commonName, inventory));
      } catch (err) {
        if (isRefused(err)) continue;
        hits.push({
          host: item.host,
          port: item.port,
          fingerprintSha256: '',
          commonName: '',
          status: 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, () => worker()));
  return hits.filter((h) => h.fingerprintSha256 || h.error);
}

function classifyHit(
  host: string,
  port: number,
  fingerprint: string,
  commonName: string,
  inventory: ReturnType<typeof listCertificates>,
): DiscoveryHit {
  const exact = inventory.find((c) => fingerprintsMatch(c.fingerprintSha256, fingerprint));
  if (exact) {
    return {
      host,
      port,
      fingerprintSha256: fingerprint,
      commonName,
      status: 'known',
      certificateId: exact.id,
      certificateName: exact.name,
    };
  }
  const sameName = inventory.find(
    (c) => c.commonName.toLowerCase() === commonName.toLowerCase() || c.sans.some((s) => s.toLowerCase().includes(commonName.toLowerCase())),
  );
  if (sameName) {
    return {
      host,
      port,
      fingerprintSha256: fingerprint,
      commonName,
      status: 'known-but-different',
      certificateId: sameName.id,
      certificateName: sameName.name,
    };
  }
  return { host, port, fingerprintSha256: fingerprint, commonName, status: 'unknown' };
}

function isRefused(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNRESET/i.test(msg);
}

void normalizeFingerprint;
