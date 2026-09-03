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
import { createProfile, deleteProfile, getProfile, listProfiles, updateProfile } from './services/profiles.js';
import { completeCsrRenewal, getRenewal, listRenewals, renewalOutputFile, renewalZipEntries, startRenewal } from './services/renewals.js';
import { getSettings, saveSettings } from './services/settings.js';
import type { KeyMode, OutputFormat, RenewalMethod } from './types.js';

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
    res.json({
      certificate: cert,
      pem: vault.certPem,
      chain: chain.map((c) => ({ subject: c.subject, commonName: c.commonName, issuer: c.issuer, notAfter: c.notAfter, isSelfSigned: c.isSelfSigned, fingerprintSha256: c.fingerprintSha256 })),
      renewals,
      events,
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
    const renewal = await startRenewal(req.params.id as string, {
      method,
      keyMode: (str(req.body.keyMode) as KeyMode | undefined) ?? 'rsa-2048',
      validityDays: Number(req.body.validityDays) || getSettings().defaultValidityDays,
      profileIds: list(req.body.profileIds),
      deploy: req.body.deploy === true || req.body.deploy === 'true',
    });
    res.status(201).json(renewal);
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

api.get('/profiles', wrap((_req, res) => res.json(listProfiles())));

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
