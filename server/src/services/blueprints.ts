import { db, newId, nowIso, parseJson } from '../db.js';
import {
  createCsr,
  generateKey,
  mergeSubjectComponents,
  newLog,
  normaliseSans,
  parseCertificate,
  readCaCert,
  selfSign,
  signWithCa,
} from '../openssl.js';
import type { Blueprint, Certificate, KeyMode, RenewalMethod, RenewalPolicy } from '../types.js';
import { writeAudit } from './audit.js';
import {
  attachCertificateBlueprint,
  getCertificate,
  insertCertificate,
  listCertificatesByBlueprint,
  setCertificateNextRenewal,
} from './certificates.js';
import { setCertificateHosts } from './hosts.js';
import { getIdentityTemplate } from './identities.js';
import { emitNotification } from './notifications.js';
import { getSettings } from './settings.js';
import { getWindow, previewRenewalSchedule, resolveNthWindowBeforeExpiry } from './windows.js';

interface BlueprintRow {
  id: string;
  name: string;
  description: string;
  identity_template_id: string | null;
  profile_ids: string;
  issuance_method: RenewalMethod;
  ca_template: string;
  key_mode: KeyMode;
  validity_days: number;
  pipeline_id: string | null;
  renewal_policy: string;
  maintenance_window_id: string | null;
  notification_targets: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_POLICY: RenewalPolicy = { nthWindowBeforeExpiry: 2, requiresApproval: false };

function mapRow(r: BlueprintRow): Blueprint {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    identityTemplateId: r.identity_template_id,
    profileIds: parseJson(r.profile_ids, []),
    issuanceMethod: r.issuance_method,
    caTemplate: r.ca_template,
    keyMode: r.key_mode,
    validityDays: r.validity_days,
    pipelineId: r.pipeline_id,
    renewalPolicy: { ...DEFAULT_POLICY, ...parseJson<Partial<RenewalPolicy>>(r.renewal_policy, {}) },
    maintenanceWindowId: r.maintenance_window_id,
    notificationTargets: parseJson(r.notification_targets, []),
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listBlueprints(): Blueprint[] {
  return (db().prepare('SELECT * FROM blueprints ORDER BY name COLLATE NOCASE').all() as BlueprintRow[]).map(mapRow);
}

export function getBlueprint(id: string): Blueprint | null {
  const row = db().prepare('SELECT * FROM blueprints WHERE id = ?').get(id) as BlueprintRow | undefined;
  return row ? mapRow(row) : null;
}

function rowFromInput(id: string, input: Partial<Blueprint>, existing?: Blueprint): BlueprintRow {
  const now = nowIso();
  return {
    id,
    name: (input.name ?? existing?.name ?? '').trim() || 'Untitled blueprint',
    description: input.description ?? existing?.description ?? '',
    identity_template_id: input.identityTemplateId !== undefined ? input.identityTemplateId : (existing?.identityTemplateId ?? null),
    profile_ids: JSON.stringify(input.profileIds ?? existing?.profileIds ?? []),
    issuance_method: input.issuanceMethod ?? existing?.issuanceMethod ?? 'internal-ca',
    ca_template: input.caTemplate ?? existing?.caTemplate ?? '',
    key_mode: input.keyMode ?? existing?.keyMode ?? 'rsa-2048',
    validity_days: Math.min(3650, Math.max(1, Math.round(input.validityDays ?? existing?.validityDays ?? getSettings().defaultValidityDays))),
    pipeline_id: input.pipelineId !== undefined ? input.pipelineId : (existing?.pipelineId ?? null),
    renewal_policy: JSON.stringify(input.renewalPolicy ?? existing?.renewalPolicy ?? DEFAULT_POLICY),
    maintenance_window_id:
      input.maintenanceWindowId !== undefined ? input.maintenanceWindowId : (existing?.maintenanceWindowId ?? null),
    notification_targets: JSON.stringify(input.notificationTargets ?? existing?.notificationTargets ?? []),
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.createdAt ?? now,
    updated_at: now,
  };
}

export function createBlueprint(input: Partial<Blueprint>): Blueprint {
  const row = rowFromInput(newId('bp'), input);
  db()
    .prepare(
      `INSERT INTO blueprints
        (id, name, description, identity_template_id, profile_ids, issuance_method, ca_template, key_mode, validity_days, pipeline_id, renewal_policy, maintenance_window_id, notification_targets, version, created_at, updated_at)
       VALUES (@id, @name, @description, @identity_template_id, @profile_ids, @issuance_method, @ca_template, @key_mode, @validity_days, @pipeline_id, @renewal_policy, @maintenance_window_id, @notification_targets, @version, @created_at, @updated_at)`,
    )
    .run(row);
  writeAudit({ action: 'blueprint.create', entityType: 'blueprint', entityId: row.id, after: { name: row.name } });
  return getBlueprint(row.id)!;
}

export function updateBlueprint(id: string, input: Partial<Blueprint>): Blueprint | null {
  const existing = getBlueprint(id);
  if (!existing) return null;
  const row = rowFromInput(id, input, existing);
  db()
    .prepare(
      `UPDATE blueprints SET name = ?, description = ?, identity_template_id = ?, profile_ids = ?, issuance_method = ?, ca_template = ?, key_mode = ?, validity_days = ?, pipeline_id = ?, renewal_policy = ?, maintenance_window_id = ?, notification_targets = ?, version = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      row.name,
      row.description,
      row.identity_template_id,
      row.profile_ids,
      row.issuance_method,
      row.ca_template,
      row.key_mode,
      row.validity_days,
      row.pipeline_id,
      row.renewal_policy,
      row.maintenance_window_id,
      row.notification_targets,
      row.version,
      row.updated_at,
      id,
    );
  writeAudit({
    action: 'blueprint.update',
    entityType: 'blueprint',
    entityId: id,
    before: { version: existing.version },
    after: { version: row.version },
  });
  return getBlueprint(id);
}

export function deleteBlueprint(id: string): boolean {
  const existing = getBlueprint(id);
  if (!existing) return false;
  db().prepare('UPDATE certificates SET blueprint_id = NULL, blueprint_version = NULL WHERE blueprint_id = ?').run(id);
  db().prepare('DELETE FROM blueprints WHERE id = ?').run(id);
  writeAudit({ action: 'blueprint.delete', entityType: 'blueprint', entityId: id, before: { name: existing.name } });
  return true;
}

export function computeNextRenewalAt(blueprint: Blueprint, notAfter: string): string | null {
  if (!blueprint.maintenanceWindowId) return null;
  const win = getWindow(blueprint.maintenanceWindowId);
  if (!win) return null;
  const when = resolveNthWindowBeforeExpiry(notAfter, win, blueprint.renewalPolicy);
  return when ? when.toISOString() : null;
}

export type InstantiateInput = {
  commonName: string;
  sans?: string[];
  hostIds?: string[];
  destinationPath?: string;
  mode?: RenewalMethod;
  name?: string;
  notes?: string;
  tags?: string[];
};

export async function instantiateBlueprint(blueprintId: string, input: InstantiateInput): Promise<Certificate> {
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) throw new Error('Blueprint not found');
  const method = input.mode ?? blueprint.issuanceMethod;
  if (method === 'csr') {
    throw new Error('Blueprint instantiate does not support CSR mode — use internal-ca or self-signed so the certificate is created in one call.');
  }
  const cn = input.commonName.trim();
  if (!cn) throw new Error('commonName is required');

  const template = blueprint.identityTemplateId ? getIdentityTemplate(blueprint.identityTemplateId) : null;
  const log = newLog();
  const keyMode = blueprint.keyMode === 'reuse' ? 'rsa-2048' : blueprint.keyMode;
  const keyPem = await generateKey(keyMode, log);
  const subject = mergeSubjectComponents([], {
    country: template?.country,
    state: template?.state,
    locality: template?.locality,
    organisation: template?.organisation,
    organisationalUnit: template?.organisationalUnit,
    email: template?.email,
    commonName: cn,
  });
  const sans = normaliseSans(input.sans ?? [cn], cn);
  const csrPem = await createCsr(keyPem, subject, sans, log);
  const days = blueprint.validityDays;

  let leafPem: string;
  let chainPems: string[] = [];
  let source: 'internal-ca' | 'self-signed' = 'self-signed';
  if (method === 'internal-ca') {
    leafPem = await signWithCa(csrPem, { days }, log);
    const ca = await readCaCert();
    if (ca) chainPems = [ca];
    source = 'internal-ca';
  } else {
    leafPem = await selfSign(csrPem, keyPem, days, log);
  }

  const leaf = await parseCertificate(leafPem, log);
  const chain = await Promise.all(chainPems.map((p) => parseCertificate(p)));
  const cert = await insertCertificate({ leaf, chain, keyPem }, {
    name: input.name?.trim() || cn,
    notes: input.notes ?? '',
    tags: input.tags ?? [],
    profileIds: blueprint.profileIds,
    destinationOverride: input.destinationPath ?? '',
    source,
  });

  attachCertificateBlueprint(cert.id, blueprint.id, blueprint.version, sans);
  if (input.hostIds?.length) setCertificateHosts(cert.id, input.hostIds);
  const next = computeNextRenewalAt(blueprint, leaf.notAfter);
  if (next) setCertificateNextRenewal(cert.id, next);

  writeAudit({
    action: 'blueprint.instantiate',
    entityType: 'certificate',
    entityId: cert.id,
    after: { blueprintId: blueprint.id, version: blueprint.version, commonName: cn },
    commandTrail: log.commands,
  });
  return getCertificate(cert.id)!;
}

export type DriftFinding = {
  certificateId: string;
  certificateName: string;
  field: string;
  expected: unknown;
  actual: unknown;
};

function keyModeMatches(mode: KeyMode, cert: Certificate): boolean {
  if (mode === 'reuse') return true;
  if (mode.startsWith('rsa-')) {
    const bits = Number(mode.slice(4));
    return /rsa/i.test(cert.keyAlgo) && cert.keyBits === bits;
  }
  if (mode === 'ec-p256') return cert.keyBits === 256;
  if (mode === 'ec-p384') return cert.keyBits === 384;
  return true;
}

export function detectBlueprintDrift(blueprintId: string): {
  blueprint: Blueprint;
  drifted: boolean;
  findings: DriftFinding[];
} {
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) throw new Error('Blueprint not found');
  const certs = listCertificatesByBlueprint(blueprintId);
  const findings: DriftFinding[] = [];

  for (const cert of certs) {
    if (cert.blueprintVersion !== blueprint.version) {
      findings.push({
        certificateId: cert.id,
        certificateName: cert.name,
        field: 'blueprintVersion',
        expected: blueprint.version,
        actual: cert.blueprintVersion,
      });
    }
    const expectedProfiles = [...blueprint.profileIds].sort();
    const actualProfiles = [...cert.profileIds].sort();
    if (JSON.stringify(expectedProfiles) !== JSON.stringify(actualProfiles)) {
      findings.push({
        certificateId: cert.id,
        certificateName: cert.name,
        field: 'profileIds',
        expected: expectedProfiles,
        actual: actualProfiles,
      });
    }
    if (!keyModeMatches(blueprint.keyMode, cert)) {
      findings.push({
        certificateId: cert.id,
        certificateName: cert.name,
        field: 'keyMode',
        expected: blueprint.keyMode,
        actual: { keyAlgo: cert.keyAlgo, keyBits: cert.keyBits },
      });
    }
    if (cert.blueprintSans.length) {
      const expected = [...cert.blueprintSans].sort();
      const actual = [...cert.sans].sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        findings.push({
          certificateId: cert.id,
          certificateName: cert.name,
          field: 'sans',
          expected,
          actual,
        });
      }
    }
  }

  if (findings.length) {
    emitNotification('drift.detected', { blueprintId, count: findings.length });
  }
  return { blueprint, drifted: findings.length > 0, findings };
}

export function getCertificateSchedule(certificateId: string) {
  const cert = getCertificate(certificateId);
  if (!cert) return null;
  const blueprint = cert.blueprintId ? getBlueprint(cert.blueprintId) : null;
  const win = blueprint?.maintenanceWindowId ? getWindow(blueprint.maintenanceWindowId) : null;
  const occurrences =
    win && blueprint ? previewRenewalSchedule(cert.notAfter, win, blueprint.renewalPolicy) : [];
  return {
    certificateId: cert.id,
    nextRenewalAt: cert.nextRenewalAt,
    occurrences,
    window: win,
    policy: blueprint?.renewalPolicy ?? null,
    blueprintId: cert.blueprintId,
  };
}
