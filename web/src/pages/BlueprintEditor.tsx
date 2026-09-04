import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb';
import { useToast } from '@/components/Toast';
import { Button, Card, CardHeader, Checkbox, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea } from '@/components/ui';
import { api, blueprintsApi, pipelinesApi, windowsApi } from '@/lib/api';
import type { Blueprint, RenewalPolicy } from '@/types/automation';

const EMPTY: Partial<Blueprint> = {
  name: '',
  description: '',
  identityTemplateId: null,
  profileIds: [],
  issuanceMethod: 'internal-ca',
  caTemplate: '',
  keyMode: 'rsa-2048',
  validityDays: 397,
  pipelineId: null,
  renewalPolicy: { nthWindowBeforeExpiry: 1, requiresApproval: false, leadDays: 30 },
  maintenanceWindowId: null,
  notificationTargets: [],
};

export function BlueprintEditor() {
  const { id = '' } = useParams();
  const isNew = id === 'new' || !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ['blueprint', id], queryFn: () => blueprintsApi.get(id), enabled: !isNew });
  const identities = useQuery({ queryKey: ['identities'], queryFn: api.identities });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: pipelinesApi.list });
  const windows = useQuery({ queryKey: ['windows'], queryFn: windowsApi.list });
  const [form, setForm] = useState<Partial<Blueprint>>(EMPTY);

  useEffect(() => {
    if (existing.data) setForm(existing.data);
  }, [existing.data]);

  const policy: RenewalPolicy = form.renewalPolicy ?? { nthWindowBeforeExpiry: 1, requiresApproval: false };

  const save = useMutation({
    mutationFn: () => (isNew ? blueprintsApi.create(form) : blueprintsApi.update(id, form)),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['blueprints'] });
      toast.success('Blueprint saved');
      if (isNew) nav(`/blueprints/${b.id}`, { replace: true });
    },
    onError: (e) => toast.error('Could not save blueprint', e),
  });

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} />;

  const toggleProfile = (pid: string) => {
    const cur = form.profileIds ?? [];
    setForm({ ...form, profileIds: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] });
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Blueprints', to: '/blueprints' }, { label: isNew ? 'New' : form.name || 'Edit' }]} />
      <PageHeader
        title={isNew ? 'New blueprint' : form.name || 'Blueprint'}
        description="Everything a certificate inherits when you onboard a server."
        actions={
          <div className="flex gap-2">
            {!isNew && <Link to={`/onboard/${id}`}><Button>Onboard from this</Button></Link>}
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Identity" />
          <div className="space-y-3">
            <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Description"><Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Identity template">
              <Select value={form.identityTemplateId ?? ''} onChange={(e) => setForm({ ...form, identityTemplateId: e.target.value || null })}>
                <option value="">None</option>
                {(identities.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Issuance">
              <Select value={form.issuanceMethod ?? 'internal-ca'} onChange={(e) => setForm({ ...form, issuanceMethod: e.target.value as Blueprint['issuanceMethod'] })}>
                <option value="internal-ca">Internal CA</option>
                <option value="self-signed">Self-signed</option>
                <option value="csr">CSR only</option>
              </Select>
            </Field>
            <Field label="Key mode"><Input value={form.keyMode ?? ''} onChange={(e) => setForm({ ...form, keyMode: e.target.value })} /></Field>
            <Field label="Validity (days)"><Input type="number" value={form.validityDays ?? 397} onChange={(e) => setForm({ ...form, validityDays: Number(e.target.value) || 397 })} /></Field>
            <Field label="CA template"><Input value={form.caTemplate ?? ''} onChange={(e) => setForm({ ...form, caTemplate: e.target.value })} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Automation" />
          <div className="space-y-3">
            <Field label="Pipeline">
              <Select value={form.pipelineId ?? ''} onChange={(e) => setForm({ ...form, pipelineId: e.target.value || null })}>
                <option value="">None</option>
                {(pipelines.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Maintenance window">
              <Select value={form.maintenanceWindowId ?? ''} onChange={(e) => setForm({ ...form, maintenanceWindowId: e.target.value || null })}>
                <option value="">None</option>
                {(windows.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Renew on the Nth window before expiry">
              <Input type="number" min={1} value={policy.nthWindowBeforeExpiry} onChange={(e) => setForm({ ...form, renewalPolicy: { ...policy, nthWindowBeforeExpiry: Number(e.target.value) || 1 } })} />
            </Field>
            <Checkbox
              checked={policy.requiresApproval}
              onChange={(v) => setForm({ ...form, renewalPolicy: { ...policy, requiresApproval: v } })}
              label="Require approval before deploy"
            />
            <div>
              <div className="text-[13px] font-medium text-text mb-1.5">Output profiles</div>
              <div className="space-y-2">
                {(profiles.data ?? []).map((p) => (
                  <Checkbox key={p.id} checked={(form.profileIds ?? []).includes(p.id)} onChange={() => toggleProfile(p.id)} label={p.name} description={p.description} />
                ))}
                {!profiles.data?.length && <p className="text-[13px] text-text-soft">No profiles yet.</p>}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
