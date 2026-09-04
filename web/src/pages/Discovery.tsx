import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Textarea } from '@/components/ui';
import { discoveryApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { DiscoveryResult } from '@/types/automation';

function tone(status?: string): 'ok' | 'warn' | 'neutral' {
  if (status === 'known') return 'ok';
  if (status === 'known-but-different') return 'warn';
  return 'neutral';
}

function statusOf(r: DiscoveryResult): string {
  if (r.matchedCertificateId && r.fingerprintSha256) return 'known';
  if (r.matchedCertificateId) return 'known-but-different';
  return r.fingerprintSha256 ? 'unknown' : 'error';
}

export function Discovery() {
  const qc = useQueryClient();
  const toast = useToast();
  const [targets, setTargets] = useState('');
  const [ports, setPorts] = useState('443, 8443');
  const listed = useQuery({ queryKey: ['discovery'], queryFn: () => discoveryApi.list() });

  const scan = useMutation({
    mutationFn: () => {
      const t = targets.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      if (!t.length) throw new Error('Enter at least one host or CIDR');
      const p = ports.split(/[\s,]+/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      return discoveryApi.scan({ targets: t, ports: p.length ? p : undefined });
    },
    onSuccess: (data) => {
      qc.setQueryData(['discovery'], { scanId: data.scanId, results: data.results });
      toast.success(`Scan ${data.scanId} finished`, `${data.hits.length} hit${data.hits.length === 1 ? '' : 's'}`);
    },
    onError: (e) => toast.error('Scan failed', e),
  });

  const rows = listed.data?.results ?? [];

  return (
    <>
      <PageHeader title="Discovery" description="Sweep hosts and CIDRs for TLS certificates. Hits persist so you can compare later." />
      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px_auto] gap-3 items-end">
          <Field label="Targets" hint="Hostnames, IPs, or CIDRs" required>
            <Textarea value={targets} onChange={(e) => setTargets(e.target.value)} placeholder="web.example.com&#10;10.0.0.0/28" />
          </Field>
          <Field label="Ports">
            <Input value={ports} onChange={(e) => setPorts(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={() => scan.mutate()} loading={scan.isPending} disabled={!targets.trim()}>
            Scan
          </Button>
        </div>
      </Card>
      {listed.isLoading ? (
        <Loading />
      ) : listed.error ? (
        <ErrorBox error={listed.error} />
      ) : !rows.length && !scan.data ? (
        <Card padded={false}>
          <EmptyState icon={<Search className="size-5" />} title="No scans yet" description="Enter a hostname or CIDR and run a scan. Refused ports are skipped." />
        </Card>
      ) : (
        <Card padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-text-soft border-b border-line">
                <th className="font-medium px-4 py-3">Address</th>
                <th className="font-medium px-4 py-3">Subject</th>
                <th className="font-medium px-4 py-3">Fingerprint</th>
                <th className="font-medium px-4 py-3">Status</th>
                <th className="font-medium px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const status = statusOf(r);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{r.address}:{r.port}</div>
                      <div className="text-[12px] text-text-soft">{r.hostname}</div>
                    </td>
                    <td className="px-4 py-3 text-text">{r.subject || '—'}</td>
                    <td className="px-4 py-3 text-[12px] font-mono text-text-soft truncate max-w-[14rem]">{r.fingerprintSha256 || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={tone(status)}>{status}</Badge>
                      {r.matchedCertificateId && (
                        <Link to={`/certificates/${r.matchedCertificateId}`} className="block text-[12px] text-brand-600 hover:underline mt-0.5">
                          Inventory match
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-soft tnum">{formatDateTime(r.lastSeen)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
