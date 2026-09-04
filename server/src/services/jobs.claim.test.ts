import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-jobs-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
const { claimJobs, enqueueJob } = await import('./jobs.js');

describe('claimJobs', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    resetDbHandle();
    db();
  });

  it('two concurrent claims do not both win the same job', () => {
    const job = enqueueJob({ type: 'notification', payload: { ping: true } });
    const a = claimJobs('owner-a', 8);
    const b = claimJobs('owner-b', 8);
    const won = [...a, ...b].filter((j) => j.id === job.id);
    assert.equal(won.length, 1);
    assert.equal(won[0].leaseOwner === 'owner-a' || won[0].leaseOwner === 'owner-b', true);
    assert.equal(a.some((j) => j.id === job.id) && b.some((j) => j.id === job.id), false);
  });
});
