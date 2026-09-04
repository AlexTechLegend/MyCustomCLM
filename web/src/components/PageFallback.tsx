import { Loading } from './ui';

/**
 * Suspense fallback for lazily-loaded routes (see App.tsx). Layout — sidebar,
 * health strip — stays mounted across the navigation; only this fills the
 * page body while the route's chunk downloads.
 */
export function PageFallback() {
  return <Loading label="Loading page" />;
}
