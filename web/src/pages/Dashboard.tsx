import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { GridCanvas } from '@/components/dashboard/GridCanvas';
import { TilePalette } from '@/components/dashboard/TilePalette';
import { useGridInteraction } from '@/components/dashboard/useGridInteraction';
import { StackedTiles, useIsLgUp } from '@/components/DashboardGrid';
import { SetupChecklist, type SetupStep } from '@/components/SetupChecklist';
import { TILE_BY_ID } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';
import { Button, ErrorBox, Input, Loading, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
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
  type DashboardLayout,
  type GridCols,
} from '@/lib/dashboardStore';
import { evictedBy, ROW_STEP, scaleLayout, scaleUnits, slotOrGrow } from '@/lib/gridGeometry';

export function Dashboard() {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 });
  const certs = useQuery({ queryKey: ['certificates', {}], queryFn: () => api.certificates({}) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const renewals = useQuery({ queryKey: ['renewals'], queryFn: api.renewals });
  const activity = useQuery({ queryKey: ['activity', 'all'], queryFn: () => api.activity() });
  const ca = useQuery({ queryKey: ['ca'], queryFn: api.ca });

  const [layout, setLayout] = useState<DashboardLayout>(() => loadLayout());
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState(activeDashboardId);
  const [nameDraft, setNameDraft] = useState('');
  const [hiddenSetup, setHiddenSetup] = useState(setupDismissed);
  const lgUp = useIsLgUp();

  useEffect(() => {
    if (!lgUp && editing) setEditing(false);
  }, [lgUp, editing]);

  const updateLayout = (next: DashboardLayout) => {
    setLayout(next);
    persistLayout(next);
  };

  const grid = useGridInteraction({ layout, onChange: updateLayout });

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

  const blocking = evictedBy(layout.items, layout.rows - ROW_STEP)[0] ?? null;

  const changeCols = (cols: GridCols) => updateLayout(scaleLayout(layout, cols, (id) => TILE_BY_ID[id]?.minW ?? 1));
  const addRows = () => updateLayout({ ...layout, rows: layout.rows + ROW_STEP });
  const removeRows = () => {
    if (blocking || layout.rows - ROW_STEP < ROW_STEP) return;
    updateLayout({ ...layout, rows: layout.rows - ROW_STEP });
  };
  const addTile = (tileId: string) => {
    const def = TILE_BY_ID[tileId];
    if (!def || layout.items.some((i) => i.id === tileId)) return;
    const w = scaleUnits(def.defaultW, layout.cols);
    const slot = slotOrGrow(layout.items, w, def.defaultH, layout.cols, layout.rows);
    updateLayout({ ...layout, rows: slot.rows, items: [...layout.items, { id: tileId, x: slot.x, y: slot.y, w, h: def.defaultH }] });
  };

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
                updateLayout(setActiveDashboard(e.target.value));
              }}
            >
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.id === defaultDashboardId() ? ' (default)' : ''}
                </option>
              ))}
            </Select>
            <Button variant={editing ? 'primary' : 'ghost'} size="sm" disabled={!lgUp} title={lgUp ? undefined : 'The builder needs a wider window'} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit layout'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => updateLayout(resetLayout())}>
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

      {!lgUp && <p className="mb-4 text-[13px] text-text-soft">Tiles are stacked for this window size. Widen the window to use the dashboard builder.</p>}

      {editing && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Name this dashboard" className="h-9 w-56" aria-label="Dashboard name" />
          <Button
            size="sm"
            disabled={!nameDraft.trim()}
            onClick={() => {
              const saved = saveNamedDashboard(nameDraft, layout);
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
                updateLayout(setActiveDashboard('default'));
              }}
            >
              Delete
            </Button>
          )}
          <span className="ml-auto text-[12px] text-text-soft">Drag headers to move · pull edges to resize · Esc cancels</span>
        </div>
      )}

      {(!emptyFleet || editing) &&
        (lgUp ? (
          <div className={clsx('flex items-start gap-5', grid.interaction.kind !== 'idle' && 'select-none')}>
            <div className="flex-1 min-w-0">
              <GridCanvas
                layout={layout}
                ctx={ctx}
                editing={editing}
                canvasRef={grid.canvasRef}
                canvasWidth={grid.canvasWidth}
                cellW={grid.cellW}
                interaction={grid.interaction}
                startMove={grid.startMove}
                startResize={grid.startResize}
                onChange={updateLayout}
              />
            </div>
            {editing && (
              <TilePalette
                className="w-[300px] shrink-0 sticky top-14 max-h-[calc(100vh-4.5rem)]"
                layout={layout}
                ctx={ctx}
                blocking={blocking}
                onChangeCols={changeCols}
                onAddRows={addRows}
                onRemoveRows={removeRows}
                onAddTile={addTile}
                startPlace={grid.startPlace}
              />
            )}
          </div>
        ) : (
          <StackedTiles layout={layout} ctx={ctx} />
        ))}
    </>
  );
}
