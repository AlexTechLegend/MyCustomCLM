import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Timer } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, Chips, CommandTrail, EmptyState, ErrorBox, Loading, PageHeader, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { CHART } from '@/lib/chartColors';
import { EVENT_META, formatDateTime, hours, humanMinutes } from '@/lib/format';

const TYPES = ['all', 'renewal', 'conversion', 'deployment', 'import', 'csr', 'ca'] as const;

export function Activity() {
  const [type, setType] = useState<(typeof TYPES)[number]>('all');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['activity', type], queryFn: () => api.activity(type === 'all' ? undefined : type) });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { events, summary } = q.data;

  return (
    <>
      <PageHeader title="Activity" description="Every automated action, what it replaced, and the OpenSSL commands behind it." />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Time reclaimed" tone="brand" icon={<Timer className="size-4" />} value={<>{hours(summary.totalMinutes)}<span className="text-[16px] font-medium text-ink-500 ml-1">h</span></>} hint={`${summary.totalEvents} automated actions`} />
        <StatCard label="This month" value={humanMinutes(summary.thisMonthMinutes)} hint={`${summary.thisMonthEvents} actions`} />
        <StatCard label="Average per action" value={humanMinutes(summary.totalEvents ? summary.totalMinutes / summary.totalEvents : 0)} hint="Weighted by your baselines" />
        <StatCard label="Busiest category" value={summary.byType[0] ? EVENT_META[summary.byType[0].type]?.label ?? summary.byType[0].type : '—'} hint={summary.byType[0] ? humanMinutes(summary.byType[0].minutes) : ''} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Twelve-month trend" description="Hours reclaimed per month." />
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.monthly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="30%">
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: CHART.tickMuted, fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 60)}h`} />
              <Tooltip cursor={{ fill: CHART.cursor }} content={({ active, payload }) => (active && payload?.length ? <div className="card px-3 py-2 text-[12px] shadow-lg"><div className="font-medium text-ink-900">{payload[0].payload.month}</div><div className="text-ink-600">{humanMinutes(payload[0].payload.minutes)} · {payload[0].payload.count} actions</div></div> : null)} />
              <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                {summary.monthly.map((m, i) => (
                  <Cell key={m.month} fill={i === summary.monthly.length - 1 ? CHART.brand : CHART.brandMuted} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mb-4">
        <Chips value={type} onChange={setType} options={TYPES.map((t) => ({ id: t, label: t === 'all' ? 'All' : EVENT_META[t]?.label ?? t }))} />
      </div>

      <Card padded={false}>
        {events.length === 0 ? (
          <EmptyState title="No activity yet" description="Import or renew a certificate and it will show up here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {events.map((e) => (
              <li key={e.id}>
                <button type="button" className="w-full text-left px-6 py-3.5 flex items-center gap-4 hover:bg-ink-50/70 transition-colors" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide w-[84px] text-center shrink-0 ${EVENT_META[e.type]?.className ?? 'bg-ink-100'}`}>{EVENT_META[e.type]?.label ?? e.type}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-950 truncate">{e.title}</div>
                    <div className="text-[12px] text-ink-500 truncate">{e.detail}</div>
                  </div>
                  {e.renewalId && e.certificateId ? (
                    <Link
                      to={`/certificates/${e.certificateId}/renew?renewal=${e.renewalId}`}
                      onClick={(ev) => ev.stopPropagation()}
                      className="text-[12px] text-brand-700 hover:underline hidden md:block truncate max-w-[200px]"
                    >
                      Open receipt
                    </Link>
                  ) : e.certificateId ? (
                    <Link to={`/certificates/${e.certificateId}`} onClick={(ev) => ev.stopPropagation()} className="text-[12px] text-brand-700 hover:underline hidden md:block truncate max-w-[180px]">
                      {e.certificateName}
                    </Link>
                  ) : null}
                  <div className="text-right shrink-0 w-32">
                    <div className="text-sm font-medium text-ink-900 tnum">+{humanMinutes(e.minutesSaved)}</div>
                    <div className="text-[11px] text-ink-500 tnum">{formatDateTime(e.createdAt)}</div>
                  </div>
                  <ChevronDown className={`size-4 text-ink-400 transition-transform ${open === e.id ? 'rotate-180' : ''}`} />
                </button>
                {open === e.id && (
                  <div className="px-6 pb-5 pt-1">
                    <CommandTrail commands={e.commands} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
