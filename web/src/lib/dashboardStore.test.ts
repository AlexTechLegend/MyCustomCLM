import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, loadLayout, migrateV1, normalizeLayout, persistLayout } from './dashboardStore';
import type { DashboardLayout } from './dashboardStore';

beforeEach(() => {
  localStorage.clear();
});

describe('migrateV1 — packing a pre-grid flow layout', () => {
  it('drops unknown tile ids and packs the rest by their registered default size', () => {
    const layout = migrateV1([
      { id: 'overview-stats', size: 12 }, // defaultW 12, defaultH 3
      { id: 'fleet-health', size: 4 }, // defaultW 4, defaultH 4
      { id: 'issuers', size: 4 }, // defaultW 4, defaultH 4
      { id: 'this-tile-no-longer-exists', size: 6 },
    ]);

    expect(layout.version).toBe(2);
    expect(layout.cols).toBe(12);
    expect(layout.items.map((i) => i.id)).toEqual(['overview-stats', 'fleet-health', 'issuers']);

    // overview-stats (w12) fills the row alone, so fleet-health wraps to row 2.
    expect(layout.items[0]).toMatchObject({ x: 0, y: 0, w: 12, h: 3 });
    expect(layout.items[1]).toMatchObject({ x: 0, y: 3, w: 4, h: 4 });
    // issuers (w4) fits beside fleet-health on the same shelf.
    expect(layout.items[2]).toMatchObject({ x: 4, y: 3, w: 4, h: 4 });
  });

  it('floors the row count at 12 even for a very short layout', () => {
    const layout = migrateV1([{ id: 'issuers', size: 4 }]);
    expect(layout.rows).toBe(12);
  });

  it('returns an empty grid when every stored id is unrecognised', () => {
    const layout = migrateV1([{ id: 'gone', size: 4 }]);
    expect(layout.items).toEqual([]);
  });
});

describe('normalizeLayout', () => {
  const base = { version: 2 as const, cols: 12 as const, rows: 12 };

  it('clamps a width/x pair that would run past the canvas edge', () => {
    const out = normalizeLayout({ ...base, items: [{ id: 'overview-stats', x: 5, y: 0, w: 14, h: 3 }] });
    expect(out.items[0]).toMatchObject({ w: 12, x: 0 });
  });

  it('drops tiles whose id is no longer registered', () => {
    const out = normalizeLayout({ ...base, items: [{ id: 'not-a-real-tile', x: 0, y: 0, w: 4, h: 4 }] });
    expect(out.items).toEqual([]);
  });

  it('resolves two tiles placed at the same cell — the later one wins, first slot kept', () => {
    const out = normalizeLayout({
      ...base,
      items: [
        { id: 'fleet-health', x: 0, y: 0, w: 4, h: 4 },
        { id: 'issuers', x: 0, y: 0, w: 4, h: 4 }, // same cell as fleet-health above
      ],
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe('issuers');
  });

  it('resolves a duplicated id, keeping the later occurrence\'s position', () => {
    const out = normalizeLayout({
      ...base,
      items: [
        { id: 'fleet-health', x: 0, y: 0, w: 4, h: 4 },
        { id: 'fleet-health', x: 4, y: 4, w: 4, h: 4 },
      ],
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ x: 4, y: 4 });
  });

  it('grows rows to fit the lowest tile, never shrinks below the stored value', () => {
    const tall = normalizeLayout({ ...base, rows: 12, items: [{ id: 'fleet-health', x: 0, y: 20, w: 4, h: 4 }] });
    expect(tall.rows).toBeGreaterThanOrEqual(24);

    const short = normalizeLayout({ ...base, rows: 36, items: [{ id: 'fleet-health', x: 0, y: 0, w: 4, h: 4 }] });
    expect(short.rows).toBe(36);
  });
});

describe('loadLayout / persistLayout', () => {
  it('falls back to the default layout when nothing is stored', () => {
    const layout = loadLayout();
    expect(layout).toEqual(DEFAULT_LAYOUT);
    expect(layout).not.toBe(DEFAULT_LAYOUT); // cloned, not the shared constant
  });

  it('falls back to the default layout when storage holds unparseable JSON', () => {
    localStorage.setItem('vigil:dashboard-layout', '{not json');
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it('migrates a v1 array on read and writes the v2 form back so it only happens once', () => {
    localStorage.setItem('vigil:dashboard-layout', JSON.stringify([{ id: 'issuers', size: 4 }]));
    const migrated = loadLayout();
    expect(migrated.version).toBe(2);
    expect(migrated.items[0]).toMatchObject({ id: 'issuers' });

    const stored = JSON.parse(localStorage.getItem('vigil:dashboard-layout')!);
    expect(stored.version).toBe(2); // persisted back as v2, not left as the raw array
  });

  it('round-trips a v2 layout through persistLayout unchanged', () => {
    const layout: DashboardLayout = { version: 2, cols: 24, rows: 24, items: [{ id: 'fleet-health', x: 0, y: 0, w: 8, h: 4 }] };
    persistLayout(layout);
    expect(loadLayout()).toEqual(layout);
  });
});
