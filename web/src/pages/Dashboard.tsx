import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridCanvas } from '@/components/dashboard/GridCanvas';
import { useGridInteraction } from '@/components/dashboard/useGridInteraction';
import { StackedTiles, useIsLgUp } from '@/components/DashboardGrid';
import { SetupChecklist, type SetupStep } from '@/components/SetupChecklist';
import type { TileContext } from '@/components/tiles/types';
import { Button, ErrorBox, Loading, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import {
  allDashboards,
  findDashboard,
  loadLayout,
  mergeServerTemplates,
  persistLayout,
  resolveDashboardId,
  setActiveDashboard,
  setupDismissed,
  setSetupDismissed,
  type DashboardLayout,
} from '@/lib/dashboardStore';

export function Dashboard() {
  const navigate = useNavigate();
  const lgUp = useIsLgUp();

  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 });
  const certs = useQuery({ queryKey: ['certificates', {}], queryFn: () => api.certificates({}) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const renewals = useQuery({ queryKey: ['renewals'], queryFn: api.renewals });
  const activity = useQuery({ queryKey: ['activity', 'all'], queryFn: () => api.activity() });
  const ca = useQuery({ queryKey: ['ca'], queryFn: api.ca });
  const me = useQuery({ queryKey: ['auth-me'], queryFn: api.me });
  const remote = useQuery({ queryKey: ['dashboard-templates'], queryFn: api.dashboardTemplates });

  const [layout, setLayout] = useState<DashboardLayout>(() => loadLayout());
  const [activeId, setActiveId] = useState(() => resolveDashboardId(null));
  const [hiddenSetup, setHiddenSetup] = useState(setupDismissed);
  const grid = useGridInteraction({ layout, onChange: () => undefined });

  useEffect(() => {
    if (!remote.data) return;
    mergeServerTemplates(remote.data);
    const id = remote.data.resolvedId || resolveDashboardId(me.data?.user);
    const dash = findDashboard(id);
    if (dash) {
      setActiveId(id);
      setLayout({ ...dash.layout, items: dash.layout.items.map((i) => ({ ...i })) });
      persistLayout(dash.layout);
    }
  }, [remote.data, me.data?.user]);

  const ctx: TileContext | null = useMemo(() => {
    if (!dash.data) return null;
    return {
      dashboard: dash.data,
      certificates: certs.data ?? [],
      profiles: profiles.data ?? [],
      renewals: renewals.data ?? [],
      events: activity.data?.events ?? [],
      activitySummary: activity.data?.summary,
    };
  }, [dash.data, certs.data, profiles.data, renewals.data, activity.data]);

  if (dash.isLoading) return <Loading />;
  if (dash.error || !dash.data || !ctx) return <ErrorBox error={dash.error} />;

  const steps: SetupStep[] = [
    {
      id: 'ca',
      title: 'Create the internal CA',
      detail: 'One-click renewals for internal names.',
      to: '/settings',
      done: Boolean(ca.data?.exists),
    },
    {
      id: 'cert',
      title: 'Import a certificate',
      detail: 'Drop a PFX or PEM so Vigil has something to manage.',
      to: '/certificates/import',
      done: dash.data.counts.total > 0,
    },
    {
      id: 'profile',
      title: 'Build an output profile',
      detail: 'Tell renewals which files to render and where.',
      to: '/profiles/new',
      done: dash.data.profiles > 0,
    },
    {
      id: 'renew',
      title: 'Run a first renewal',
      detail: 'Issue or generate a CSR so the trail is no longer empty.',
      to: '/certificates',
      done: (renewals.data ?? []).length > 0 || dash.data.recentEvents.some((e) => e.type === 'renewal' || e.type === 'csr'),
    },
  ];
  const setupComplete = steps.every((s) => s.done);
  const showSetup = !hiddenSetup || !setupComplete;
  const emptyFleet = dash.data.counts.total === 0;
  const dashboards = allDashboards();
  const current = dashboards.find((d) => d.id === activeId);
  const canPick = !me.data?.authEnabled || me.data.user?.role === 'admin';

  return (
    <>
      <PageHeader
        eyebrow={dash.data.settings.organisation}
        title="Dashboard"
        description={
          emptyFleet
            ? 'A fresh install. Work through the checklist — the charts will fill themselves.'
            : dash.data.counts.critical + dash.data.counts.expired > 0
              ? `${dash.data.counts.critical + dash.data.counts.expired} certificate${dash.data.counts.critical + dash.data.counts.expired === 1 ? '' : 's'} need attention.`
              : 'Every certificate is inside its renewal window.'
        }
        actions={
          <>
            {canPick && (
              <>
                <Select
                  value={activeId}
                  className="h-9 w-44"
                  onChange={(e) => {
                    setActiveId(e.target.value);
                    setLayout(setActiveDashboard(e.target.value));
                  }}
                >
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Button variant="secondary" size="sm" disabled={!lgUp} title={lgUp ? undefined : 'The builder needs a wider window'} onClick={() => navigate('/dashboard/builder')}>
                  Edit layout
                </Button>
              </>
            )}
          </>
        }
      />

      {showSetup && (
        <SetupChecklist
          steps={steps}
          complete={setupComplete}
          onDismiss={
            setupComplete
              ? () => {
                  setSetupDismissed(true);
                  setHiddenSetup(true);
                }
              : undefined
          }
        />
      )}

      {!lgUp && <p className="mb-4 text-[13px] text-text-soft">Tiles are stacked for this window size. Widen the window to use the dashboard builder.</p>}

      {current && !canPick && (
        <p className="mb-4 text-[12px] text-text-soft">
          Showing “{current.name}” — assigned to {me.data?.user?.role ?? 'this session'}.
        </p>
      )}

      {(!emptyFleet || layout.items.length > 0) &&
        (lgUp ? (
          <GridCanvas
            layout={layout}
            ctx={ctx}
            editing={false}
            canvasRef={grid.canvasRef}
            canvasWidth={grid.canvasWidth}
            cellW={grid.cellW}
            interaction={grid.interaction}
            startMove={() => undefined}
            startResize={() => undefined}
            onChange={() => undefined}
          />
        ) : (
          <StackedTiles layout={layout} ctx={ctx} />
        ))}
    </>
  );
}
