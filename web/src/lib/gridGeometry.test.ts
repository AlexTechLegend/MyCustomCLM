import { describe, expect, it } from 'vitest';
import {
  canvasHeight,
  cellWidth,
  clampRows,
  collides,
  evictedBy,
  firstFreeSlot,
  inBounds,
  isValidPlacement,
  overlaps,
  packFlow,
  pxToCols,
  pxToRows,
  rectFor,
  roundRows,
  scaleLayout,
  scaleUnits,
  slotOrGrow,
  sortReading,
} from './gridGeometry';
import type { DashboardLayout, GridPos } from './dashboardStore';

describe('overlaps / collides', () => {
  it('detects a shared rectangle', () => {
    expect(overlaps({ x: 0, y: 0, w: 4, h: 2 }, { x: 3, y: 1, w: 2, h: 2 })).toBe(true);
  });

  it('does not flag rectangles that only touch at an edge', () => {
    expect(overlaps({ x: 0, y: 0, w: 4, h: 2 }, { x: 4, y: 0, w: 4, h: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 4, h: 2 })).toBe(false);
  });

  it('collides() ignores the item being moved via skipId', () => {
    const items: GridPos[] = [{ id: 'a', x: 0, y: 0, w: 4, h: 2 }];
    expect(collides({ x: 0, y: 0, w: 4, h: 2 }, items)).toBe(true);
    expect(collides({ x: 0, y: 0, w: 4, h: 2 }, items, 'a')).toBe(false);
  });
});

describe('inBounds / isValidPlacement', () => {
  it('rejects a rectangle that runs past the canvas edge', () => {
    expect(inBounds({ x: 10, y: 0, w: 4, h: 2 }, 12, 24)).toBe(false);
    expect(inBounds({ x: 8, y: 0, w: 4, h: 2 }, 12, 24)).toBe(true);
  });

  it('rejects a zero or negative size', () => {
    expect(inBounds({ x: 0, y: 0, w: 0, h: 2 }, 12, 24)).toBe(false);
  });

  it('isValidPlacement combines bounds and collision checks', () => {
    const items: GridPos[] = [{ id: 'a', x: 0, y: 0, w: 4, h: 4 }];
    expect(isValidPlacement({ x: 2, y: 2, w: 4, h: 4 }, items, 12, 24)).toBe(false); // overlaps
    expect(isValidPlacement({ x: 4, y: 0, w: 4, h: 4 }, items, 12, 24)).toBe(true); // clear
    expect(isValidPlacement({ x: 9, y: 0, w: 4, h: 4 }, items, 12, 24)).toBe(false); // out of bounds
  });
});

describe('pixel <-> cell conversion', () => {
  it('cellWidth divides the canvas evenly minus gaps', () => {
    // 12 columns, 11 internal gaps of 8px, over a 1000px canvas
    expect(cellWidth(1000, 12)).toBeCloseTo((1000 - 8 * 11) / 12);
  });

  it('rectFor and pxToCols/pxToRows round-trip a grid position', () => {
    const cellW = cellWidth(1200, 12);
    const rect = rectFor({ x: 2, y: 3, w: 4, h: 2 }, cellW);
    expect(pxToCols(rect.left, cellW)).toBe(2);
    expect(pxToRows(rect.top)).toBe(3);
  });

  it('canvasHeight accounts for inter-row gaps', () => {
    expect(canvasHeight(12)).toBe(12 * 64 + 11 * 8);
  });
});

describe('scaleUnits', () => {
  it('is the identity at 12 columns', () => {
    expect(scaleUnits(4, 12)).toBe(4);
  });

  it('scales a 12-unit size proportionally to 24 and 36 columns', () => {
    expect(scaleUnits(4, 24)).toBe(8);
    expect(scaleUnits(4, 36)).toBe(12);
  });

  it('never rounds a nonzero size down to zero', () => {
    expect(scaleUnits(1, 12)).toBeGreaterThanOrEqual(1);
  });
});

describe('roundRows / clampRows', () => {
  it('rounds up to the next multiple of 12, floored at 12', () => {
    expect(roundRows(1)).toBe(12);
    expect(roundRows(12)).toBe(12);
    expect(roundRows(13)).toBe(24);
    expect(roundRows(25)).toBe(36);
  });

  it('clampRows floors at 12 and tolerates garbage input', () => {
    expect(clampRows(5)).toBe(12);
    expect(clampRows(30)).toBe(30);
    expect(clampRows(Number.NaN)).toBe(12);
  });
});

