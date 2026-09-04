import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb';
import { copyText } from '@/components/CopyButton';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader } from '@/components/ui';
import { pipelinesApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PipelineStepResult } from '@/types/automation';

function duration(s: PipelineStepResult): string {
  if (!s.startedAt) return '—';
  const end = s.finishedAt ? Date.parse(s.finishedAt) : Date.now();
  const ms = Math.max(0, end - Date.parse(s.startedAt));
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function tone(state: string): 'ok' | 'warn' | 'crit' | 'neutral' | 'brand' {
  if (state === 'succeeded') return 'ok';
  if (state === 'failed') return 'crit';
  if (state === 'awaiting-approval' || state === 'running') return 'warn';
  if (state === 'skipped') return 'neutral';
  return 'brand';
}

export function PipelineRunPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const run = useQuery({ queryKey: ['pipeline-run', id], queryFn: () => pipelinesApi.runById(id), refetchInterval: (query) => {
    const s = query.state.data?.state;
    return s === 'running' || s === 'pending' ? 2000 : false;
  } });

  const rerun = useMutation({
    mutationFn: () => {
      const r = run.data;
      if (!r) throw new Error('Run not loaded');
      return pipelinesApi.run(r.pipelineId, { certificateId: r.certificateId ?? undefined, hostId: r.hostId ?? undefined, params: r.params });
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Rerun started');
      window.location.assign(`/runs/${next.id}`);
    },
    onError: (e) => toast.error('Could not rerun', e),
  });

  const steps = useMemo(() => {
    const list = run.data?.steps ?? [];
    if (!q.trim()) return list;
    const n = q.toLowerCase();
    return list.filter((s) => [s.name, s.stdout, s.stderr, s.error ?? ''].some((v) => v.toLowerCase().includes(n)));
  }, [run.data, q]);

  if (run.isLoading) return <Loading />;
  if (run.error || !run.data) return <ErrorBox error={run.error} />;
  const r = run.data;

  return (
    <>
      <Breadcrumb items={[{ label: 'Pipelines', to: '/pipelines' }, { label: r.pipelineName, to: `/pipelines/${r.pipelineId}` }, { label: 'Run' }]} />
      <PageHeader
        title={r.pipelineName}
        description={`Run ${r.id} · ${r.state}`}
        actions={
          <div className="flex gap-2">
            {r.state === 'awaiting-approval' && <Link to="/approvals"><Button variant="primary">Open inbox</Button></Link>}
            <Button onClick={() => rerun.mutate()} loading={rerun.isPending}>Rerun</Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-text-soft">
        {r.certificateId && <Link to={`/certificates/${r.certificateId}`} className="text-brand-600 hover:underline">Certificate</Link>}
        {r.hostId && <Link to="/hosts" className="text-brand-600 hover:underline">Host</Link>}
        <span>Started {r.startedAt ? formatDateTime(r.startedAt) : '—'}</span>
        <span>Finished {r.finishedAt ? formatDateTime(r.finishedAt) : '—'}</span>
        {r.decisionNote && <span>Decision note: {r.decisionNote}</span>}
        {r.approvedBy && <span>By {r.approvedBy}{r.approvedAt ? ` · ${formatDateTime(r.approvedAt)}` : ''}</span>}
        <Field label="" className="ml-auto w-64">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stdout…" />
        </Field>
      </div>
      <div className="relative border-l border-line ml-3 space-y-4">
        {steps.map((s) => (
          <details key={s.stepId} className={`ml-4 card p-4 ${s.state === 'failed' ? 'ring-1 ring-crit-500' : ''}`}>
            <summary className="cursor-pointer list-none flex flex-wrap items-center gap-2">
              <Badge tone={tone(s.state)}>{s.state}</Badge>
              <span className="font-medium text-text">{s.name}</span>
              <span className="text-[12px] text-text-soft">{s.type}</span>
              <span className="text-[12px] text-text-soft tnum ml-auto">{duration(s)}</span>
            </summary>
            <div className="mt-3 space-y-2">
              {s.error && <p className="text-[13px] text-crit-fg">{s.error}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => copyText([s.stdout, s.stderr].filter(Boolean).join('\n---\n')).then((ok) => ok ? toast.success('Copied output') : toast.error('Copy failed'))}>Copy output</Button>
              </div>
              {s.stdout && <pre className="rounded-xl bg-code text-ink-200 text-[12px] p-3 overflow-x-auto scrollbar-thin whitespace-pre-wrap">{s.stdout}</pre>}
              {s.stderr && <pre className="rounded-xl bg-code text-crit-100 text-[12px] p-3 overflow-x-auto scrollbar-thin whitespace-pre-wrap">{s.stderr}</pre>}
            </div>
          </details>
        ))}
        {!steps.length && <Card className="ml-4"><p className="text-[13px] text-text-soft">No matching steps.</p></Card>}
      </div>
    </>
  );
}
