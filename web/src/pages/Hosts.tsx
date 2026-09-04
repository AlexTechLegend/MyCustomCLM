import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { credentialsApi, hostsApi } from '@/lib/api';
import type { AgentStatus, Host, HostPlatform } from '@/types/automation';

const EMPTY: Partial<Host> = {
  name: '',
  hostname: '',
  address: '',
  platform: 'windows',
  environment: '',
  owner: '',
  credentialId: null,
  notes: '',
  tags: [],
};

export function Hosts() {
  const qc = useQueryClient();
  const toast = useToast();
  const hosts = useQuery({ queryKey: ['hosts'], queryFn: hostsApi.list });
  const creds = useQuery({ queryKey: ['credentials'], queryFn: credentialsApi.list });
  const [edit, setEdit] = useState<Partial<Host> | null>(null);
  const [tagInput, setTagInput] = useState('');

  const save = useMutation({
    mutationFn: () => (edit?.id ? hostsApi.update(edit.id, edit) : hostsApi.create(edit ?? {})),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hosts'] });
      toast.success(edit?.id ? 'Host saved' : 'Host created');
      setEdit(null);
    },
    onError: (e) => toast.error('Could not save host', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => hostsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hosts'] });
      toast.success('Host deleted');
      setEdit(null);
    },
    onError: (e) => toast.error('Could not delete host', e),
  });

  return (
    <>
      <PageHeader
        title="Hosts"
        description="Machines Vigil deploys to. Link a credential if a step needs one; the secret never comes back."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setEdit({ ...EMPTY }); setTagInput(''); }}>
            New host
          </Button>
        }
      />
      {hosts.isLoading ? (
        <Loading />
      ) : hosts.error ? (
        <ErrorBox error={hosts.error} />
      ) : !hosts.data?.length ? (
        <Card padded={false}>
          <EmptyState icon={<Server className="size-5" />} title="No hosts yet" description="Add the servers that receive renewed certificates." action={<Button variant="primary" onClick={() => setEdit({ ...EMPTY })}>Add a host</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hosts.data.map((h) => (
            <button key={h.id} type="button" onClick={() => { setEdit(h); setTagInput((h.tags ?? []).join(', ')); }} className="card p-5 text-left hover:border-line-strong transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text">{h.name}</div>
                  <div className="text-[13px] text-text-soft mt-0.5">{h.hostname || h.address || '—'}</div>
                </div>
                <Badge tone={h.agentStatus === 'online' ? 'ok' : h.agentStatus === 'offline' ? 'crit' : 'neutral'}>{h.agentStatus}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] text-text-soft">
                <span>{h.platform}</span>
                {h.environment && <span>· {h.environment}</span>}
                {h.certificateIds?.length ? <span>· {h.certificateIds.length} certs</span> : null}
              </div>
              {(h.tags ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {h.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit host' : 'New host'}
        footer={
          <>
            {edit?.id && (
              <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-3.5" />} onClick={() => edit.id && remove.mutate(edit.id)} loading={remove.isPending}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Name" required><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hostname"><Input value={edit.hostname ?? ''} onChange={(e) => setEdit({ ...edit, hostname: e.target.value })} /></Field>
              <Field label="Address"><Input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Platform">
                <Select value={edit.platform ?? 'other'} onChange={(e) => setEdit({ ...edit, platform: e.target.value as HostPlatform })}>
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Environment"><Input value={edit.environment ?? ''} onChange={(e) => setEdit({ ...edit, environment: e.target.value })} /></Field>
            </div>
            <Field label="Owner"><Input value={edit.owner ?? ''} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} /></Field>
            <Field label="Credential">
              <Select value={edit.credentialId ?? ''} onChange={(e) => setEdit({ ...edit, credentialId: e.target.value || null })}>
                <option value="">None</option>
                {(creds.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Agent status">
              <Select value={edit.agentStatus ?? 'unknown'} onChange={(e) => setEdit({ ...edit, agentStatus: e.target.value as AgentStatus })}>
                <option value="unknown">Unknown</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
            <Field label="Tags" hint="Comma-separated">
              <Input value={tagInput} onChange={(e) => { setTagInput(e.target.value); setEdit({ ...edit, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }); }} />
            </Field>
            <Field label="Notes"><Textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            {!!edit.certificateIds?.length && (
              <p className="text-[13px] text-text-soft">
                Linked certificates:{' '}
                {edit.certificateIds.map((id) => (
                  <Link key={id} to={`/certificates/${id}`} className="text-brand-600 hover:underline mr-2">{id.slice(0, 8)}…</Link>
                ))}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
