import clsx from 'clsx';
import { Check, GripVertical, Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TILE_REGISTRY } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';
import { Button, Chips, Input } from '@/components/ui';
import type { DashboardLayout, GridCols } from '@/lib/dashboardStore';
import { evictedBy, GRID_COLS, MIN_ROWS, scaleUnits } from '@/lib/gridGeometry';
import { TilePreview } from './TilePreview';

type ColsId = '12' | '24' | '36';

export function TilePalette({
  layout,
  ctx,
  onChangeCols,
  onGrow,
  onAddTile,
  startPlace,
  className,
}: {
  layout: DashboardLayout;
  ctx: TileContext;
  onChangeCols: (cols: GridCols) => void;
  onGrow: (delta: number) => void;
  onAddTile: (tileId: string) => void;
  startPlace: (tileId: string, e: ReactPointerEvent) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const placed = useMemo(() => new Set(layout.items.map((i) => i.id)), [layout.items]);
  const evict1 = evictedBy(layout.items, layout.rows - 1);
  const evict12 = evictedBy(layout.items, layout.rows - 12);
  const blocking = evict1[0] ?? evict12[0] ?? null;
  const blockingTitle = blocking ? TILE_REGISTRY.find((t) => t.id === blocking.id)?.title ?? blocking.id : null;
  const canShrink1 = layout.rows > MIN_ROWS && evict1.length === 0;
  const canShrink12 = layout.rows - 12 >= MIN_ROWS && evict12.length === 0;

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
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-canvas p-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={!canShrink12} aria-label="Remove 12 rows" onClick={() => onGrow(-12)}>
                −12
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={!canShrink1} aria-label="Remove one row" onClick={() => onGrow(-1)} icon={<Minus className="size-3.5" />} />
              <span className="tnum text-[13px] font-medium text-text px-1.5 min-w-[3ch] text-center">{layout.rows}</span>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Add one row" onClick={() => onGrow(1)} icon={<Plus className="size-3.5" />} />
              <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Add 12 rows" onClick={() => onGrow(12)}>
                +12
              </Button>
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-text-soft">The canvas grows as you drag toward the bottom.</p>
          {blockingTitle && (
            <p className="text-[12px] text-warn-fg">
              Shrink blocked: “{blockingTitle}” sits in the bottom rows.
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
            <li
              key={def.id}
              className={clsx('rounded-xl border border-line bg-surface-raised p-2.5', on && 'opacity-60', !on && 'cursor-grab active:cursor-grabbing touch-none')}
              onPointerDown={on ? undefined : (e) => startPlace(def.id, e)}
            >
              <div className="rounded-lg overflow-hidden border border-line bg-canvas flex justify-center pointer-events-none" aria-hidden>
                <TilePreview def={def} ctx={ctx} />
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-text truncate inline-flex items-center gap-1">
                    {!on && <GripVertical className="size-3.5 text-text-soft shrink-0" />}
                    {def.title}
                  </div>
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
                    <span className="text-[12px] text-text-soft">Drag onto the grid</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      icon={<Plus className="size-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddTile(def.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
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
