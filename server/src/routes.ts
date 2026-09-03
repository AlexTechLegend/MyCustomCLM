import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import { config } from './config.js';
import {
  caExists,
  createCa,
  deleteCa,
  detectFormat,
  inspectText,
  newLog,
  opensslVersion,
  parseCertificate,
  readCaCert,
  specFromDetected,
  FORMAT_LABELS,
} from './openssl.js';
import { newId } from './db.js';
import {
  adhocDownload,
  chainDetails,
  deleteCertificate,
  getCertificate,
  importCertificate,
  listCertificates,
  readVault,
  updateCertificate,
} from './services/certificates.js';
import { dashboard } from './services/dashboard.js';
import { listEvents, recordEvent, timeSavedSummary } from './services/events.js';
import { createIdentityTemplate, deleteIdentityTemplate, getIdentityTemplate, listIdentityTemplates, updateIdentityTemplate } from './services/identities.js';
import { createProfile, deleteProfile, getProfile, listProfiles, profileAppliesTo, updateProfile } from './services/profiles.js';
import { completeCsrRenewal, getRenewal, listRenewals, renewalOutputFile, renewalZipEntries, startRenewal } from './services/renewals.js';
import { getSettings, saveSettings } from './services/settings.js';
import { createTagGroup, deleteTagGroup, getTagGroup, listDistinctTags, listTagGroups, updateTagGroup } from './services/tags.js';
import type { KeyMode, OutputFormat, RenewalMethod, UserRole } from './types.js';
import { auditToCsv, listAudit, writeAudit } from './services/audit.js';
import {
  authenticateLocal,
  authMiddleware,
  clearSessionCookie,
  createSession,
  createUser,
  deleteUser,
  destroySession,
  getUser,
  listUsers,
  requireRole,
  setSessionCookie,
  updateUser,
  type AuthedRequest,
} from './services/auth.js';
import { createBlueprint, deleteBlueprint, detectBlueprintDrift, getBlueprint, getCertificateSchedule, instantiateBlueprint, listBlueprints, updateBlueprint } from './services/blueprints.js';
import { createCredential, deleteCredential, getCredentialMeta, listCredentials, updateCredential } from './services/credentials.js';
import {
  createHost,
  deleteHost,
  getHost,
  hostsForCertificate,
  linkCertificateHost,
  listHosts,
  setCertificateHosts,
  unlinkCertificateHost,
  updateHost,
} from './services/hosts.js';
import { cancelJob, getJob, listJobs, retryJob } from './services/jobs.js';
import {
  createNotificationTarget,
  deleteNotificationTarget,
  getNotificationTarget,
  listNotificationTargets,
  updateNotificationTarget,
} from './services/notifications.js';
import {
  approvePipelineRun,
  createPipeline,
  deletePipeline,
  describeStepLibrary,
  executePipeline,
  getPipeline,
  getPipelineRun,
  listPipelineRuns,
  listPipelines,
  planPipeline,
  updatePipeline,
} from './services/pipelines.js';
import { getSchedulerHeartbeat } from './services/scheduler.js';
import { createWindow, deleteWindow, getWindow, listWindows, updateWindow } from './services/windows.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 12 } });

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* comma separated */
    }
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

export const api = Router();

api.use(authMiddleware);

api.get('/health', (_req, res) => res.json({ ok: true }));

api.get(
  '/system',
  wrap(async (_req, res) => {
    res.json({
      openssl: await opensslVersion(),
      node: process.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      dataDir: config.dataDir,
      vaultDir: config.vaultDir,
      renewalsDir: config.renewalsDir,
      caDir: config.caDir,
      formats: FORMAT_LABELS,
      scheduler: getSchedulerHeartbeat(),
      authEnabled: config.authEnabled,
    });
  }),
);

api.get('/dashboard', wrap((_req, res) => res.json(dashboard())));

// Certificates -------------------------------------------------------------

api.get(
  '/certificates',
  wrap((req, res) => {
    res.json(
      listCertificates({
        q: str(req.query.q),
        status: str(req.query.status),
        source: str(req.query.source),
        profileId: str(req.query.profileId),
        tag: str(req.query.tag),
        groupId: str(req.query.groupId),
        sort: str(req.query.sort) as never,
        dir: str(req.query.dir) as never,
      }),
    );
  }),
);

