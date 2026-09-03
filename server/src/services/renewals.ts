import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { db, newId, nowIso, parseJson } from '../db.js';
import {
  createCsr,
  generateKey,
  keyMatchesCert,
  loadMaterial,
  newLog,
  parseCertificate,
  readCaCert,
  renderDestinationPath,
  renderFilename,
  renderOutput,
  selfSign,
  signWithCa,
  type CommandLog,
  type Material,
  type ParsedCert,
  type UploadedFile,
} from '../openssl.js';
import type { Certificate, KeyMode, Profile, Renewal, RenewalMethod, RenewalOutput, RenewalStatus } from '../types.js';
import { getCertificate, readVault, replaceCertificateMaterial } from './certificates.js';
import { recordEvent } from './events.js';
import { getProfile } from './profiles.js';
import { getSettings } from './settings.js';

interface RenewalRow {
  id: string;
  certificate_id: string;
  method: RenewalMethod;
  status: RenewalStatus;
  key_mode: KeyMode;
  validity_days: number;
  csr_pem: string | null;
  previous_not_after: string | null;
  new_not_after: string | null;
  profile_ids: string;
  deploy: number;
  outputs: string;
  commands: string;
  minutes_saved: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

function mapRow(r: RenewalRow, certName?: string): Renewal {
  return {
    id: r.id,
    certificateId: r.certificate_id,
    certificateName: certName ?? getCertificate(r.certificate_id)?.name ?? '',
    method: r.method,
    status: r.status,
    keyMode: r.key_mode,
    validityDays: r.validity_days,
    csrPem: r.csr_pem,
    previousNotAfter: r.previous_not_after,
    newNotAfter: r.new_not_after,
    profileIds: parseJson<string[]>(r.profile_ids, []),
    deploy: !!r.deploy,
    outputs: parseJson<RenewalOutput[]>(r.outputs, []),
    commands: parseJson<string[]>(r.commands, []),
    minutesSaved: r.minutes_saved,
    error: r.error,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export function getRenewal(id: string): Renewal | null {
  const row = db().prepare('SELECT * FROM renewals WHERE id = ?').get(id) as RenewalRow | undefined;
  return row ? mapRow(row) : null;
}

export function listRenewals(certificateId?: string, limit = 100): Renewal[] {
  const rows = certificateId
    ? (db().prepare('SELECT * FROM renewals WHERE certificate_id = ? ORDER BY created_at DESC LIMIT ?').all(certificateId, limit) as RenewalRow[])
    : (db().prepare('SELECT * FROM renewals ORDER BY created_at DESC LIMIT ?').all(limit) as RenewalRow[]);
  return rows.map((r) => mapRow(r));
}

export interface StartRenewalInput {
  method: RenewalMethod;
  keyMode: KeyMode;
  validityDays: number;
  profileIds: string[];
  deploy: boolean;
}

function renewalDir(id: string) {
  return path.join(config.renewalsDir, id);
}

export async function startRenewal(certId: string, input: StartRenewalInput): Promise<Renewal> {
  const cert = getCertificate(certId);
  if (!cert) throw new Error('Certificate not found');
  const vault = await readVault(certId);
  const log = newLog();
  const settings = getSettings();
  const validityDays = Math.min(3650, Math.max(1, Math.round(input.validityDays || settings.defaultValidityDays)));

  let keyPem: string;
  if (input.keyMode === 'reuse') {
    if (!vault.keyPem) throw new Error('This certificate has no private key in the vault, so the key cannot be reused. Choose a new key.');
    keyPem = vault.keyPem;
  } else {
    keyPem = await generateKey(input.keyMode, log);
  }

  const parsedLeaf = await parseCertificate(vault.certPem);
  const csrPem = await createCsr(keyPem, parsedLeaf.subjectComponents, parsedLeaf.sans, log);

  const id = newId('rnw');
  const now = nowIso();
  const row: RenewalRow = {
    id,
    certificate_id: certId,
    method: input.method,
    status: 'pending-csr',
    key_mode: input.keyMode,
    validity_days: validityDays,
    csr_pem: csrPem,
    previous_not_after: cert.notAfter,
    new_not_after: null,
    profile_ids: JSON.stringify(input.profileIds ?? []),
    deploy: input.deploy ? 1 : 0,
    outputs: '[]',
    commands: JSON.stringify(log.commands),
    minutes_saved: 0,
    error: null,
    created_at: now,
    completed_at: null,
  };
  db()
    .prepare(
      `INSERT INTO renewals (id, certificate_id, method, status, key_mode, validity_days, csr_pem, previous_not_after, new_not_after, profile_ids, deploy, outputs, commands, minutes_saved, error, created_at, completed_at)
       VALUES (@id, @certificate_id, @method, @status, @key_mode, @validity_days, @csr_pem, @previous_not_after, @new_not_after, @profile_ids, @deploy, @outputs, @commands, @minutes_saved, @error, @created_at, @completed_at)`,
    )
    .run(row);

  await fs.mkdir(renewalDir(id), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(renewalDir(id), 'pending.key'), keyPem, { mode: 0o600 });

  if (input.method === 'csr') {
    recordEvent({
      type: 'csr',
      certificateId: certId,
      certificateName: cert.name,
      renewalId: id,
      title: `Generated CSR for ${cert.name}`,
      detail: `${input.keyMode === 'reuse' ? 'Existing key reused' : 'New ' + input.keyMode.toUpperCase().replace('-', ' ') + ' key'}; ${parsedLeaf.sans.length} SAN${parsedLeaf.sans.length === 1 ? '' : 's'} carried over`,
      commands: log.commands,
      minutesSaved: settings.baselines.csr,
    });
    return getRenewal(id)!;
  }

  try {
    let leafPem: string;
    let chainPems: string[] = [];
    if (input.method === 'internal-ca') {
      leafPem = await signWithCa(csrPem, { days: validityDays }, log);
      const ca = await readCaCert();
      if (ca) chainPems = [ca];
    } else {
      leafPem = await selfSign(csrPem, keyPem, validityDays, log);
    }
    return await finaliseRenewal(id, leafPem, chainPems, keyPem, log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db().prepare('UPDATE renewals SET status = ?, error = ?, commands = ?, completed_at = ? WHERE id = ?').run('failed', msg, JSON.stringify(log.commands), nowIso(), id);
    throw err;
  }
}

export async function completeCsrRenewal(renewalId: string, files: UploadedFile[]): Promise<Renewal> {
  const renewal = getRenewal(renewalId);
  if (!renewal) throw new Error('Renewal not found');
  if (renewal.status !== 'pending-csr') throw new Error('This renewal is not waiting for a signed certificate.');
  const log = newLog();
  log.commands.push(...renewal.commands);
  const keyPem = await fs.readFile(path.join(renewalDir(renewalId), 'pending.key'), 'utf8');
  try {
    const material = await loadMaterial([...files, { originalname: 'pending.key', buffer: Buffer.from(keyPem) }], { log });
    let chainPems = material.chain.map((c) => c.pem);
    if (chainPems.length === 0) {
      // No chain supplied — reuse the previous chain if it still issues the new leaf.
      const old = await readVault(renewal.certificateId);
      if (old.chainPems.length) {
        const first = await parseCertificate(old.chainPems[0]);
        if (material.leaf.x509.checkIssued(first.x509)) chainPems = old.chainPems;
      }
    }
    return await finaliseRenewal(renewalId, material.leaf.pem, chainPems, keyPem, log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db().prepare('UPDATE renewals SET error = ? WHERE id = ?').run(msg, renewalId);
    throw err;
  }
}

async function finaliseRenewal(renewalId: string, leafPem: string, chainPems: string[], keyPem: string, log: CommandLog): Promise<Renewal> {
  const renewal = getRenewal(renewalId)!;
  const cert = getCertificate(renewal.certificateId)!;
  const settings = getSettings();

  if (!keyMatchesCert(leafPem, keyPem)) throw new Error('The issued certificate does not match the renewal key.');
  const leaf = await parseCertificate(leafPem, log);
  const chain: ParsedCert[] = await Promise.all(chainPems.map((p) => parseCertificate(p)));
  const material: Material = { leaf, chain, keyPem };

  const source = renewal.method === 'internal-ca' ? 'internal-ca' : renewal.method === 'self-signed' ? 'self-signed' : 'external-ca';
  const updated = (await replaceCertificateMaterial(cert.id, material, source)) as Certificate;

  const profiles = renewal.profileIds.map((id) => getProfile(id)).filter((p): p is Profile => !!p);
  const outputs: RenewalOutput[] = [];
  const dir = renewalDir(renewalId);
  const tokens = { cn: leaf.commonName, serial: leaf.serial, date: new Date(), profile: '' };
  const renderMaterial = { certPem: leaf.pem, chainPems, keyPem };
  const deployedDestinations = new Set<string>();
  const failures: string[] = [];

  for (const profile of profiles) {
    const slug = profile.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const stageDir = path.join(dir, slug);
    await fs.mkdir(stageDir, { recursive: true, mode: 0o700 });
    for (const spec of profile.outputs) {
      const filename = renderFilename(spec.filename, { ...tokens, profile: profile.name });
      const out: RenewalOutput = {
        index: outputs.length,
        profileId: profile.id,
        profileName: profile.name,
        specId: spec.id,
        label: spec.label,
        filename,
        format: spec.format,
        size: 0,
        stagedPath: path.join(stageDir, filename),
        deployedTo: null,
        deployStatus: 'skipped',
        deployError: null,
      };
      try {
        const buf = await renderOutput(spec, renderMaterial, { ...tokens, profile: profile.name }, log);
        out.size = buf.length;
        const isKey = spec.format.includes('key') || spec.format === 'pem-bundle' || spec.format === 'pkcs12';
        await fs.writeFile(out.stagedPath, buf, { mode: isKey ? 0o600 : 0o644 });
        const destTemplate = (cert.destinationOverride || profile.destinationPath || '').trim();
        if (renewal.deploy && destTemplate) {
          try {
            const destDir = renderDestinationPath(destTemplate, { ...tokens, profile: profile.name });
            await fs.mkdir(destDir, { recursive: true });
            const dest = path.join(destDir, filename);
            await fs.writeFile(dest, buf, { mode: isKey ? 0o600 : 0o644 });
            out.deployedTo = dest;
            out.deployStatus = 'deployed';
            deployedDestinations.add(destDir);
          } catch (e) {
            out.deployStatus = 'failed';
            out.deployError = e instanceof Error ? e.message : String(e);
          }
        }
      } catch (e) {
        out.deployStatus = 'failed';
        out.deployError = `Render failed: ${e instanceof Error ? e.message : String(e)}`;
        failures.push(`${profile.name}/${spec.label}: ${out.deployError}`);
      }
      outputs.push(out);
    }
  }

  const rendered = outputs.filter((o) => o.size > 0).length;
  const deployedCount = outputs.filter((o) => o.deployStatus === 'deployed').length;
  const minutes = settings.baselines.renewal + settings.baselines.conversion * rendered + settings.baselines.deployment * deployedDestinations.size;
  const now = nowIso();

  db()
    .prepare('UPDATE renewals SET status = ?, new_not_after = ?, outputs = ?, commands = ?, minutes_saved = ?, error = ?, completed_at = ? WHERE id = ?')
    .run('completed', leaf.notAfter, JSON.stringify(outputs), JSON.stringify(log.commands), minutes, failures.length ? failures.join('\n') : null, now, renewalId);
  await fs.rm(path.join(dir, 'pending.key'), { force: true });

  const methodLabel = renewal.method === 'internal-ca' ? 'internal CA' : renewal.method === 'self-signed' ? 'self-signed' : 'external CA (CSR)';
  recordEvent({
    type: 'renewal',
    certificateId: cert.id,
    certificateName: updated.name,
    renewalId,
    title: `Renewed ${updated.name}`,
    detail: `${methodLabel}, ${renewal.keyMode === 'reuse' ? 'key reused' : 'new ' + renewal.keyMode.toUpperCase().replace('-', ' ') + ' key'}, valid until ${leaf.notAfter.slice(0, 10)}`,
    commands: log.commands,
    minutesSaved: settings.baselines.renewal,
  });
  if (rendered > 0) {
    recordEvent({
      type: 'conversion',
      certificateId: cert.id,
      certificateName: updated.name,
      renewalId,
      title: `Rendered ${rendered} output file${rendered === 1 ? '' : 's'} for ${updated.name}`,
      detail: outputs.filter((o) => o.size > 0).map((o) => `${o.profileName}/${o.filename}`).join(', '),
      minutesSaved: settings.baselines.conversion * rendered,
    });
  }
  if (deployedCount > 0) {
    recordEvent({
      type: 'deployment',
      certificateId: cert.id,
      certificateName: updated.name,
      renewalId,
      title: `Deployed ${deployedCount} file${deployedCount === 1 ? '' : 's'} to ${deployedDestinations.size} location${deployedDestinations.size === 1 ? '' : 's'}`,
      detail: [...deployedDestinations].join(', '),
      minutesSaved: settings.baselines.deployment * deployedDestinations.size,
    });
  }
  return getRenewal(renewalId)!;
}

export async function renewalOutputFile(renewalId: string, index: number): Promise<{ path: string; filename: string } | null> {
  const r = getRenewal(renewalId);
  const out = r?.outputs.find((o) => o.index === index);
  if (!out) return null;
  try {
    await fs.access(out.stagedPath);
    return { path: out.stagedPath, filename: out.filename };
  } catch {
    return null;
  }
}

export function renewalZipEntries(renewalId: string): { path: string; name: string }[] {
  const r = getRenewal(renewalId);
  if (!r) return [];
  const multi = new Set(r.outputs.map((o) => o.profileId)).size > 1;
  return r.outputs.filter((o) => o.size > 0).map((o) => ({ path: o.stagedPath, name: multi ? `${o.profileName}/${o.filename}` : o.filename }));
}
