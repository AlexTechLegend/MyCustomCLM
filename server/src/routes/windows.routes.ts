import { Router } from 'express';
import { requireRole } from '../services/auth.js';
import { createWindow, deleteWindow, getWindow, listWindows, updateWindow } from '../services/windows.js';
import { wrap } from './http.js';

export const windowsRoutes = Router();

windowsRoutes.get('/windows', wrap((_req, res) => res.json(listWindows())));
windowsRoutes.post('/windows', requireRole('operator'), wrap((req, res) => res.status(201).json(createWindow(req.body))));
windowsRoutes.get(
  '/windows/:id',
  wrap((req, res) => {
    const w = getWindow(req.params.id as string);
    if (!w) return res.status(404).json({ error: 'Window not found' });
    res.json(w);
  }),
);
windowsRoutes.put(
  '/windows/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const w = updateWindow(req.params.id as string, req.body);
    if (!w) return res.status(404).json({ error: 'Window not found' });
    res.json(w);
  }),
);
windowsRoutes.delete('/windows/:id', requireRole('operator'), wrap((req, res) => res.status(deleteWindow(req.params.id as string) ? 204 : 404).end()));