api.post(
  '/certificates/import',
  upload.array('files', 12),
  wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return res.status(400).json({ error: 'Upload at least one file.' });
    const result = await importCertificate(
      files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })),
      {
        password: str(req.body.password),
        keyPassword: str(req.body.keyPassword),
        name: str(req.body.name),
        tags: list(req.body.tags),
        notes: str(req.body.notes),
        profileIds: list(req.body.profileIds),
      },
    );
    res.status(201).json(result);
  }),
);

api.get(
  '/certificates/:id',
  wrap(async (req, res) => {
    const cert = getCertificate(req.params.id as string);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const vault = await readVault(cert.id);
    const chain = await chainDetails(cert.id);
    const renewals = listRenewals(cert.id);
    const events = listEvents({ certificateId: cert.id, limit: 50 });
    const hosts = hostsForCertificate(cert.id);
    res.json({
      certificate: cert,
      pem: vault.certPem,
      chain: chain.map((c) => ({ subject: c.subject, commonName: c.commonName, issuer: c.issuer, notAfter: c.notAfter, isSelfSigned: c.isSelfSigned, fingerprintSha256: c.fingerprintSha256 })),
      renewals,
      events,
      hosts,
      profiles: cert.profileIds.map((id) => getProfile(id)).filter(Boolean),
    });
  }),
);

api.get(
  '/certificates/:id/text',
  wrap(async (req, res) => {
    const cert = getCertificate(req.params.id as string);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const vault = await readVault(cert.id);
    res.type('text/plain').send(await inspectText(vault.certPem));
  }),
);

api.patch(
  '/certificates/:id',
  wrap((req, res) => {
    const cert = updateCertificate(req.params.id as string, {
      name: str(req.body.name),
      tags: req.body.tags !== undefined ? list(req.body.tags) : undefined,
      notes: str(req.body.notes),
      profileIds: req.body.profileIds !== undefined ? list(req.body.profileIds) : undefined,
      destinationOverride: req.body.destinationOverride !== undefined ? str(req.body.destinationOverride) ?? '' : undefined,
    });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json(cert);
  }),
);

api.delete(
  '/certificates/:id',
  wrap(async (req, res) => {
    const ok = await deleteCertificate(req.params.id as string);
    res.status(ok ? 204 : 404).end();
  }),
);

api.get(
  '/certificates/:id/download',
  wrap(async (req, res) => {
    const format = (str(req.query.format) ?? 'pem-cert') as OutputFormat;
    if (!(format in FORMAT_LABELS)) return res.status(400).json({ error: 'Unknown format' });
    const log = newLog();
    const { buffer, filename } = await adhocDownload(
      req.params.id as string,
      format,
      {
        password: str(req.query.password),
        includeRoot: req.query.includeRoot === 'true',
        keyEncoding: str(req.query.keyEncoding) as never,
        lineEnding: str(req.query.lineEnding) as never,
      },
      log,
    );
    const cert = getCertificate(req.params.id as string);
    recordEvent({
      type: 'conversion',
      certificateId: cert?.id,
      certificateName: cert?.name,
      title: `Converted ${cert?.name} to ${FORMAT_LABELS[format]}`,
      detail: filename,
      commands: log.commands,
      minutesSaved: getSettings().baselines.conversion,
    });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.type('application/octet-stream').send(buffer);
  }),
);

// Renewals -----------------------------------------------------------------

api.post(
  '/certificates/:id/renew',
  wrap(async (req, res) => {
    const method = str(req.body.method) as RenewalMethod | undefined;
    if (!method || !['internal-ca', 'self-signed', 'csr'].includes(method)) return res.status(400).json({ error: 'Invalid renewal method' });
    const result = await startRenewal(req.params.id as string, {
      method,
      keyMode: (str(req.body.keyMode) as KeyMode | undefined) ?? 'rsa-2048',
      validityDays: Number(req.body.validityDays) || getSettings().defaultValidityDays,
      profileIds: list(req.body.profileIds),
      deploy: req.body.deploy === true || req.body.deploy === 'true',
      commonName: str(req.body.commonName),
      sans: req.body.sans !== undefined ? list(req.body.sans) : undefined,
      country: str(req.body.country),
      state: str(req.body.state),
      locality: str(req.body.locality),
      organisation: str(req.body.organisation),
      organisationalUnit: str(req.body.organisationalUnit),
      email: str(req.body.email),
      identityTemplateId: str(req.body.identityTemplateId),
      runNow: req.body.runNow !== false && req.body.runNow !== 'false',
      pipelineId: str(req.body.pipelineId) ?? null,
    });
    if ('queued' in result) return res.status(202).json(result);
    res.status(201).json(result.renewal);
  }),
);

