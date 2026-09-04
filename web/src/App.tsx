import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageFallback } from './components/PageFallback';
import { Dashboard } from './pages/Dashboard';

const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));
const Approvals = lazy(() => import('./pages/Approvals').then((m) => ({ default: m.Approvals })));
const BlueprintEditor = lazy(() => import('./pages/BlueprintEditor').then((m) => ({ default: m.BlueprintEditor })));
const Blueprints = lazy(() => import('./pages/Blueprints').then((m) => ({ default: m.Blueprints })));
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })));
const CertificateDetail = lazy(() => import('./pages/CertificateDetail').then((m) => ({ default: m.CertificateDetail })));
const Certificates = lazy(() => import('./pages/Certificates').then((m) => ({ default: m.Certificates })));
const Credentials = lazy(() => import('./pages/Credentials').then((m) => ({ default: m.Credentials })));
const Discovery = lazy(() => import('./pages/Discovery').then((m) => ({ default: m.Discovery })));
const DashboardBuilder = lazy(() => import('./pages/DashboardBuilder').then((m) => ({ default: m.DashboardBuilder })));
const Hosts = lazy(() => import('./pages/Hosts').then((m) => ({ default: m.Hosts })));
const ImportCertificate = lazy(() => import('./pages/ImportCertificate').then((m) => ({ default: m.ImportCertificate })));
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })));
const Onboard = lazy(() => import('./pages/Onboard').then((m) => ({ default: m.Onboard })));
const PipelineEditor = lazy(() => import('./pages/PipelineEditor').then((m) => ({ default: m.PipelineEditor })));
const PipelineRunPage = lazy(() => import('./pages/PipelineRun').then((m) => ({ default: m.PipelineRunPage })));
const Pipelines = lazy(() => import('./pages/Pipelines').then((m) => ({ default: m.Pipelines })));
const ProfileEditor = lazy(() => import('./pages/ProfileEditor').then((m) => ({ default: m.ProfileEditor })));
const Profiles = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.Profiles })));
const Renew = lazy(() => import('./pages/Renew').then((m) => ({ default: m.Renew })));
const Renewals = lazy(() => import('./pages/Renewals').then((m) => ({ default: m.Renewals })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Identities = lazy(() => import('./pages/Identities').then((m) => ({ default: m.Identities })));
const Tags = lazy(() => import('./pages/Tags').then((m) => ({ default: m.Tags })));
const Windows = lazy(() => import('./pages/Windows').then((m) => ({ default: m.Windows })));

/** Wraps a lazy page element in its own Suspense boundary so only the page body suspends. */
function s(el: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{el}</Suspense>;
}

/**
 * Dashboard (the index route) stays eager since it is the first thing every
 * session loads. Every other route is code-split via React.lazy — Layout
 * (sidebar, health strip) never unmounts across navigations, only the page
 * body suspends while its chunk downloads.
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
        <Route path="profiles/new" element={s(<ProfileEditor />)} />
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
