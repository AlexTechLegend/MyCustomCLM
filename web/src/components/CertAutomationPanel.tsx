import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader, ErrorBox } from '@/components/ui';
import { blueprintsApi, hostsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Certificate } from '@/types';
import type { Host } from '@/types/automation';

export function CertAutomationPanel({
  certificate,
  hosts,
}: {
  certificate: Certificate;
  hosts?: Host[];
}) {
  const schedule = useQuery({ queryKey: ['cert-schedule', certificate.id], queryFn: () => blueprintsApi.certificateSchedule(certificate.id) });
  const blueprintId = certificate.blueprintId ?? schedule.data?.blueprintId ?? null;
  const blueprint = useQuery({ queryKey: ['blueprint', blueprintId], queryFn: () => blueprintsApi.get(blueprintId!), enabled: !!blueprintId });
  const drift = useQuery({ queryKey: ['blueprint-drift', blueprintId], queryFn: () => blueprintsApi.drift(blueprintId!), enabled: !!blueprintId });
  const allHosts = useQuery({ queryKey: ['hosts'], queryFn: hostsApi.list, enabled: !hosts });
  const linked = hosts ?? (allHosts.data ?? []).filter((h) => h.certificateIds?.includes(certificate.id));

  const mine = (drift.data?.findings ?? []).filter((f) => f.certificateId === certificate.id);
  const nextAt = certificate.nextRenewalAt ?? schedule.data?.nextRenewalAt ?? null;

  return (
    <Card>
      <CardHeader title="Automation" description="Where it lives, what governs it, and whether it has drifted." />
      {schedule.error && <ErrorBox error={schedule.error} className="mb-3" />}
      <dl className="grid grid-cols-[minmax(100px,140px)_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-text-soft">Host</dt>
        <dd className="text-text">
          {linked.length ? linked.map((h) => (
            <Link key={h.id} to="/hosts" className="text-brand-600 hover:underline block">{h.name}</Link>
          )) : '—'}
        </dd>
        <dt className="text-text-soft">Blueprint</dt>
        <dd className="text-text">
          {blueprint.data ? (
            <Link to={`/blueprints/${blueprint.data.id}`} className="text-brand-600 hover:underline">{blueprint.data.name}</Link>
          ) : blueprintId ? '…' : 'Not linked'}
        </dd>
        <dt className="text-text-soft">Next renewal</dt>
        <dd className="text-text">
          {nextAt ? <span className="tnum">{formatDateTime(nextAt)}</span> : 'Not scheduled'}
          {schedule.data?.window && (
            <div className="text-[12px] text-text-soft mt-0.5">
              Window <Link to="/windows" className="text-brand-600 hover:underline">{schedule.data.window.name}</Link>
              {' · '}{schedule.data.window.startTime}–{schedule.data.window.endTime} {schedule.data.window.timezone}
            </div>
          )}
        </dd>
        <dt className="text-text-soft">Drift</dt>
        <dd>
          {!blueprintId ? (
            <span className="text-text-soft">No blueprint to compare</span>
          ) : drift.isLoading ? (
            <span className="text-text-soft">Checking…</span>
          ) : drift.error ? (
            <span className="text-crit-fg">Could not load drift</span>
          ) : mine.length === 0 ? (
            <Badge tone="ok">In sync</Badge>
          ) : (
            <div>
              <Badge tone="warn">Drifted</Badge>
              <ul className="mt-1.5 text-[12px] text-text-mid space-y-0.5">
                {mine.map((f) => (
                  <li key={`${f.field}-${f.certificateId}`}>{f.field}: expected {JSON.stringify(f.expected)}</li>
                ))}
              </ul>
            </div>
          )}
        </dd>
      </dl>
    </Card>
  );
}
