import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, ErrorBox, Field, Loading, PageHeader, Textarea } from '@/components/ui';
import { api, hostsApi, pipelinesApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

export function Approvals() {
  const qc = useQueryClient();
  const toast = useToast();
  const runs = useQuery({ queryKey: ['pipeline-runs'], queryFn: () => pipelinesApi.runs(), refetchInterval: 15000 });
  const certs = useQuery({ queryKey: ['certificates', {}], queryFn: () => api.certificates({}) });
  const hosts = useQuery({ queryKey: ['hosts'], queryFn: hostsApi.list });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const waiting = (runs.data ?? []).filter((r) => r.state === 'awaiting-approval');
  const nameOf = (id: string | null) => (id && certs.data?.find((c) => c.id === id)?.name) || id || '—';
  const hostOf = (id: string | null) => (id && hosts.data?.find((h) => h.id === id)?.name) || id || '—';

  const act = useMutation({
    mutationFn: ({ id, reject }: { id: string; reject: boolean }) =>
      reject ? pipelinesApi.reject(id, notes[id]) : pipelinesApi.approve(id, notes[id]),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['pipeline-runs'] });
      toast.success(vars.reject ? 'Run rejected' : 'Run approved');
    },
    onError: (e) => toast.error('Could not update approval', e),
  });

  return (
    <>
      <PageHeader title="Approvals" description="Paused pipeline runs waiting for a person. Without this screen they deadlock." />
      {runs.isLoading ? (
        <Loading />
      ) : runs.error ? (
        <ErrorBox error={runs.error} />
      ) : !waiting.length ? (
        <Card padded={false}>
          <EmptyState icon={<Inbox className="size-5" />} title="Inbox is clear" description="No runs are waiting for approval." />
        </Card>
      ) : (
        <div className="space-y-3">
          {waiting.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link to={`/runs/${r.id}`} className="text-sm font-semibold text-text hover:text-brand-600">{r.pipelineName}</Link>
                  <p className="text-[13px] text-text-soft mt-1">
                    Certificate {r.certificateId ? <Link to={`/certificates/${r.certificateId}`} className="text-brand-600 hover:underline">{nameOf(r.certificateId)}</Link> : '—'}
                    {' · '}Host {hostOf(r.hostId)}
                    {' · '}Requested {formatDateTime(r.createdAt)}
                  </p>
                </div>
              </div>
              <Field label="Note (optional)" className="mt-3">
                <Textarea value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              </Field>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" onClick={() => act.mutate({ id: r.id, reject: false })} loading={act.isPending}>Approve</Button>
                <Button variant="danger" onClick={() => act.mutate({ id: r.id, reject: true })} loading={act.isPending}>Reject</Button>
                <Link to={`/runs/${r.id}`}><Button variant="ghost">Timeline</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
