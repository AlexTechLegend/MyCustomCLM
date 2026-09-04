import type { TileContext, TileDef, TilePreviewSize } from '@/components/tiles/types';

export const PREVIEW_BOX: Record<TilePreviewSize, number> = { '2x2': 126, '4x4': 252 };
export const PREVIEW_SCALE = 0.4;

/**
 * The real tile, rendered at roughly 40% and clipped to a square. `inert` plus
 * `aria-hidden` keep it out of the tab order and the accessibility tree, and
 * `pointer-events: none` lets the parent handle the drag.
 */
export function TilePreview({ def, ctx }: { def: TileDef; ctx: TileContext }) {
  const box = PREVIEW_BOX[def.preview];
  const inner = box / PREVIEW_SCALE;
  return (
    <div aria-hidden inert className="overflow-hidden pointer-events-none select-none bg-canvas" style={{ width: box, height: box }}>
      <div className="tile-fill" style={{ width: inner, height: inner, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
        {def.render(ctx)}
      </div>
    </div>
  );
}
