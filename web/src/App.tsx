import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageFallback } from './components/PageFallback';
import { Dashboard } from './pages/Dashboard';
import { ROUTE_LOADERS } from './lib/lazyRoutes';

/**
 * Wraps a shared route loader (see lib/lazyRoutes.ts — the same function
 * NavRail calls to prefetch on hover) in React.lazy. Keeping the loader
 * definitions in one module means the literal import() string each route
 * needs for Vite's static analysis exists exactly once.
 */
function page(path: keyof typeof ROUTE_LOADERS) {
  return lazy(ROUTE_LOADERS[path] as () => Promise<{ default: ComponentType }>);
}

const DashboardBuilder = page('/dashboard/builder');
const Certificates = page('/certificates');
const ImportCertificate = page('/certificates/import');
const Renewals = page('/renewals');
const Profiles = page('/profiles');
const ProfileEditorNew = page('/profiles/new');
const Identities = page('/identities');
const Tags = page('/tags');
const Calendar = page('/calendar');
const Activity = page('/activity');
const Settings = page('/settings');
const Hosts = page('/hosts');
const Discovery = page('/discovery');
const Blueprints = page('/blueprints');
const Pipelines = page('/pipelines');
const Jobs = page('/jobs');
const Onboard = page('/onboard');
const Approvals = page('/approvals');
const Credentials = page('/credentials');
const Windows = page('/windows');

// Routes below share a page component with one of the entries above but are
// not themselves in the nav-driven prefetch registry (a detail route, or a
// second path for the same editor page). Loading them is independent of the
// registry, so they keep their own literal import() — sharing App.tsx's own
// module-level cache with the registry entry the moment either has loaded.
const CertificateDetail = lazy(() => import('./pages/CertificateDetail').then((m) => ({ default: m.CertificateDetail })));
const Renew = lazy(() => import('./pages/Renew').then((m) => ({ default: m.Renew })));
const ProfileEditor = lazy(() => import('./pages/ProfileEditor').then((m) => ({ default: m.ProfileEditor })));
const BlueprintEditor = lazy(() => import('./pages/BlueprintEditor').then((m) => ({ default: m.BlueprintEditor })));
const PipelineEditor = lazy(() => import('./pages/PipelineEditor').then((m) => ({ default: m.PipelineEditor })));
const PipelineRunPage = lazy(() => import('./pages/PipelineRun').then((m) => ({ default: m.PipelineRunPage })));

/** Wraps a lazy page element in its own Suspense boundary so only the page body suspends. */
function s(el: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{el}</Suspense>;
}

/**
 * Dashboard (the index route) stays eager since it is the first thing every
 * session loads. Every other route is code-split via React.lazy — Layout
 * (sidebar, health strip) never unmounts across navigations, only the page
 * body suspends while its chunk downloads. See lib/lazyRoutes.ts for the
 * shared loader registry and NavRail.tsx for the hover-intent prefetch that
 * makes most of these loads finish before the click ever happens.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="dashboard/builder" element={s(<DashboardBuilder />)} />
        <Route path="certificates" element={s(<Certificates />)} />
        <Route path="certificates/import" element={s(<ImportCertificate />)} />
        <Route path="certificates/:id" element={s(<CertificateDetail />)} />
        <Route path="certificates/:id/renew" element={s(<Renew />)} />
        <Route path="renewals" element={s(<Renewals />)} />
        <Route path="profiles" element={s(<Profiles />)} />
        <Route path="profiles/new" element={s(<ProfileEditorNew />)} />
        <Route path="profiles/:id" element={s(<ProfileEditor />)} />
        <Route path="identities" element={s(<Identities />)} />
        <Route path="tags" element={s(<Tags />)} />
        <Route path="calendar" element={s(<Calendar />)} />
        <Route path="activity" element={s(<Activity />)} />
        <Route path="settings" element={s(<Settings />)} />
        <Route path="hosts" element={s(<Hosts />)} />
        <Route path="discovery" element={s(<Discovery />)} />
        <Route path="blueprints" element={s(<Blueprints />)} />
        <Route path="blueprints/new" element={s(<BlueprintEditor />)} />
        <Route path="blueprints/:id" element={s(<BlueprintEditor />)} />
        <Route path="pipelines" element={s(<Pipelines />)} />
        <Route path="pipelines/new" element={s(<PipelineEditor />)} />
        <Route path="pipelines/:id" element={s(<PipelineEditor />)} />
        <Route path="runs/:id" element={s(<PipelineRunPage />)} />
        <Route path="jobs" element={s(<Jobs />)} />
        <Route path="onboard" element={s(<Onboard />)} />
        <Route path="onboard/:blueprintId" element={s(<Onboard />)} />
        <Route path="approvals" element={s(<Approvals />)} />
        <Route path="credentials" element={s(<Credentials />)} />
        <Route path="windows" element={s(<Windows />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
