import { Router } from 'express';
import { db } from '../db.js';
import { agentResultBody, agentStreamBody, parseBody } from '../lib/schema.js';
import { log } from '../lib/logger.js';
import { safeEqualString } from '../services/crypto.js';
import { revealCredentialSecret } from '../services/credentials.js';
import { markHostAgentSeen } from '../services/hosts.js';
import { completeAgentJob, pollAgentJob } from '../services/transport/agent.js';
import { wrap } from './http.js';

export const agentRoutes = Router();

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function authenticateAgent(authorization: string | undefined): { hostId: string } | null {
  const token = bearerToken(authorization);
  if (!token) return null;
  const rows = db()
    .prepare(`SELECT id, agent_token_credential_id FROM hosts WHERE agent_token_credential_id IS NOT NULL`)
    .all() as { id: string; agent_token_credential_id: string }[];
  for (const row of rows) {
    const cred = revealCredentialSecret(row.agent_token_credential_id);
    if (cred && safeEqualString(cred.secret, token)) {
      markHostAgentSeen(row.id);
      return { hostId: row.id };
    }
  }
  return null;
}

function reject(res: import('express').Response) {
  return res.status(401).json({ error: 'Agent authentication required. Authorization: Bearer <token>' });
}

agentRoutes.get(
  '/agent/v1/poll',
  wrap((req, res) => {
    if (!authenticateAgent(req.headers.authorization)) return reject(res);
    const job = pollAgentJob();
    if (!job) return res.status(204).end();
    res.json(job);
  }),
);

agentRoutes.post(
  '/agent/v1/result',
  wrap((req, res) => {
    if (!authenticateAgent(req.headers.authorization)) return reject(res);
    const body = parseBody(agentResultBody, req.body);
    completeAgentJob({
      jobId: body.jobId,
      stdout: body.stdout ?? '',
      stderr: body.stderr ?? '',
      exitCode: body.exitCode ?? 0,
      error: body.error,
      files: body.files,
      stat: body.stat ?? undefined,
      exists: body.exists,
    });
    res.status(204).end();
  }),
);

agentRoutes.post(
  '/agent/v1/stream',
  wrap((req, res) => {
    if (!authenticateAgent(req.headers.authorization)) return reject(res);
    const body = parseBody(agentStreamBody, req.body);
    log.debug('agent stream', { jobId: body.jobId, channel: body.channel, bytes: body.chunk.length });
    res.status(204).end();
  }),
);
