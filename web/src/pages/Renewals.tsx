import { useQuery } from '@tanstack/react-query';
import { FileWarning, History } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, Chips, EmptyState, ErrorBox, LinkButton, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Renewal, RenewalMethod, RenewalStatus } from '@/types';

type StatusFilter = 'all' | RenewalStatus;

const METHOD_LABEL: Record<RenewalMethod, string> = {
  'internal-ca': 'Internal CA',
  'self-signed': 'Self-signed',
  csr: 'External CA',
};

function statusTone(status: RenewalStatus): 'ok' | 'warn' | 'crit' {
  if (status === 'completed') return 'ok';
  if (status === 'failed') return 'crit';
  return 'warn';
}

function statusLabel(status: RenewalStatus) {
  if (status === 'pending-csr') return 'Pending CSR';
  if (status === 'completed') return 'Completed';
  return 'Failed';
}

function keyLabel(mode: Renewal['keyMode']) {
  return mode === 'reuse' ? 'Key reused' : mode.toUpperCase().replace('-', ' ');
}

export function Renewals() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'all') as StatusFilter;
  const q = useQuery({ queryKey: ['renewals'], queryFn: api.renewals });

  const setStatus = (v: StatusFilter) => {
    const next = new URLSearchParams(params);
    if (v === 'all') next.delete('status');
    else next.set('status', v);
    setParams(next, { replace: true });
  };

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;

  const all = q.data;
  const pending = all.filter((r) => r.status === 'pending-csr');
  const counts = {
    all: all.length,
    completed: all.filter((r) => r.status === 'completed').length,
    'pending-csr': pending.length,
    failed: all.filter((r) => r.status === 'failed').length,
  };
  const rows = status === 'all' ? all : all.filter((r) => r.status === status);

  return (
    <>
      <PageHeader
        title="Renewals"
        description="Every renewal Vigil has run — completed receipts, failed attempts, and CSRs still waiting on a signed certificate."
      />

      {pending.length > 0 && (
        <Card className="mb-6 border-warn-100 bg-warn-50/70">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-xl bg-warn-100 text-warn-700 flex items-center justify-center shrink-0">
              <FileWarning className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-ink-950">
                {pending.length} renewal{pending.length === 1 ? '' : 's'} waiting on a signed certificate
              </h3>
              <p className="text-[13px] text-ink-600 mt-0.5">
                External-CA renewals stay blocked until you upload the signed leaf (and chain). Open a receipt to paste the CSR or finish the upload.
              </p>
              <ul className="mt-3 space-y-1.5">
                {pending.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 text-[13px]">
                    <Link to={`/certificates/${r.certificateId}`} className="font-medium text-ink-900 hover:text-brand-700 truncate">
                      {r.certificateName}
                    </Link>
                    <span className="text-ink-400 tnum shrink-0">{formatDateTime(r.createdAt)}</span>
                    <LinkButton to={`/certificates/${r.certificateId}/renew?renewal=${r.id}`} size="sm" variant="secondary" className="ml-auto shrink-0">
                      Open receipt
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-5">
        <Chips
          value={status}
          onChange={setStatus}
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'completed', label: 'Completed', count: counts.completed },
            { id: 'pending-csr', label: 'Pending CSR', count: counts['pending-csr'] },
            { id: 'failed', label: 'Failed', count: counts.failed },
          ]}
        />
      </div>

      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" />}
            title={counts.all === 0 ? 'No renewals yet' : 'No renewals match'}
            description={
              counts.all === 0
                ? 'Renew a certificate from its detail page and the receipt will show up here.'
                : 'Try a different status filter.'
            }
            action={counts.all === 0 ? <LinkButton to="/certificates" variant="primary">Browse certificates</LinkButton> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[11px] uppercase tracking-[0.1em] text-ink-500">
                  <th className="px-6 py-3 font-medium">Certificate</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium tnum">Files</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <Link to={`/certificates/${r.certificateId}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {r.certificateName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{METHOD_LABEL[r.method]}</td>
                    <td className="px-4 py-3 text-ink-600">{keyLabel(r.keyMode)}</td>
                    <td className="px-4 py-3 text-ink-700 tnum">{r.outputs.length}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-500 tnum whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="px-6 py-3 text-right">
                      <LinkButton to={`/certificates/${r.certificateId}/renew?renewal=${r.id}`} size="sm" variant="ghost">
                        Open receipt
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