api.get('/renewals', wrap((_req, res) => res.json(listRenewals())));

api.get(
  '/renewals/:id',
  wrap((req, res) => {
    const r = getRenewal(req.params.id as string);
    if (!r) return res.status(404).json({ error: 'Renewal not found' });
    res.json(r);
  }),
);

api.post(
  '/renewals/:id/complete',
  upload.array('files', 12),
  wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return res.status(400).json({ error: 'Upload the signed certificate.' });
    const r = await completeCsrRenewal(req.params.id as string, files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })));
    res.json(r);
  }),
);

api.get(
  '/renewals/:id/csr',
  wrap((req, res) => {
    const r = getRenewal(req.params.id as string);
    if (!r?.csrPem) return res.status(404).json({ error: 'CSR not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${r.certificateName.replace(/[^A-Za-z0-9._-]+/g, '_')}.csr"`);
    res.type('application/pkcs10').send(r.csrPem);
  }),
);

api.get(
  '/renewals/:id/outputs/:index',
  wrap(async (req, res) => {
    const f = await renewalOutputFile(req.params.id as string, Number(req.params.index));
    if (!f) return res.status(404).json({ error: 'Output not found' });
    res.download(f.path, f.filename);
  }),
);

api.get(
  '/renewals/:id/zip',
  wrap(async (req, res) => {
    const r = getRenewal(req.params.id as string);
    if (!r) return res.status(404).json({ error: 'Renewal not found' });
    const entries = renewalZipEntries(r.id);
    res.setHeader('Content-Disposition', `attachment; filename="${r.certificateName.replace(/[^A-Za-z0-9._-]+/g, '_')}-renewal.zip"`);
    res.type('application/zip');
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.on('error', (e) => res.destroy(e));
    zip.pipe(res);
    for (const e of entries) if (fs.existsSync(e.path)) zip.file(e.path, { name: e.name });
    await zip.finalize();
  }),
);

// Profiles -----------------------------------------------------------------

api.get(
  '/profiles',
  wrap((req, res) => {
    const all = listProfiles();
    const certificateId = str(req.query.certificateId);
    if (!certificateId) return res.json(all);
    const cert = getCertificate(certificateId);
    if (!cert) return res.json(all);
    res.json(all.map((p) => ({ ...p, applicable: profileAppliesTo(p, cert) })));
  }),
);

api.post(
  '/profiles/analyze',
  upload.single('file'),
  wrap(async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Upload a reference file.' });
    const detected = await detectFormat(f.buffer, f.originalname, str(req.body.password));
    if (!detected.format) return res.status(422).json({ error: `Could not recognise ${f.originalname}. Supported: PEM/DER certificates, PKCS#12, PKCS#7, PEM/DER private keys.`, detected });
    const spec = specFromDetected(detected, newId('out'));
    if (detected.format === 'pkcs12' && str(req.body.password)) spec.password = req.body.password;
    res.json({ detected, spec });
  }),
);

api.post('/profiles', wrap((req, res) => res.status(201).json(createProfile(req.body))));

api.get(
  '/profiles/:id',
  wrap((req, res) => {
    const p = getProfile(req.params.id as string);
    if (!p) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: p, certificates: listCertificates({ profileId: p.id }) });
  }),
);

api.put(
  '/profiles/:id',
  wrap((req, res) => {
    const p = updateProfile(req.params.id as string, req.body);
    if (!p) return res.status(404).json({ error: 'Profile not found' });
    res.json(p);
  }),
);

api.delete('/profiles/:id', wrap((req, res) => res.status(deleteProfile(req.params.id as string) ? 204 : 404).end()));

// Tags & groups ------------------------------------------------------------

