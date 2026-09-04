import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TILE_BY_ID } from '@/components/tiles/registry';
import type { DashboardLayout, GridPos } from '@/lib/dashboardStore';
import { canvasHeight, cellWidth, clamp, collides, GAP, inBounds, pxToCols, pxToRows, ROW_HEIGHT, scaleUnits } from '@/lib/gridGeometry';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type Px = { x: number; y: number };

export type Interaction =
  | { kind: 'idle' }
  | { kind: 'place'; tileId: string; w: number; h: number; candidate: GridPos | null; valid: boolean }
  | { kind: 'move'; id: string; origin: GridPos; offset: Px; candidate: GridPos; valid: boolean }
  | { kind: 'resize'; id: string; origin: GridPos; handle: Handle; candidate: GridPos; valid: boolean };

const IDLE: Interaction = { kind: 'idle' };

function samePos(a: GridPos, b: GridPos) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Pointer-driven place / move / resize on the grid canvas. All geometry is
 * resolved against the live canvas rectangle so scrolling mid-drag stays correct.
 */
export function useGridInteraction({ layout, onChange }: { layout: DashboardLayout; onChange: (next: DashboardLayout) => void }) {
  const canvasEl = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  const canvasRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    canvasEl.current = el;
    if (!el) return;
    setCanvasWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setCanvasWidth(w);
    });
    ro.observe(el);
    observer.current = ro;
  }, []);

  const cellW = cellWidth(canvasWidth, layout.cols);

  const [interaction, setInteraction] = useState<Interaction>(IDLE);

  // Refs let the window listeners read the latest values without re-binding per frame.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const cellWRef = useRef(cellW);
  cellWRef.current = cellW;
  const canvasWidthRef = useRef(canvasWidth);
  canvasWidthRef.current = canvasWidth;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
  const startPx = useRef<Px | null>(null);

  const toCanvas = useCallback((e: { clientX: number; clientY: number }): Px | null => {
    const el = canvasEl.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const begin = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return false;
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      startPx.current = toCanvas(e);
      return startPx.current !== null;
    },
    [toCanvas],
  );

  const startMove = useCallback(
    (id: string, e: ReactPointerEvent) => {
      const item = layoutRef.current.items.find((i) => i.id === id);
      if (!item || !begin(e)) return;
      setInteraction({ kind: 'move', id, origin: item, offset: { x: 0, y: 0 }, candidate: item, valid: true });
    },
    [begin],
  );

  const startResize = useCallback(
    (id: string, handle: Handle, e: ReactPointerEvent) => {
      const item = layoutRef.current.items.find((i) => i.id === id);
      if (!item || !begin(e)) return;
      setInteraction({ kind: 'resize', id, origin: item, handle, candidate: item, valid: true });
    },
    [begin],
  );

  const startPlace = useCallback(
    (tileId: string, e: ReactPointerEvent) => {
      const def = TILE_BY_ID[tileId];
      if (!def) return;
      if (e.button !== 0) return;
      e.preventDefault();
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
      const { cols } = layoutRef.current;
      setInteraction({ kind: 'place', tileId, w: scaleUnits(def.defaultW, cols), h: def.defaultH, candidate: null, valid: false });
    },
    [],
  );

  const cancel = useCallback(() => setInteraction(IDLE), []);

  useEffect(() => {
    if (interaction.kind === 'idle') return;

    const onMove = (e: PointerEvent) => {
      const st = interactionRef.current;
      const { cols, rows, items } = layoutRef.current;
      const cw = cellWRef.current;
      const p = toCanvas(e);
      if (!p) return;

      if (st.kind === 'place') {
        const inside = p.x >= 0 && p.y >= 0 && p.x <= canvasWidthRef.current && p.y <= canvasHeight(rows);
        if (!inside) {
          if (st.candidate) setInteraction({ ...st, candidate: null, valid: false });
          return;
        }
        const x = clamp(Math.round(p.x / (cw + GAP) - st.w / 2), 0, Math.max(0, cols - st.w));
        const y = clamp(Math.round(p.y / (ROW_HEIGHT + GAP) - st.h / 2), 0, Math.max(0, rows - st.h));
        const candidate: GridPos = { id: st.tileId, x, y, w: st.w, h: st.h };
        const valid = inBounds(candidate, cols, rows) && !collides(candidate, items);
        setInteraction({ ...st, candidate, valid });
        return;
      }

      const s = startPx.current;
      if (!s) return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const dc = pxToCols(dx, cw);
      const dr = pxToRows(dy);

      if (st.kind === 'move') {
        const o = st.origin;
        const candidate: GridPos = { ...o, x: clamp(o.x + dc, 0, cols - o.w), y: clamp(o.y + dr, 0, rows - o.h) };
        setInteraction({ ...st, offset: { x: dx, y: dy }, candidate, valid: !collides(candidate, items, st.id) });
        return;
      }

      if (st.kind === 'resize') {
        const def = TILE_BY_ID[st.id];
        const minW = scaleUnits(def?.minW ?? 1, cols);
        const minH = def?.minH ?? 1;
        const o = st.origin;
        let { x, y, w, h } = o;
        if (st.handle.includes('e')) w = clamp(o.w + dc, minW, cols - o.x);
        if (st.handle.includes('w')) {
          const nx = clamp(o.x + dc, 0, o.x + o.w - minW);
          w = o.x + o.w - nx;
          x = nx;
        }
        if (st.handle.includes('s')) h = clamp(o.h + dr, minH, rows - o.y);
        if (st.handle.includes('n')) {
          const ny = clamp(o.y + dr, 0, o.y + o.h - minH);
          h = o.y + o.h - ny;
          y = ny;
        }
        const candidate: GridPos = { id: st.id, x, y, w, h };
        setInteraction({ ...st, candidate, valid: inBounds(candidate, cols, rows) && !collides(candidate, items, st.id) });
      }
    };

    const onUp = () => {
      const st = interactionRef.current;
      const layout = layoutRef.current;
      if (st.kind === 'place' && st.valid && st.candidate) {
        onChangeRef.current({ ...layout, items: [...layout.items, st.candidate] });
      } else if ((st.kind === 'move' || st.kind === 'resize') && st.valid && !samePos(st.candidate, st.origin)) {
        onChangeRef.current({ ...layout, items: layout.items.map((i) => (i.id === st.id ? st.candidate : i)) });
      }
      setInteraction(IDLE);
    };

    const onCancel = () => setInteraction(IDLE);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setInteraction(IDLE);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [interaction.kind, toCanvas]);

  return { canvasRef, canvasWidth, cellW, interaction, startMove, startResize, startPlace, cancel };
}
