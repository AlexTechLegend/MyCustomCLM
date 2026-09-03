import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Activity } from './pages/Activity';
import { CertificateDetail } from './pages/CertificateDetail';
import { Certificates } from './pages/Certificates';
import { Dashboard } from './pages/Dashboard';
import { ImportCertificate } from './pages/ImportCertificate';
import { ProfileEditor } from './pages/ProfileEditor';
import { Profiles } from './pages/Profiles';
import { Renew } from './pages/Renew';
import { Settings } from './pages/Settings';
import { Identities } from './pages/Identities';
import { Tags } from './pages/Tags';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="certificates/import" element={<ImportCertificate />} />
        <Route path="certificates/:id" element={<CertificateDetail />} />
        <Route path="certificates/:id/renew" element={<Renew />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="profiles/new" element={<ProfileEditor />} />
        <Route path="profiles/:id" element={<ProfileEditor />} />
        <Route path="identities" element={<Identities />} />
        <Route path="tags" element={<Tags />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
