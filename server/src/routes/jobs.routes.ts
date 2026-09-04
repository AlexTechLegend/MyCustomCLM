import { Router } from 'express';
import { writeAudit } from '../services/audit.js';
import { requireRole } from '../services/auth.js';
import { cancelJob, getJob, listJobs, retryJob } from '../services/jobs.js';
import { getSchedulerHeartbeat } from '../services/scheduler.js';
import { actorId, str, wrap } from './http.js';

export const jobsRoutes = Router();

jobsRoutes.get('/scheduler', wrap((_req, res) => res.json(getSchedulerHeartbeat())));
jobsRoutes.get(
  '/jobs',
  wrap((req, res) => {
    res.json(listJobs({ state: str(req.query.state), limit: Number(req.query.limit) || 100 }));
  }),
);
jobsRoutes.get(
  '/jobs/:id',
  wrap((req, res) => {
    const job = getJob(req.params.id as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  }),
);
jobsRoutes.post(
  '/jobs/:id/cancel',
  requireRole('operator'),
  wrap((req, res) => {
    const job = cancelJob(req.params.id as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'job.cancel', entityType: 'job', entityId: job.id });
    res.json(job);
  }),
);
jobsRoutes.post(
  '/jobs/:id/retry',
  requireRole('operator'),
  wrap((req, res) => {
    const job = retryJob(req.params.id as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    writeAudit({ actorUserId: actorId(req), actorType: 'user', action: 'job.retry', entityType: 'job', entityId: job.id });
    res.json(job);
  }),
);
