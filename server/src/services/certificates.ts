import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { db, newId, nowIso, parseJson } from '../db.js';
import {
  loadMaterial,
  newLog,
  parseCertificate,
  renderOutput,
  type CommandLog,
  type Material,
  type ParsedCert,
  type RenderMaterial,
  type UploadedFile,
} from '../openssl.js';
import type { Certificate, CertSource, CertStatus, OutputFormat, OutputSpec } from '../types.js';
import { recordEvent } from './events.js';
import { getSettings } from './settings.js';

export interface CertRow {
  id: string;
  name: string;
  subject: string;
  common_name: string;
  issuer: string;
  issuer_common_name: string;
  serial: string;
  not_before: string;
  not_after: string;
  sans: string;
  key_algo: string;
  key_bits: number | null;
  sig_algo: string;
  fingerprint_sha256: string;
  has_key: number;
  chain_count: number;
  source: CertSource;
  tags: string;
  notes: string;
  profile_ids: string;
  renewal_count: number;
  created_at: string;
  updated_at: string;
}

export function statusFor(notAfter: string, notBefore?: string): { status: CertStatus; daysRemaining: number; lifetimeUsed: number } {
  const s = getSettings();
  const now = Date.now();
  const end = new Date(notAfter).getTime();
  const start = notBefore ? new Date(notBefore).getTime() : end - 365 * 86400000;
  const daysRemaining = Math.ceil((end - now) / 86400000);
  const lifetimeUsed = end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1;
  let status: CertStatus = 'healthy';
  if (daysRemaining < 0) status = 'expired';
  else if (daysRemaining <= s.criticalThresholdDays) status = 'critical';
  else if (daysRemaining <= s.expiringThresholdDays) status = 'expiring';
  return { status, daysRemaining, lifetimeUsed };
}

export function mapCert(r: CertRow): Certificate {
  const st = statusFor(r.not_after, r.not_before);
  return {
    id: r.id,
    name: r.name,
    subject: r.subject,
    commonName: r.common_name,
    issuer: r.issuer,
    issuerCommonName: r.issuer_common_name,
    serial: r.serial,
    notBefore: r.not_before,
    notAfter: r.not_after,
    sans: parseJson<string[]>(r.sans, []),
    keyAlgo: r.key_algo,
    keyBits: r.key_bits,
    sigAlgo: r.sig_algo,
    fingerprintSha256: r.fingerprint_sha256,
    hasKey: !!r.has_key,
    chainCount: r.chain_count,
    source: r.source,
    tags: parseJson<string[]>(r.tags, []),
    notes: r.notes,
    profileIds: parseJson<string[]>(r.profile_ids, []),
    renewalCount: r.renewal_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...st,
  };
}

export interface ListQuery {
  q?: string;
  status?: string;
  source?: string;
  profileId?: string;
  sort?: 'expiry' | 'name' | 'issuer' | 'updated';
  dir?: 'asc' | 'desc';
}

export function listCertificates(query: ListQuery = {}): Certificate[] {
  const rows = db().prepare('SELECT * FROM certificates').all() as CertRow[];
  let certs = rows.map(mapCert);
  if (query.q) {
    const q = query.q.toLowerCase();
    certs = certs.filter((c) =>
      [c.name, c.commonName, c.subject, c.issuer, c.serial, c.fingerprintSha256, ...c.sans, ...c.tags].some((v) => v.toLowerCase().includes(q)),
    );
  }
  if (query.status && query.status !== 'all') certs = certs.filter((c) => c.status === query.status);
  if (query.source && query.source !== 'all') certs = certs.filter((c) => c.source === query.source);
  if (query.profileId) certs = certs.filter((c) => c.profileIds.includes(query.profileId!));
  const dir = query.dir === 'desc' ? -1 : 1;
  const sort = query.sort ?? 'expiry';
  certs.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name) * dir;
      case 'issuer':
        return a.issuerCommonName.localeCompare(b.issuerCommonName) * dir;
      case 'updated':
        return a.updatedAt.localeCompare(b.updatedAt) * dir;
      default:
        return a.notAfter.localeCompare(b.notAfter) * dir;
    }
  });
  return certs;
}

export function getCertificate(id: string): Certificate | null {
  const row = db().prepare('SELECT * FROM certificates WHERE id = ?').get(id) as CertRow | undefined;
  return row ? mapCert(row) : null;
}

