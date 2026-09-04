import { Router } from 'express';
import { FORMAT_LABELS, inspectText, newLog } from '../openssl.js';
import { takeRateLimit } from '../lib/rateLimit.js';
import {
  adhocDownload,
  chainDetails,
  deleteCertificate,
  getCertificate,
  importCertificate,
  listCertificates,
  readVault,
  updateCertificate,
} from '../services/certificates.js';
import { getCertificateSchedule } from '../services/blueprints.js';
import { listEvents } from '../services/events.js';
import { hostsForCertificate, setCertificateHosts } from '../services/hosts.js';
import { getProfiles } from '../services/profiles.js';
import { listRenewals, startRenewal } from '../services/renewals.js';
import { getSettings } from '../services/settings.js';
import { writeAudit } from '../services/audit.js';
import { requireRole } from '../services/auth.js';
import type { KeyMode, OutputFormat } from '../types.js';
import { parseBody, renewBody } from '../lib/schema.js';
import { actorId, list, str, upload, wrap } from './http.js';

export const certificatesRoutes = Router();

certificatesRoutes.get(
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

certificatesRoutes.post(
  '/certificates/import',
  requireRole('operator'),
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

certificatesRoutes.get(
  '/certificates/:id',
  wrap(async (req, res) => {
    const cert = getCertificate(req.params.id as string);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const vault = await readVault(cert.id);
    const chain = await chainDetails(cert.id);
    res.json({
      certificate: cert,
      pem: vault.certPem,
      chain: chain.map((c) => ({
        subject: c.subject,
        commonName: c.commonName,
        issuer: c.issuer,
        notAfter: c.notAfter,
        isSelfSigned: c.isSelfSigned,
        fingerprintSha256: c.fingerprintSha256,
      })),
      renewals: listRenewals(cert.id),
      events: listEvents({ certificateId: cert.id, limit: 50 }),
      hosts: hostsForCertificate(cert.id),
      profiles: getProfiles(cert.profileIds),
    });
  }),
);

certificatesRoutes.get(
  '/certificates/:id/text',
  wrap(async (req, res) => {
    const cert = getCertificate(req.params.id as string);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const vault = await readVault(cert.id);
    res.type('text/plain').send(await inspectText(vault.certPem));
  }),
);

certificatesRoutes.patch(
  '/certificates/:id',
  requireRole('operator'),
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

certificatesRoutes.delete(
  '/certificates/:id',
  requireRole('operator'),
  wrap(async (req, res) => {
    const ok = await deleteCertificate(req.params.id as string);
    res.status(ok ? 204 : 404).end();
  }),
);

certificatesRoutes.get(
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
    const { recordEvent } = await import('../services/events.js');
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

certificatesRoutes.post(
  '/certificates/:id/renew',
  requireRole('operator'),
  wrap(async (req, res) => {
    const slot = takeRateLimit(`renew:${req.ip ?? 'local'}`);
    try {
      const body = parseBody(renewBody, req.body);
      const result = await startRenewal(req.params.id as string, {
        method: body.method,
        keyMode: (body.keyMode as KeyMode | undefined) ?? 'rsa-2048',
        validityDays: body.validityDays || getSettings().defaultValidityDays,
        profileIds: body.profileIds ?? list(req.body.profileIds),
        deploy: body.deploy === true || req.body.deploy === 'true',
        commonName: body.commonName,
        sans: body.sans,
        country: body.country,
        state: body.state,
        locality: body.locality,
        organisation: body.organisation,
        organisationalUnit: body.organisationalUnit,
        email: body.email,
        identityTemplateId: body.identityTemplateId,
        runNow: body.runNow !== false && req.body.runNow !== 'false',
        pipelineId: body.pipelineId ?? null,
      });
      if ('queued' in result) return res.status(202).json(result);
      res.status(201).json(result.renewal);
    } finally {
      slot.release();
    }
  }),
);

certificatesRoutes.get(
  '/certificates/:id/schedule',
  wrap((req, res) => {
    const schedule = getCertificateSchedule(req.params.id as string);
    if (!schedule) return res.status(404).json({ error: 'Certificate not found' });
    res.json(schedule);
  }),
);

certificatesRoutes.put(
  '/certificates/:id/hosts',
  requireRole('operator'),
  wrap((req, res) => {
    const cert = getCertificate(req.params.id as string);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    setCertificateHosts(cert.id, list(req.body.hostIds ?? req.body.hosts));
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'certificate.hosts', entityType: 'certificate', entityId: cert.id });
    res.json(hostsForCertificate(cert.id));
  }),
);
