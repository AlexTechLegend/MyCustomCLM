import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { blueprintsApi } from '@/lib/api';

export function Blueprints() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['blueprints'], queryFn: blueprintsApi.list });
  const remove = useMutation({
    mutationFn: (id: string) => blueprintsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blueprints'] });
      toast.success('Blueprint deleted');
    },
    onError: (e) => toast.error('Could not delete blueprint', e),
  });

  return (
    <>
      <PageHeader
        title="Blueprints"
        description="A blueprint binds identity, profiles, issuance, pipeline and a renewal window. Instantiate one to onboard a server."
        actions={
          <div className="flex gap-2">
            <Link to="/onboard"><Button>Onboard a server</Button></Link>
            <Link to="/blueprints/new"><Button variant="primary" icon={<Plus className="size-4" />}>New blueprint</Button></Link>
          </div>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !q.data?.length ? (
        <Card padded={false}>
          <EmptyState icon={<Boxes className="size-5" />} title="No blueprints yet" description="Create a blueprint, then instantiate it with a CN and hosts." action={<Link to="/blueprints/new"><Button variant="primary">Create blueprint</Button></Link>} />
        </Card>
      ) : (
        <div className="space-y-3">
          {q.data.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link to={`/blueprints/${b.id}`} className="text-sm font-semibold text-text hover:text-brand-600">{b.name}</Link>
                  <p className="text-[13px] text-text-soft mt-0.5">{b.description || 'No description'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{b.issuanceMethod}</Badge>
                    <Badge>{b.keyMode}</Badge>
                    <Badge>{b.validityDays} d</Badge>
                    {b.renewalPolicy.requiresApproval && <Badge tone="warn">Approval gate</Badge>}
                    <span className="text-[12px] text-text-soft tnum">v{b.version}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/onboard/${b.id}`}><Button size="sm">Onboard</Button></Link>
                  <Link to={`/blueprints/${b.id}`}><Button size="sm" variant="ghost">Edit</Button></Link>
                  <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => remove.mutate(b.id)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