api.get('/tags', wrap((_req, res) => res.json({ tags: listDistinctTags(), groups: listTagGroups() })));
api.get('/tag-groups', wrap((_req, res) => res.json(listTagGroups())));
api.post('/tag-groups', wrap((req, res) => res.status(201).json(createTagGroup(req.body))));
api.get(
  '/tag-groups/:id',
  wrap((req, res) => {
    const g = getTagGroup(req.params.id as string);
    if (!g) return res.status(404).json({ error: 'Tag group not found' });
    res.json({ group: g, certificates: listCertificates({ groupId: g.id }) });
  }),
);
api.put(
  '/tag-groups/:id',
  wrap((req, res) => {
    const g = updateTagGroup(req.params.id as string, req.body);
    if (!g) return res.status(404).json({ error: 'Tag group not found' });
    res.json(g);
  }),
);
api.delete('/tag-groups/:id', wrap((req, res) => res.status(deleteTagGroup(req.params.id as string) ? 204 : 404).end()));

// Identity templates -------------------------------------------------------

api.get('/identities', wrap((_req, res) => res.json(listIdentityTemplates())));
api.post('/identities', wrap((req, res) => res.status(201).json(createIdentityTemplate(req.body))));
api.get(
  '/identities/:id',
  wrap((req, res) => {
    const t = getIdentityTemplate(req.params.id as string);
    if (!t) return res.status(404).json({ error: 'Identity template not found' });
    res.json(t);
  }),
);
api.put(
  '/identities/:id',
  wrap((req, res) => {
    const t = updateIdentityTemplate(req.params.id as string, req.body);
    if (!t) return res.status(404).json({ error: 'Identity template not found' });
    res.json(t);
  }),
);
api.delete('/identities/:id', wrap((req, res) => res.status(deleteIdentityTemplate(req.params.id as string) ? 204 : 404).end()));

// Activity -----------------------------------------------------------------

api.get(
  '/activity',
  wrap((req, res) => {
    res.json({ events: listEvents({ limit: Number(req.query.limit) || 300, type: str(req.query.type) }), summary: timeSavedSummary(12) });
  }),
);

// Settings & CA ------------------------------------------------------------

api.get('/settings', wrap((_req, res) => res.json(getSettings())));
api.put('/settings', wrap((req, res) => res.json(saveSettings(req.body))));

api.get(
  '/ca',
  wrap(async (_req, res) => {
    if (!(await caExists())) return res.json({ exists: false });
    const pem = (await readCaCert())!;
    const parsed = await parseCertificate(pem);
    res.json({
      exists: true,
      subject: parsed.subject,
      commonName: parsed.commonName,
      notBefore: parsed.notBefore,
      notAfter: parsed.notAfter,
      fingerprintSha256: parsed.fingerprintSha256,
      keyAlgo: parsed.keyAlgo,
      keyBits: parsed.keyBits,
      pem,
    });
  }),
);

api.post(
  '/ca',
  wrap(async (req, res) => {
    if (await caExists()) return res.status(409).json({ error: 'An internal CA already exists. Delete it first to create a new one.' });
    const log = newLog();
    const settings = getSettings();
    await createCa(
      {
        commonName: str(req.body.commonName)?.trim() || `${settings.organisation} Internal CA`,
        organisation: str(req.body.organisation)?.trim() || settings.organisation,
        days: Math.min(7300, Math.max(365, Number(req.body.days) || 3650)),
      },
      log,
    );
    recordEvent({ type: 'ca', title: 'Created internal CA', detail: 'RSA 4096, SHA-256', commands: log.commands, minutesSaved: 30 });
    res.status(201).json({ ok: true });
  }),
);

api.delete(
  '/ca',
  wrap(async (_req, res) => {
    await deleteCa();
    res.status(204).end();
  }),
);

api.get(
  '/ca/certificate',
  wrap(async (_req, res) => {
    const pem = await readCaCert();
    if (!pem) return res.status(404).json({ error: 'No internal CA' });
    res.setHeader('Content-Disposition', 'attachment; filename="vigil-internal-ca.crt"');
    res.type('application/x-pem-file').send(pem);
  }),
);

function actorId(req: Request): string | null {
  return (req as AuthedRequest).user?.id ?? null;
}

// Certificate schedule + host links ---------------------------------------

api.get(
  '/certificates/:id/schedule',
  wrap((req, res) => {
    const schedule = getCertificateSchedule(req.params.id as string);
    if (!schedule) return res.status(404).json({ error: 'Certificate not found' });
    res.json(schedule);
  }),
);

