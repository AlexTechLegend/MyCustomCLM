import clsx from 'clsx';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from 'react';
import { TILE_BY_ID } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';
import type { DashboardLayout, GridPos } from '@/lib/dashboardStore';
import { canvasHeight, GAP, isValidPlacement, rectFor, ROW_HEIGHT, scaleUnits } from '@/lib/gridGeometry';
import { GridTile } from './GridTile';
import type { Handle, Interaction } from './useGridInteraction';

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function GridCanvas({
  layout,
  ctx,
  editing,
  canvasRef,
  canvasWidth,
  cellW,
  interaction,
  startMove,
  startResize,
  onChange,
}: {
  layout: DashboardLayout;
  ctx: TileContext;
  editing: boolean;
  canvasRef: Ref<HTMLDivElement>;
  canvasWidth: number;
  cellW: number;
  interaction: Interaction;
  startMove: (id: string, e: ReactPointerEvent) => void;
  startResize: (id: string, handle: Handle, e: ReactPointerEvent) => void;
  onChange: (next: DashboardLayout) => void;
}) {
  const { cols, rows, items } = layout;
  const ready = canvasWidth > 0;

  const remove = (id: string) => onChange({ ...layout, items: items.filter((i) => i.id !== id) });

  const onTileKey = (item: GridPos, e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(item.id);
      return;
    }
    const step = NUDGE[e.key];
    if (!step) return;
    e.preventDefault();
    const [dx, dy] = step;
    const def = TILE_BY_ID[item.id];
    const minW = scaleUnits(def?.minW ?? 1, cols);
    const minH = def?.minH ?? 1;
    const cand: GridPos = e.shiftKey
      ? { ...item, w: Math.max(minW, item.w + dx), h: Math.max(minH, item.h + dy) }
      : { ...item, x: item.x + dx, y: item.y + dy };
    if (isValidPlacement(cand, items, cols, rows, item.id)) onChange({ ...layout, items: items.map((i) => (i.id === item.id ? cand : i)) });
  };

  let ghost: { rect: ReturnType<typeof rectFor>; valid: boolean; label?: string } | null = null;
  if (interaction.kind === 'place' && interaction.candidate) {
    ghost = { rect: rectFor(interaction.candidate, cellW), valid: interaction.valid, label: TILE_BY_ID[interaction.tileId]?.title };
  } else if (interaction.kind === 'move' || interaction.kind === 'resize') {
    ghost = { rect: rectFor(interaction.candidate, cellW), valid: interaction.valid };
  }

  return (
    <div
      ref={canvasRef}
      className={clsx('relative w-full', editing && 'rounded-2xl', interaction.kind !== 'idle' && 'select-none cursor-grabbing')}
      style={{ height: canvasHeight(rows) }}
    >
      {editing && ready && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          <defs>
            <pattern id="dashboard-grid-cells" width={cellW + GAP} height={ROW_HEIGHT + GAP} patternUnits="userSpaceOnUse">
              <rect width={cellW} height={ROW_HEIGHT} rx={6} className="fill-accent/6 stroke-line-strong/60" strokeDasharray="3 3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dashboard-grid-cells)" />
        </svg>
      )}

      {ready &&
        items.map((item) => {
          const def = TILE_BY_ID[item.id];
          if (!def) return null;
          const moving = interaction.kind === 'move' && interaction.id === item.id;
          const resizing = interaction.kind === 'resize' && interaction.id === item.id;
          const pos = resizing ? interaction.candidate : item;
          return (
            <GridTile
              key={item.id}
              item={item}
              title={def.title}
              rect={rectFor(pos, cellW)}
              editing={editing}
              dragging={moving || resizing}
              offset={moving ? interaction.offset : undefined}
              onStartMove={(e) => startMove(item.id, e)}
              onStartResize={(h, e) => startResize(item.id, h, e)}
              onRemove={() => remove(item.id)}
              onKeyDown={(e) => onTileKey(item, e)}
            >
              {def.render(ctx)}
            </GridTile>
          );
        })}

      {ghost && (
        <div
          aria-hidden
          className={clsx(
            'absolute z-50 pointer-events-none rounded-2xl border-2 flex items-start justify-start p-2',
            ghost.valid ? 'border-ok-500 bg-ok-500/12' : 'border-crit-500 bg-crit-500/12',
          )}
          style={ghost.rect}
        >
          {ghost.label && (
            <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-medium bg-surface-raised border', ghost.valid ? 'text-ok-fg border-ok-500/40' : 'text-crit-fg border-crit-500/40')}>
              {ghost.valid ? ghost.label : `${ghost.label} — no room here`}
            </span>
          )}
        </div>
      )}

      {editing && items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="rounded-xl bg-surface border border-line px-4 py-2 text-[13px] text-text-mid">Drag a tile from the palette onto the canvas.</p>
        </div>
      )}
    </div>
  );
}
