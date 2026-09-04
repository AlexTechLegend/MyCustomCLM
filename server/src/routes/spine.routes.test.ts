import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-spine-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_AUTH = '0';
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_SECRET_KEY = '22'.repeat(32);
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
resetDbHandle();
db();
const { createApp } = await import('../lib/app.js');
const { createCredential } = await import('../services/credentials.js');
const { createHost } = await import('../services/hosts.js');
const { persistDiscoveryHits, listDiscoveryResults } = await import('../services/discovery.js');
const { enqueueAgentJob } = await import('../services/transport/agent.js');

describe('Task 8 spine routes', () => {
  let server: Server;
  let base = '';
  const token = 'agent-token-spine-test';
  let hostId = '';

  before(async () => {
    process.env.VIGIL_DATA_DIR = dir;
    process.env.VIGIL_AUTH = '0';
    process.env.VIGIL_SECRET_KEY = '22'.repeat(32);
    const cred = createCredential({ name: 'agent', kind: 'api-token', secret: token });
    const host = createHost({
      name: 'edge-1',
      hostname: 'edge-1.example',
      transport: 'agent',
      agentTokenCredentialId: cred.id,
    });
    hostId = host.id;
    persistDiscoveryHits('scan_test', [
      {
        host: '10.0.0.8',
        port: 443,
        fingerprintSha256: 'aa'.repeat(32),
        commonName: 'intranet.example',
        subject: 'CN=intranet.example',
        issuer: 'CN=Vigil Test CA',
        status: 'unknown',
      },
    ]);
    server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  it('persists host transport columns through create/get', async () => {
    const res = await fetch(`${base}/api/hosts/${hostId}`);
    assert.equal(res.status, 200);
    const host = (await res.json()) as {
      transport: string;
      agentTokenCredentialId: string | null;
      transportConfig: Record<string, unknown>;
    };
    assert.equal(host.transport, 'agent');
    assert.ok(host.agentTokenCredentialId);
    assert.deepEqual(host.transportConfig, {});
  });

  it('lists persisted discovery results on GET /discovery', async () => {
    const stored = listDiscoveryResults({ scanId: 'scan_test' });
    assert.equal(stored.length, 1);
    const res = await fetch(`${base}/api/discovery`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { scanId: string | null; results: { address: string; fingerprintSha256: string }[] };
    assert.ok(body.results.some((r) => r.address === '10.0.0.8' && r.fingerprintSha256 === 'aa'.repeat(32)));
  });

  it('openapi documents the mounted spine routes and agent wire format', async () => {
    const res = await fetch(`${base}/api/openapi.json`);
    assert.equal(res.status, 200);
    const doc = (await res.json()) as {
      paths: Record<string, unknown>;
      'x-vigil': { agent: { pollPath: string } };
    };
    assert.ok(doc.paths['/discovery']);
    assert.ok(doc.paths['/discovery/scan']);
    assert.ok(doc.paths['/connectors/adcs/templates']);
    assert.ok(doc.paths['/pipelines/preflight']);
    assert.ok(doc.paths['/notifications/{id}/test']);
    assert.equal(doc['x-vigil'].agent.pollPath, '/agent/v1/poll');
  });

  it('pipeline preflight runs against the local transport', async () => {
    const res = await fetch(`${base}/api/pipelines/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ params: {} }),
    });
    const raw = await res.text();
    assert.equal(res.status, 200, raw);
    const report = JSON.parse(raw) as { ok: boolean; checks: { name: string }[]; transport: string };
    assert.equal(typeof report.ok, 'boolean');
    assert.ok(report.checks.some((c) => c.name === 'transport'));
    assert.equal(report.transport, 'local');
  });

  it('agent poll/result require a bearer token and complete a job', async () => {
    const denied = await fetch(`${base}/agent/v1/poll`);
    assert.equal(denied.status, 401);

    enqueueAgentJob({
      jobId: 'job-spine-1',
      op: 'ping',
      args: {},
      timeoutMs: 5_000,
      createdAt: new Date().toISOString(),
    });

    const poll = await fetch(`${base}/agent/v1/poll`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(poll.status, 200);
    const job = (await poll.json()) as { jobId: string; op: string };
    assert.equal(job.jobId, 'job-spine-1');
    assert.equal(job.op, 'ping');

    const empty = await fetch(`${base}/agent/v1/poll`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(empty.status, 204);

    const result = await fetch(`${base}/agent/v1/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId: 'job-spine-1', stdout: 'ok', stderr: '', exitCode: 0 }),
    });
    assert.equal(result.status, 204);

    const seen = await fetch(`${base}/api/hosts/${hostId}`);
    const host = (await seen.json()) as { agentStatus: string; agentLastSeen: string | null };
    assert.equal(host.agentStatus, 'online');
    assert.ok(host.agentLastSeen);
  });
});
