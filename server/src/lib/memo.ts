/**
 * Tiny TTL memoiser for read-heavy aggregate endpoints (dashboard, tag
 * counts) that recompute from a full certificates scan on every call.
 *
 * Deliberately NOT write-invalidated: this codebase's mutations are spread
 * across dozens of route handlers, and wiring an "invalidate on any write"
 * event through all of them is real surface area to get right -- miss one
 * and a cache goes stale silently, which is worse than the problem this is
 * solving. A short TTL gets almost all of the benefit (collapsing a burst of
 * concurrent polls -- the health strip, the dashboard page, a second browser
 * tab -- into one computation) with a bounded, obvious staleness window
 * instead of an open-ended one.
 */
export function ttlMemo<T>(fn: () => T, ttlMs: number): () => T {
  let cached: { value: T; at: number } | null = null;
  return () => {
    const now = Date.now();
    if (cached && now - cached.at < ttlMs) return cached.value;
    const value = fn();
    cached = { value, at: now };
    return value;
  };
}
