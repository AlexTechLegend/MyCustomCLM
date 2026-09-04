import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Button, Card, CardHeader, Checkbox, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea } from '@/components/ui';
import { api, blueprintsApi, hostsApi, pipelinesApi, windowsApi } from '@/lib/api';
import type { InstantiateBody } from '@/types/automation';

export function Onboard() {
  const { blueprintId = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const blueprints = useQuery({ queryKey: ['blueprints'], queryFn: blueprintsApi.list });
  const hosts = useQuery({ queryKey: ['hosts'], queryFn: hostsApi.list });
  const identities = useQuery({ queryKey: ['identities'], queryFn: api.identities });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: pipelinesApi.list });
  const windows = useQuery({ queryKey: ['windows'], queryFn: windowsApi.list });

  const [id, setId] = useState(blueprintId);
  const [cn, setCn] = useState('');
  const [sans, setSans] = useState('');
  const [dest, setDest] = useState('');
  const [mode, setMode] = useState<InstantiateBody['mode'] | ''>('');
  const [hostIds, setHostIds] = useState<string[]>([]);

  const blueprint = (blueprints.data ?? []).find((b) => b.id === (id || blueprintId));

  const summary = useMemo(() => {
    if (!blueprint) return [];
    const ident = identities.data?.find((t) => t.id === blueprint.identityTemplateId);
    const pipe = pipelines.data?.find((p) => p.id === blueprint.pipelineId);
    const win = windows.data?.find((w) => w.id === blueprint.maintenanceWindowId);
    const profs = (profiles.data ?? []).filter((p) => blueprint.profileIds.includes(p.id));
    return [
      `Issue as ${mode || blueprint.issuanceMethod} with key ${blueprint.keyMode} for ${blueprint.validityDays} days.`,
      ident ? `Subject defaults from “${ident.name}”.` : 'No identity template — CN/SANs only.',
      profs.length ? `Render ${profs.map((p) => p.name).join(', ')}.` : 'No output profiles linked.',
      pipe ? `Then run pipeline “${pipe.name}” (${pipe.steps.length} steps).` : 'No pipeline — certificate is stored only.',
      win ? `Next renewals land in “${win.name}” (Nth window = ${blueprint.renewalPolicy.nthWindowBeforeExpiry}).` : 'No maintenance window.',
      hostIds.length ? `Bind to ${hostIds.length} host(s).` : 'No hosts selected.',
      dest ? `Destination override: ${dest}` : 'Destination from the profile.',
      blueprint.renewalPolicy.requiresApproval ? 'An approval gate will pause deploy.' : 'No approval gate.',
    ];
  }, [blueprint, identities.data, pipelines.data, windows.data, profiles.data, hostIds, dest, mode]);

  const go = useMutation({
    mutationFn: () => {
      if (!blueprint) throw new Error('Pick a blueprint');
      return blueprintsApi.instantiate(blueprint.id, {
        commonName: cn.trim(),
        sans: sans.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        hostIds,
        destinationPath: dest || undefined,
        mode: mode || undefined,
      });
    },
    onSuccess: (cert) => {
      toast.success('Certificate created', cert.commonName);
      nav(`/certificates/${cert.id}`);
    },
    onError: (e) => toast.error('Could not instantiate', e),
  });

  if (blueprints.isLoading) return <Loading />;
  if (blueprints.error) return <ErrorBox error={blueprints.error} />;

  return (
    <>
      <PageHeader title="Onboard a server" description="Answer only what varies. Everything else comes from the blueprint." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="What varies" />
          <div className="space-y-3">
            <Field label="Blueprint" required>
              <Select value={id || blueprintId} onChange={(e) => setId(e.target.value)}>
                <option value="">Select…</option>
                {(blueprints.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Common name" required><Input value={cn} onChange={(e) => setCn(e.target.value)} placeholder="app.example.com" autoFocus /></Field>
            <Field label="SANs" hint="Comma or whitespace separated"><Textarea value={sans} onChange={(e) => setSans(e.target.value)} /></Field>
            <Field label="Destination path"><Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Optional override" /></Field>
            <Field label="Issuance mode">
              <Select value={mode} onChange={(e) => setMode(e.target.value as InstantiateBody['mode'] | '')}>
                <option value="">Inherit from blueprint</option>
                <option value="internal-ca">Internal CA</option>
                <option value="self-signed">Self-signed</option>
                <option value="csr">CSR only</option>
              </Select>
            </Field>
            <div>
              <div className="text-[13px] font-medium text-text mb-1.5">Hosts</div>
              <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                {(hosts.data ?? []).map((h) => (
                  <Checkbox key={h.id} checked={hostIds.includes(h.id)} onChange={(on) => setHostIds(on ? [...hostIds, h.id] : hostIds.filter((x) => x !== h.id))} label={h.name} description={h.hostname || h.address} />
                ))}
                {!hosts.data?.length && <p className="text-[13px] text-text-soft">No hosts yet. <Link to="/hosts" className="text-brand-600">Add one</Link>.</p>}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="What will happen" />
          {!blueprint ? (
            <p className="text-[13px] text-text-soft">Pick a blueprint to see the plan.</p>
          ) : (
            <ul className="space-y-2 text-sm text-text-mid">
              {summary.map((line) => <li key={line}>· {line}</li>)}
            </ul>
          )}
          <div className="mt-6">
            <Button variant="primary" disabled={!blueprint || !cn.trim()} loading={go.isPending} onClick={() => go.mutate()}>
              Create certificate
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
