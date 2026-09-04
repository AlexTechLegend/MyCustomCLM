import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui';
import { CHART, STATUS_FILLS } from '@/lib/chartColors';
import { EVENT_META, hours, humanMinutes } from '@/lib/format';
import type { TileContext } from './types';

/**
 * The two dashboard tiles that render a Recharts chart, split out of core.tsx
 * so they can be loaded lazily (see registry.tsx) — Recharts is ~110kB gzip
 * and the dashboard is the app's eager, first-load route.
 */

const STATUSES = ['healthy', 'expiring', 'critical', 'expired'] as const;

export function FleetHealthTile({ dashboard }: TileContext) {
  const { counts } = dashboard;
  const donut = STATUSES.map((k) => ({ name: k, value: counts[k] })).filter((d) => d.value > 0);
  return (
    <Card>
      <CardHeader title="Fleet health" description={`${counts.total} certificates by status`} />
      <div className="flex items-center gap-5">
        <div className="size-[132px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} dataKey="value" innerRadius={44} outerRadius={62} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
                {donut.map((d) => (
                  <Cell key={d.name} fill={STATUS_FILLS[d.name]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2 text-[13px] flex-1">
          {STATUSES.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: STATUS_FILLS[k] }} />
              <span className="capitalize text-ink-600 flex-1">{k}</span>
              <span className="tnum font-medium text-ink-900">{counts[k]}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function TimeReclaimedTile({ dashboard }: TileContext) {
  const { timeSaved } = dashboard;
  return (
    <Card>
      <CardHeader
        title="Time reclaimed by automation"
        description="Minutes a human did not have to spend converting, renewing and copying files, by month."
        action={
          <div className="text-right">
            <div className="text-[22px] font-semibold text-brand-700 tnum leading-none">{hours(timeSaved.totalMinutes)} h</div>
            <div className="text-[12px] text-ink-500 mt-1">lifetime</div>
          </div>
        }
      />
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={timeSaved.monthly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="28%">
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: CHART.tickMuted, fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 60)}h`} />
            <Tooltip
              cursor={{ fill: CHART.cursor }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="card px-3 py-2 text-[12px] shadow-lg">
                    <div className="font-medium text-ink-900">{payload[0].payload.month}</div>
                    <div className="text-ink-600">{humanMinutes(payload[0].payload.minutes)} · {payload[0].payload.count} actions</div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
              {timeSaved.monthly.map((m, i) => (
                <Cell key={m.month} fill={i === timeSaved.monthly.length - 1 ? CHART.brand : CHART.brandMuted} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {timeSaved.byType.slice(0, 4).map((t) => (
          <div key={t.type} className="rounded-xl bg-ink-50 px-3.5 py-3">
            <div className="text-[12px] text-ink-500 capitalize">{EVENT_META[t.type]?.label ?? t.type}</div>
            <div className="text-[15px] font-semibold text-ink-900 tnum mt-0.5">{humanMinutes(t.minutes)}</div>
            <div className="text-[11px] text-ink-400 tnum">{t.count} actions</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
