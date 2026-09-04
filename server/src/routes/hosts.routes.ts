import { Router } from 'express';
import { getCertificate } from '../services/certificates.js';
import { writeAudit } from '../services/audit.js';
import { requireRole } from '../services/auth.js';
import { createHost, deleteHost, getHost, linkCertificateHost, listHosts, unlinkCertificateHost, updateHost } from '../services/hosts.js';
import { hostBody, parseBody } from '../lib/schema.js';
import { actorId, wrap } from './http.js';

export const hostsRoutes = Router();

hostsRoutes.get('/hosts', wrap((_req, res) => res.json(listHosts())));
hostsRoutes.post(
  '/hosts',
  requireRole('operator'),
  wrap((req, res) => {
    const host = createHost(parseBody(hostBody, req.body));
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'host.create', entityType: 'host', entityId: host.id, after: { name: host.name } });
    res.status(201).json(host);
  }),
);
hostsRoutes.get(
  '/hosts/:id',
  wrap((req, res) => {
    const host = getHost(req.params.id as string);
    if (!host) return res.status(404).json({ error: 'Host not found' });
    res.json(host);
  }),
);
hostsRoutes.put(
  '/hosts/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const host = updateHost(req.params.id as string, parseBody(hostBody, req.body));
    if (!host) return res.status(404).json({ error: 'Host not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'host.update', entityType: 'host', entityId: host.id });
    res.json(host);
  }),
);
hostsRoutes.delete(
  '/hosts/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const ok = deleteHost(req.params.id as string);
    if (ok) writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'host.delete', entityType: 'host', entityId: req.params.id as string });
    res.status(ok ? 204 : 404).end();
  }),
);
hostsRoutes.post(
  '/hosts/:id/certificates/:certificateId',
  requireRole('operator'),
  wrap((req, res) => {
    const host = getHost(req.params.id as string);
    const cert = getCertificate(req.params.certificateId as string);
    if (!host || !cert) return res.status(404).json({ error: 'Host or certificate not found' });
    linkCertificateHost(cert.id, host.id);
    res.json(getHost(host.id));
  }),
);
hostsRoutes.delete(
  '/hosts/:id/certificates/:certificateId',
  requireRole('operator'),
  wrap((req, res) => {
    unlinkCertificateHost(req.params.certificateId as string, req.params.id as string);
    res.status(204).end();
  }),
);
