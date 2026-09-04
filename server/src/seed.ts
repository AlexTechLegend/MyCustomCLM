/**
 * Seeds a realistic demo estate: an internal CA, a second "enterprise" CA for issuer
 * variety, ~16 certificates across every status, reference profiles and six months of
 * automation history. Run with `npm run seed` (destroys existing data).
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config, ensureDirs, preflightProblems, secretKeyMaterial } from './config.js';
import { db, dbBackend, newId, nowIso } from './db.js';
import { createCa, createCsr, generateKey, newLog, parseCertificate, readCaCert, signWithCa, selfSign, type Material } from './openssl.js';
import { createUser } from './services/auth.js';
import { attachCertificateBlueprint, insertCertificate } from './services/certificates.js';
import { createBlueprint } from './services/blueprints.js';
import { createCredential } from './services/credentials.js';
import { randomToken } from './services/crypto.js';
import { recordEvent } from './services/events.js';
import { createHost } from './services/hosts.js';
import { createIdentityTemplate, listIdentityTemplates } from './services/identities.js';
import { enqueueJob } from './services/jobs.js';
import { STAGING_PRESET_ID, ensureBuiltinPipelines } from './services/pipelines.js';
import { createProfile } from './services/profiles.js';
import { saveSettings } from './services/settings.js';
import { createTagGroup } from './services/tags.js';
import { createWindow } from './services/windows.js';
import type { CertSource, EventType } from './types.js';

const DAY = 86400000;

interface SeedCert {
  cn: string;
  sans?: string[];
  org: string;
  issuedDaysAgo: number;
  expiresInDays: number;
  issuer: 'internal' | 'enterprise' | 'self';
  tags: string[];
  profiles: string[];
  key?: 'rsa-2048' | 'rsa-3072' | 'ec-p256';
  notes?: string;
}

const ESTATE: SeedCert[] = [
  { cn: 'portal.contoso.com', sans: ['portal.contoso.com', 'www.portal.contoso.com'], org: 'Contoso Ltd', issuedDaysAgo: 353, expiresInDays: 12, issuer: 'enterprise', tags: ['web', 'prod', 'iis'], profiles: ['iis'] },
  { cn: 'api.contoso.com', org: 'Contoso Ltd', issuedDaysAgo: 360, expiresInDays: 5, issuer: 'enterprise', tags: ['api', 'prod'], profiles: ['nginx'], key: 'ec-p256' },
  { cn: '*.internal.contoso.com', sans: ['*.internal.contoso.com', 'internal.contoso.com'], org: 'Contoso Ltd', issuedDaysAgo: 320, expiresInDays: 45, issuer: 'internal', tags: ['wildcard', 'internal'], profiles: ['iis', 'nginx'] },
  { cn: 'vpn.contoso.com', org: 'Contoso Ltd', issuedDaysAgo: 374, expiresInDays: -9, issuer: 'enterprise', tags: ['network', 'prod'], profiles: ['appliance'], notes: 'Palo Alto GlobalProtect portal. Renewal requires change ticket.' },
  { cn: 'mail.contoso.com', sans: ['mail.contoso.com', 'autodiscover.contoso.com', 'smtp.contoso.com'], org: 'Contoso Ltd', issuedDaysAgo: 155, expiresInDays: 210, issuer: 'enterprise', tags: ['exchange', 'prod'], profiles: ['iis'] },
  { cn: 'sso.contoso.com', org: 'Contoso Ltd', issuedDaysAgo: 337, expiresInDays: 28, issuer: 'enterprise', tags: ['identity', 'prod'], profiles: ['nginx'] },
  { cn: 'intranet.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 65, expiresInDays: 300, issuer: 'internal', tags: ['web', 'internal', 'iis'], profiles: ['iis'] },
  { cn: 'jenkins.build.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 290, expiresInDays: 75, issuer: 'internal', tags: ['ci', 'internal'], profiles: ['nginx'] },
  { cn: 'gitlab.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 362, expiresInDays: 3, issuer: 'internal', tags: ['ci', 'internal'], profiles: ['nginx'] },
  { cn: 'grafana.ops.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 405, expiresInDays: -40, issuer: 'internal', tags: ['monitoring'], profiles: [] },
  { cn: 'sql01.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 185, expiresInDays: 180, issuer: 'internal', tags: ['database', 'internal'], profiles: ['appliance'], key: 'rsa-3072' },
  { cn: 'dev.contoso.dev', org: 'Contoso Engineering', issuedDaysAgo: 70, expiresInDays: 20, issuer: 'self', tags: ['dev'], profiles: ['nginx'] },
  { cn: 'staging-api.contoso.dev', org: 'Contoso Engineering', issuedDaysAgo: 30, expiresInDays: 95, issuer: 'self', tags: ['dev', 'api'], profiles: ['nginx'], key: 'ec-p256' },
  { cn: 'printserver.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 5, expiresInDays: 365, issuer: 'internal', tags: ['internal'], profiles: ['iis'] },
  { cn: 'wiki.contoso.local', org: 'Contoso Ltd', issuedDaysAgo: 305, expiresInDays: 60, issuer: 'internal', tags: ['web', 'internal'], profiles: ['nginx'] },
  { cn: 'ldaps.dc01.contoso.local', sans: ['ldaps.dc01.contoso.local', 'dc01.contoso.local', 'contoso.local'], org: 'Contoso Ltd', issuedDaysAgo: 235, expiresInDays: 130, issuer: 'enterprise', tags: ['identity', 'internal'], profiles: ['appliance'] },
];

async function resetData() {
  try {
    await fs.rm(config.dataDir, { recursive: true, force: true });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY') {
      throw new Error(
        `Could not reset ${config.dataDir} (${code}). Another process is holding it open — stop the Vigil server (npm run dev / npm start) and any file explorer or editor looking at the data folder, then run the seed again.`,
      );
    }
    throw e;
  }
  ensureDirs();
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function issue(c: SeedCert, caCertPem: string | null): Promise<Material> {
  const keyPem = await generateKey(c.key ?? 'rsa-2048');
  const subject = [`C=GB`, `O=${c.org}`, `CN=${c.cn}`];
  const sans = c.sans ?? [c.cn];
  const csr = await createCsr(keyPem, subject, sans);
  const start = new Date(Date.now() - c.issuedDaysAgo * DAY);
  const end = new Date(Date.now() + c.expiresInDays * DAY);
  let leafPem: string;
  if (c.issuer === 'self') {
    // openssl x509 -req has no start/end dates in 3.0; self-signed demo certs are issued "now".
    leafPem = await selfSign(csr, keyPem, Math.max(1, c.expiresInDays));
  } else {
    leafPem = await signWithCa(csr, { start, end });
  }
  const leaf = await parseCertificate(leafPem);
  const chain = caCertPem ? [await parseCertificate(caCertPem)] : [];
  return { leaf, chain, keyPem };
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function main() {
  const problems = preflightProblems();
  if (problems.length) fail(problems.join('\n\n✖ '));
  console.log(`Using ${config.opensslVersion} (${config.opensslBin}) on Node ${process.versions.node}`);

  console.log(`Resetting data directory ${config.dataDir}…`);
  await resetData();
  db();
  console.log(`Database backend: ${dbBackend()}`);

  saveSettings({ organisation: 'Contoso Ltd' });

  createTagGroup({ name: 'Production web', description: 'Public-facing web and API certificates.', tags: ['web', 'prod', 'api', 'iis'] });
  createTagGroup({ name: 'Internal infrastructure', description: 'Anything on the corporate network.', tags: ['internal', 'ci', 'database', 'monitoring'] });
  createTagGroup({ name: 'Identity', description: 'SSO, LDAP and VPN.', tags: ['identity', 'network'] });

  createIdentityTemplate({
    name: 'Contoso Ltd — Production',
    description: 'Public and internal production certificates. RSA 2048, 397-day public-CA window.',
    country: 'GB',
    state: 'Greater London',
    locality: 'London',
    organisation: 'Contoso Ltd',
    organisationalUnit: 'Infrastructure',
    email: 'pki@contoso.com',
    defaultKeyMode: 'rsa-2048',
    defaultValidityDays: 397,
  });
  createIdentityTemplate({
    name: 'Contoso Engineering — Lab',
    description: 'Self-signed and internal-CA lab identities. EC P-256, 90 days.',
    country: 'GB',
    state: 'Greater London',
    locality: 'London',
    organisation: 'Contoso Engineering',
    organisationalUnit: 'Platform',
    email: 'lab@contoso.dev',
    defaultKeyMode: 'ec-p256',
    defaultValidityDays: 90,
  });

  const destRoot = path.join(os.tmpdir(), 'vigil-demo');
  const profiles = {
    iis: createProfile({
      name: 'IIS – Web Farm',
      description: 'Full-chain .cer (CRLF, leaf + intermediate + root) for the bindings, decrypted private.key for the automation share, and a PFX for direct import.',
      destinationPath: path.join(destRoot, 'webfarm', '{cn_safe}'),
      scope: 'specialized',
      serverTags: ['iis', 'prod', 'web'],
      outputs: [
        { label: 'Full chain certificate (.cer, CRLF)', filename: 'fullchain.cer', format: 'pem-fullchain', lineEnding: 'crlf', includeRoot: true },
        { label: 'Decrypted private key (PKCS#8)', filename: 'private.key', format: 'pem-key', lineEnding: 'lf', keyEncoding: 'pkcs8' },
        { label: 'PKCS#12 for IIS import', filename: '{cn_safe}.pfx', format: 'pkcs12', password: 'ChangeMe-2024', friendlyName: '{cn}' },
      ],
    } as never),
    nginx: createProfile({
      name: 'Linux – Nginx',
      description: 'Standard fullchain.pem / privkey.pem pair, LF endings. Available for any certificate.',
      destinationPath: path.join(destRoot, 'nginx'),
      scope: 'general',
      outputs: [
        { label: 'fullchain.pem', filename: 'fullchain.pem', format: 'pem-fullchain', lineEnding: 'lf', includeRoot: false },
        { label: 'privkey.pem (PKCS#8)', filename: 'privkey.pem', format: 'pem-key', lineEnding: 'lf', keyEncoding: 'pkcs8' },
      ],
    } as never),
    appliance: createProfile({
      name: 'Appliances – DER + P7B',
      description: 'Binary DER certificate and a PKCS#7 chain bundle for network appliances and Java keystores.',
      destinationPath: '',
      scope: 'specialized',
      serverTags: ['network', 'database', 'identity'],
      outputs: [
        { label: 'DER certificate', filename: '{cn_safe}.cer', format: 'der-cert' },
        { label: 'PKCS#7 chain (DER)', filename: '{cn_safe}-chain.p7b', format: 'pkcs7-der', includeRoot: true },
        { label: 'Encrypted key (PKCS#8, AES-256)', filename: '{cn_safe}.key', format: 'pem-key-encrypted', password: 'ChangeMe-2024' },
      ],
    } as never),
  };

  // Enterprise CA (used for issuer variety) — lives in a side directory.
  const realCaDir = config.caDir;
  const enterpriseDir = path.join(config.dataDir, 'seed-enterprise-ca');
  await fs.mkdir(enterpriseDir, { recursive: true });
  config.caDir = enterpriseDir;
  console.log('Creating Contoso Enterprise CA 01…');
  const enterpriseCa = await createCa({ commonName: 'Contoso Enterprise CA 01', organisation: 'Contoso Ltd', days: 3650 });

  const enterprise: Material[] = [];
  for (const c of ESTATE.filter((c) => c.issuer === 'enterprise')) enterprise.push(await issue(c, enterpriseCa));
  config.caDir = realCaDir;

  console.log('Creating Vigil internal CA…');
  const caLog = newLog();
  await createCa({ commonName: 'Contoso Ltd Internal CA', organisation: 'Contoso Ltd', days: 3650 }, caLog);
  recordEvent({ type: 'ca', title: 'Created internal CA', detail: 'RSA 4096, SHA-256', commands: caLog.commands, minutesSaved: 30, createdAt: new Date(Date.now() - 170 * DAY).toISOString() });
  const internalCa = await readCaCert();

  console.log('Issuing certificates…');
  let ei = 0;
  const certIds: { id: string; name: string }[] = [];
  for (const c of ESTATE) {
    const material = c.issuer === 'enterprise' ? enterprise[ei++] : c.issuer === 'internal' ? await issue(c, internalCa) : await issue(c, null);
    const source: CertSource = c.issuer === 'enterprise' ? 'imported' : c.issuer === 'internal' ? 'internal-ca' : 'self-signed';
    const createdAt = new Date(Date.now() - Math.min(c.issuedDaysAgo, 170) * DAY).toISOString();
    const cert = await insertCertificate(material, {
      name: c.cn,
      tags: c.tags,
      notes: c.notes,
      profileIds: c.profiles.map((p) => profiles[p as keyof typeof profiles].id),
      source,
      createdAt,
    });
    certIds.push({ id: cert.id, name: cert.name });
    process.stdout.write(`  ${cert.name.padEnd(32)} ${cert.status.padEnd(9)} ${cert.daysRemaining} d\n`);
  }

  console.log('Writing automation history…');
  const r = rand(42);
  const baselines = { import: 10, csr: 15, renewal: 45, conversion: 8, deployment: 15 };
  const templates: { type: EventType; title: (n: string) => string; detail: string; minutes: () => number; weight: number }[] = [
    { type: 'import', title: (n) => `Imported ${n}`, detail: 'PKCS#12 unpacked to canonical PEM with private key', minutes: () => baselines.import, weight: 3 },
    { type: 'renewal', title: (n) => `Renewed ${n}`, detail: 'Internal CA, new RSA 2048 key', minutes: () => baselines.renewal, weight: 4 },
    { type: 'conversion', title: (n) => `Rendered 3 output files for ${n}`, detail: 'fullchain.cer, private.key, {cn}.pfx', minutes: () => baselines.conversion * 3, weight: 4 },
    { type: 'deployment', title: (_n) => `Deployed 3 files to 1 location`, detail: 'IIS – Web Farm destination', minutes: () => baselines.deployment, weight: 3 },
    { type: 'csr', title: (n) => `Generated CSR for ${n}`, detail: 'Key reused, SANs carried over', minutes: () => baselines.csr, weight: 2 },
  ];
  const pool = templates.flatMap((t) => Array(t.weight).fill(t) as typeof templates);
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const monthEnd = m === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m + 1, 0, 23, 59));
    const count = 5 + Math.floor(r() * 6) + (5 - m);
    for (let i = 0; i < count; i++) {
      const t = pool[Math.floor(r() * pool.length)];
      const cert = certIds[Math.floor(r() * certIds.length)];
      const at = new Date(monthStart.getTime() + r() * (monthEnd.getTime() - monthStart.getTime()));
      recordEvent({ type: t.type, certificateId: cert.id, certificateName: cert.name, title: t.title(cert.name), detail: t.detail, minutesSaved: t.minutes(), createdAt: at.toISOString() });
    }
  }

  // A few historical renewals so detail pages have a receipt to reopen.
  const hist = db().prepare(
    `INSERT INTO renewals (id, certificate_id, method, status, key_mode, validity_days, csr_pem, previous_not_after, new_not_after, profile_ids, deploy, outputs, commands, minutes_saved, error, created_at, completed_at)
     VALUES (?, ?, ?, 'completed', ?, ?, NULL, ?, ?, ?, 1, ?, ?, ?, NULL, ?, ?)`,
  );
  for (const c of ESTATE.filter((c) => c.issuer === 'internal' && c.issuedDaysAgo > 100).slice(0, 4)) {
    const rec = certIds.find((x) => x.name === c.cn)!;
    const when = new Date(Date.now() - c.issuedDaysAgo * DAY);
    const prev = new Date(when.getTime() - 3 * DAY).toISOString();
    const next = new Date(Date.now() + c.expiresInDays * DAY).toISOString();
    const rid = newId('rnw');
    const usedProfiles = c.profiles.map((p) => profiles[p as keyof typeof profiles]);
    const outputs = usedProfiles.flatMap((p, pi) =>
      p.outputs.map((o, oi) => ({
        index: pi * 10 + oi,
        profileId: p.id,
        profileName: p.name,
        specId: o.id,
        label: o.label,
        filename: o.filename.replace('{cn_safe}', c.cn.replace(/[^A-Za-z0-9._-]+/g, '_')),
        format: o.format,
        size: 0,
        stagedPath: '',
        deployedTo: p.destinationPath ? path.join(p.destinationPath.replace('{cn_safe}', c.cn.replace(/[^A-Za-z0-9._-]+/g, '_')), o.filename) : null,
        deployStatus: p.destinationPath ? 'deployed' : 'skipped',
        deployError: null,
      })),
    );
    hist.run(
      rid, rec.id, 'internal-ca', 'rsa-2048', 365, prev, next, JSON.stringify(usedProfiles.map((p) => p.id)),
      JSON.stringify(outputs),
      JSON.stringify(['openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out key.pem', 'openssl req -new -key key.pem -out req.csr -subj …', 'openssl ca -config ca.cnf -batch -notext -in req.csr -out cert.pem -days 365']),
      baselines.renewal + baselines.conversion * outputs.length + baselines.deployment, when.toISOString(), when.toISOString(),
    );
    recordEvent({
      type: 'renewal',
      certificateId: rec.id,
      certificateName: rec.name,
      renewalId: rid,
      title: `Renewed ${rec.name}`,
      detail: 'Internal CA, new RSA 2048 key',
      minutesSaved: baselines.renewal,
      createdAt: when.toISOString(),
    });
  }

  await fs.rm(enterpriseDir, { recursive: true, force: true });

  console.log('Seeding automation estate…');
  ensureBuiltinPipelines();
  const adminPassword = randomToken(12);
  const operatorPassword = randomToken(12);
  createUser({ username: 'admin', password: adminPassword, displayName: 'Vigil Admin', role: 'admin', email: 'admin@contoso.com' });
  createUser({ username: 'operator', password: operatorPassword, displayName: 'Vigil Operator', role: 'operator', email: 'ops@contoso.com' });
  console.log(`  One-time passwords (not stored in plaintext):`);
  console.log(`    admin    / ${adminPassword}`);
  console.log(`    operator / ${operatorPassword}`);

  if (secretKeyMaterial()) {
    createCredential({
      name: 'WinRM deploy account',
      kind: 'password',
      username: 'svc-vigil',
      secret: randomToken(16),
      description: 'Demo credential — secret never returned by the API.',
    });
  } else {
    console.log('  (no VIGIL_SECRET_KEY — skipped credential seed)');
  }

  const web01 = createHost({ name: 'web01.prod', hostname: 'web01.contoso.local', address: '10.20.0.11', platform: 'windows', environment: 'prod', owner: 'platform', tags: ['iis', 'web', 'prod'] });
  const web02 = createHost({ name: 'web02.prod', hostname: 'web02.contoso.local', address: '10.20.0.12', platform: 'windows', environment: 'prod', owner: 'platform', tags: ['iis', 'web', 'prod'] });
  createHost({ name: 'app01.prod', hostname: 'app01.contoso.local', address: '10.20.0.21', platform: 'linux', environment: 'prod', owner: 'platform', tags: ['nginx', 'prod'] });
  createHost({ name: 'web01.staging', hostname: 'web01.staging.contoso.local', address: '10.30.0.11', platform: 'windows', environment: 'staging', owner: 'platform', tags: ['iis', 'staging'] });
  createHost({ name: 'app01.staging', hostname: 'app01.staging.contoso.local', address: '10.30.0.21', platform: 'linux', environment: 'staging', owner: 'platform', tags: ['nginx', 'staging'] });

  const window = createWindow({
    name: 'Wednesday 22:00 UTC',
    weekday: 3,
    startTime: '22:00',
    endTime: '23:30',
    timezone: 'UTC',
  });

  const identities = listIdentityTemplates();
  const prodId = identities.find((i) => /Production/.test(i.name))?.id ?? null;
  const iisBp = createBlueprint({
    name: 'Standard IIS web server',
    description: 'Public IIS bindings, internal CA, Wednesday window.',
    identityTemplateId: prodId,
    profileIds: [profiles.iis.id],
    issuanceMethod: 'internal-ca',
    keyMode: 'rsa-2048',
    validityDays: 397,
    maintenanceWindowId: window.id,
    renewalPolicy: { nthWindowBeforeExpiry: 2, requiresApproval: false },
  });
  const nginxBp = createBlueprint({
    name: 'Linux nginx staged swap',
    description: 'Staging → backup → swap → verify → run-commands via the built-in pipeline.',
    identityTemplateId: prodId,
    profileIds: [profiles.nginx.id],
    issuanceMethod: 'internal-ca',
    keyMode: 'rsa-2048',
    validityDays: 397,
    pipelineId: STAGING_PRESET_ID,
    maintenanceWindowId: window.id,
    renewalPolicy: { nthWindowBeforeExpiry: 1, requiresApproval: true },
  });

  const intranet = certIds.find((c) => c.name === 'intranet.contoso.local');
  if (intranet) {
    attachCertificateBlueprint(intranet.id, iisBp.id, iisBp.version, ['DNS:intranet.contoso.local', 'DNS:drifted.contoso.local']);
  }
  const portal = certIds.find((c) => c.name === 'portal.contoso.com');
  if (portal) {
    attachCertificateBlueprint(portal.id, nginxBp.id, nginxBp.version, ['DNS:portal.contoso.com']);
  }

  const nowIsoStamp = nowIso();
  const runOk = newId('run');
  const runQueued = newId('run');
  db()
    .prepare(
      `INSERT INTO pipeline_runs (id, pipeline_id, renewal_id, certificate_id, host_id, state, steps, params, approved_by, approved_at, started_at, finished_at, created_at)
       VALUES (?, ?, NULL, ?, ?, 'succeeded', ?, '{}', 'seed', ?, ?, ?, ?)`,
    )
    .run(
      runOk,
      STAGING_PRESET_ID,
      portal?.id ?? null,
      web01.id,
      JSON.stringify([{ stepId: 'swap', type: 'swap', name: 'Atomic swap', state: 'succeeded', startedAt: nowIsoStamp, finishedAt: nowIsoStamp, stdout: 'seed', stderr: '', error: null, outputs: {} }]),
      nowIsoStamp,
      nowIsoStamp,
      nowIsoStamp,
      nowIsoStamp,
    );
  db()
    .prepare(
      `INSERT INTO pipeline_runs (id, pipeline_id, renewal_id, certificate_id, host_id, state, steps, params, approved_by, approved_at, started_at, finished_at, created_at)
       VALUES (?, ?, NULL, ?, ?, 'succeeded', ?, '{}', 'seed', ?, ?, ?, ?)`,
    )
    .run(
      runQueued,
      STAGING_PRESET_ID,
      intranet?.id ?? null,
      web02.id,
      JSON.stringify([{ stepId: 'backup', type: 'backup', name: 'Backup', state: 'succeeded', startedAt: nowIsoStamp, finishedAt: nowIsoStamp, stdout: 'seed', stderr: '', error: null, outputs: {} }]),
      nowIsoStamp,
      nowIsoStamp,
      nowIsoStamp,
      nowIsoStamp,
    );

  enqueueJob({
    type: 'pipeline-run',
    certificateId: portal?.id ?? null,
    payload: { pipelineId: STAGING_PRESET_ID, hostId: web01.id, dryRun: true },
    priority: 40,
  });

  console.log(`\n✔ Seed complete at ${nowIso()}. Demo destinations under ${destRoot}`);
  console.log('  Next: npm run dev  →  http://localhost:5173');
}

main().catch((e: unknown) => {
  if (e instanceof Error && 'stderr' in e) {
    const err = e as Error & { stderr: string; command: string };
    fail(`${err.message}\n  command: ${err.command}\n  ${err.stderr.trim().split('\n').slice(0, 5).join('\n  ')}`);
  }
  fail(e instanceof Error ? e.message : String(e));
});
