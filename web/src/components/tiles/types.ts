import type { ReactNode } from 'react';
import type { DashboardData, TimeSavedSummary } from '@/lib/api';
import type { TileSize } from '@/lib/dashboardStore';
import type { AutomationEvent, Certificate, Profile, Renewal } from '@/types';

export type TileContext = {
  dashboard: DashboardData;
  certificates: Certificate[];
  profiles: Profile[];
  renewals: Renewal[];
  events: AutomationEvent[];
  activitySummary?: TimeSavedSummary;
};

export type TileDef = {
  id: string;
  title: string;
  description: string;
  defaultSize: TileSize;
  render: (ctx: TileContext) => ReactNode;
};
