import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridCanvas } from '@/components/dashboard/GridCanvas';
import { TilePalette } from '@/components/dashboard/TilePalette';
import { useGridInteraction } from '@/components/dashboard/useGridInteraction';
import { useIsLgUp } from '@/components/DashboardGrid';
import { TILE_BY_ID } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';
import { useToast } from '@/components/Toast';
import { Button, Checkbox, ErrorBox, Input, Loading, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import {
  allDashboards,
  BLANK_LAYOUT,
  BUILTIN_DASHBOARDS,
  defaultDashboardId,
  exportCustomStore,
  findDashboard,
  mergeServerTemplates,
  persistLayout,
  roleAssignments,
  saveNamedDashboard,
  setActiveDashboard,
  setAssignments,
  setDefaultDashboard,
  updateNamedDashboard,
  userAssignments,
  USER_ROLES,
  type DashboardLayout,
  type GridCols,
} from '@/lib/dashboardStore';
import { evictedBy, MIN_ROWS, scaleLayout, scaleUnits, slotOrGrow } from '@/lib/gridGeometry';
import type { User, UserRole } from '@/types';

const ROLE_LABEL: Record<UserRole, string> = {
  viewer: 'Viewer',
  operator: 'Operator',
  approver: 'Approver',
  admin: 'Admin',
};

function syncServer(resolvedId: string) {
  const payload = exportCustomStore();
  return api.saveDashboardTemplates(payload).catch(() => ({ ...payload, resolvedId }));
}

export function DashboardBuilder() {
  const navigate = useNavigate();
  const toast = useToast();
  const lgUp = useIsLgUp();
  const queryClient = useQueryClient();

  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 });
  const certs = useQuery({ queryKey: ['certificates', {}], queryFn: () => api.certificates({}) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const renewals = useQuery({ queryKey: ['renewals'], queryFn: api.renewals });
  const activity = useQuery({ queryKey: ['activity', 'all'], queryFn: () => api.activity() });
  const me = useQuery({ queryKey: ['auth-me'], queryFn: api.me });
  const users = useQuery({ queryKey: ['users'], queryFn: api.users, retry: false });
  const remote = useQuery({
    queryKey: ['dashboard-templates'],
    queryFn: api.dashboardTemplates,
  });

  useEffect(() => {
    if (!remote.data) return;
    mergeServerTemplates(remote.data);
  }, [remote.data]);

  const [layout, setLayout] = useState<DashboardLayout>(() => ({ ...BLANK_LAYOUT, items: [] }));
  const [editingId, setEditingId] = useState<string | ''>('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [asDefault, setAsDefault] = useState(false);

  const updateLayout = (next: DashboardLayout) => setLayout(next);

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

  if (me.data?.authEnabled && me.data.user?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Dashboard builder" description="An administrator assigns dashboard templates to each role or person." />
        <Button onClick={() => navigate('/')}>Back to dashboard</Button>
      </div>
    );
  }

  if (!lgUp) {
    return (
      <div>
        <PageHeader title="Dashboard builder" description="The builder needs a wider window. Widen the browser or return to the dashboard." />
        <Button onClick={() => navigate('/')}>Back to dashboard</Button>
      </div>
    );
  }

  if (dash.isLoading) return <Loading />;
  if (dash.error || !dash.data || !ctx) return <ErrorBox error={dash.error} />;

  const templates = allDashboards();
  const userList: User[] = users.data ?? [];

  const changeCols = (cols: GridCols) => updateLayout(scaleLayout(layout, cols, (id) => TILE_BY_ID[id]?.minW ?? 1));
  const grow = (delta: number) => {
    const next = layout.rows + delta;
    if (next < MIN_ROWS) return;
    if (delta < 0 && evictedBy(layout.items, next).length) return;
    updateLayout({ ...layout, rows: next });
  };
  const addTile = (tileId: string) => {
    const def = TILE_BY_ID[tileId];
    if (!def || layout.items.some((i) => i.id === tileId)) return;
    const w = scaleUnits(def.defaultW, layout.cols);
    const slot = slotOrGrow(layout.items, w, def.defaultH, layout.cols, layout.rows);
    updateLayout({ ...layout, rows: slot.rows, items: [...layout.items, { id: tileId, x: slot.x, y: slot.y, w, h: def.defaultH }] });
  };

  const loadExisting = (id: string) => {
    if (!id) {
      setEditingId('');
      setLayout({ ...BLANK_LAYOUT, items: [] });
      setName('');
      setRoles([]);
      setUserIds([]);
      setAsDefault(false);
      return;
    }
    const dash = findDashboard(id);
    if (!dash) return;
    setEditingId(id);
    setLayout({ ...dash.layout, items: dash.layout.items.map((i) => ({ ...i })) });
    setName(dash.builtin ? `${dash.name} copy` : dash.name);
    const ra = roleAssignments();
    setRoles(USER_ROLES.filter((r) => ra[r] === id));
    const ua = userAssignments();
    setUserIds(Object.entries(ua).filter(([, tid]) => tid === id).map(([uid]) => uid));
    setAsDefault(defaultDashboardId() === id);
  };

  const applyAssignments = (templateId: string) => {
    const nextRoles = { ...roleAssignments() };
    for (const r of USER_ROLES) {
      if (roles.includes(r)) nextRoles[r] = templateId;
      else if (nextRoles[r] === templateId) delete nextRoles[r];
    }
    const nextUsers = { ...userAssignments() };
    for (const uid of Object.keys(nextUsers)) {
      if (nextUsers[uid] === templateId && !userIds.includes(uid)) delete nextUsers[uid];
    }
    for (const uid of userIds) nextUsers[uid] = templateId;
    setAssignments({
      roleAssignments: nextRoles,
      userAssignments: nextUsers,
      defaultId: asDefault ? templateId : defaultDashboardId(),
    });
    if (asDefault) setDefaultDashboard(templateId);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Name this template first');
      return;
    }
    const existing = editingId && !BUILTIN_DASHBOARDS.some((b) => b.id === editingId) ? updateNamedDashboard(editingId, { name, layout }) : null;
    const saved = existing ?? saveNamedDashboard(name, layout);
    applyAssignments(saved.id);
    persistLayout(saved.layout);
    setActiveDashboard(saved.id);
    try {
      const remote = await syncServer(saved.id);
      queryClient.setQueryData(['dashboard-templates'], { ...remote, resolvedId: remote.resolvedId ?? saved.id });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-templates'] });
    } catch {
      /* local copy is enough when the API is unreachable */
    }
    toast.success(`Saved “${saved.name}”`);
    navigate('/');
  };

  return (
    <>
      <PageHeader
        title="Dashboard builder"
        description="Blank 12 × 12 canvas. Drag tiles from the right, pull any edge to resize, and save as a template for a permission level or a specific person."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={!name.trim() || layout.items.length === 0}>
              Save template
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-[12px] font-medium text-text-soft mb-1">Start from</span>
          <Select value={editingId} onChange={(e) => loadExisting(e.target.value)} className="h-9 w-56">
            <option value="">Blank canvas</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.builtin ? ' (built-in)' : ''}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-text-soft mb-1">Template name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Operations view" className="h-9 w-56" aria-label="Template name" />
        </label>
        <label className="inline-flex items-center gap-2 h-9 text-[13px] text-text">
          <input type="checkbox" className="size-4 accent-brand-600" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} />
          Estate default
        </label>
      </div>

      <div className="mb-5 card p-4">
        <div className="text-[13px] font-medium text-text mb-1">Who sees this template</div>
        <p className="text-[12px] text-text-soft mb-3">A person assignment wins over their role. Everyone else keeps the estate default.</p>
        <div className="flex flex-wrap gap-4 mb-3">
          {USER_ROLES.map((r) => (
            <Checkbox
              key={r}
              checked={roles.includes(r)}
              onChange={(on) => setRoles(on ? [...roles, r] : roles.filter((x) => x !== r))}
              label={ROLE_LABEL[r]}
            />
          ))}
        </div>
        {userList.length > 0 && (
          <div>
            <div className="text-[12px] font-medium text-text-soft mb-2">Specific people</div>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {userList.map((u) => (
                <li key={u.id}>
                  <Checkbox
                    checked={userIds.includes(u.id)}
                    onChange={(on) => setUserIds(on ? [...userIds, u.id] : userIds.filter((x) => x !== u.id))}
                    label={`${u.displayName || u.username} (${ROLE_LABEL[u.role]})`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        {me.data?.authEnabled && !me.data.user && (
          <p className="text-[12px] text-text-soft">Sign in to assign templates to people. Role assignments still apply when they next log in.</p>
        )}
      </div>

      <div className={clsx('flex items-start gap-5', grid.interaction.kind !== 'idle' && 'select-none')}>
        <div className="flex-1 min-w-0">
          <GridCanvas
            layout={layout}
            ctx={ctx}
            editing
            canvasRef={grid.canvasRef}
            canvasWidth={grid.canvasWidth}
            cellW={grid.cellW}
            interaction={grid.interaction}
            startMove={grid.startMove}
            startResize={grid.startResize}
            onChange={updateLayout}
          />
        </div>
        <TilePalette
          className="w-[300px] shrink-0 sticky top-14 max-h-[calc(100vh-4.5rem)]"
          layout={layout}
          ctx={ctx}
          onChangeCols={changeCols}
          onGrow={grow}
          onAddTile={addTile}
          startPlace={grid.startPlace}
        />
      </div>
    </>
  );
}
