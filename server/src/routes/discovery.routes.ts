import { Router } from 'express';
import { takeRateLimit } from '../lib/rateLimit.js';
import { discoveryScanBody, parseBody } from '../lib/schema.js';
import { requireRole } from '../services/auth.js';
import { latestDiscoveryScanId, listDiscoveryResults, persistDiscoveryHits, runDiscoveryScan } from '../services/discovery.js';
import { newId } from '../db.js';
import { str, wrap } from './http.js';

export const discoveryRoutes = Router();

discoveryRoutes.get(
  '/discovery',
  wrap((req, res) => {
    const scanId = str(req.query.scanId);
    res.json({
      scanId: scanId ?? latestDiscoveryScanId(),
      results: listDiscoveryResults(scanId),
    });
  }),
);

discoveryRoutes.post(
  '/discovery/scan',
  requireRole('operator'),
  wrap(async (req, res) => {
    const slot = takeRateLimit(`discovery:${req.ip ?? 'local'}`, { max: 4, maxInflight: 1 });
    try {
      const body = parseBody(discoveryScanBody, req.body);
      const scanId = newId('scan');
      const hits = await runDiscoveryScan({
        targets: body.targets,
        ports: body.ports,
        concurrency: body.concurrency,
      });
      const persisted = persistDiscoveryHits(scanId, hits);
      res.status(201).json({ scanId, hits, results: persisted });
    } finally {
      slot.release();
    }
  }),
);