api.put(
  '/certificates/:id/hosts',
  wrap((req, res) => {
    const cert = getCertificate(req.params.id as string);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    setCertificateHosts(cert.id, list(req.body.hostIds ?? req.body.hosts));
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'certificate.hosts', entityType: 'certificate', entityId: cert.id });
    res.json(hostsForCertificate(cert.id));
  }),
);

// Jobs + scheduler --------------------------------------------------------

api.get('/scheduler', wrap((_req, res) => res.json(getSchedulerHeartbeat())));

api.get(
  '/jobs',
  wrap((req, res) => {
    res.json(listJobs({ state: str(req.query.state), limit: Number(req.query.limit) || 100 }));
  }),
);

api.get(
  '/jobs/:id',
  wrap((req, res) => {
    const job = getJob(req.params.id as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  }),
);

api.post(
  '/jobs/:id/cancel',
  wrap((req, res) => {
    const job = cancelJob(req.params.id as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'job.cancel', entityType: 'job', entityId: job.id });
    res.json(job);
  }),
);

api.post(
  '/jobs/:id/retry',
  wrap((req, res) => {
    const job = retryJob(req.params.id as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'job.retry', entityType: 'job', entityId: job.id });
    res.json(job);
  }),
);

// Hosts -------------------------------------------------------------------

api.get('/hosts', wrap((_req, res) => res.json(listHosts())));
api.post(
  '/hosts',
  wrap((req, res) => {
    const host = createHost(req.body);
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'host.create', entityType: 'host', entityId: host.id, after: { name: host.name } });
    res.status(201).json(host);
  }),
);
api.get(
  '/hosts/:id',
  wrap((req, res) => {
    const host = getHost(req.params.id as string);
    if (!host) return res.status(404).json({ error: 'Host not found' });
    res.json(host);
  }),
);
api.put(
  '/hosts/:id',
  wrap((req, res) => {
    const host = updateHost(req.params.id as string, req.body);
    if (!host) return res.status(404).json({ error: 'Host not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'host.update', entityType: 'host', entityId: host.id });
    res.json(host);
  }),
);
api.delete(
  '/hosts/:id',
  wrap((req, res) => {
    const ok = deleteHost(req.params.id as string);
    if (ok) writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'host.delete', entityType: 'host', entityId: req.params.id as string });
    res.status(ok ? 204 : 404).end();
  }),
);
api.post(
  '/hosts/:id/certificates/:certificateId',
  wrap((req, res) => {
    const host = getHost(req.params.id as string);
    const cert = getCertificate(req.params.certificateId as string);
    if (!host || !cert) return res.status(404).json({ error: 'Host or certificate not found' });
    linkCertificateHost(cert.id, host.id);
    res.json(getHost(host.id));
  }),
);
api.delete(
  '/hosts/:id/certificates/:certificateId',
  wrap((req, res) => {
    unlinkCertificateHost(req.params.certificateId as string, req.params.id as string);
    res.status(204).end();
  }),
);

// Credentials (metadata only — secrets never leave the process) ------------

api.get('/credentials', wrap((_req, res) => res.json(listCredentials())));
api.post(
  '/credentials',
  wrap((req, res) => {
    const cred = createCredential(req.body);
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'credential.create', entityType: 'credential', entityId: cred.id, after: { name: cred.name, kind: cred.kind } });
    res.status(201).json(cred);
  }),
);
api.get(
  '/credentials/:id',
  wrap((req, res) => {
    const cred = getCredentialMeta(req.params.id as string);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    res.json(cred);
  }),
);
api.put(
  '/credentials/:id',
  wrap((req, res) => {
    const cred = updateCredential(req.params.id as string, req.body);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'credential.update', entityType: 'credential', entityId: cred.id });
    res.json(cred);
  }),
);
api.delete(
  '/credentials/:id',
  wrap((req, res) => {
    const ok = deleteCredential(req.params.id as string);
    if (ok) writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'credential.delete', entityType: 'credential', entityId: req.params.id as string });
    res.status(ok ? 204 : 404).end();
  }),
);

// Pipelines ---------------------------------------------------------------

