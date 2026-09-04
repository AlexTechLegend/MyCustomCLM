import type { QueryClient } from '@tanstack/react-query';
import { api, blueprintsApi, credentialsApi, hostsApi, pipelinesApi, windowsApi } from '@/lib/api';

/**
 * Single source of truth for the app's lazy route chunks. App.tsx wraps each
 * loader in React.lazy(); NavRail (and anything else that wants to warm a
 * route before the user clicks) calls prefetchRouteChunk(path) with the same
 * loader function, so the dynamic import() is a literal string in exactly one
 * place per route — required for Vite's static chunk analysis, and the only
 * way to guarantee the prefetch actually shares the lazy() import's cache.
 *
 * Vite resolves the module cache by import specifier, so calling a loader
 * here ahead of time and calling it again later from React.lazy's internals
 * resolves to the same in-flight/resolved promise — the browser fetches the
 * chunk once no matter which call site triggers it first.
 */

export type RouteLoader = () => Promise<{ default: unknown }>;

export const ROUTE_LOADERS: Record<string, RouteLoader> = {
  '/dashboard/builder': () => import('../pages/DashboardBuilder').then((m) => ({ default: m.DashboardBuilder })),
  '/certificates': () => import('../pages/Certificates').then((m) => ({ default: m.Certificates })),
  '/certificates/import': () => import('../pages/ImportCertificate').then((m) => ({ default: m.ImportCertificate })),
  '/renewals': () => import('../pages/Renewals').then((m) => ({ default: m.Renewals })),
  '/profiles': () => import('../pages/Profiles').then((m) => ({ default: m.Profiles })),
  '/profiles/new': () => import('../pages/ProfileEditor').then((m) => ({ default: m.ProfileEditor })),
  '/identities': () => import('../pages/Identities').then((m) => ({ default: m.Identities })),
  '/tags': () => import('../pages/Tags').then((m) => ({ default: m.Tags })),
  '/calendar': () => import('../pages/Calendar').then((m) => ({ default: m.Calendar })),
  '/activity': () => import('../pages/Activity').then((m) => ({ default: m.Activity })),
  '/settings': () => import('../pages/Settings').then((m) => ({ default: m.Settings })),
  '/hosts': () => import('../pages/Hosts').then((m) => ({ default: m.Hosts })),
  '/discovery': () => import('../pages/Discovery').then((m) => ({ default: m.Discovery })),
  '/blueprints': () => import('../pages/Blueprints').then((m) => ({ default: m.Blueprints })),
  '/pipelines': () => import('../pages/Pipelines').then((m) => ({ default: m.Pipelines })),
  '/jobs': () => import('../pages/Jobs').then((m) => ({ default: m.Jobs })),
  '/onboard': () => import('../pages/Onboard').then((m) => ({ default: m.Onboard })),
  '/approvals': () => import('../pages/Approvals').then((m) => ({ default: m.Approvals })),
  '/credentials': () => import('../pages/Credentials').then((m) => ({ default: m.Credentials })),
  '/windows': () => import('../pages/Windows').then((m) => ({ default: m.Windows })),
};

const warmed = new Set<string>();

/** Idempotent: safe to call on every hover/focus, only ever fetches once per route. */
export function prefetchRouteChunk(path: string): void {
  if (warmed.has(path)) return;
  const loader = ROUTE_LOADERS[path];
  if (!loader) return;
  warmed.add(path);
  loader().catch(() => {
    // A failed prefetch (offline, flaky network) should never surface to the
    // user here — the real navigation's own error handling covers it.
    warmed.delete(path);
  });
}

/**
 * Only routes whose destination page reads its primary list with an exact,
 * verified queryKey/queryFn pair — a prefetch under the wrong key just wastes
 * a request and is never read back from cache, so this list is deliberately
 * short rather than exhaustive. TanStack Query's default key hashing drops
 * undefined-valued object properties, so `['certificates', {}]` here is a
 * cache hit for both Certificates.tsx's unfiltered default state and
 * Approvals.tsx, which queries the same key directly.
 */
const ROUTE_QUERIES: Record<string, { key: unknown[]; fn: () => Promise<unknown> }> = {
  '/certificates': { key: ['certificates', {}], fn: () => api.certificates({}) },
  '/renewals': { key: ['renewals'], fn: api.renewals },
  '/profiles': { key: ['profiles'], fn: () => api.profiles() },
  '/tags': { key: ['tags'], fn: api.tags },
  '/blueprints': { key: ['blueprints'], fn: blueprintsApi.list },
  '/pipelines': { key: ['pipelines'], fn: pipelinesApi.list },
  '/hosts': { key: ['hosts'], fn: hostsApi.list },
  '/credentials': { key: ['credentials'], fn: credentialsApi.list },
  '/windows': { key: ['windows'], fn: windowsApi.list },
  '/identities': { key: ['identities'], fn: api.identities },
};

/** Warms both the route's JS chunk and its primary list query on hover/focus intent. */
export function prefetchRoute(path: string, queryClient: QueryClient): void {
  prefetchRouteChunk(path);
  const q = ROUTE_QUERIES[path];
  if (q) void queryClient.prefetchQuery({ queryKey: q.key, queryFn: q.fn, staleTime: 15_000 });
}
