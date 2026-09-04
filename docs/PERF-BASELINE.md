# Performance baseline

Recorded against `web/` production builds (`npm run build -w web`). Re-measure and update this
table whenever a later modernization phase lands — see `Tasks/009/PLAN-modernization.md`.

## Before (main @ 356709f)

| Chunk | Raw | Gzip |
|---|---|---|
| `index-*.js` (all 33 routes, eager) | 532.74 kB | 150.12 kB |
| `charts-*.js` (Recharts, eager) | 402.69 kB | 109.29 kB |
| `react-*.js` | 93.33 kB | 30.39 kB |
| `index-*.css` | 65.97 kB | 14.25 kB |
| **Eager JS on first load** | **1,028 kB** | **~290 kB** |

Zero `React.lazy` anywhere; every route and Recharts shipped in the initial bundle regardless
of the page visited.

## After (this branch)

Two changes, in order:

1. **Route-level code splitting** (`web/src/App.tsx`) — every route except the eager
   `Dashboard` index route is now `React.lazy`, each in its own `Suspense` boundary
   (`web/src/components/PageFallback.tsx`). `Layout` never unmounts across a navigation; only
   the page body suspends.
2. **Deferred Recharts** (`web/src/components/tiles/coreCharts.tsx`) — the two dashboard tiles
   that render a chart (`FleetHealthTile`, `TimeReclaimedTile`) were split out of
   `tiles/core.tsx` into their own module, loaded via `React.lazy` from `registry.tsx`. The
   grid cell that hosts a tile already has a fixed pixel height (`GridTile.tsx`), so the
   Suspense fallback is a plain `h-full` skeleton — no layout shift while the chunk loads.
   `Activity.tsx`'s own Recharts usage is covered for free by change 1, since that whole route
   is now lazy.

A third fix was required to make the above actually work: `web/vite.config.ts` had
`manualChunks: { charts: ['recharts'] }`. Manual chunking does not imply lazy loading — it only
names the output file. Because Recharts depends on `clsx` internally, forcing it into a named
chunk dragged that shared `clsx` module in with it, and any *eager* code that also imports
`clsx` (nearly every component in the app) ended up with a static `import` from the chart
chunk — verified directly in the built output (`import{c as V}from"./charts-*.js"`, where `c`
resolved to clsx's own minified source). The `charts` manual chunk entry was removed; Rollup's
automatic code-splitting draws the correct sync/async boundary on its own once Recharts is only
reached through `import()`.

| Chunk | Raw | Gzip |
|---|---|---|
| `index-*.js` (eager: Dashboard + shell) | 308.5 kB | 93.6 kB |
| `react-*.js` (eager, vendor) | 93.3 kB | 30.4 kB |
| `index-*.css` (eager) | 68 kB | 14.4 kB |
| **Eager JS+CSS on first load** | **~470 kB** | **~138 kB** |
| `BarChart-*.js` (Recharts, lazy) | 376.8 kB | 104.3 kB |
| `coreCharts-*.js` (lazy) | 29.1 kB | 8.2 kB |
| 30 other route chunks (lazy) | 0.3–33 kB each | fetched only on visit |

`index.html`'s `modulepreload` list now contains only the React vendor chunk — confirmed by
inspecting the built `dist/index.html` and grepping the entry chunk for static imports of the
chart chunk (none remain; the one residual filename match is inside Vite's dynamic-import
dependency-prefetch array, `m.f=[...]`, which only fires once the lazy chunk is actually
requested).

## Result

| Metric | Before | After |
|---|---|---|
| Eager JS+CSS (gzip) | ~290 kB | **~138 kB** (–52%) |
| Recharts on a page with no chart | 109 kB gzip, always | **0 kB** |
| Route chunks | 1 (everything) | 30, fetched on navigation |

Target from the plan was "< 120 kB gzip initial JS" — at ~124 kB JS alone (93.6 + 30.4) this is
close but not fully there; the remaining headroom is in Phase 1.5 (re-render/state-splitting
audit of the large pages) and Phase 1.3 (font subset trimming), neither of which was in scope
for this pass.

## Not yet done from the plan

Everything else in `Tasks/009/PLAN-modernization.md` is unchanged: prefetch-on-intent (2.2),
skeleton loaders beyond the route fallback (2.3), optimistic updates (2.1), table
virtualization (1.4), font subset trimming (1.3), the Inter keep/drop decision, ESLint, web
tests, the four large-page breakups, and the backend throughput work (Phase 4). This pass
covered Phase 0 (this document) and the highest-value slice of Phase 1 (1.1 + 1.2) only.
