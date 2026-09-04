import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb';
import { PipelineComposer } from '@/components/PipelineComposer';
import { useToast } from '@/components/Toast';
import { Button, Card, CardHeader, ErrorBox, Field, Input, Loading, PageHeader, Textarea } from '@/components/ui';
import { pipelinesApi } from '@/lib/api';
import type { Pipeline, PipelineStep } from '@/types/automation';

export function PipelineEditor() {
  const { id = '' } = useParams();
  const isNew = id === 'new' || !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({ queryKey: ['pipeline', id], queryFn: () => pipelinesApi.get(id), enabled: !isNew });
  const library = useQuery({ queryKey: ['pipeline-steps'], queryFn: pipelinesApi.steps });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<PipelineStep[]>([]);

  useEffect(() => {
    if (!detail.data) return;
    setName(detail.data.pipeline.name);
    setDescription(detail.data.pipeline.description);
    setSteps(detail.data.pipeline.steps);
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () => {
      const body: Partial<Pipeline> = { name, description, steps };
      return isNew ? pipelinesApi.create(body) : pipelinesApi.update(id, body);
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      qc.invalidateQueries({ queryKey: ['pipeline', p.id] });
      toast.success('Pipeline saved');
      if (isNew) nav(`/pipelines/${p.id}`, { replace: true });
    },
    onError: (e) => toast.error('Could not save pipeline', e),
  });

  if (!isNew && detail.isLoading) return <Loading />;
  if (!isNew && detail.error) return <ErrorBox error={detail.error} />;

  const runs = detail.data?.runs ?? [];

  return (
    <>
      <Breadcrumb items={[{ label: 'Pipelines', to: '/pipelines' }, { label: isNew ? 'New' : name || 'Pipeline' }]} />
      <PageHeader
        title={isNew ? 'New pipeline' : name || 'Pipeline'}
        description="Reorder steps and fill the type-specific fields. Unknown types open as JSON."
        actions={<Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>}
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            </div>
            {library.error ? <ErrorBox error={library.error} /> : (
              <PipelineComposer steps={steps} onChange={setSteps} library={library.data ?? []} />
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Recent runs" />
            {!runs.length ? (
              <p className="text-[13px] text-text-soft">No runs yet.</p>
            ) : (
              <ul className="space-y-2">
                {runs.slice(0, 12).map((r) => (
                  <li key={r.id}>
                    <Link to={`/runs/${r.id}`} className="text-[13px] text-text hover:text-brand-600 flex justify-between gap-2">
                      <span className="truncate">{r.state}</span>
                      <span className="text-text-soft tnum shrink-0">{new Date(r.createdAt).toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Notes" />
            <Textarea readOnly value="A verify step can assert against files a earlier copy/swap wrote. Use {steps.<id>.destination} in paths." className="text-[13px]" />
          </Card>
        </div>
      </div>
    </>
  );
}