api.get('/pipelines', wrap((_req, res) => res.json(listPipelines())));
api.get('/pipelines/steps', wrap((_req, res) => res.json(describeStepLibrary())));
api.post(
  '/pipelines',
  wrap((req, res) => {
    const p = createPipeline(req.body);
    res.status(201).json(p);
  }),
);
api.get(
  '/pipelines/:id',
  wrap((req, res) => {
    const p = getPipeline(req.params.id as string);
    if (!p) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ pipeline: p, runs: listPipelineRuns({ pipelineId: p.id, limit: 50 }) });
  }),
);
api.put(
  '/pipelines/:id',
  wrap((req, res) => {
    const p = updatePipeline(req.params.id as string, req.body);
    if (!p) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(p);
  }),
);
api.delete(
  '/pipelines/:id',
  wrap((req, res) => res.status(deletePipeline(req.params.id as string) ? 204 : 404).end()),
);
api.post(
  '/pipelines/:id/plan',
  wrap(async (req, res) => {
    const planned = await planPipeline({
      pipelineId: req.params.id as string,
      certificateId: str(req.body.certificateId),
      hostId: str(req.body.hostId),
      params: req.body.params && typeof req.body.params === 'object' ? req.body.params : req.body,
    });
    res.json(planned);
  }),
);
api.post(
  '/pipelines/:id/run',
  wrap(async (req, res) => {
    const run = await executePipeline({
      pipelineId: req.params.id as string,
      certificateId: str(req.body.certificateId),
      hostId: str(req.body.hostId),
      renewalId: str(req.body.renewalId),
      params: req.body.params && typeof req.body.params === 'object' ? req.body.params : {},
      dryRun: req.body.dryRun === true,
      actorUserId: actorId(req),
    });
    res.status(201).json(run);
  }),
);

api.get(
  '/pipeline-runs',
  wrap((req, res) => {
    res.json(listPipelineRuns({ certificateId: str(req.query.certificateId), pipelineId: str(req.query.pipelineId) }));
  }),
);
api.get(
  '/pipeline-runs/:id',
  wrap((req, res) => {
    const run = getPipelineRun(req.params.id as string);
    if (!run) return res.status(404).json({ error: 'Pipeline run not found' });
    res.json(run);
  }),
);
api.post(
  '/pipeline-runs/:id/approve',
  requireRole('approver', 'admin'),
  wrap(async (req, res) => {
    const run = await approvePipelineRun(req.params.id as string, { userId: actorId(req) });
    res.json(run);
  }),
);
api.post(
  '/pipeline-runs/:id/reject',
  requireRole('approver', 'admin'),
  wrap(async (req, res) => {
    const run = await approvePipelineRun(req.params.id as string, { userId: actorId(req), reject: true });
    res.json(run);
  }),
);

// Blueprints --------------------------------------------------------------

api.get('/blueprints', wrap((_req, res) => res.json(listBlueprints())));
api.post(
  '/blueprints',
  wrap((req, res) => res.status(201).json(createBlueprint(req.body))),
);
api.get(
  '/blueprints/:id',
  wrap((req, res) => {
    const b = getBlueprint(req.params.id as string);
    if (!b) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(b);
  }),
);
api.put(
  '/blueprints/:id',
  wrap((req, res) => {
    const b = updateBlueprint(req.params.id as string, req.body);
    if (!b) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(b);
  }),
);
api.delete(
  '/blueprints/:id',
  wrap((req, res) => res.status(deleteBlueprint(req.params.id as string) ? 204 : 404).end()),
);
api.post(
  '/blueprints/:id/instantiate',
  wrap(async (req, res) => {
    const cn = str(req.body.commonName)?.trim();
    if (!cn) return res.status(400).json({ error: 'commonName is required' });
    const cert = await instantiateBlueprint(req.params.id as string, {
      commonName: cn,
      sans: req.body.sans !== undefined ? list(req.body.sans) : undefined,
      hostIds: list(req.body.hostIds),
      destinationPath: str(req.body.destinationPath),
      mode: str(req.body.mode) as RenewalMethod | undefined,
      name: str(req.body.name),
      notes: str(req.body.notes),
      tags: list(req.body.tags),
    });
    res.status(201).json(cert);
  }),
);
api.get(
  '/blueprints/:id/drift',
  wrap((req, res) => {
    try {
      res.json(detectBlueprintDrift(req.params.id as string));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Blueprint not found') return res.status(404).json({ error: message });
      throw err;
    }
  }),
);

// Maintenance windows -----------------------------------------------------

