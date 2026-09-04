import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Activity } from './pages/Activity';
import { Approvals } from './pages/Approvals';
import { BlueprintEditor } from './pages/BlueprintEditor';
import { Blueprints } from './pages/Blueprints';
import { Calendar } from './pages/Calendar';
import { CertificateDetail } from './pages/CertificateDetail';
import { Certificates } from './pages/Certificates';
import { Credentials } from './pages/Credentials';
import { Dashboard } from './pages/Dashboard';
import { DashboardBuilder } from './pages/DashboardBuilder';
import { Hosts } from './pages/Hosts';
import { ImportCertificate } from './pages/ImportCertificate';
import { Jobs } from './pages/Jobs';
import { Onboard } from './pages/Onboard';
import { PipelineEditor } from './pages/PipelineEditor';
import { PipelineRunPage } from './pages/PipelineRun';
import { Pipelines } from './pages/Pipelines';
import { ProfileEditor } from './pages/ProfileEditor';
import { Profiles } from './pages/Profiles';
import { Renew } from './pages/Renew';
import { Renewals } from './pages/Renewals';
import { Settings } from './pages/Settings';
import { Identities } from './pages/Identities';
import { Tags } from './pages/Tags';
import { Windows } from './pages/Windows';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="dashboard/builder" element={<DashboardBuilder />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="certificates/import" element={<ImportCertificate />} />
        <Route path="certificates/:id" element={<CertificateDetail />} />
        <Route path="certificates/:id/renew" element={<Renew />} />
        <Route path="renewals" element={<Renewals />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="profiles/new" element={<ProfileEditor />} />
        <Route path="profiles/:id" element={<ProfileEditor />} />
        <Route path="identities" element={<Identities />} />
        <Route path="tags" element={<Tags />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
        <Route path="hosts" element={<Hosts />} />
        <Route path="blueprints" element={<Blueprints />} />
        <Route path="blueprints/new" element={<BlueprintEditor />} />
        <Route path="blueprints/:id" element={<BlueprintEditor />} />
        <Route path="pipelines" element={<Pipelines />} />
        <Route path="pipelines/new" element={<PipelineEditor />} />
        <Route path="pipelines/:id" element={<PipelineEditor />} />
        <Route path="runs/:id" element={<PipelineRunPage />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="onboard" element={<Onboard />} />
        <Route path="onboard/:blueprintId" element={<Onboard />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="credentials" element={<Credentials />} />
        <Route path="windows" element={<Windows />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