describe('sortReading / evictedBy', () => {
  it('sorts top-to-bottom, then left-to-right', () => {
    const items: GridPos[] = [
      { id: 'c', x: 4, y: 0, w: 2, h: 2 },
      { id: 'a', x: 0, y: 0, w: 2, h: 2 },
      { id: 'b', x: 0, y: 2, w: 2, h: 2 },
    ];
    expect(sortReading(items).map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('evictedBy finds tiles that fall outside a shrunk canvas', () => {
    const items: GridPos[] = [
      { id: 'fits', x: 0, y: 0, w: 4, h: 4 },
      { id: 'over', x: 0, y: 20, w: 4, h: 4 },
    ];
    expect(evictedBy(items, 12).map((i) => i.id)).toEqual(['over']);
    expect(evictedBy(items, 24)).toEqual([]);
  });
});

describe('firstFreeSlot / slotOrGrow', () => {
  it('finds the first open cell scanning row by row', () => {
    const items: GridPos[] = [{ id: 'a', x: 0, y: 0, w: 12, h: 1 }];
    expect(firstFreeSlot(items, 4, 1, 12, 12)).toEqual({ x: 0, y: 1 });
  });

  it('returns null when the tile cannot fit the canvas at all', () => {
    expect(firstFreeSlot([], 13, 1, 12, 12)).toBeNull();
  });

  it('slotOrGrow extends the canvas until the tile fits', () => {
    // A canvas fully occupied through row 12 forces growth to place a 1-row tile.
    const items: GridPos[] = [{ id: 'full', x: 0, y: 0, w: 12, h: 12 }];
    const slot = slotOrGrow(items, 4, 1, 12, 12);
    expect(slot.rows).toBeGreaterThan(12);
    expect(slot.y).toBeGreaterThanOrEqual(12);
  });
});

describe('packFlow — v1 flow layout to v2 grid', () => {
  it('places items left to right and wraps when a row is full', () => {
    const { items, rows } = packFlow(
      [
        { id: 'a', w: 8 },
        { id: 'b', w: 4 },
        { id: 'c', w: 6 },
      ],
      () => 4,
    );
    expect(items).toEqual([
      { id: 'a', x: 0, y: 0, w: 8, h: 4 },
      { id: 'b', x: 8, y: 0, w: 4, h: 4 },
      { id: 'c', x: 0, y: 4, w: 6, h: 4 }, // did not fit next to b (8+4+6 > 12), wraps
    ]);
    expect(rows).toBe(12); // rounded up to the 12-row floor
  });

  it('wraps below the tallest tile on the shelf, not just the last one', () => {
    const { items } = packFlow(
      [
        { id: 'tall', w: 6 },
        { id: 'short', w: 6 },
        { id: 'next', w: 6 },
      ],
      (id) => (id === 'tall' ? 6 : 2),
    );
    // tall(h6) + short(h2) fill the row; "next" must start below the taller one, not the shorter.
    expect(items[2]).toMatchObject({ id: 'next', x: 0, y: 6 });
  });
});

describe('scaleLayout — proportional column-count switch', () => {
  const base: DashboardLayout = {
    version: 2,
    cols: 12,
    rows: 12,
    items: [{ id: 'a', x: 0, y: 0, w: 6, h: 4 }],
  };

  it('is a no-op when the target column count matches', () => {
    expect(scaleLayout(base, 12, () => 1)).toBe(base);
  });

  it('doubles width and x when going from 12 to 24 columns', () => {
    const scaled = scaleLayout(base, 24, () => 1);
    expect(scaled.cols).toBe(24);
    expect(scaled.items[0]).toMatchObject({ x: 0, w: 12 });
  });

  it('halves width and x, clamped to the minimum, when narrowing 24 -> 12', () => {
    const wide: DashboardLayout = { version: 2, cols: 24, rows: 12, items: [{ id: 'a', x: 8, y: 0, w: 12, h: 4 }] };
    const scaled = scaleLayout(wide, 12, () => 1);
    expect(scaled.items[0].w).toBe(6);
    expect(scaled.items[0].x).toBe(4);
  });

  it('relocates a tile that would overlap after scaling rather than dropping it', () => {
    const layout: DashboardLayout = {
      version: 2,
      cols: 12,
      rows: 12,
      items: [
        { id: 'a', x: 0, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ],
    };
    // Force both tiles' minimum width so wide that narrowing collides them.
    const scaled = scaleLayout(layout, 24, (id) => (id === 'b' ? 12 : 1));
    // Every tile must still be present, in bounds, and non-overlapping.
    expect(scaled.items).toHaveLength(2);
    expect(overlaps(scaled.items[0], scaled.items[1])).toBe(false);
    for (const item of scaled.items) expect(inBounds(item, scaled.cols, scaled.rows)).toBe(true);
  });
});
