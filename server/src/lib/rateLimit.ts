export class RateLimitedError extends Error {
  status = 429;
  retryAfter: number;
  constructor(retryAfter: number, message = 'Too many requests. Try again shortly.') {
    super(message);
    this.retryAfter = retryAfter;
  }
}

type Bucket = { times: number[]; inflight: number };

const buckets = new Map<string, Bucket>();

export function resetRateLimits() {
  buckets.clear();
}

/**
 * Sliding-window limiter. `maxInflight` caps concurrent work for spawn-heavy routes.
 */
export function takeRateLimit(
  key: string,
  opts: { windowMs?: number; max?: number; maxInflight?: number } = {},
): { release: () => void } {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 10;
  const maxInflight = opts.maxInflight ?? 3;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { times: [], inflight: 0 };
  bucket.times = bucket.times.filter((t) => now - t < windowMs);
  if (bucket.times.length >= max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.times[0] + windowMs - now) / 1000));
    throw new RateLimitedError(retryAfter);
  }
  if (bucket.inflight >= maxInflight) {
    throw new RateLimitedError(1, 'Too many concurrent runs. Try again in a moment.');
  }
  bucket.times.push(now);
  bucket.inflight += 1;
  buckets.set(key, bucket);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      const b = buckets.get(key);
      if (b) b.inflight = Math.max(0, b.inflight - 1);
    },
  };
}
