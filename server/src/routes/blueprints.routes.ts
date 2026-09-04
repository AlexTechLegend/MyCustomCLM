import { Router } from 'express';
import { takeRateLimit } from '../lib/rateLimit.js';
import { requireRole } from '../services/auth.js';
import { createBlueprint, deleteBlueprint, detectBlueprintDrift, getBlueprint, instantiateBlueprint, listBlueprints, updateBlueprint } from '../services/blueprints.js';
import { instantiateBody, parseBody } from '../lib/schema.js';
import { wrap } from './http.js';

export const blueprintsRoutes = Router();

blueprintsRoutes.get('/blueprints', wrap((_req, res) => res.json(listBlueprints())));
blueprintsRoutes.post('/blueprints', requireRole('admin'), wrap((req, res) => res.status(201).json(createBlueprint(req.body))));
blueprintsRoutes.get(
  '/blueprints/:id',
  wrap((req, res) => {
    const b = getBlueprint(req.params.id as string);
    if (!b) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(b);
  }),
);
blueprintsRoutes.put(
  '/blueprints/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const b = updateBlueprint(req.params.id as string, req.body);
    if (!b) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(b);
  }),
);
blueprintsRoutes.delete('/blueprints/:id', requireRole('admin'), wrap((req, res) => res.status(deleteBlueprint(req.params.id as string) ? 204 : 404).end()));

blueprintsRoutes.post(
  '/blueprints/:id/instantiate',
  requireRole('admin'),
  wrap(async (req, res) => {
    const slot = takeRateLimit(`instantiate:${req.ip ?? 'local'}`);
    try {
      const body = parseBody(instantiateBody, req.body);
      const cert = await instantiateBlueprint(req.params.id as string, {
        commonName: body.commonName.trim(),
        sans: body.sans,
        hostIds: body.hostIds,
        destinationPath: body.destinationPath,
        mode: body.mode,
        name: body.name,
        notes: body.notes,
        tags: body.tags,
      });
      res.status(201).json(cert);
    } finally {
      slot.release();
    }
  }),
);

blueprintsRoutes.get(
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
