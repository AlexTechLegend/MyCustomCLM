import { KeyRound, Link2, ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatTile } from '@/components/StatTile';
import { Badge, Card, CardHeader } from '@/components/ui';
import { coverageCounts } from '@/lib/coverage';
import { formatDate, humanMinutes } from '@/lib/format';
import { certsByMonth, deltaFromSeries } from './helpers';
import type { TileContext } from './types';

export function WithoutKeyTile({ dashboard, certificates }: TileContext) {
  const series = certsByMonth(certificates.filter((c) => !c.hasKey), 'createdAt');
  return (
    <StatTile
      label="Without a private key"
      value={dashboard.counts.withoutKey}
      tone={dashboard.counts.withoutKey ? 'warn' : 'ok'}
      icon={<KeyRound className="size-4" />}
      to="/certificates"
      series={series}
      delta={deltaFromSeries(series)}
      hint="Cannot produce key-bearing outputs"
    />
  );
}

export function WithoutProfileTile({ dashboard }: TileContext) {
  return (
    <StatTile
      label="No profile linked"
      value={dashboard.counts.withoutProfile}
      tone={dashboard.counts.withoutProfile ? 'warn' : 'ok'}
      icon={<Link2 className="size-4" />}
      to="/certificates?unprofiled=true"
      hint="Renewals will not render files"
    />
  );
}

export function IssuerConcentrationTile({ dashboard }: TileContext) {
  const total = dashboard.issuers.reduce((n, i) => n + i.count, 0) || 1;
  const top = dashboard.issuers[0];
  const share = top ? Math.round((top.count / total) * 100) : 0;
  const hhi = dashboard.issuers.reduce((n, i) => n + (i.count / total) ** 2, 0);
  return (
    <Card>
      <CardHeader title="Issuer concentration" description="How much of the estate sits with a single signer." />
      <div className="text-[32px] font-semibold tracking-tight tnum text-ink-950">{share}%</div>
      <p className="text-[13px] text-ink-500 mt-1 truncate">{top ? top.name : 'No issuers yet'}</p>
      <p className="text-[12px] text-ink-400 mt-2">Herfindahl {hhi.toFixed(2)} · {dashboard.issuers.length} issuer{dashboard.issuers.length === 1 ? '' : 's'}</p>
    </Card>
  );
}

export function MeanDaysTile({ certificates }: TileContext) {
  const live = certificates.filter((c) => c.daysRemaining >= 0);
  const mean = live.length ? Math.round(live.reduce((n, c) => n + c.daysRemaining, 0) / live.length) : 0;
  return (
    <StatTile
      label="Mean days to expiry"
      value={live.length ? mean : '—'}
      hint={live.length ? `${live.length} unexpired certificate${live.length === 1 ? '' : 's'}` : 'No live certificates'}
      tone={mean <= 30 ? 'warn' : 'default'}
    />
  );
}

