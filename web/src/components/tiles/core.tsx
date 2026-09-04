import { AlertTriangle, ArrowRight, Clock3, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader, EmptyState, LifetimeBar, LinkButton, StatusBadge } from '@/components/ui';
import { EVENT_META, formatDate, hours, humanMinutes, relativeDays, timeAgo } from '@/lib/format';
import type { TileContext } from './types';

// FleetHealthTile and TimeReclaimedTile (the two Recharts-based tiles) live in
// coreCharts.tsx, loaded lazily via registry.tsx so Recharts never ships on
// the initial bundle.

export function OverviewStatsTile({ dashboard }: TileContext) {
  const { counts, timeSaved, settings } = dashboard;
  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
      <Link to="/certificates" className="card p-5 block hover:border-ink-300 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-500">Certificates</span>
          <ShieldCheck className="size-4 text-ink-400" />
        </div>
        <div className="mt-3 text-[32px] leading-none font-semibold tracking-tight tnum text-ink-950">{counts.total}</div>
        <div className="mt-2.5 text-[13px] text-ink-500">{counts.healthy} healthy · {counts.withoutKey} without key</div>
      </Link>
      <Link to="/certificates?status=expiring" className="card p-5 block hover:border-ink-300 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-500">Expiring ≤ {settings.expiringThresholdDays} d</span>
          <Clock3 className="size-4 text-ink-400" />
        </div>
        <div className={`mt-3 text-[32px] leading-none font-semibold tracking-tight tnum ${counts.expiring ? 'text-warn-600' : 'text-ink-950'}`}>{counts.expiring}</div>
        <div className="mt-2.5 text-[13px] text-ink-500">Plan renewals now</div>
      </Link>
      <Link to="/certificates?status=critical" className="card p-5 block hover:border-ink-300 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-500">Critical ≤ {settings.criticalThresholdDays} d</span>
          <AlertTriangle className="size-4 text-ink-400" />
        </div>
        <div className={`mt-3 text-[32px] leading-none font-semibold tracking-tight tnum ${counts.critical ? 'text-crit-600' : 'text-ink-950'}`}>{counts.critical}</div>
        <div className="mt-2.5 text-[13px] text-ink-500">Renew immediately</div>
      </Link>
      <Link to="/certificates?status=expired" className="card p-5 block hover:border-ink-300 transition-colors">
        <div className="text-[13px] font-medium text-ink-500">Expired</div>
        <div className={`mt-3 text-[32px] leading-none font-semibold tracking-tight tnum ${counts.expired ? 'text-dead-600' : 'text-ink-950'}`}>{counts.expired}</div>
        <div className="mt-2.5 text-[13px] text-ink-500">Services may be failing</div>
      </Link>
      <Link to="/activity" className="card p-5 block hover:border-ink-300 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-500">Time reclaimed</span>
          <Timer className="size-4 text-ink-400" />
        </div>
        <div className="mt-3 text-[32px] leading-none font-semibold tracking-tight tnum text-brand-700">
          {hours(timeSaved.totalMinutes)}
          <span className="text-[16px] font-medium text-ink-500 ml-1">h</span>
        </div>
        <div className="mt-2.5 text-[13px] text-ink-500">{humanMinutes(timeSaved.thisMonthMinutes)} this month · {timeSaved.totalEvents} actions</div>
      </Link>
    </div>
  );
}

export function ExpiringSoonTile({ dashboard }: TileContext) {
  const { expiringSoon } = dashboard;
  return (
    <Card padded={false}>
      <div className="p-6 pb-0">
        <CardHeader
          title="Expiring soon"
          description="Certificates leaving their safe window in the next 60 days, soonest first."
          action={
            <Link to="/certificates?sort=expiry" className="text-[13px] font-medium text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
              All certificates <ArrowRight className="size-3.5" />
            </Link>
          }
        />
      </div>
      {expiringSoon.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title="Nothing expires in the next 60 days" description="Renewals are all on schedule." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {expiringSoon.map((c) => (
            <li key={c.id} className="px-6 py-2.5 flex items-center gap-5 hover:bg-ink-50/60 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <Link to={`/certificates/${c.id}`} className="text-sm font-medium text-ink-950 hover:text-brand-700 truncate">
                    {c.name}
                  </Link>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-[12px] text-ink-500 mt-0.5 truncate">
                  {c.issuerCommonName} · {c.keyAlgo} {c.keyBits ?? ''} · {c.sans.length} SAN{c.sans.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="w-36 hidden md:block">
                <LifetimeBar used={c.lifetimeUsed} status={c.status} />
                <div className="text-[11px] text-ink-500 mt-1 tnum">{Math.round(c.lifetimeUsed * 100)}% of lifetime used</div>
              </div>
              <div className="text-right w-28">
                <div className="text-sm text-ink-900 tnum">{formatDate(c.notAfter)}</div>
                <div className={`text-[12px] tnum ${c.daysRemaining <= 7 ? 'text-crit-600' : 'text-ink-500'}`}>{relativeDays(c.daysRemaining)}</div>
              </div>
              <LinkButton to={`/certificates/${c.id}/renew`} size="sm" variant={c.daysRemaining <= 7 ? 'primary' : 'secondary'} icon={<RefreshCw className="size-3.5" />}>
                Renew
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ExpiryHorizonTile({ dashboard }: TileContext) {
  const { horizon } = dashboard;
  const max = Math.max(1, ...horizon.map((x) => x.count));
  return (
    <Card>
      <CardHeader title="Expiry horizon" />
      <ul className="space-y-2.5">
        {horizon.map((h) => (
          <li key={h.label} className="flex items-center gap-3 text-[13px]">
            <span className="w-14 text-ink-500 tnum">{h.label}</span>
            <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(h.count / max) * 100}%` }} />
            </div>
            <span className="w-6 text-right tnum font-medium text-ink-900">{h.count}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function IssuersTile({ dashboard }: TileContext) {
  return (
    <Card>
      <CardHeader title="Issuers" description="Who signs your estate" />
      <ul className="space-y-2.5">
        {dashboard.issuers.map((i) => (
          <li key={i.name} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-ink-700 truncate">{i.name}</span>
            <Badge>{i.count}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RecentActivityTile({ dashboard }: TileContext) {
  const { recentEvents } = dashboard;
  return (
    <Card>
      <CardHeader
        title="Recent activity"
        action={
          <Link to="/activity" className="text-[13px] font-medium text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
            All <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {recentEvents.length === 0 ? (
        <p className="text-[13px] text-ink-500">No automation has run yet.</p>
      ) : (
        <ul className="space-y-3">
          {recentEvents.slice(0, 6).map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${EVENT_META[e.type]?.className ?? 'bg-ink-100'}`}>{EVENT_META[e.type]?.label ?? e.type}</span>
              <div className="min-w-0 flex-1">
                {e.renewalId && e.certificateId ? (
                  <Link to={`/certificates/${e.certificateId}/renew?renewal=${e.renewalId}`} className="text-[13px] text-ink-900 hover:text-brand-700 truncate block">
                    {e.title}
                  </Link>
                ) : (
                  <div className="text-[13px] text-ink-900 truncate">{e.title}</div>
                )}
                <div className="text-[11px] text-ink-500 tnum">{timeAgo(e.createdAt)} · saved {humanMinutes(e.minutesSaved)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
