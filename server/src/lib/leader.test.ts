import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-leader-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
const { tryAcquireLeadership, currentLeader } = await import('./leader.js');

describe('scheduler leader lease', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    resetDbHandle();
    db();
  });

  it('only one owner holds the lease', () => {
    assert.equal(tryAcquireLeadership('a', 30_000), true);
    assert.equal(tryAcquireLeadership('b', 30_000), false);
    assert.equal(currentLeader()?.owner, 'a');
    assert.equal(tryAcquireLeadership('a', 30_000), true);
  });

  it('an expired lease can be taken over', () => {
    db().prepare(`UPDATE instance_leases SET expires_at = ? WHERE id = 'scheduler'`).run('2000-01-01T00:00:00.000Z');
    assert.equal(tryAcquireLeadership('b', 30_000), true);
    assert.equal(currentLeader()?.owner, 'b');
  });
});
