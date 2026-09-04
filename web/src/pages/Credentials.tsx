import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { credentialsApi, hostsApi, pipelinesApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { CredentialKind, CredentialMeta } from '@/types/automation';

const KINDS: CredentialKind[] = ['password', 'service-account', 'api-token', 'ssh-key', 'pfx-password'];

export function Credentials() {
  const qc = useQueryClient();
  const toast = useToast();
  const creds = useQuery({ queryKey: ['credentials'], queryFn: credentialsApi.list });
  const hosts = useQuery({ queryKey: ['hosts'], queryFn: hostsApi.list });
  const pipes = useQuery({ queryKey: ['pipelines'], queryFn: pipelinesApi.list });
  const [edit, setEdit] = useState<(Partial<CredentialMeta> & { secret?: string }) | null>(null);

  const usage = useMemo(() => {
    const map = new Map<string, { hosts: number; pipelines: number }>();
    for (const c of creds.data ?? []) map.set(c.id, { hosts: 0, pipelines: 0 });
    for (const h of hosts.data ?? []) {
      if (h.credentialId && map.has(h.credentialId)) map.get(h.credentialId)!.hosts += 1;
    }
    for (const p of pipes.data ?? []) {
      const ids = new Set(
        p.steps.flatMap((s) => {
          const v = s.config.credentialId;
          return typeof v === 'string' && v ? [v] : [];
        }),
      );
      for (const id of ids) {
        if (!map.has(id)) map.set(id, { hosts: 0, pipelines: 0 });
        map.get(id)!.pipelines += 1;
      }
    }
    return map;
  }, [creds.data, hosts.data, pipes.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error('Nothing to save');
      const body = { name: edit.name, kind: edit.kind, username: edit.username, description: edit.description, secret: edit.secret };
      return edit.id ? credentialsApi.update(edit.id, body) : credentialsApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] });
      toast.success(edit?.id ? 'Credential updated' : 'Credential created');
      setEdit(null);
    },
    onError: (e) => toast.error('Could not save credential', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => credentialsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] });
      toast.success('Credential deleted');
      setEdit(null);
    },
    onError: (e) => toast.error('Could not delete credential', e),
  });

  return (
    <>
      <PageHeader
        title="Credentials"
        description="Secrets never come back from the server. Create or replace — never reveal."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', kind: 'password', username: '', description: '', secret: '' })}>New credential</Button>}
      />
      {creds.isLoading ? (
        <Loading />
      ) : creds.error ? (
        <ErrorBox error={creds.error} />
      ) : !creds.data?.length ? (
        <Card padded={false}>
          <EmptyState icon={<KeyRound className="size-5" />} title="No credentials" description="Store a password or token so hosts and run-command steps can use it." />
        </Card>
      ) : (
        <div className="space-y-3">
          {creds.data.map((c) => {
            const u = usage.get(c.id) ?? { hosts: 0, pipelines: 0 };
            return (
              <button key={c.id} type="button" onClick={() => setEdit({ ...c, secret: '' })} className="card p-5 w-full text-left hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text">{c.name}</div>
                    <div className="text-[13px] text-text-soft">{c.kind}{c.username ? ` · ${c.username}` : ''}</div>
                  </div>
                  <Badge>{c.hasSecret ? 'Secret stored' : 'No secret'}</Badge>
                </div>
                <p className="mt-2 text-[13px] text-text-mid">
                  Used by {u.hosts} host{u.hosts === 1 ? '' : 's'}, {u.pipelines} pipeline{u.pipelines === 1 ? '' : 's'}
                </p>
                <p className="text-[12px] text-text-soft mt-1">Last rotation {formatDateTime(c.updatedAt)}</p>
              </button>
            );
          })}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Replace credential' : 'New credential'}
        description="The existing secret is never shown. Leave the secret field blank to keep the current value."
        footer={
          <>
            {edit?.id && <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-3.5" />} onClick={() => edit.id && remove.mutate(edit.id)}>Delete</Button>}
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!edit?.id && !edit?.secret?.trim()}>Save</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Name"><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Kind">
              <Select value={edit.kind ?? 'password'} onChange={(e) => setEdit({ ...edit, kind: e.target.value as CredentialKind })}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="Username"><Input value={edit.username ?? ''} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            <Field label={edit.id ? 'New secret (optional)' : 'Secret'} required={!edit.id}>
              <Input type="password" value={edit.secret ?? ''} onChange={(e) => setEdit({ ...edit, secret: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Description"><Textarea value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
