/**
 * Suspense fallback for lazily-loaded routes (see App.tsx). Layout — sidebar,
 * health strip — stays mounted across the navigation; only this fills the
 * page body while the route's chunk downloads.
 *
 * A generic shape rather than a per-page skeleton: with 26 distinct page
 * layouts, matching each one exactly is more than this pass covers, but a
 * page-header bar plus a few card blocks is closer to every real page's
 * shape than a centred spinner, and it means the page doesn't visibly change
 * structure twice (skeleton -> spinner -> content) while loading.
 */
export function PageFallback() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="space-y-2.5">
          <div className="h-3 w-24 rounded bg-ink-100" />
          <div className="h-7 w-56 rounded bg-ink-100" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-ink-100" />
      </div>
      <div className="space-y-3">
        <div className="h-24 rounded-2xl bg-ink-100" />
        <div className="h-40 rounded-2xl bg-ink-100" />
        <div className="h-40 rounded-2xl bg-ink-100" />
      </div>
    </div>
  );
}
