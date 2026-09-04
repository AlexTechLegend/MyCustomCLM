import { Router } from 'express';
import { openApiDocument } from '../lib/openapi.js';

export const healthRoutes = Router();

healthRoutes.get('/health', (_req, res) => res.json({ ok: true }));
healthRoutes.get('/openapi.json', (_req, res) => res.json(openApiDocument()));
