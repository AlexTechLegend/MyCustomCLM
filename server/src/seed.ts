/**
 * Seeds a realistic demo estate: an internal CA, a second "enterprise" CA for issuer
 * variety, ~16 certificates across every status, reference profiles and six months of
 * automation history. Run with `npm run seed` (destroys existing data).
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config, ensureDirs, preflightProblems } from './config.js';
import { db, dbBackend, newId, nowIso } from './db.js';
import { createCa, createCsr, generateKey, newLog, parseCertificate, readCaCert, signWithCa, selfSign, type Material } from './openssl.js';
import { insertCertificate } from './services/certificates.js';
import { recordEvent } from './services/events.js';
import { createProfile } from './services/profiles.js';
import { saveSettings } from './services/settings.js';
import { createTagGroup } from './services/tags.js';
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

  const destRoot = path.join(os.tmpdir(), 'vigil-demo');
  const profiles = {
    iis: createProfile({
      name: 'IIS – Web Farm',
      description: 'Full-chain .cer (CRLF, leaf + intermediate + root) for the bindings, decrypted private.key for the automation share, and a PFX for direct import.',
      destinationPath: path.join(destRoot, 'webfarm', '{cn_safe}'),
      outputs: [
        { label: 'Full chain certificate (.cer, CRLF)', filename: 'fullchain.cer', format: 'pem-fullchain', lineEnding: 'crlf', includeRoot: true },
        { label: 'Decrypted private key (PKCS#8)', filename: 'private.key', format: 'pem-key', lineEnding: 'lf', keyEncoding: 'pkcs8' },
        { label: 'PKCS#12 for IIS import', filename: '{cn_safe}.pfx', format: 'pkcs12', password: 'ChangeMe-2024', friendlyName: '{cn}' },
      ],
    } as never),
    nginx: createProfile({
      name: 'Linux – Nginx',
      description: 'Standard fullchain.pem / privkey.pem pair, LF endings.',
      destinationPath: path.join(destRoot, 'nginx'),
      outputs: [
        { label: 'fullchain.pem', filename: 'fullchain.pem', format: 'pem-fullchain', lineEnding: 'lf', includeRoot: false },
        { label: 'privkey.pem (PKCS#8)', filename: 'privkey.pem', format: 'pem-key', lineEnding: 'lf', keyEncoding: 'pkcs8' },
      ],
    } as never),
    appliance: createProfile({
      name: 'Appliances – DER + P7B',
      description: 'Binary DER certificate and a PKCS#7 chain bundle for network appliances and Java keystores.',
      destinationPath: '',
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
  const log = newLog();
  await createCa({ commonName: 'Contoso Ltd Internal CA', organisation: 'Contoso Ltd', days: 3650 }, log);
  recordEvent({ type: 'ca', title: 'Created internal CA', detail: 'RSA 4096, SHA-256', commands: log.commands, minutesSaved: 30, createdAt: new Date(Date.now() - 170 * DAY).toISOString() });
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
    { type: 'deployment', title: (n) => `Deployed 3 files to 1 location`, detail: 'IIS – Web Farm destination', minutes: () => baselines.deployment, weight: 3 },
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

  // A few historical renewals so detail pages have history.
  const hist = db().prepare(
    `INSERT INTO renewals (id, certificate_id, method, status, key_mode, validity_days, csr_pem, previous_not_after, new_not_after, profile_ids, deploy, outputs, commands, minutes_saved, error, created_at, completed_at)
     VALUES (?, ?, ?, 'completed', ?, ?, NULL, ?, ?, ?, 1, '[]', ?, ?, NULL, ?, ?)`,
  );
  for (const c of ESTATE.filter((c) => c.issuer === 'internal' && c.issuedDaysAgo > 100).slice(0, 4)) {
    const rec = certIds.find((x) => x.name === c.cn)!;
    const when = new Date(Date.now() - c.issuedDaysAgo * DAY);
    const prev = new Date(when.getTime() - 3 * DAY).toISOString();
    const next = new Date(Date.now() + c.expiresInDays * DAY).toISOString();
    hist.run(
      newId('rnw'), rec.id, 'internal-ca', 'rsa-2048', 365, prev, next, JSON.stringify(c.profiles.map((p) => profiles[p as keyof typeof profiles].id)),
      JSON.stringify(['openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out key.pem', 'openssl req -new -key key.pem -out req.csr -subj …', 'openssl ca -config ca.cnf -batch -notext -in req.csr -out cert.pem -days 365']),
      baselines.renewal + baselines.conversion * 2 + baselines.deployment, when.toISOString(), when.toISOString(),
    );
  }

  await fs.rm(enterpriseDir, { recursive: true, force: true });
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
