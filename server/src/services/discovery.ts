import { db, newId, nowIso } from '../db.js';
import type { DiscoveryResult } from '../types.js';
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
 * Results are written to `discovery_results`. Scheduler job type is still deferred.
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

interface DiscoveryRow {
  id: string;
  scan_id: string;
  address: string;
  port: number;
  hostname: string;
  subject: string;
  issuer: string;
  not_after: string | null;
  fingerprint_sha256: string;
  matched_certificate_id: string | null;
  first_seen: string;
  last_seen: string;
}

function mapDiscovery(r: DiscoveryRow): DiscoveryResult {
  return {
    id: r.id,
    scanId: r.scan_id,
    address: r.address,
    port: r.port,
    hostname: r.hostname,
    subject: r.subject,
    issuer: r.issuer,
    notAfter: r.not_after,
    fingerprintSha256: r.fingerprint_sha256,
    matchedCertificateId: r.matched_certificate_id,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  };
}

export function persistDiscoveryHits(scanId: string, hits: DiscoveryHit[]): DiscoveryResult[] {
  const now = nowIso();
  const out: DiscoveryResult[] = [];
  const find = db().prepare(
    `SELECT * FROM discovery_results WHERE address = ? AND port = ? AND fingerprint_sha256 = ? ORDER BY last_seen DESC LIMIT 1`,
  );
  const insert = db().prepare(
    `INSERT INTO discovery_results
      (id, scan_id, address, port, hostname, subject, issuer, not_after, fingerprint_sha256, matched_certificate_id, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const touch = db().prepare(
    `UPDATE discovery_results SET scan_id = ?, hostname = ?, subject = ?, not_after = ?, matched_certificate_id = ?, last_seen = ? WHERE id = ?`,
  );
  for (const hit of hits) {
    const existing = find.get(hit.host, hit.port, hit.fingerprintSha256) as DiscoveryRow | undefined;
    if (existing) {
      touch.run(scanId, hit.host, hit.commonName, hit.notAfter ?? existing.not_after, hit.certificateId ?? existing.matched_certificate_id, now, existing.id);
      out.push(
        mapDiscovery({
          ...existing,
          scan_id: scanId,
          hostname: hit.host,
          subject: hit.commonName,
          not_after: hit.notAfter ?? existing.not_after,
          matched_certificate_id: hit.certificateId ?? existing.matched_certificate_id,
          last_seen: now,
        }),
      );
      continue;
    }
    const id = newId('dsc');
    insert.run(
      id,
      scanId,
      hit.host,
      hit.port,
      hit.host,
      hit.commonName,
      '',
      hit.notAfter ?? null,
      hit.fingerprintSha256,
      hit.certificateId ?? null,
      now,
      now,
    );
    out.push({
      id,
      scanId,
      address: hit.host,
      port: hit.port,
      hostname: hit.host,
      subject: hit.commonName,
      issuer: '',
      notAfter: hit.notAfter ?? null,
      fingerprintSha256: hit.fingerprintSha256,
      matchedCertificateId: hit.certificateId ?? null,
      firstSeen: now,
      lastSeen: now,
    });
  }
  return out;
}

export function listDiscoveryResults(scanId?: string): DiscoveryResult[] {
  const rows = scanId
    ? (db().prepare('SELECT * FROM discovery_results WHERE scan_id = ? ORDER BY last_seen DESC').all(scanId) as DiscoveryRow[])
    : (db().prepare('SELECT * FROM discovery_results ORDER BY last_seen DESC LIMIT 500').all() as DiscoveryRow[]);
  return rows.map(mapDiscovery);
}

export function latestDiscoveryScanId(): string | null {
  const row = db().prepare('SELECT scan_id FROM discovery_results ORDER BY last_seen DESC LIMIT 1').get() as { scan_id: string } | undefined;
  return row?.scan_id ?? null;
}
