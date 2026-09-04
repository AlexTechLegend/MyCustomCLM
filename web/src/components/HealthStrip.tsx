import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, FileWarning, RadioTower, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { fetchSchedulerInfo } from '@/lib/apiExtra';
import { timeAgo } from '@/lib/format';

export function HealthStrip({ onOpenDiagnostics }: { onOpenDiagnostics: () => void }) {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 30_000 });
  const renewals = useQuery({ queryKey: ['renewals'], queryFn: api.renewals, staleTime: 30_000 });
  const scheduler = useQuery({ queryKey: ['scheduler-info'], queryFn: fetchSchedulerInfo, staleTime: 60_000 });

  const expiring = dash.data?.counts.expiring ?? 0;
  const critical = dash.data?.counts.critical ?? 0;
  const pending = (renewals.data ?? []).filter((r) => r.status === 'pending-csr').length;
  const failed = (renewals.data ?? []).filter((r) => r.status === 'failed' || r.outputs.some((o) => o.deployStatus === 'failed')).length;
  const sched = scheduler.data;

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="max-w-[1280px] mx-auto px-8 h-10 flex items-center gap-1 text-[12px] overflow-x-auto scrollbar-thin">
        <Link
          to="/certificates?status=expiring"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border ${expiring ? 'text-warn-700 bg-warn-50 border-warn-100' : 'text-text-mid border-transparent hover:bg-canvas hover:border-line'}`}
        >
          <Clock3 className="size-3.5" />
          <span className="tnum font-medium">{expiring}</span> expiring
        </Link>
        <Link
          to="/certificates?status=critical"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border ${critical ? 'text-crit-700 bg-crit-50 border-crit-100' : 'text-text-mid border-transparent hover:bg-canvas hover:border-line'}`}
        >
          <AlertTriangle className="size-3.5" />
          <span className="tnum font-medium">{critical}</span> critical
        </Link>
        <Link
          to="/renewals?status=pending-csr"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border ${pending ? 'text-warn-700 bg-warn-50 border-warn-100' : 'text-text-mid border-transparent hover:bg-canvas hover:border-line'}`}
        >
          <FileWarning className="size-3.5" />
          <span className="tnum font-medium">{pending}</span> pending CSR
        </Link>
        <Link
          to="/renewals?status=failed"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border ${failed ? 'text-crit-700 bg-crit-50 border-crit-100' : 'text-text-mid border-transparent hover:bg-canvas hover:border-line'}`}
        >
          <XCircle className="size-3.5" />
          <span className="tnum font-medium">{failed}</span> failed deploys
        </Link>
        <button type="button" onClick={onOpenDiagnostics} className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border border-transparent text-text-mid hover:bg-canvas hover:border-line">
          Diagnostics
        </button>
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-text-soft ml-auto hover:bg-canvas hover:border-line border border-transparent"
          title={sched?.configured ? sched.label : 'Scheduler endpoint is not available yet'}
        >
          <RadioTower className="size-3.5" />
          {sched?.configured
            ? sched.lastRunAt
              ? `Scheduler ${timeAgo(sched.lastRunAt)}`
              : 'Scheduler configured'
            : 'Scheduler not configured'}
        </Link>
      </div>
    </div>
  );
}
