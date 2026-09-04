import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acquireHostLock, releaseHostLock, withHostLock } from './host-lock.js';

describe('per-host file lease', () => {
  it('grants a lock to the first owner and rejects a second', () => {
    const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    assert.equal(acquireHostLock(id, 'a', 30), true);
    assert.equal(acquireHostLock(id, 'b', 30), false);
    releaseHostLock(id, 'a');
    assert.equal(acquireHostLock(id, 'b', 30), true);
    releaseHostLock(id, 'b');
  });

  it('lets the same owner refresh', () => {
    const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    assert.equal(acquireHostLock(id, 'a', 30), true);
    assert.equal(acquireHostLock(id, 'a', 30), true);
    releaseHostLock(id, 'a');
  });

  it('skips locking when hostId is empty', async () => {
    const value = await withHostLock(null, 'owner', async () => 7);
    assert.equal(value, 7);
  });
});
