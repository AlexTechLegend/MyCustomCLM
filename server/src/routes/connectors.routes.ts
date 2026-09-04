import { Router } from 'express';
import { requireRole } from '../services/auth.js';
import { listAdcsTemplates } from '../services/connectors/adcs.js';
import { str, wrap } from './http.js';

export const connectorsRoutes = Router();

connectorsRoutes.get(
  '/connectors/adcs/templates',
  requireRole('operator'),
  wrap(async (req, res) => {
    const templates = await listAdcsTemplates({ cesUrl: str(req.query.cesUrl) });
    res.json({ templates });
  }),
);
