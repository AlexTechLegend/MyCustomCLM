import { Router } from 'express';
import { takeRateLimit } from '../lib/rateLimit.js';
import { requireRole } from '../services/auth.js';
import {
  approvePipelineRun,
  createPipeline,
  deletePipeline,
  describeStepLibrary,
  executePipeline,
  getPipeline,
  getPipelineRun,
  listPipelineRuns,
  listPipelines,
  planPipeline,
  updatePipeline,
} from '../services/pipelines.js';
import { approvalBody, parseBody, pipelineRunBody } from '../lib/schema.js';
import { actorId, str, wrap } from './http.js';

export const pipelinesRoutes = Router();

pipelinesRoutes.get('/pipelines', wrap((_req, res) => res.json(listPipelines())));
pipelinesRoutes.get('/pipelines/steps', wrap((_req, res) => res.json(describeStepLibrary())));
pipelinesRoutes.post('/pipelines', requireRole('operator'), wrap((req, res) => res.status(201).json(createPipeline(req.body))));
pipelinesRoutes.get(
  '/pipelines/:id',
  wrap((req, res) => {
    const p = getPipeline(req.params.id as string);
    if (!p) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ pipeline: p, runs: listPipelineRuns({ pipelineId: p.id, limit: 50 }) });
  }),
);
pipelinesRoutes.put(
  '/pipelines/:id',
  requireRole('operator'),
  wrap((req, res) => {
    const p = updatePipeline(req.params.id as string, req.body);
    if (!p) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(p);
  }),
);
pipelinesRoutes.delete('/pipelines/:id', requireRole('operator'), wrap((req, res) => res.status(deletePipeline(req.params.id as string) ? 204 : 404).end()));

pipelinesRoutes.post(
  '/pipelines/:id/plan',
  requireRole('operator'),
  wrap(async (req, res) => {
    const planned = await planPipeline({
      pipelineId: req.params.id as string,
      certificateId: str(req.body.certificateId),
      hostId: str(req.body.hostId),
      params: req.body.params && typeof req.body.params === 'object' ? req.body.params : req.body,
    });
    res.json(planned);
  }),
);

pipelinesRoutes.post(
  '/pipelines/:id/run',
  requireRole('operator'),
  wrap(async (req, res) => {
    const slot = takeRateLimit(`pipeline-run:${req.ip ?? 'local'}`, { max: 8, maxInflight: 2 });
    try {
      const body = parseBody(pipelineRunBody, req.body);
      const run = await executePipeline({
        pipelineId: req.params.id as string,
        certificateId: body.certificateId,
        hostId: body.hostId,
        renewalId: body.renewalId,
        params: body.params && typeof body.params === 'object' ? body.params : {},
        dryRun: body.dryRun === true,
        actorUserId: actorId(req),
      });
      res.status(201).json(run);
    } finally {
      slot.release();
    }
  }),
);

pipelinesRoutes.get(
  '/pipeline-runs',
  wrap((req, res) => {
    res.json(listPipelineRuns({ certificateId: str(req.query.certificateId), pipelineId: str(req.query.pipelineId) }));
  }),
);
pipelinesRoutes.get(
  '/pipeline-runs/:id',
  wrap((req, res) => {
    const run = getPipelineRun(req.params.id as string);
    if (!run) return res.status(404).json({ error: 'Pipeline run not found' });
    res.json(run);
  }),
);
pipelinesRoutes.post(
  '/pipeline-runs/:id/approve',
  requireRole('approver'),
  wrap(async (req, res) => {
    const body = parseBody(approvalBody, req.body ?? {});
    const run = await approvePipelineRun(req.params.id as string, { userId: actorId(req), note: body.note });
    res.json(run);
  }),
);
pipelinesRoutes.post(
  '/pipeline-runs/:id/reject',
  requireRole('approver'),
  wrap(async (req, res) => {
    const body = parseBody(approvalBody, req.body ?? {});
    const run = await approvePipelineRun(req.params.id as string, { userId: actorId(req), reject: true, note: body.note });
    res.json(run);
  }),
);
