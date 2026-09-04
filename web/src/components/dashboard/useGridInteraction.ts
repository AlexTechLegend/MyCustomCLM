import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TILE_BY_ID } from '@/components/tiles/registry';
import type { DashboardLayout, GridPos } from '@/lib/dashboardStore';
import { cellWidth, clamp, collides, GAP, inBounds, pxToCols, pxToRows, rectFor, ROW_HEIGHT, scaleUnits, type PxRect } from '@/lib/gridGeometry';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type Px = { x: number; y: number };

export type Interaction =
  | { kind: 'idle' }
  | { kind: 'place'; tileId: string; w: number; h: number; candidate: GridPos | null; valid: boolean; pointer: Px }
  | { kind: 'move'; id: string; origin: GridPos; offset: Px; candidate: GridPos; valid: boolean }
  | { kind: 'resize'; id: string; origin: GridPos; handle: Handle; candidate: GridPos; valid: boolean; preview: PxRect };

const IDLE: Interaction = { kind: 'idle' };

function samePos(a: GridPos, b: GridPos) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function ensureRows(layout: DashboardLayout, need: number): DashboardLayout {
  if (need <= layout.rows) return layout;
  return { ...layout, rows: need };
}

function pixelResize(origin: GridPos, handle: Handle, dx: number, dy: number, minW: number, minH: number, cellW: number, cols: number): PxRect {
  const o = rectFor(origin, cellW);
  const minWpx = minW * cellW + (minW - 1) * GAP;
  const minHpx = minH * ROW_HEIGHT + (minH - 1) * GAP;
  const maxRight = cols * cellW + (cols - 1) * GAP;
  let { left, top, width, height } = o;
  if (handle.includes('e')) width = clamp(o.width + dx, minWpx, Math.max(minWpx, maxRight - left));
  if (handle.includes('w')) {
    const nextLeft = clamp(o.left + dx, 0, o.left + o.width - minWpx);
    width = o.left + o.width - nextLeft;
    left = nextLeft;
  }
  if (handle.includes('s')) height = Math.max(minHpx, o.height + dy);
  if (handle.includes('n')) {
    const nextTop = clamp(o.top + dy, 0, o.top + o.height - minHpx);
    height = o.top + o.height - nextTop;
    top = nextTop;
  }
  return { left, top, width, height };
}

function rowsNeededForPx(top: number, height: number): number {
  return Math.max(1, Math.ceil((top + height + GAP) / (ROW_HEIGHT + GAP)));
}

/**
 * Pointer-driven place / move / resize. Palette drags do not capture the
 * pointer so the canvas can keep receiving coordinates; move/resize capture
 * on the handle so a fast flick never drops the gesture.
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
        /* best-effort */
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
      setInteraction({
        kind: 'resize',
        id,
        origin: item,
        handle,
        candidate: item,
        valid: true,
        preview: rectFor(item, cellWRef.current),
      });
    },
    [begin],
  );

  const startPlace = useCallback((tileId: string, e: ReactPointerEvent) => {
    const def = TILE_BY_ID[tileId];
    if (!def || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const { cols } = layoutRef.current;
    setInteraction({
      kind: 'place',
      tileId,
      w: scaleUnits(def.defaultW, cols),
      h: def.defaultH,
      candidate: null,
      valid: false,
      pointer: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const cancel = useCallback(() => setInteraction(IDLE), []);

  useEffect(() => {
    if (interaction.kind === 'idle') return;

    const applyPointer = (e: PointerEvent): Interaction => {
      const st = interactionRef.current;
      const layout = layoutRef.current;
      const { cols, items } = layout;
      const cw = cellWRef.current;
      const p = toCanvas(e);
      if (!p) return st;

      let next: Interaction = st;
      if (st.kind === 'place') {
        const overCanvas = p.x >= -24 && p.x <= canvasWidthRef.current + 24 && p.y >= -24;
        if (!overCanvas) {
          next = { ...st, candidate: null, valid: false, pointer: { x: e.clientX, y: e.clientY } };
        } else {
          const x = clamp(Math.round(p.x / (cw + GAP) - st.w / 2), 0, Math.max(0, cols - st.w));
          const y = Math.max(0, Math.round(p.y / (ROW_HEIGHT + GAP) - st.h / 2));
          const need = y + st.h;
          if (need > layout.rows) onChangeRef.current(ensureRows(layout, need));
          const candidate: GridPos = { id: st.tileId, x, y, w: st.w, h: st.h };
          const rows = Math.max(layout.rows, need);
          next = { ...st, candidate, valid: inBounds(candidate, cols, rows) && !collides(candidate, items), pointer: { x: e.clientX, y: e.clientY } };
        }
      } else {
        const s = startPx.current;
        if (!s) return st;
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        const dc = pxToCols(dx, cw);
        const dr = pxToRows(dy);

        if (st.kind === 'move') {
          const o = st.origin;
          const x = clamp(o.x + dc, 0, cols - o.w);
          const y = Math.max(0, o.y + dr);
          const candidate: GridPos = { ...o, x, y };
          const need = candidate.y + candidate.h;
          if (need > layout.rows) onChangeRef.current(ensureRows(layout, need));
          next = { ...st, offset: { x: dx, y: dy }, candidate, valid: !collides(candidate, items, st.id) };
        } else if (st.kind === 'resize') {
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
          if (st.handle.includes('s')) h = Math.max(minH, o.h + dr);
          if (st.handle.includes('n')) {
            const ny = clamp(o.y + dr, 0, o.y + o.h - minH);
            h = o.y + o.h - ny;
            y = ny;
          }
          const candidate: GridPos = { id: st.id, x, y, w, h };
          const preview = pixelResize(o, st.handle, dx, dy, minW, minH, cw, cols);
          const need = Math.max(candidate.y + candidate.h, rowsNeededForPx(preview.top, preview.height));
          if (need > layout.rows) onChangeRef.current(ensureRows(layout, need));
          const rows = Math.max(layout.rows, need);
          next = { ...st, candidate, preview, valid: inBounds(candidate, cols, rows) && !collides(candidate, items, st.id) };
        }
      }

      interactionRef.current = next;
      setInteraction(next);
      return next;
    };

    const onUp = (e: PointerEvent) => {
      const st = applyPointer(e);
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

    window.addEventListener('pointermove', applyPointer);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', applyPointer);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [interaction.kind, toCanvas]);

  return { canvasRef, canvasWidth, cellW, interaction, startMove, startResize, startPlace, cancel };
}
