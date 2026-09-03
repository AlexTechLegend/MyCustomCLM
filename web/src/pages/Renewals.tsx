import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, Chips, EmptyState, ErrorBox, LinkButton, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { RenewalStatus } from '@/types';

type Filter = 'all' | RenewalStatus;

export function Renewals() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'all') as Filter;
  const q = useQuery({ queryKey: ['renewals'], queryFn: api.renewals });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;

  const pending = q.data.filter((r) => r.status === 'pending-csr');
  const failed = q.data.filter((r) => r.status === 'failed' || r.outputs.some((o) => o.deployStatus === 'failed'));
  const list = q.data.filter((r) => {
    if (status === 'all') return true;
    if (status === 'failed') return r.status === 'failed' || r.outputs.some((o) => o.deployStatus === 'failed');
    return r.status === status;
  });

  return (
    <>
      <PageHeader
        title="Renewals"
        description="Every renewal receipt. Pending CSRs are blocked until a signed certificate is uploaded."
      />
      {pending.length > 0 && status === 'all' && (
        <Card className="mb-6 border-warn-200 bg-warn-50/40">
          <div className="text-[13px] font-medium text-warn-700">
            {pending.length} renewal{pending.length === 1 ? '' : 's'} waiting on a signed certificate
          </div>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <Link to={`/certificates/${r.certificateId}/renew?renewal=${r.id}`} className="text-sm text-ink-900 hover:text-brand-700">
                  {r.certificateName}
                </Link>
                <LinkButton to={`/certificates/${r.certificateId}/renew?renewal=${r.id}`} size="sm" variant="primary">
                  Upload signed cert
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mb-4">
        <Chips
          value={status}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            if (v === 'all') next.delete('status');
            else next.set('status', v);
            setParams(next, { replace: true });
          }}
          options={[
            { id: 'all', label: 'All', count: q.data.length },
            { id: 'pending-csr', label: 'Pending CSR', count: pending.length },
            { id: 'completed', label: 'Complete', count: q.data.filter((r) => r.status === 'completed').length },
            { id: 'failed', label: 'Failed', count: failed.length },
          ]}
        />
      </div>
      <Card padded={false}>
        {list.length === 0 ? (
          <EmptyState title="No renewals" description="Renew a certificate and the receipt will land here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((r) => (
              <li key={r.id} className="px-6 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link to={`/certificates/${r.certificateId}/renew?renewal=${r.id}`} className="text-sm font-medium text-ink-950 hover:text-brand-700 truncate block">
                    {r.certificateName}
                  </Link>
                  <div className="text-[12px] text-ink-500 tnum">{formatDateTime(r.createdAt)}</div>
                </div>
                <Badge tone={r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'crit' : 'warn'}>
                  {r.status === 'pending-csr' ? 'Awaiting signed cert' : r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
