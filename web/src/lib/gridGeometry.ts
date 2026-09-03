import type { DashboardLayout, GridCols, GridPos } from '@/lib/dashboardStore';

export const GAP = 8;
export const ROW_HEIGHT = 64;
export const ROW_STEP = 12;
export const MIN_ROWS = 12;
export const GRID_COLS: readonly GridCols[] = [12, 24, 36];

export type PxRect = { left: number; top: number; width: number; height: number };
export type CellRect = { x: number; y: number; w: number; h: number };

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function isGridCols(n: unknown): n is GridCols {
  return GRID_COLS.includes(n as GridCols);
}

export function cellWidth(canvasWidth: number, cols: number): number {
  return Math.max(0, (canvasWidth - GAP * (cols - 1)) / cols);
}

export function canvasHeight(rows: number): number {
  return rows * ROW_HEIGHT + (rows - 1) * GAP;
}

export function rectFor(pos: CellRect, cellW: number): PxRect {
  return {
    left: pos.x * (cellW + GAP),
    top: pos.y * (ROW_HEIGHT + GAP),
    width: pos.w * cellW + (pos.w - 1) * GAP,
    height: pos.h * ROW_HEIGHT + (pos.h - 1) * GAP,
  };
}

/** Pixel delta → whole cells, snapping to the nearest boundary. */
export function pxToCols(dx: number, cellW: number): number {
  return Math.round(dx / (cellW + GAP));
}

export function pxToRows(dy: number): number {
  return Math.round(dy / (ROW_HEIGHT + GAP));
}

export function overlaps(a: CellRect, b: CellRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function collides(candidate: CellRect, items: GridPos[], skipId?: string): boolean {
  return items.some((i) => i.id !== skipId && overlaps(candidate, i));
}

export function inBounds(pos: CellRect, cols: number, rows: number): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.w >= 1 && pos.h >= 1 && pos.x + pos.w <= cols && pos.y + pos.h <= rows;
}

export function isValidPlacement(pos: CellRect, items: GridPos[], cols: number, rows: number, skipId?: string): boolean {
  return inBounds(pos, cols, rows) && !collides(pos, items, skipId);
}

/** Convert a size expressed in 12-column units to the active column count. */
export function scaleUnits(units12: number, cols: GridCols): number {
  return Math.max(1, Math.ceil((units12 * cols) / 12));
}

export function roundRows(n: number): number {
  return Math.max(MIN_ROWS, Math.ceil(n / ROW_STEP) * ROW_STEP);
}

export function sortReading<T extends CellRect>(items: T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Items that would fall outside the canvas if it were shrunk to `rows`. */
export function evictedBy(items: GridPos[], rows: number): GridPos[] {
  return sortReading(items.filter((i) => i.y + i.h > rows));
}

/** First free top-left cell for a w×h rectangle, scanning rows top to bottom. */
export function firstFreeSlot(items: GridPos[], w: number, h: number, cols: number, rows: number): { x: number; y: number } | null {
  if (w > cols || h > rows) return null;
  for (let y = 0; y + h <= rows; y++) {
    for (let x = 0; x + w <= cols; x++) {
      if (!collides({ x, y, w, h }, items)) return { x, y };
    }
  }
  return null;
}

/** Like firstFreeSlot, but grows the canvas in 12-row steps until the tile fits. */
export function slotOrGrow(items: GridPos[], w: number, h: number, cols: number, rows: number): { x: number; y: number; rows: number } {
  let r = rows;
  for (let guard = 0; guard < 64; guard++) {
    const slot = firstFreeSlot(items, w, h, cols, r);
    if (slot) return { ...slot, rows: r };
    r += ROW_STEP;
  }
  return { x: 0, y: r, rows: roundRows(r + h) };
}

/**
 * Shelf-pack a v1 flow layout (widths only, in array order) into a 12-column grid.
 * Each item lands at the next free x on the current row; when it will not fit the
 * row wraps below the tallest tile placed so far.
 */
export function packFlow(items: { id: string; w: number }[], heightOf: (id: string) => number, cols = 12): { rows: number; items: GridPos[] } {
  const out: GridPos[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const it of items) {
    const w = clamp(Math.round(it.w) || 1, 1, cols);
    const h = Math.max(1, Math.round(heightOf(it.id)) || 1);
    if (x + w > cols) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    out.push({ id: it.id, x, y, w, h });
    x += w;
    shelf = Math.max(shelf, h);
  }
  return { rows: roundRows(y + shelf), items: out };
}

/**
 * Re-express a layout in a different column count, keeping every tile's visual
 * proportions. Widening is exact; narrowing rounds widths up and clamps to each
 * tile's minimum, then relocates anything that ends up overlapping.
 */
export function scaleLayout(layout: DashboardLayout, toCols: GridCols, minWOf: (id: string) => number): DashboardLayout {
  if (toCols === layout.cols) return layout;
  const f = toCols / layout.cols;
  const placed: GridPos[] = [];
  let rows = layout.rows;
  let relocated = 0;
  for (const it of sortReading(layout.items)) {
    const minW = scaleUnits(minWOf(it.id), toCols);
    const w = clamp(Math.max(minW, Math.ceil(it.w * f)), 1, toCols);
    const x = clamp(Math.floor(it.x * f), 0, toCols - w);
    let cand: GridPos = { ...it, x, w };
    if (collides(cand, placed)) {
      const slot = slotOrGrow(placed, w, it.h, toCols, rows);
      rows = slot.rows;
      cand = { ...cand, x: slot.x, y: slot.y };
      relocated++;
    }
    placed.push(cand);
  }
  if (relocated) console.info(`[dashboard] ${relocated} tile${relocated === 1 ? '' : 's'} moved to avoid overlap after switching to ${toCols} columns`);
  return { ...layout, cols: toCols, rows: roundRows(rows), items: placed };
}
