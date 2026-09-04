import archiver from 'archiver';
import fs from 'node:fs';
import { Router } from 'express';
import { completeCsrRenewal, getRenewal, listRenewals, renewalOutputFile, renewalZipEntries } from '../services/renewals.js';
import { requireRole } from '../services/auth.js';
import { upload, wrap } from './http.js';

export const renewalsRoutes = Router();

renewalsRoutes.get('/renewals', wrap((_req, res) => res.json(listRenewals())));

renewalsRoutes.get(
  '/renewals/:id',
  wrap((req, res) => {
    const r = getRenewal(req.params.id as string);
    if (!r) return res.status(404).json({ error: 'Renewal not found' });
    res.json(r);
  }),
);

renewalsRoutes.post(
  '/renewals/:id/complete',
  requireRole('operator'),
  upload.array('files', 12),
  wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return res.status(400).json({ error: 'Upload the signed certificate.' });
    const r = await completeCsrRenewal(
      req.params.id as string,
      files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })),
    );
    res.json(r);
  }),
);

renewalsRoutes.get(
  '/renewals/:id/csr',
  wrap((req, res) => {
    const r = getRenewal(req.params.id as string);
    if (!r?.csrPem) return res.status(404).json({ error: 'CSR not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${r.certificateName.replace(/[^A-Za-z0-9._-]+/g, '_')}.csr"`);
    res.type('application/pkcs10').send(r.csrPem);
  }),
);

renewalsRoutes.get(
  '/renewals/:id/outputs/:index',
  wrap(async (req, res) => {
    const f = await renewalOutputFile(req.params.id as string, Number(req.params.index));
    if (!f) return res.status(404).json({ error: 'Output not found' });
    res.download(f.path, f.filename);
  }),
);

renewalsRoutes.get(
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
