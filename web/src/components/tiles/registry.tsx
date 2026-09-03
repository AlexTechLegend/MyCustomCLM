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
  FleetHealthTile,
  IssuersTile,
  OverviewStatsTile,
  RecentActivityTile,
  TimeReclaimedTile,
} from './core';
import type { ReactNode } from 'react';
import type { TileContext, TileDef } from './types';

function wrap(id: string, title: string, description: string, defaultSize: TileDef['defaultSize'], Cmp: (ctx: TileContext) => ReactNode): TileDef {
  return { id, title, description, defaultSize, render: (ctx) => <Cmp {...ctx} /> };
}

export const TILE_REGISTRY: TileDef[] = [
  wrap('overview-stats', 'Fleet overview', 'Five headline counts for the estate.', 12, OverviewStatsTile),
  wrap('expiring-soon', 'Expiring soon', 'Certificates leaving the safe window in the next 60 days.', 8, ExpiringSoonTile),
  wrap('fleet-health', 'Fleet health', 'Status donut for the whole fleet.', 4, FleetHealthTile),
  wrap('expiry-horizon', 'Expiry horizon', 'Bucketed count of upcoming expiries.', 4, ExpiryHorizonTile),
  wrap('time-reclaimed', 'Time reclaimed', 'Monthly minutes saved by automation.', 8, TimeReclaimedTile),
  wrap('issuers', 'Issuers', 'Who signs the estate.', 4, IssuersTile),
  wrap('recent-activity', 'Recent activity', 'Latest automated actions.', 4, RecentActivityTile),
  wrap('without-key', 'Without a private key', 'Certificates that cannot produce key-bearing outputs.', 4, WithoutKeyTile),
  wrap('without-profile', 'No profile linked', 'Certificates that will not render files on renew.', 4, WithoutProfileTile),
  wrap('issuer-concentration', 'Issuer concentration', 'Share sitting with the top signer.', 4, IssuerConcentrationTile),
  wrap('mean-days', 'Mean days to expiry', 'Average remaining life of unexpired certificates.', 3, MeanDaysTile),
  wrap('expiring-by-tag', 'Expiring by tag', 'Attention load grouped by your labels.', 4, ExpiringByTagTile),
  wrap('renewals-30d', 'Renewals · 30 days', 'How many renewals started this month.', 3, Renewals30dTile),
  wrap('conversion-volume', 'Conversion volume', 'Automated format conversions.', 4, ConversionVolumeTile),
  wrap('time-quarter', 'Time reclaimed this quarter', 'Hours saved since the quarter opened.', 4, TimeQuarterTile),
  wrap('oldest-cert', 'Oldest certificate', 'Earliest not-before in the vault.', 3, OldestCertTile),
  wrap('largest-san', 'Largest SAN count', 'The hungriest name list.', 3, LargestSanTile),
  wrap('calendar-mini', 'Expiry calendar', 'This month, one cell per day.', 4, CalendarMiniTile),
  wrap('automation-coverage', 'Automation coverage', 'How much of the fleet renews without a human.', 12, AutomationCoverageTile),
];

export const TILE_BY_ID = Object.fromEntries(TILE_REGISTRY.map((t) => [t.id, t]));
