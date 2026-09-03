import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import type { IdentityTemplate, KeyMode } from '@/types';

const EMPTY: Omit<IdentityTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  country: '',
  state: '',
  locality: '',
  organisation: '',
  organisationalUnit: '',
  email: '',
  defaultKeyMode: 'rsa-2048',
  defaultValidityDays: 397,
};

function dnLine(t: IdentityTemplate) {
  return [
    t.country && `C=${t.country}`,
    t.state && `ST=${t.state}`,
    t.locality && `L=${t.locality}`,
    t.organisation && `O=${t.organisation}`,
    t.organisationalUnit && `OU=${t.organisationalUnit}`,
    t.email && `emailAddress=${t.email}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
}

export function Identities() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['identities'], queryFn: api.identities });
  const [editing, setEditing] = useState<Partial<IdentityTemplate> | null>(null);

  const save = useMutation({
    mutationFn: () => (editing?.id ? api.updateIdentity(editing.id, editing) : api.createIdentity(editing ?? {})),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identities'] });
      toast.success(editing?.id ? 'Identity saved' : 'Identity created');
      setEditing(null);
    },
    onError: (e) => toast.error('Could not save identity', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteIdentity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identities'] });
      toast.success('Identity deleted');
      setEditing(null);
    },
    onError: (e) => toast.error('Could not delete identity', e),
  });

  return (
    <>
      <PageHeader
        title="Identity templates"
        description="Reusable organisation labels, distinguished name fields, and key defaults. Apply one when you renew so every certificate is issued the same way."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ ...EMPTY })}>
            New identity
          </Button>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !q.data?.length ? (
        <Card padded={false}>
          <EmptyState
            icon={<Fingerprint className="size-5" />}
            title="No identity templates yet"
            description="Capture C, ST, L, O, OU and the default key type once. On renew you apply the template, then adjust CN and SANs."
            action={
              <Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>
                Create your first identity
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {q.data.map((t) => (
            <button key={t.id} type="button" onClick={() => setEditing(t)} className="card p-5 text-left hover:border-brand-300/80 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-ink-950 truncate">{t.name}</h3>
                <Badge tone="brand">{t.defaultKeyMode.replace('-', ' ').toUpperCase()}</Badge>
              </div>
              <p className="text-[13px] text-ink-500 mt-1 line-clamp-2">{t.description || 'No description'}</p>
              <div className="mt-4 font-mono text-[12px] text-ink-700 leading-5">{dnLine(t) || 'No DN fields set'}</div>
              <div className="mt-3 text-[12px] text-ink-500 tnum">{t.defaultValidityDays} day default validity</div>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit identity' : 'New identity'}
        description="These values become the subject defaults when the template is applied on a renewal."
        width="max-w-2xl"
        footer={
          editing && (
            <>
              {editing.id && (
                <Button variant="danger" icon={<Trash2 className="size-4" />} className="mr-auto" loading={remove.isPending} onClick={() => remove.mutate(editing.id!)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={save.isPending} disabled={!editing.name?.trim()} onClick={() => save.mutate()}>
                {editing.id ? 'Save identity' : 'Create identity'}
              </Button>
            </>
          )
        }
      >
        {editing && <IdentityForm value={editing} onChange={setEditing} />}
      </Modal>
    </>
  );
}

function IdentityForm({ value, onChange }: { value: Partial<IdentityTemplate>; onChange: (v: Partial<IdentityTemplate>) => void }) {
  const set = <K extends keyof IdentityTemplate>(key: K, v: IdentityTemplate[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" required>
          <Input value={value.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Contoso Ltd — Production" />
        </Field>
        <Field label="Default key">
          <Select value={value.defaultKeyMode ?? 'rsa-2048'} onChange={(e) => set('defaultKeyMode', e.target.value as KeyMode)}>
            <option value="reuse">Reuse existing key</option>
            <option value="rsa-2048">RSA 2048</option>
            <option value="rsa-3072">RSA 3072</option>
            <option value="rsa-4096">RSA 4096</option>
            <option value="ec-p256">EC P-256</option>
            <option value="ec-p384">EC P-384</option>
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={value.description ?? ''} onChange={(e) => set('description', e.target.value)} className="min-h-16" placeholder="When to use this identity." />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Country (C)">
          <Input value={value.country ?? ''} onChange={(e) => set('country', e.target.value)} placeholder="GB" maxLength={2} className="uppercase" />
        </Field>
        <Field label="State / province (ST)">
          <Input value={value.state ?? ''} onChange={(e) => set('state', e.target.value)} placeholder="Greater London" />
        </Field>
        <Field label="Locality (L)">
          <Input value={value.locality ?? ''} onChange={(e) => set('locality', e.target.value)} placeholder="London" />
        </Field>
        <Field label="Organisation (O)">
          <Input value={value.organisation ?? ''} onChange={(e) => set('organisation', e.target.value)} placeholder="Contoso Ltd" />
        </Field>
        <Field label="Organisational unit (OU)">
          <Input value={value.organisationalUnit ?? ''} onChange={(e) => set('organisationalUnit', e.target.value)} placeholder="Infrastructure" />
        </Field>
        <Field label="Email">
          <Input type="email" value={value.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="pki@contoso.com" />
        </Field>
        <Field label="Default validity (days)">
          <Input type="number" min={1} max={3650} value={value.defaultValidityDays ?? 397} onChange={(e) => set('defaultValidityDays', Number(e.target.value))} className="tnum" />
        </Field>
      </div>
    </div>
  );
}
