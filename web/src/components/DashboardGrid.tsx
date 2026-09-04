import { useEffect, useState } from 'react';
import { TILE_BY_ID } from '@/components/tiles/registry';
import type { TileContext } from '@/components/tiles/types';
import type { DashboardLayout } from '@/lib/dashboardStore';
import { sortReading } from '@/lib/gridGeometry';

/** Tracks Tailwind's `lg` breakpoint; the 2-D builder needs at least that much width. */
export function useIsLgUp() {
  const [up, setUp] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setUp(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return up;
}

/**
 * Narrow-viewport fallback: a fixed grid cannot reflow, so tiles stack full-width
 * in reading order (top to bottom, then left to right) at their natural height.
 */
export function StackedTiles({ layout, ctx }: { layout: DashboardLayout; ctx: TileContext }) {
  return (
    <div className="space-y-4">
      {sortReading(layout.items).map((item) => {
        const def = TILE_BY_ID[item.id];
        if (!def) return null;
        return <div key={item.id}>{def.render(ctx)}</div>;
      })}
    </div>
  );
}