api.get('/windows', wrap((_req, res) => res.json(listWindows())));
api.post('/windows', wrap((req, res) => res.status(201).json(createWindow(req.body))));
api.get(
  '/windows/:id',
  wrap((req, res) => {
    const w = getWindow(req.params.id as string);
    if (!w) return res.status(404).json({ error: 'Window not found' });
    res.json(w);
  }),
);
api.put(
  '/windows/:id',
  wrap((req, res) => {
    const w = updateWindow(req.params.id as string, req.body);
    if (!w) return res.status(404).json({ error: 'Window not found' });
    res.json(w);
  }),
);
api.delete('/windows/:id', wrap((req, res) => res.status(deleteWindow(req.params.id as string) ? 204 : 404).end()));

// Auth + users (VIGIL_AUTH=1 enables enforcement; routes always exist) ----

api.post(
  '/auth/login',
  wrap((req, res) => {
    const username = str(req.body.username) ?? '';
    const password = str(req.body.password) ?? '';
    const user = authenticateLocal(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
    const session = createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    writeAudit({ actorUserId: user.id, actorType: 'user', action: 'auth.login', entityType: 'user', entityId: user.id });
    res.json({ user, expiresAt: session.expiresAt });
  }),
);
api.post(
  '/auth/logout',
  wrap((req, res) => {
    const cookie = req.headers.cookie ?? '';
    const match = cookie.match(/(?:^|;\s*)vigil_session=([^;]+)/);
    if (match) destroySession(decodeURIComponent(match[1]));
    clearSessionCookie(res);
    res.status(204).end();
  }),
);
api.get(
  '/auth/me',
  wrap((req, res) => {
    const user = (req as AuthedRequest).user;
    if (!user) return res.json({ user: null, authEnabled: config.authEnabled });
    res.json({ user, authEnabled: config.authEnabled });
  }),
);

api.get('/users', requireRole('admin'), wrap((_req, res) => res.json(listUsers())));
api.post(
  '/users',
  requireRole('admin'),
  wrap((req, res) => {
    const username = str(req.body.username);
    const password = str(req.body.password);
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
    const user = createUser({
      username,
      password,
      displayName: str(req.body.displayName),
      email: str(req.body.email),
      role: str(req.body.role) as UserRole | undefined,
      scopeTags: list(req.body.scopeTags),
    });
    res.status(201).json(user);
  }),
);
api.get(
  '/users/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const user = getUser(req.params.id as string);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  }),
);
api.put(
  '/users/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const user = updateUser(req.params.id as string, {
      displayName: str(req.body.displayName),
      email: str(req.body.email),
      role: str(req.body.role) as UserRole | undefined,
      scopeTags: req.body.scopeTags !== undefined ? list(req.body.scopeTags) : undefined,
      isActive: req.body.isActive,
      password: str(req.body.password),
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  }),
);
api.delete(
  '/users/:id',
  requireRole('admin'),
  wrap((req, res) => res.status(deleteUser(req.params.id as string) ? 204 : 404).end()),
);

// Notifications -----------------------------------------------------------

api.get('/notifications', wrap((_req, res) => res.json(listNotificationTargets())));
api.post('/notifications', wrap((req, res) => res.status(201).json(createNotificationTarget(req.body))));
api.get(
  '/notifications/:id',
  wrap((req, res) => {
    const t = getNotificationTarget(req.params.id as string);
    if (!t) return res.status(404).json({ error: 'Notification target not found' });
    res.json(t);
  }),
);
api.put(
  '/notifications/:id',
  wrap((req, res) => {
    const t = updateNotificationTarget(req.params.id as string, req.body);
    if (!t) return res.status(404).json({ error: 'Notification target not found' });
    res.json(t);
  }),
);
api.delete(
  '/notifications/:id',
  wrap((req, res) => res.status(deleteNotificationTarget(req.params.id as string) ? 204 : 404).end()),
);

// Audit (append-only; CSV via ?format=csv) --------------------------------

api.get(
  '/audit',
  wrap((req, res) => {
    const entries = listAudit({
      entityType: str(req.query.entityType),
      entityId: str(req.query.entityId),
      action: str(req.query.action),
      limit: Number(req.query.limit) || 200,
    });
    if (str(req.query.format) === 'csv') {
      res.setHeader('Content-Disposition', 'attachment; filename="vigil-audit.csv"');
      return res.type('text/csv').send(auditToCsv(entries));
    }
    res.json(entries);
  }),
);

