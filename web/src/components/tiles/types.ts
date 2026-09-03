import type { ReactNode } from 'react';
import type { DashboardData, TimeSavedSummary } from '@/lib/api';
import type { AutomationEvent, Certificate, Profile, Renewal } from '@/types';

export type TileContext = {
  dashboard: DashboardData;
  certificates: Certificate[];
  profiles: Profile[];
  renewals: Renewal[];
  events: AutomationEvent[];
  activitySummary?: TimeSavedSummary;
};

export type TilePreviewSize = '2x2' | '4x4';

export type TileDef = {
  id: string;
  title: string;
  description: string;
  /** Default width in 12-column units; scaled to the active column count on placement. */
  defaultW: number;
  /** Default height in rows. */
  defaultH: number;
  /** Minimum width in 12-column units; scaled to the active column count. */
  minW: number;
  /** Minimum height in rows. */
  minH: number;
  /** Palette miniature aspect. */
  preview: TilePreviewSize;
  render: (ctx: TileContext) => ReactNode;
};
