import clsx from 'clsx';
import { Check, Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TILE_REGISTRY } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';
import { Button, Chips, Input } from '@/components/ui';
import type { DashboardLayout, GridCols, GridPos } from '@/lib/dashboardStore';
import { GRID_COLS, MIN_ROWS, ROW_STEP, scaleUnits } from '@/lib/gridGeometry';
import { TilePreview } from './TilePreview';

type ColsId = '12' | '24' | '36';

export function TilePalette({
  layout,
  ctx,
  blocking,
  onChangeCols,
  onAddRows,
  onRemoveRows,
  onAddTile,
  startPlace,
  className,
}: {
  layout: DashboardLayout;
  ctx: TileContext;
  /** First tile that would be evicted by removing 12 rows, if any. */
  blocking: GridPos | null;
  onChangeCols: (cols: GridCols) => void;
  onAddRows: () => void;
  onRemoveRows: () => void;
  onAddTile: (tileId: string) => void;
  startPlace: (tileId: string, e: ReactPointerEvent) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const placed = useMemo(() => new Set(layout.items.map((i) => i.id)), [layout.items]);
  const blockingTitle = blocking ? TILE_REGISTRY.find((t) => t.id === blocking.id)?.title ?? blocking.id : null;
  const canShrink = layout.rows > MIN_ROWS && !blocking;

  const q = query.trim().toLowerCase();
  const visible = TILE_REGISTRY.filter((t) => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));

  return (
    <aside className={clsx('card p-0 flex flex-col overflow-hidden', className)} aria-label="Dashboard builder">
      <div className="p-4 border-b border-line space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-soft">Canvas</span>
            <span className="text-[12px] tnum text-text-mid">
              {layout.cols} × {layout.rows} cells
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-text">Width</span>
            <Chips<ColsId>
              value={String(layout.cols) as ColsId}
              onChange={(v) => onChangeCols(Number(v) as GridCols)}
              options={GRID_COLS.map((c) => ({ id: String(c) as ColsId, label: String(c) }))}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[13px] text-text">Height</span>
            <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-canvas p-1">
              <span title={canShrink ? `Remove ${ROW_STEP} rows` : blockingTitle ? `Shrinking would evict “${blockingTitle}”` : `Minimum ${MIN_ROWS} rows`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={!canShrink}
                  aria-label={`Remove ${ROW_STEP} rows`}
                  onClick={onRemoveRows}
                  icon={<Minus className="size-3.5" />}
                >
                  12
                </Button>
              </span>
              <span className="tnum text-[13px] font-medium text-text px-1.5 min-w-[3ch] text-center">{layout.rows}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Add ${ROW_STEP} rows`} onClick={onAddRows} icon={<Plus className="size-3.5" />}>
                12
              </Button>
            </div>
          </div>
          {blockingTitle && (
            <p className="mt-1.5 text-[12px] text-warn-fg">
              −12 blocked: “{blockingTitle}” sits in the bottom rows.
            </p>
          )}
        </div>

        <div className="relative">
          <Search className="size-4 text-text-soft absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tiles…" className="pl-9 h-9" aria-label="Search tiles" />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3" aria-label="Tiles">
        {visible.map((def) => {
          const on = placed.has(def.id);
          const w = scaleUnits(def.defaultW, layout.cols);
          return (
            <li key={def.id} className={clsx('rounded-xl border border-line bg-surface-raised p-2.5', on && 'opacity-60')}>
              <div
                role={on ? undefined : 'button'}
                aria-label={on ? undefined : `Drag ${def.title} onto the canvas`}
                className={clsx('rounded-lg overflow-hidden border border-line bg-canvas flex justify-center', !on && 'cursor-grab active:cursor-grabbing touch-none')}
                onPointerDown={on ? undefined : (e) => startPlace(def.id, e)}
              >
                <TilePreview def={def} ctx={ctx} />
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-text truncate">{def.title}</div>
                  <div className="text-[12px] text-text-soft leading-5">{def.description}</div>
                </div>
                <span className="shrink-0 tnum text-[11px] text-text-mid rounded-md border border-line bg-surface px-1.5 py-0.5" title="Default size, columns × rows">
                  {w} × {def.defaultH}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {on ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-accent font-medium">
                    <Check className="size-3.5" /> On canvas
                  </span>
                ) : (
                  <>
                    <span className="text-[12px] text-text-soft">Drag the preview, or</span>
                    <Button size="sm" variant="ghost" className="h-7" icon={<Plus className="size-3.5" />} onClick={() => onAddTile(def.id)}>
                      Add
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {visible.length === 0 && <li className="text-[13px] text-text-soft px-1 py-4 text-center">No tiles match “{query}”.</li>}
      </ul>
    </aside>
  );
}
