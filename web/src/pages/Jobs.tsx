import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { jobsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Job, JobState } from '@/types/automation';

const STATES: JobState[] = ['queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled'];

function staleHeartbeat(lastTickAt: string | null, enabled: boolean): boolean {
  if (!enabled) return true;
  if (!lastTickAt) return true;
  return Date.now() - Date.parse(lastTickAt) > 3 * 45_000;
}

export function Jobs() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<string>('all');
  const jobs = useQuery({ queryKey: ['jobs', filter], queryFn: () => jobsApi.list({ state: filter === 'all' ? undefined : filter, limit: 200 }), refetchInterval: 8000 });
  const hb = useQuery({ queryKey: ['scheduler'], queryFn: jobsApi.scheduler, refetchInterval: 15000 });

  const cancel = useMutation({
    mutationFn: (id: string) => jobsApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Job cancelled'); },
    onError: (e) => toast.error('Could not cancel', e),
  });
  const retry = useMutation({
    mutationFn: (id: string) => jobsApi.retry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Job requeued'); },
    onError: (e) => toast.error('Could not retry', e),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobs.data ?? []) c[j.state] = (c[j.state] ?? 0) + 1;
    return c;
  }, [jobs.data]);

  const dead = hb.data ? staleHeartbeat(hb.data.lastTickAt, hb.data.enabled) : false;

  return (
    <>
      <PageHeader title="Jobs" description="Scheduler queue, running leases, and retries." />
      {dead && (
        <div className="mb-4 rounded-xl border border-crit-100 bg-crit-50 text-crit-fg px-4 py-3 text-sm">
          Scheduler heartbeat is stale{hb.data?.lastTickAt ? ` (last tick ${formatDateTime(hb.data.lastTickAt)})` : ''}. Unattended renewals are not running.
        </div>
      )}
      {hb.data && !dead && (
        <p className="mb-4 text-[13px] text-text-soft">
          Scheduler {hb.data.enabled ? 'enabled' : 'disabled'} · last tick {hb.data.lastTickAt ? formatDateTime(hb.data.lastTickAt) : 'never'} · owner {hb.data.owner}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>All</Button>
        {STATES.map((s) => (
          <Button key={s} size="sm" variant={filter === s ? 'primary' : 'secondary'} onClick={() => setFilter(s)}>
            {s}{counts[s] ? ` ${counts[s]}` : ''}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {STATES.map((s) => (
          <Card key={s} className="p-4">
            <div className="text-[12px] text-text-soft capitalize">{s}</div>
            <div className="text-[22px] font-semibold tnum text-text">{counts[s] ?? 0}</div>
          </Card>
        ))}
      </div>
      {jobs.isLoading ? (
        <Loading />
      ) : jobs.error ? (
        <ErrorBox error={jobs.error} />
      ) : (
        <Card padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-text-soft border-b border-line">
                <th className="font-medium px-4 py-3">Job</th>
                <th className="font-medium px-4 py-3">State</th>
                <th className="font-medium px-4 py-3">Attempts</th>
                <th className="font-medium px-4 py-3">Lease / retry</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(jobs.data ?? []).map((j: Job) => (
                <tr key={j.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{j.type}</div>
                    <div className="text-[12px] text-text-soft">
                      {j.certificateId ? <Link to={`/certificates/${j.certificateId}`} className="text-brand-600 hover:underline">Certificate</Link> : j.id}
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={j.state === 'failed' ? 'crit' : j.state === 'running' ? 'warn' : j.state === 'succeeded' ? 'ok' : 'neutral'}>{j.state}</Badge></td>
                  <td className="px-4 py-3 tnum text-text-mid">{j.attempts}/{j.maxAttempts}</td>
                  <td className="px-4 py-3 text-[12px] text-text-soft">
                    {j.state === 'running' && j.leaseExpiresAt && <>Lease {formatDateTime(j.leaseExpiresAt)}</>}
                    {j.state === 'failed' && <>Next {formatDateTime(j.scheduledFor)}</>}
                    {j.error && <div className="text-crit-fg mt-0.5 truncate max-w-xs">{j.error}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(j.state === 'queued' || j.state === 'running' || j.state === 'claimed') && (
                      <Button size="sm" onClick={() => cancel.mutate(j.id)}>Cancel</Button>
                    )}
                    {(j.state === 'failed' || j.state === 'cancelled') && (
                      <Button size="sm" onClick={() => retry.mutate(j.id)}>Retry</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!jobs.data?.length && <CardHeader title="No jobs" description="The queue is empty." />}
        </Card>
      )}
    </>
  );
}
