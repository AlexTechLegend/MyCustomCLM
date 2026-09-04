import { Router } from 'express';
import { writeAudit } from '../services/audit.js';
import { requireRole } from '../services/auth.js';
import { createCredential, deleteCredential, getCredentialMeta, listCredentials, updateCredential } from '../services/credentials.js';
import { credentialBody, parseBody } from '../lib/schema.js';
import { actorId, wrap } from './http.js';

export const credentialsRoutes = Router();

credentialsRoutes.get('/credentials', wrap((_req, res) => res.json(listCredentials())));
credentialsRoutes.post(
  '/credentials',
  requireRole('admin'),
  wrap((req, res) => {
    const cred = createCredential(parseBody(credentialBody, req.body));
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'credential.create', entityType: 'credential', entityId: cred.id, after: { name: cred.name, kind: cred.kind } });
    res.status(201).json(cred);
  }),
);
credentialsRoutes.get(
  '/credentials/:id',
  wrap((req, res) => {
    const cred = getCredentialMeta(req.params.id as string);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    res.json(cred);
  }),
);
credentialsRoutes.put(
  '/credentials/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const cred = updateCredential(req.params.id as string, parseBody(credentialBody, req.body));
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'credential.update', entityType: 'credential', entityId: cred.id });
    res.json(cred);
  }),
);
credentialsRoutes.delete(
  '/credentials/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const ok = deleteCredential(req.params.id as string);
    if (ok) writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'credential.delete', entityType: 'credential', entityId: req.params.id as string });
    res.status(ok ? 204 : 404).end();
  }),
);
