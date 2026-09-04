import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-auth-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_AUTH = '1';
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_SECRET_KEY = '11'.repeat(32);
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
resetDbHandle();
db();
const { createUser } = await import('../services/auth.js');
const { createApp } = await import('../lib/app.js');

const MUTATING: [string, string][] = [
  ['POST', '/api/credentials'],
  ['PUT', '/api/credentials/crd_x'],
  ['DELETE', '/api/credentials/crd_x'],
  ['POST', '/api/pipelines/pipe_x/run'],
  ['POST', '/api/pipelines/pipe_x/plan'],
  ['POST', '/api/hosts'],
  ['PUT', '/api/hosts/hst_x'],
  ['DELETE', '/api/hosts/hst_x'],
  ['POST', '/api/blueprints'],
  ['PUT', '/api/blueprints/bp_x'],
  ['DELETE', '/api/blueprints/bp_x'],
  ['POST', '/api/blueprints/bp_x/instantiate'],
  ['POST', '/api/windows'],
  ['PUT', '/api/windows/win_x'],
  ['DELETE', '/api/windows/win_x'],
  ['POST', '/api/jobs/job_x/cancel'],
  ['POST', '/api/jobs/job_x/retry'],
  ['POST', '/api/certificates/crt_x/renew'],
  ['POST', '/api/pipeline-runs/run_x/approve'],
  ['POST', '/api/pipeline-runs/run_x/reject'],
  ['POST', '/api/users'],
  ['PUT', '/api/settings'],
  ['PUT', '/api/dashboard-templates'],
  ['POST', '/api/discovery/scan'],
];

describe('auth default-deny', () => {
  let server: Server;
  let base = '';
  let viewerCookie = '';
  let operatorCookie = '';

  before(async () => {
    process.env.VIGIL_DATA_DIR = dir;
    process.env.VIGIL_AUTH = '1';
    createUser({ username: 'viewer', password: 'viewer-pass-1', role: 'viewer' });
    createUser({ username: 'operator', password: 'operator-pass-1', role: 'operator' });
    createUser({ username: 'admin', password: 'admin-pass-99', role: 'admin' });
    server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${addr.port}`;
    viewerCookie = await login('viewer', 'viewer-pass-1');
    operatorCookie = await login('operator', 'operator-pass-1');
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(res.status, 200, await res.text());
    return res.headers.get('set-cookie') ?? '';
  }

  it('health is public', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it('openapi is public', async () => {
    const res = await fetch(`${base}/api/openapi.json`);
    assert.equal(res.status, 200);
    const doc = (await res.json()) as { openapi: string };
    assert.equal(doc.openapi.startsWith('3.'), true);
  });

  for (const [method, url] of MUTATING) {
    it(`${method} ${url} rejects unauthenticated`, async () => {
      const res = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(res.status, 401, `${method} ${url} → ${res.status}`);
    });

    it(`${method} ${url} rejects a viewer`, async () => {
      const res = await fetch(`${base}${url}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: viewerCookie },
        body: JSON.stringify({ commonName: 'x.example', secret: 'x', username: 'u', password: 'password1', name: 'x' }),
      });
      assert.ok(res.status === 403 || res.status === 401, `${method} ${url} → ${res.status} (expected 403)`);
    });
  }

  it('viewer may read certificates', async () => {
    const res = await fetch(`${base}/api/certificates`, { headers: { cookie: viewerCookie } });
    assert.equal(res.status, 200);
  });

  it('operator cannot create credentials', async () => {
    const res = await fetch(`${base}/api/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: operatorCookie },
      body: JSON.stringify({ name: 'x', secret: 'super-secret' }),
    });
    assert.equal(res.status, 403);
  });
});
