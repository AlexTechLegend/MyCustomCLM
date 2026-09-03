import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { CHART } from '@/lib/chartColors';

function sparkPoints(series: number[], w: number, h: number, pad = 2): string {
  if (series.length === 0) return '';
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  return series
    .map((v, i) => {
      const x = series.length === 1 ? w / 2 : pad + (i / (series.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function Sparkline({ series, className }: { series: number[]; className?: string }) {
  const w = 72;
  const h = 28;
  const pts = sparkPoints(series, w, h);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={clsx('w-[72px] h-7', className)} aria-hidden>
      {pts && <polyline fill="none" stroke={CHART.brand} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={pts} />}
    </svg>
  );
}

export function StatTile({
  label,
  value,
  hint,
  series,
  delta,
  tone = 'default',
  icon,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  series?: number[];
  delta?: { label: string; direction: 'up' | 'down' | 'flat' };
  tone?: 'default' | 'brand' | 'warn' | 'crit' | 'ok' | 'dead';
  icon?: ReactNode;
  to?: string;
}) {
  const toneClass = {
    default: 'text-ink-950',
    brand: 'text-brand-700',
    warn: 'text-warn-600',
    crit: 'text-crit-600',
    ok: 'text-ok-600',
    dead: 'text-dead-600',
  }[tone];
  const deltaClass =
    delta?.direction === 'down' ? 'text-ok-600' : delta?.direction === 'up' ? 'text-warn-700' : 'text-ink-500';
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className={clsx('text-[32px] leading-none font-semibold tracking-tight tnum', toneClass)}>{value}</div>
        {series && series.length > 1 && <Sparkline series={series} />}
      </div>
      {(hint || delta) && (
        <div className="mt-2.5 text-[13px] text-ink-500">
          {hint}
          {delta && <span className={clsx(hint ? ' ml-1' : '', deltaClass)}>{delta.label}</span>}
        </div>
      )}
    </>
  );
  return to ? (
    <Link to={to} className="block">
      <Card className="hover:border-ink-300 transition-colors">{body}</Card>
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}
