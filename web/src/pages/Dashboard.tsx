import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock3, FolderCog, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, LifetimeBar, LinkButton, Loading, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { EVENT_META, formatDate, hours, humanMinutes, relativeDays, timeAgo } from '@/lib/format';

const STATUS_COLORS = { healthy: '#22c55e', expiring: '#f59e0b', critical: '#f43f5e', expired: '#94a3b8' };

export function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const { counts, timeSaved, expiringSoon, issuers, recentEvents, horizon } = data;
  const donut = (['healthy', 'expiring', 'critical', 'expired'] as const).map((k) => ({ name: k, value: counts[k] })).filter((d) => d.value > 0);
  const needsAttention = counts.critical + counts.expired;

  return (
    <>
      <PageHeader
        eyebrow={data.settings.organisation}
        title="Dashboard"
        description={
          needsAttention > 0
            ? `${needsAttention} certificate${needsAttention === 1 ? '' : 's'} need${needsAttention === 1 ? 's' : ''} attention. Everything else is on schedule.`
            : 'Every certificate is inside its renewal window.'
        }
        actions={
          <>
            <LinkButton to="/certificates" icon={<ShieldCheck className="size-4" />}>Browse certificates</LinkButton>
            <LinkButton to="/certificates/import" variant="primary">Import certificate</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Certificates" value={counts.total} hint={`${counts.healthy} healthy · ${counts.withoutKey} without key`} icon={<ShieldCheck className="size-4" />} to="/certificates" />
        <StatCard label={`Expiring ≤ ${data.settings.expiringThresholdDays} d`} value={counts.expiring} tone={counts.expiring ? 'warn' : 'default'} hint="Plan renewals now" icon={<Clock3 className="size-4" />} to="/certificates?status=expiring" />
        <StatCard label={`Critical ≤ ${data.settings.criticalThresholdDays} d`} value={counts.critical} tone={counts.critical ? 'crit' : 'default'} hint="Renew immediately" icon={<AlertTriangle className="size-4" />} to="/certificates?status=critical" />
        <StatCard label="Expired" value={counts.expired} tone={counts.expired ? 'dead' : 'default'} hint="Services may be failing" to="/certificates?status=expired" />
        <StatCard
          label="Time reclaimed"
          value={
            <>
              {hours(timeSaved.totalMinutes)}
              <span className="text-[16px] font-medium text-ink-500 ml-1">h</span>
            </>
          }
          tone="brand"
          hint={`${humanMinutes(timeSaved.thisMonthMinutes)} this month · ${timeSaved.totalEvents} actions`}
          icon={<Timer className="size-4" />}
          to="/activity"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <Card className="xl:col-span-2" padded={false}>
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
                <li key={c.id} className="px-6 py-3.5 flex items-center gap-5 hover:bg-ink-50/60 transition-colors">
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

        <div className="space-y-6">
          <Card>
            <CardHeader title="Fleet health" description={`${counts.total} certificates by status`} />
            <div className="flex items-center gap-5">
              <div className="size-[132px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={44} outerRadius={62} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
                      {donut.map((d) => (
                        <Cell key={d.name} fill={STATUS_COLORS[d.name]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-[13px] flex-1">
                {(['healthy', 'expiring', 'critical', 'expired'] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                    <span className="capitalize text-ink-600 flex-1">{k}</span>
                    <span className="tnum font-medium text-ink-900">{counts[k]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Expiry horizon" />
            <ul className="space-y-2.5">
              {horizon.map((h) => {
                const max = Math.max(1, ...horizon.map((x) => x.count));
                return (
                  <li key={h.label} className="flex items-center gap-3 text-[13px]">
                    <span className="w-14 text-ink-500 tnum">{h.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(h.count / max) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right tnum font-medium text-ink-900">{h.count}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <Card className="xl:col-span-2">
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
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 60)}h`} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
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
                    <Cell key={m.month} fill={i === timeSaved.monthly.length - 1 ? '#0e7c7b' : '#7fd6d4'} />
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

        <div className="space-y-6">
          <Card>
            <CardHeader title="Issuers" description="Who signs your estate" />
            <ul className="space-y-2.5">
              {issuers.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-ink-700 truncate">{i.name}</span>
                  <Badge>{i.count}</Badge>
                </li>
              ))}
            </ul>
          </Card>
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
          {counts.withoutProfile > 0 && (
            <Link to="/profiles" className="card p-4 flex items-start gap-3 hover:border-ink-300 transition-colors">
              <FolderCog className="size-4 text-brand-700 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-ink-950">{counts.withoutProfile} certificate{counts.withoutProfile === 1 ? ' has' : 's have'} no reference profile</div>
                <div className="text-[12px] text-ink-500 mt-0.5">Link a profile so renewals produce the right files in the right place.</div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
