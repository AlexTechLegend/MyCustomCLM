import { Router } from 'express';
import { caExists, createCa, deleteCa, parseCertificate, readCaCert, newLog } from '../openssl.js';
import { recordEvent } from '../services/events.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { requireRole } from '../services/auth.js';
import { str, wrap } from './http.js';

export const settingsRoutes = Router();

settingsRoutes.get('/settings', wrap((_req, res) => res.json(getSettings())));
settingsRoutes.put('/settings', requireRole('admin'), wrap((req, res) => res.json(saveSettings(req.body))));

settingsRoutes.get(
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

settingsRoutes.post(
  '/ca',
  requireRole('admin'),
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

settingsRoutes.delete(
  '/ca',
  requireRole('admin'),
  wrap(async (_req, res) => {
    await deleteCa();
    res.status(204).end();
  }),
);

settingsRoutes.get(
  '/ca/certificate',
  wrap(async (_req, res) => {
    const pem = await readCaCert();
    if (!pem) return res.status(404).json({ error: 'No internal CA' });
    res.setHeader('Content-Disposition', 'attachment; filename="vigil-internal-ca.crt"');
    res.type('application/x-pem-file').send(pem);
  }),
);
