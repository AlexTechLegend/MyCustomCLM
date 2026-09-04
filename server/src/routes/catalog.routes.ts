import { Router } from 'express';
import { newId } from '../db.js';
import { detectFormat, specFromDetected } from '../openssl.js';
import { dashboard } from '../services/dashboard.js';
import { listEvents, timeSavedSummary } from '../services/events.js';
import { createIdentityTemplate, deleteIdentityTemplate, getIdentityTemplate, listIdentityTemplates, updateIdentityTemplate } from '../services/identities.js';
import { createProfile, deleteProfile, getProfile, listProfiles, profileAppliesTo, updateProfile } from '../services/profiles.js';
import { getCertificate, listCertificates } from '../services/certificates.js';
import { createTagGroup, deleteTagGroup, getTagGroup, listDistinctTags, listTagGroups, updateTagGroup } from '../services/tags.js';
import { requireRole } from '../services/auth.js';
import { str, upload, wrap } from './http.js';

export const catalogRoutes = Router();

catalogRoutes.get('/dashboard', wrap((_req, res) => res.json(dashboard())));

catalogRoutes.get(
  '/activity',
  wrap((req, res) => {
    res.json({ events: listEvents({ limit: Number(req.query.limit) || 300, type: str(req.query.type) }), summary: timeSavedSummary(12) });
  }),
);

catalogRoutes.get(
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

catalogRoutes.post(
  '/profiles/analyze',
  requireRole('operator'),
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

catalogRoutes.post('/profiles', requireRole('operator'), wrap((req, res) => res.status(201).json(createProfile(req.body))));
catalogRoutes.get(
  '/profiles/:id',
  wrap((req, res) => {
    const p = getProfile(req.params.id as string);
    if (!p) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: p, certificates: listCertificates({ profileId: p.id }) });
  }),
);
catalogRoutes.put(
  '/profiles/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const p = updateProfile(req.params.id as string, req.body);
    if (!p) return res.status(404).json({ error: 'Profile not found' });
    res.json(p);
  }),
);
catalogRoutes.delete('/profiles/:id', requireRole('operator'), wrap((req, res) => res.status(deleteProfile(req.params.id as string) ? 204 : 404).end()));

catalogRoutes.get('/tags', wrap((_req, res) => res.json({ tags: listDistinctTags(), groups: listTagGroups() })));
catalogRoutes.get('/tag-groups', wrap((_req, res) => res.json(listTagGroups())));
catalogRoutes.post('/tag-groups', requireRole('operator'), wrap((req, res) => res.status(201).json(createTagGroup(req.body))));
catalogRoutes.get(
  '/tag-groups/:id',
  wrap((req, res) => {
    const g = getTagGroup(req.params.id as string);
    if (!g) return res.status(404).json({ error: 'Tag group not found' });
    res.json({ group: g, certificates: listCertificates({ groupId: g.id }) });
  }),
);
catalogRoutes.put(
  '/tag-groups/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const g = updateTagGroup(req.params.id as string, req.body);
    if (!g) return res.status(404).json({ error: 'Tag group not found' });
    res.json(g);
  }),
);
catalogRoutes.delete('/tag-groups/:id', requireRole('operator'), wrap((req, res) => res.status(deleteTagGroup(req.params.id as string) ? 204 : 404).end()));

catalogRoutes.get('/identities', wrap((_req, res) => res.json(listIdentityTemplates())));
catalogRoutes.post('/identities', requireRole('operator'), wrap((req, res) => res.status(201).json(createIdentityTemplate(req.body))));
catalogRoutes.get(
  '/identities/:id',
  wrap((req, res) => {
    const t = getIdentityTemplate(req.params.id as string);
    if (!t) return res.status(404).json({ error: 'Identity template not found' });
    res.json(t);
  }),
);
catalogRoutes.put(
  '/identities/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const t = updateIdentityTemplate(req.params.id as string, req.body);
    if (!t) return res.status(404).json({ error: 'Identity template not found' });
    res.json(t);
  }),
);
catalogRoutes.delete('/identities/:id', requireRole('operator'), wrap((req, res) => res.status(deleteIdentityTemplate(req.params.id as string) ? 204 : 404).end()));
