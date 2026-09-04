import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RateLimitedError, resetRateLimits, takeRateLimit } from './rateLimit.js';

describe('takeRateLimit', () => {
  it('returns 429-shaped errors with Retry-After', () => {
    resetRateLimits();
    takeRateLimit('k', { windowMs: 60_000, max: 1, maxInflight: 2 }).release();
    assert.throws(() => takeRateLimit('k', { windowMs: 60_000, max: 1 }), (e: unknown) => {
      assert.ok(e instanceof RateLimitedError);
      assert.equal(e.status, 429);
      assert.ok(e.retryAfter >= 1);
      return true;
    });
  });

  it('caps concurrent inflight', () => {
    resetRateLimits();
    const a = takeRateLimit('c', { max: 10, maxInflight: 1 });
    assert.throws(() => takeRateLimit('c', { max: 10, maxInflight: 1 }), RateLimitedError);
    a.release();
    const b = takeRateLimit('c', { max: 10, maxInflight: 1 });
    b.release();
  });
});
