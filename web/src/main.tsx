import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { persistTheme, readTheme } from './lib/theme';
import './styles.css';

persistTheme(readTheme());

const queryClient = new QueryClient({
  // 60s covers the app's reference-ish data (profiles, tags, identities,
  // blueprints, credentials, windows, the certificate list...) which rarely
  // changes between one navigation and the next. Genuinely live data (jobs,
  // pipeline runs, the health strip, scheduler status) overrides this with
  // its own shorter staleTime/refetchInterval at the call site — see
  // components/HealthStrip.tsx, pages/Jobs.tsx, pages/PipelineRun.tsx.
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
