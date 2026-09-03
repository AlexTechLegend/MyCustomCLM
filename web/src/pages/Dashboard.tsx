import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { DashboardGrid } from '@/components/DashboardGrid';
import { SetupChecklist, type SetupStep } from '@/components/SetupChecklist';
import { Button, ErrorBox, Loading, PageHeader, Select } from '@/components/ui';
import {
  activeDashboardId,
  allDashboards,
  defaultDashboardId,
  deleteDashboard,
  loadLayout,
  persistLayout,
  resetLayout,
  saveNamedDashboard,
  setActiveDashboard,
  setDefaultDashboard,
  setupDismissed,
  setSetupDismissed,
  type LayoutItem,
} from '@/lib/dashboardStore';
import { api } from '@/lib/api';
import type { TileContext } from '@/components/tiles/types';

export function Dashboard() {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 });
  const certs = useQuery({ queryKey: ['certificates', {}], queryFn: () => api.certificates({}) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const renewals = useQuery({ queryKey: ['renewals'], queryFn: api.renewals });
  const activity = useQuery({ queryKey: ['activity', 'all'], queryFn: () => api.activity() });
  const ca = useQuery({ queryKey: ['ca'], queryFn: api.ca });

  const [items, setItems] = useState<LayoutItem[]>(() => loadLayout());
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState(activeDashboardId);
  const [nameDraft, setNameDraft] = useState('');
  const [hiddenSetup, setHiddenSetup] = useState(setupDismissed);

  const updateItems = (next: LayoutItem[]) => {
    setItems(next);
    persistLayout(next);
  };

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
  const isDefault = defaultDashboardId() === activeId;
  const current = dashboards.find((d) => d.id === activeId);

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
            <Select
              value={activeId}
              className="h-9 w-44"
              onChange={(e) => {
                setActiveId(e.target.value);
                updateItems(setActiveDashboard(e.target.value));
              }}
            >
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.id === defaultDashboardId() ? ' (default)' : ''}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit layout'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => updateItems(resetLayout())}>
              Reset to default
            </Button>
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

      {editing && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Name this dashboard"
            className="h-9 rounded-xl border border-ink-200 bg-surface px-3 text-sm"
          />
          <Button
            size="sm"
            disabled={!nameDraft.trim()}
            onClick={() => {
              const saved = saveNamedDashboard(nameDraft, items);
              setActiveId(saved.id);
              setNameDraft('');
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDefaultDashboard(activeId)}>
            {isDefault ? 'Default dashboard' : 'Set as default'}
          </Button>
          {current && !current.builtin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                deleteDashboard(current.id);
                setActiveId('default');
                updateItems(setActiveDashboard('default'));
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}

      {(!emptyFleet || editing) && <DashboardGrid items={items} ctx={ctx} editing={editing} onChange={updateItems} />}
    </>
  );
}
