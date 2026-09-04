import { lazy, Suspense } from 'react';
import {
  AutomationCoverageTile,
  ConversionVolumeTile,
  ExpiringByTagTile,
  IssuerConcentrationTile,
  LargestSanTile,
  MeanDaysTile,
  OldestCertTile,
  Renewals30dTile,
  TimeQuarterTile,
  WithoutKeyTile,
  WithoutProfileTile,
} from './catalogue';
import { CalendarMiniTile } from './CalendarMiniTile';
import {
  ExpiringSoonTile,
  ExpiryHorizonTile,
  IssuersTile,
  OverviewStatsTile,
  RecentActivityTile,
} from './core';
import type { ReactNode } from 'react';
import type { TileContext, TileDef } from './types';

type Size = Pick<TileDef, 'defaultW' | 'defaultH' | 'minW' | 'minH' | 'preview'>;

// FleetHealthTile and TimeReclaimedTile pull in Recharts (~110kB gzip). The
// dashboard is the app's eager first-load route, so these two are loaded on
// demand instead — the grid cell already has a fixed pixel height (see
// GridTile), so the skeleton fallback below needs no explicit sizing.
const LazyFleetHealthTile = lazy(() => import('./coreCharts').then((m) => ({ default: m.FleetHealthTile })));
const LazyTimeReclaimedTile = lazy(() => import('./coreCharts').then((m) => ({ default: m.TimeReclaimedTile })));

function ChartTileFallback() {
  return <div className="card h-full animate-pulse" />;
}

function FleetHealthTile(ctx: TileContext): ReactNode {
  return (
    <Suspense fallback={<ChartTileFallback />}>
      <LazyFleetHealthTile {...ctx} />
    </Suspense>
  );
}

function TimeReclaimedTile(ctx: TileContext): ReactNode {
  return (
    <Suspense fallback={<ChartTileFallback />}>
      <LazyTimeReclaimedTile {...ctx} />
    </Suspense>
  );
}

/** [defaultW, defaultH, minW, minH, preview] — widths in 12-column units, heights in rows. */
function size(defaultW: number, defaultH: number, minW: number, minH: number, preview: TileDef['preview']): Size {
  return { defaultW, defaultH, minW, minH, preview };
}

function wrap(id: string, title: string, description: string, s: Size, Cmp: (ctx: TileContext) => ReactNode): TileDef {
  return { id, title, description, ...s, render: (ctx) => <Cmp {...ctx} /> };
}

export const TILE_REGISTRY: TileDef[] = [
  wrap('overview-stats', 'Fleet overview', 'Five headline counts for the estate.', size(12, 3, 8, 2, '4x4'), OverviewStatsTile),
  wrap('expiring-soon', 'Expiring soon', 'Certificates leaving the safe window in the next 60 days.', size(8, 6, 6, 4, '4x4'), ExpiringSoonTile),
  wrap('fleet-health', 'Fleet health', 'Status donut for the whole fleet.', size(4, 4, 4, 4, '4x4'), FleetHealthTile),
  wrap('expiry-horizon', 'Expiry horizon', 'Bucketed count of upcoming expiries.', size(4, 4, 3, 3, '4x4'), ExpiryHorizonTile),
  wrap('time-reclaimed', 'Time reclaimed', 'Monthly minutes saved by automation.', size(8, 7, 6, 5, '4x4'), TimeReclaimedTile),
  wrap('issuers', 'Issuers', 'Who signs the estate.', size(4, 4, 3, 3, '2x2'), IssuersTile),
  wrap('recent-activity', 'Recent activity', 'Latest automated actions.', size(4, 5, 4, 3, '4x4'), RecentActivityTile),
  wrap('without-key', 'Without a private key', 'Certificates that cannot produce key-bearing outputs.', size(4, 3, 3, 2, '2x2'), WithoutKeyTile),
  wrap('without-profile', 'No profile linked', 'Certificates that will not render files on renew.', size(4, 3, 3, 2, '2x2'), WithoutProfileTile),
  wrap('issuer-concentration', 'Issuer concentration', 'Share sitting with the top signer.', size(4, 4, 3, 3, '2x2'), IssuerConcentrationTile),
  wrap('mean-days', 'Mean days to expiry', 'Average remaining life of unexpired certificates.', size(3, 3, 3, 2, '2x2'), MeanDaysTile),
  wrap('expiring-by-tag', 'Expiring by tag', 'Attention load grouped by your labels.', size(4, 5, 3, 3, '4x4'), ExpiringByTagTile),
  wrap('renewals-30d', 'Renewals · 30 days', 'How many renewals started this month.', size(3, 3, 3, 2, '2x2'), Renewals30dTile),
  wrap('conversion-volume', 'Conversion volume', 'Automated format conversions.', size(4, 3, 3, 2, '2x2'), ConversionVolumeTile),
  wrap('time-quarter', 'Time reclaimed this quarter', 'Hours saved since the quarter opened.', size(4, 3, 3, 2, '2x2'), TimeQuarterTile),
  wrap('oldest-cert', 'Oldest certificate', 'Earliest not-before in the vault.', size(3, 3, 3, 2, '2x2'), OldestCertTile),
  wrap('largest-san', 'Largest SAN count', 'The hungriest name list.', size(3, 3, 3, 2, '2x2'), LargestSanTile),
  wrap('calendar-mini', 'Expiry calendar', 'This month, one cell per day.', size(4, 5, 4, 4, '4x4'), CalendarMiniTile),
  wrap('automation-coverage', 'Automation coverage', 'How much of the fleet renews without a human.', size(12, 4, 6, 2, '4x4'), AutomationCoverageTile),
];

export const TILE_BY_ID: Record<string, TileDef> = Object.fromEntries(TILE_REGISTRY.map((t) => [t.id, t]));
