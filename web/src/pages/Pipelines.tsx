import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { pipelinesApi } from '@/lib/api';

export function Pipelines() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['pipelines'], queryFn: pipelinesApi.list });
  const remove = useMutation({
    mutationFn: (id: string) => pipelinesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline deleted');
    },
    onError: (e) => toast.error('Could not delete pipeline', e),
  });

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Ordered deploy steps. Compose them visually — no JSON required."
        actions={<Link to="/pipelines/new"><Button variant="primary" icon={<Plus className="size-4" />}>New pipeline</Button></Link>}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !q.data?.length ? (
        <Card padded={false}>
          <EmptyState icon={<GitBranch className="size-5" />} title="No pipelines" description="Start from a blank pipeline or the built-in staging recipe." action={<Link to="/pipelines/new"><Button variant="primary">Create pipeline</Button></Link>} />
        </Card>
      ) : (
        <div className="space-y-3">
          {q.data.map((p) => (
            <Card key={p.id} className="p-5 flex items-start justify-between gap-4">
              <div>
                <Link to={`/pipelines/${p.id}`} className="text-sm font-semibold text-text hover:text-brand-600">{p.name}</Link>
                <p className="text-[13px] text-text-soft mt-0.5">{p.description || `${p.steps.length} steps`}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.isBuiltin && <Badge tone="brand">Built-in</Badge>}
                  {p.steps.map((s) => <Badge key={s.id}>{s.type}</Badge>)}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link to={`/pipelines/${p.id}`}><Button size="sm">Open</Button></Link>
                {!p.isBuiltin && <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => remove.mutate(p.id)} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
