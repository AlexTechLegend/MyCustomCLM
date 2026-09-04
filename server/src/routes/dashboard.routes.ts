import { Router } from 'express';
import type { AuthedRequest } from '../services/auth.js';
import { requireRole } from '../services/auth.js';
import { dashboardTemplateStoreBody, parseBody } from '../lib/schema.js';
import { getTemplateStore, resolveTemplateId, saveTemplateStore } from '../services/dashboardTemplates.js';
import { wrap } from './http.js';

export const dashboardRoutes = Router();

dashboardRoutes.get(
  '/dashboard-templates',
  wrap((req, res) => {
    const store = getTemplateStore();
    const user = (req as AuthedRequest).user;
    res.json({ ...store, resolvedId: resolveTemplateId(store, user) });
  }),
);

dashboardRoutes.put(
  '/dashboard-templates',
  requireRole('admin'),
  wrap((req, res) => {
    const body = parseBody(dashboardTemplateStoreBody, req.body);
    const store = saveTemplateStore(body);
    const user = (req as AuthedRequest).user;
    res.json({ ...store, resolvedId: resolveTemplateId(store, user) });
  }),
);
