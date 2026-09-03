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
    <div className="sticky top-0 z-20 border-b border-ink-200/80 bg-surface/90 backdrop-blur-md">
      <div className="max-w-[1280px] mx-auto px-8 h-10 flex items-center gap-1 text-[12px] overflow-x-auto scrollbar-thin">
        <Link
          to="/certificates?status=expiring"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg ${expiring ? 'text-warn-700 bg-warn-50' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          <Clock3 className="size-3.5" />
          <span className="tnum font-medium">{expiring}</span> expiring
        </Link>
        <Link
          to="/certificates?status=critical"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg ${critical ? 'text-crit-700 bg-crit-50' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          <AlertTriangle className="size-3.5" />
          <span className="tnum font-medium">{critical}</span> critical
        </Link>
        <Link
          to="/renewals?status=pending-csr"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg ${pending ? 'text-warn-700 bg-warn-50' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          <FileWarning className="size-3.5" />
          <span className="tnum font-medium">{pending}</span> pending CSR
        </Link>
        <Link
          to="/renewals?status=failed"
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg ${failed ? 'text-crit-700 bg-crit-50' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          <XCircle className="size-3.5" />
          <span className="tnum font-medium">{failed}</span> failed deploys
        </Link>
        <button type="button" onClick={onOpenDiagnostics} className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-ink-600 hover:bg-ink-50">
          Diagnostics
        </button>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-ink-500 ml-auto"
          title={sched?.configured ? sched.label : 'Scheduler endpoint is not available yet'}
        >
          <RadioTower className="size-3.5" />
          {sched?.configured
            ? sched.lastRunAt
              ? `Scheduler ${timeAgo(sched.lastRunAt)}`
              : 'Scheduler configured'
            : 'Scheduler not configured'}
        </span>
      </div>
    </div>
  );
}
