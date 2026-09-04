import { Router } from 'express';
import { auditToCsv, listAudit } from '../services/audit.js';
import { requireRole } from '../services/auth.js';
import { createNotificationTarget, deleteNotificationTarget, getNotificationTarget, listNotificationTargets, testSendNotification, updateNotificationTarget } from '../services/notifications.js';
import { str, wrap } from './http.js';

export const notificationsRoutes = Router();

notificationsRoutes.get('/notifications', wrap((_req, res) => res.json(listNotificationTargets())));
notificationsRoutes.post('/notifications', requireRole('admin'), wrap((req, res) => res.status(201).json(createNotificationTarget(req.body))));
notificationsRoutes.get(
  '/notifications/:id',
  wrap((req, res) => {
    const t = getNotificationTarget(req.params.id as string);
    if (!t) return res.status(404).json({ error: 'Notification target not found' });
    res.json(t);
  }),
);
notificationsRoutes.put(
  '/notifications/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const t = updateNotificationTarget(req.params.id as string, req.body);
    if (!t) return res.status(404).json({ error: 'Notification target not found' });
    res.json(t);
  }),
);
notificationsRoutes.delete('/notifications/:id', requireRole('admin'), wrap((req, res) => res.status(deleteNotificationTarget(req.params.id as string) ? 204 : 404).end()));
notificationsRoutes.post(
  '/notifications/:id/test',
  requireRole('admin'),
  wrap(async (req, res) => {
    const t = getNotificationTarget(req.params.id as string);
    if (!t) return res.status(404).json({ error: 'Notification target not found' });
    res.json(await testSendNotification(t.id));
  }),
);

notificationsRoutes.get(
  '/audit',
  wrap((req, res) => {
    const entries = listAudit({
      entityType: str(req.query.entityType),
      entityId: str(req.query.entityId),
      action: str(req.query.action),
      limit: Number(req.query.limit) || 200,
    });
    if (str(req.query.format) === 'csv') {
      res.setHeader('Content-Disposition', 'attachment; filename="vigil-audit.csv"');
      return res.type('text/csv').send(auditToCsv(entries));
    }
    res.json(entries);
  }),
);
