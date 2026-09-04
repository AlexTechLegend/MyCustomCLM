import { Router } from 'express';
import { takeRateLimit } from '../lib/rateLimit.js';
import { discoveryScanBody, parseBody } from '../lib/schema.js';
import { requireRole } from '../services/auth.js';
import { listDiscoveryResults, runDiscoveryScan } from '../services/discovery.js';
import { str, wrap } from './http.js';

export const discoveryRoutes = Router();

discoveryRoutes.get(
  '/discovery',
  wrap((req, res) => {
    res.json(
      listDiscoveryResults({
        scanId: str(req.query.scanId),
        limit: Number(req.query.limit) || 500,
      }),
    );
  }),
);

discoveryRoutes.post(
  '/discovery/scan',
  requireRole('operator'),
  wrap(async (req, res) => {
    const slot = takeRateLimit(`discovery-scan:${req.ip ?? 'local'}`, { max: 4, maxInflight: 1 });
    try {
      const body = parseBody(discoveryScanBody, req.body);
      const hits = await runDiscoveryScan({
        targets: body.targets,
        ports: body.ports,
        concurrency: body.concurrency,
        delayMs: body.delayMs,
        timeoutMs: body.timeoutMs,
      });
      res.status(201).json({ hits, results: listDiscoveryResults({ limit: 200 }) });
    } finally {
      slot.release();
    }
  }),
);
