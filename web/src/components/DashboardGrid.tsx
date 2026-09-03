import { GripVertical, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { TILE_SIZES, type LayoutItem, type TileSize } from '@/lib/dashboardStore';
import { TILE_BY_ID, TILE_REGISTRY } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';

const SPAN: Record<TileSize, string> = {
  3: 'col-span-12 md:col-span-6 xl:col-span-3',
  4: 'col-span-12 md:col-span-6 xl:col-span-4',
  6: 'col-span-12 xl:col-span-6',
  8: 'col-span-12 xl:col-span-8',
  12: 'col-span-12',
};

export function DashboardGrid({
  items,
  ctx,
  editing,
  onChange,
}: {
  items: LayoutItem[];
  ctx: TileContext;
  editing: boolean;
  onChange: (items: LayoutItem[]) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const used = new Set(items.map((i) => i.id));

  const move = (from: string, to: string) => {
    if (from === to) return;
    const next = [...items];
    const a = next.findIndex((i) => i.id === from);
    const b = next.findIndex((i) => i.id === to);
    if (a < 0 || b < 0) return;
    const [row] = next.splice(a, 1);
    next.splice(b, 0, row);
    onChange(next);
  };

  return (
    <>
      <div className="grid grid-cols-12 gap-4">
        {items.map((item) => {
          const def = TILE_BY_ID[item.id];
          if (!def) return null;
          return (
            <div
              key={item.id}
              className={SPAN[item.size]}
              draggable={editing}
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => {
                if (!editing) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, item.id);
              }}
            >
              {editing && (
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[12px] text-ink-500">
                  <span className="inline-flex items-center gap-1 cursor-grab text-ink-600">
                    <GripVertical className="size-3.5" /> {def.title}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <select
                      className="h-7 rounded-lg border border-ink-200 bg-surface px-1.5 text-[12px]"
                      value={item.size}
                      onChange={(e) =>
                        onChange(items.map((i) => (i.id === item.id ? { ...i, size: Number(e.target.value) as TileSize } : i)))
                      }
                    >
                      {TILE_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}/12
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-lg p-1 hover:bg-crit-50 text-ink-400 hover:text-crit-600"
                      aria-label={`Remove ${def.title}`}
                      onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                    >
                      <Minus className="size-3.5" />
                    </button>
                  </span>
                </div>
              )}
              <div className={editing && dragId === item.id ? 'opacity-50' : undefined}>{def.render(ctx)}</div>
            </div>
          );
        })}
      </div>
      {editing && (
        <Card className="mt-4">
          <div className="text-[13px] font-medium text-ink-800 mb-3">Add a tile</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {TILE_REGISTRY.filter((t) => !used.has(t.id)).map((t) => (
              <li key={t.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start h-auto py-2"
                  icon={<Plus className="size-3.5" />}
                  onClick={() => onChange([...items, { id: t.id, size: t.defaultSize }])}
                >
                  <span className="text-left">
                    <span className="block text-[13px] font-medium">{t.title}</span>
                    <span className="block text-[12px] text-ink-500 font-normal whitespace-normal">{t.description}</span>
                  </span>
                </Button>
              </li>
            ))}
            {TILE_REGISTRY.every((t) => used.has(t.id)) && <li className="text-[13px] text-ink-500">Every tile is already on this dashboard.</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