export function vaultPaths(id: string) {
  const dir = path.join(config.vaultDir, id);
  return { dir, cert: path.join(dir, 'cert.pem'), chain: path.join(dir, 'chain.pem'), key: path.join(dir, 'key.pem') };
}

export async function readVault(id: string): Promise<RenderMaterial & { chainPems: string[] }> {
  const p = vaultPaths(id);
  const certPem = await fs.readFile(p.cert, 'utf8');
  let chainPems: string[] = [];
  try {
    const chain = await fs.readFile(p.chain, 'utf8');
    chainPems = chain.split(/(?<=-----END CERTIFICATE-----\n)/).filter((s) => s.trim());
  } catch {
    chainPems = [];
  }
  let keyPem: string | null = null;
  try {
    keyPem = await fs.readFile(p.key, 'utf8');
  } catch {
    keyPem = null;
  }
  return { certPem, chainPems, keyPem };
}

export async function writeVault(id: string, m: Material) {
  const p = vaultPaths(id);
  await fs.mkdir(p.dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(p.cert, m.leaf.pem);
  await fs.writeFile(p.chain, m.chain.map((c) => c.pem).join(''));
  if (m.keyPem) await fs.writeFile(p.key, m.keyPem, { mode: 0o600 });
  else await fs.rm(p.key, { force: true });
}

function rowFromMaterial(id: string, m: Material, extra: Partial<CertRow>): CertRow {
  const now = nowIso();
  const l = m.leaf;
  return {
    id,
    name: extra.name || l.commonName || l.subject,
    subject: l.subject,
    common_name: l.commonName,
    issuer: l.issuer,
    issuer_common_name: l.issuerCommonName,
    serial: l.serial,
    not_before: l.notBefore,
    not_after: l.notAfter,
    sans: JSON.stringify(l.sans),
    key_algo: l.keyAlgo,
    key_bits: l.keyBits,
    sig_algo: l.sigAlgo,
    fingerprint_sha256: l.fingerprintSha256,
    has_key: m.keyPem ? 1 : 0,
    chain_count: m.chain.length,
    source: extra.source ?? 'imported',
    tags: extra.tags ?? '[]',
    notes: extra.notes ?? '',
    profile_ids: extra.profile_ids ?? '[]',
    renewal_count: extra.renewal_count ?? 0,
    created_at: extra.created_at ?? now,
    updated_at: now,
  };
}

const INSERT_SQL = `INSERT INTO certificates (id, name, subject, common_name, issuer, issuer_common_name, serial, not_before, not_after, sans, key_algo, key_bits, sig_algo,
  fingerprint_sha256, has_key, chain_count, source, tags, notes, profile_ids, renewal_count, created_at, updated_at)
  VALUES (@id, @name, @subject, @common_name, @issuer, @issuer_common_name, @serial, @not_before, @not_after, @sans, @key_algo, @key_bits, @sig_algo,
  @fingerprint_sha256, @has_key, @chain_count, @source, @tags, @notes, @profile_ids, @renewal_count, @created_at, @updated_at)`;

export async function insertCertificate(
  m: Material,
  opts: { name?: string; tags?: string[]; notes?: string; profileIds?: string[]; source?: CertSource; createdAt?: string },
): Promise<Certificate> {
  const id = newId('crt');
  await writeVault(id, m);
  const row = rowFromMaterial(id, m, {
    name: opts.name,
    tags: JSON.stringify(opts.tags ?? []),
    notes: opts.notes ?? '',
    profile_ids: JSON.stringify(opts.profileIds ?? []),
    source: opts.source ?? 'imported',
    created_at: opts.createdAt,
  });
  db().prepare(INSERT_SQL).run(row);
  return mapCert(row);
}

export async function importCertificate(
  files: UploadedFile[],
  opts: { password?: string; keyPassword?: string; name?: string; tags?: string[]; notes?: string; profileIds?: string[] },
): Promise<{ certificate: Certificate; commands: string[] }> {
  const log = newLog();
  const material = await loadMaterial(files, { password: opts.password, keyPassword: opts.keyPassword, log });
  const dup = db().prepare('SELECT id, name FROM certificates WHERE fingerprint_sha256 = ?').get(material.leaf.fingerprintSha256) as { id: string; name: string } | undefined;
  if (dup) throw new Error(`This certificate is already in Vigil as "${dup.name}".`);
  const cert = await insertCertificate(material, { ...opts, source: 'imported' });
  const s = getSettings();
  recordEvent({
    type: 'import',
    certificateId: cert.id,
    certificateName: cert.name,
    title: `Imported ${cert.name}`,
    detail: `${files.map((f) => f.originalname).join(', ')} → canonical PEM${material.keyPem ? ' with private key' : ''}, ${material.chain.length} chain certificate${material.chain.length === 1 ? '' : 's'}`,
    commands: log.commands,
    minutesSaved: s.baselines.import,
  });
  return { certificate: cert, commands: log.commands };
}

export function updateCertificate(id: string, patch: { name?: string; tags?: string[]; notes?: string; profileIds?: string[] }): Certificate | null {
  const existing = getCertificate(id);
  if (!existing) return null;
  db()
    .prepare('UPDATE certificates SET name = ?, tags = ?, notes = ?, profile_ids = ?, updated_at = ? WHERE id = ?')
    .run(
      patch.name?.trim() || existing.name,
      JSON.stringify(patch.tags ?? existing.tags),
      patch.notes ?? existing.notes,
      JSON.stringify(patch.profileIds ?? existing.profileIds),
      nowIso(),
      id,
    );
  return getCertificate(id);
}

export async function replaceCertificateMaterial(id: string, m: Material, source: CertSource): Promise<Certificate | null> {
  const existing = db().prepare('SELECT * FROM certificates WHERE id = ?').get(id) as CertRow | undefined;
  if (!existing) return null;
  await writeVault(id, m);
  const row = rowFromMaterial(id, m, {
    ...existing,
    source,
    renewal_count: existing.renewal_count + 1,
    created_at: existing.created_at,
  });
  db()
    .prepare(
      `UPDATE certificates SET subject=@subject, common_name=@common_name, issuer=@issuer, issuer_common_name=@issuer_common_name, serial=@serial,
       not_before=@not_before, not_after=@not_after, sans=@sans, key_algo=@key_algo, key_bits=@key_bits, sig_algo=@sig_algo,
       fingerprint_sha256=@fingerprint_sha256, has_key=@has_key, chain_count=@chain_count, source=@source, renewal_count=@renewal_count, updated_at=@updated_at
       WHERE id=@id`,
    )
    .run(row);
  return getCertificate(id);
}

export async function deleteCertificate(id: string): Promise<boolean> {
  const res = db().prepare('DELETE FROM certificates WHERE id = ?').run(id);
  await fs.rm(vaultPaths(id).dir, { recursive: true, force: true });
  return res.changes > 0;
}

export async function chainDetails(id: string): Promise<ParsedCert[]> {
  const m = await readVault(id);
  return Promise.all(m.chainPems.map((p) => parseCertificate(p)));
}

export async function adhocDownload(
  id: string,
  format: OutputFormat,
  opts: { password?: string; includeRoot?: boolean; keyEncoding?: 'pkcs8' | 'pkcs1' | 'sec1'; lineEnding?: 'lf' | 'crlf' },
  log?: CommandLog,
): Promise<{ buffer: Buffer; filename: string }> {
  const cert = getCertificate(id);
  if (!cert) throw new Error('Certificate not found');
  const m = await readVault(id);
  const spec: OutputSpec = {
    id: 'adhoc',
    label: format,
    filename: '',
    format,
    lineEnding: opts.lineEnding ?? 'lf',
    includeRoot: opts.includeRoot ?? false,
    keyEncoding: opts.keyEncoding ?? 'pkcs8',
    password: opts.password ?? '',
    friendlyName: '{cn}',
    legacyPkcs12: false,
    trailingNewline: true,
    detected: null,
  };
  const buffer = await renderOutput(spec, m, { cn: cert.commonName, serial: cert.serial, profile: 'adhoc', date: new Date() }, log);
  const base = cert.commonName.replace(/^\*\./, 'wildcard.').replace(/[^A-Za-z0-9._-]+/g, '_');
  const ext: Record<OutputFormat, string> = {
    'pem-cert': '.pem',
    'pem-fullchain': '.fullchain.pem',
    'pem-chain': '.chain.pem',
    'pem-bundle': '.bundle.pem',
    'der-cert': '.cer',
    pkcs12: '.pfx',
    'pkcs7-pem': '.p7b',
    'pkcs7-der': '.p7b',
    'pem-key': '.key',
    'pem-key-encrypted': '.enc.key',
    'der-key': '.key.der',
  };
  return { buffer, filename: base + ext[format] };
}