export function ExpiringByTagTile({ certificates }: TileContext) {
  const map = new Map<string, number>();
  for (const c of certificates.filter((x) => x.status === 'expiring' || x.status === 'critical')) {
    const tags = c.tags.length ? c.tags : ['(untagged)'];
    for (const t of tags) map.set(t, (map.get(t) ?? 0) + 1);
  }
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <Card>
      <CardHeader title="Expiring by tag" description="Attention load across your own labels." />
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">Nothing expiring or critical.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([tag, n]) => (
            <li key={tag}>
              <Link to={`/certificates?tag=${encodeURIComponent(tag === '(untagged)' ? '' : tag)}`} className="flex items-center justify-between gap-3 text-[13px] hover:text-brand-700">
                <span className="truncate text-ink-800">{tag}</span>
                <Badge>{n}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Renewals30dTile({ renewals }: TileContext) {
  const cutoff = Date.now() - 30 * 86400000;
  const recent = renewals.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  const failed = recent.filter((r) => r.status === 'failed').length;
  return (
    <StatTile
      label="Renewals · 30 days"
      value={recent.length}
      to="/renewals"
      hint={failed ? `${failed} failed` : 'Completed or pending'}
      tone={failed ? 'crit' : 'default'}
    />
  );
}

export function ConversionVolumeTile({ dashboard, events }: TileContext) {
  const conv = dashboard.timeSaved.byType.find((t) => t.type === 'conversion');
  const monthly = dashboard.timeSaved.monthly.map((m) => m.count);
  return (
    <StatTile
      label="Conversion volume"
      value={conv?.count ?? events.filter((e) => e.type === 'conversion').length}
      series={monthly}
      delta={deltaFromSeries(monthly)}
      hint={conv ? humanMinutes(conv.minutes) : 'Automated format conversions'}
      to="/activity"
    />
  );
}

export function TimeQuarterTile({ dashboard }: TileContext) {
  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const minutes = dashboard.timeSaved.monthly
    .filter((m) => {
      const [y, mo] = m.month.split('-').map(Number);
      const d = new Date(y, (mo ?? 1) - 1, 1);
      return d >= qStart && d <= now;
    })
    .reduce((n, m) => n + m.minutes, 0);
  return (
    <StatTile
      label="Time reclaimed this quarter"
      value={
        <>
          {Math.round(minutes / 60)}
          <span className="text-[16px] font-medium text-ink-500 ml-1">h</span>
        </>
      }
      tone="brand"
      hint={`${humanMinutes(minutes)} since ${qStart.toLocaleDateString(undefined, { month: 'short' })}`}
      to="/activity"
    />
  );
}

export function OldestCertTile({ certificates }: TileContext) {
  const oldest = [...certificates].sort((a, b) => a.notBefore.localeCompare(b.notBefore))[0];
  if (!oldest) {
    return (
      <Card>
        <CardHeader title="Oldest certificate" />
        <p className="text-[13px] text-ink-500">No certificates yet.</p>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Oldest certificate" description="Earliest not-before in the vault." />
      <Link to={`/certificates/${oldest.id}`} className="block hover:text-brand-700">
        <div className="text-sm font-medium text-ink-950 truncate">{oldest.name}</div>
        <div className="text-[13px] text-ink-500 mt-1 tnum">Issued {formatDate(oldest.notBefore)}</div>
      </Link>
    </Card>
  );
}

export function LargestSanTile({ certificates }: TileContext) {
  const top = [...certificates].sort((a, b) => b.sans.length - a.sans.length)[0];
  if (!top) {
    return (
      <Card>
        <CardHeader title="Largest SAN count" />
        <p className="text-[13px] text-ink-500">No certificates yet.</p>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Largest SAN count" />
      <Link to={`/certificates/${top.id}`} className="block hover:text-brand-700">
        <div className="text-[32px] font-semibold tracking-tight tnum text-ink-950">{top.sans.length}</div>
        <div className="text-sm text-ink-800 mt-1 truncate">{top.name}</div>
      </Link>
    </Card>
  );
}

export function AutomationCoverageTile({ certificates, profiles }: TileContext) {
  const { automated, partial, manual, total } = coverageCounts(certificates, profiles);
  const pct = total ? Math.round((automated / total) * 100) : 0;
  return (
    <Card>
      <CardHeader title="Automation coverage" description="How much of the fleet renews and deploys without a human." />
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[40px] font-semibold tracking-tight tnum text-brand-700 leading-none">{pct}%</div>
          <div className="text-[13px] text-ink-500 mt-2">fully automated</div>
        </div>
        <ul className="flex gap-6 text-[13px]">
          <li>
            <div className="text-ink-500">Automated</div>
            <div className="text-[18px] font-semibold tnum text-ok-600">{automated}</div>
          </li>
          <li>
            <div className="text-ink-500">Partial</div>
            <div className="text-[18px] font-semibold tnum text-warn-600">{partial}</div>
          </li>
          <li>
            <Link to="/certificates?unprofiled=true" className="block hover:text-brand-700">
              <div className="text-ink-500 inline-flex items-center gap-1">Manual <ShieldOff className="size-3.5" /></div>
              <div className="text-[18px] font-semibold tnum text-crit-600">{manual}</div>
            </Link>
          </li>
        </ul>
      </div>
      <div className="mt-4 h-2 rounded-full bg-ink-100 overflow-hidden flex">
        {automated > 0 && <div className="h-full bg-ok-500" style={{ width: `${(automated / (total || 1)) * 100}%` }} />}
        {partial > 0 && <div className="h-full bg-warn-500" style={{ width: `${(partial / (total || 1)) * 100}%` }} />}
        {manual > 0 && <div className="h-full bg-crit-500" style={{ width: `${(manual / (total || 1)) * 100}%` }} />}
      </div>
      <p className="text-[12px] text-ink-500 mt-2">Manual certificates have no linked profile — they are the platform&apos;s own to-do list.</p>
    </Card>
  );
}
