import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, KeyRound, Link2, Pencil, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, Checkbox, CodeBlock, ErrorBox, Field, Input, KeyValue, LifetimeBar, LinkButton, Loading, Modal, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { EVENT_META, FORMAT_LABELS, formatDate, formatDateTime, humanMinutes, relativeDays, SOURCE_LABEL, timeAgo } from '@/lib/format';
import type { OutputFormat } from '@/types';

export function CertificateDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const detail = useQuery({ queryKey: ['certificate', id], queryFn: () => api.certificate(id) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: api.profiles });
  const [edit, setEdit] = useState(false);
  const [download, setDownload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showText, setShowText] = useState(false);
  const text = useQuery({ queryKey: ['certificate-text', id], queryFn: () => api.certificateText(id), enabled: showText });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['certificate', id] });
    qc.invalidateQueries({ queryKey: ['certificates'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['profiles'] });
  };

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateCertificate>[1]) => api.updateCertificate(id, patch),
    onSuccess: () => {
      invalidate();
      setEdit(false);
    },
    onError: (e) => toast.error('Could not save', e),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteCertificate(id),
    onSuccess: () => {
      toast.success('Certificate deleted');
      invalidate();
      nav('/certificates');
    },
    onError: (e) => toast.error('Could not delete', e),
  });

  if (detail.isLoading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox error={detail.error} />;
  const { certificate: c, chain, renewals, events, pem } = detail.data;

  const toggleProfile = (pid: string, on: boolean) => {
    const next = on ? [...c.profileIds, pid] : c.profileIds.filter((x) => x !== pid);
    update.mutate({ profileIds: next });
  };

  return (
    <>
      <div className="mb-2">
        <Link to="/certificates" className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> Certificates
        </Link>
      </div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3 flex-wrap">
            {c.name}
            <StatusBadge status={c.status} days={c.daysRemaining} />
          </span>
        }
        description={
          <>
            {SOURCE_LABEL[c.source]} · issued by {c.issuerCommonName} · renewed {c.renewalCount}× · {c.hasKey ? 'private key in vault' : 'no private key'}
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>
            <Button icon={<Download className="size-4" />} onClick={() => setDownload(true)}>Download</Button>
            <LinkButton to={`/certificates/${c.id}/renew`} variant="primary" icon={<RefreshCw className="size-4" />}>Renew</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Validity" />
            <div className="flex items-end justify-between gap-6 mb-3">
              <div>
                <div className="text-[12px] text-ink-500">Not before</div>
                <div className="text-sm text-ink-900 tnum">{formatDateTime(c.notBefore)}</div>
              </div>
              <div className="text-center">
                <div className={`text-[28px] font-semibold tracking-tight tnum ${c.daysRemaining <= 7 ? 'text-crit-600' : c.daysRemaining <= 30 ? 'text-warn-600' : 'text-ink-950'}`}>
                  {c.daysRemaining < 0 ? `${Math.abs(c.daysRemaining)} d` : `${c.daysRemaining} d`}
                </div>
                <div className="text-[12px] text-ink-500">{c.daysRemaining < 0 ? 'since expiry' : 'remaining'}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-ink-500">Not after</div>
                <div className="text-sm text-ink-900 tnum">{formatDateTime(c.notAfter)}</div>
              </div>
            </div>
            <LifetimeBar used={c.lifetimeUsed} status={c.status} className="h-2" />
            <div className="text-[12px] text-ink-500 mt-2 tnum">{Math.round(c.lifetimeUsed * 100)}% of lifetime consumed · expires {relativeDays(c.daysRemaining)}</div>
          </Card>

          <Card>
            <CardHeader title="Certificate" />
            <KeyValue
              items={[
                { label: 'Common name', value: c.commonName },
                { label: 'Subject', value: c.subject },
                { label: 'Issuer', value: c.issuer },
                {
                  label: 'Subject alt names',
                  value: c.sans.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {c.sans.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-ink-400">None</span>
                  ),
                },
                { label: 'Serial', value: c.serial, mono: true },
                { label: 'Public key', value: `${c.keyAlgo} ${c.keyBits ?? ''}`.trim() },
                { label: 'Signature', value: c.sigAlgo || '—' },
                { label: 'SHA-256', value: c.fingerprintSha256, mono: true },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Chain" description={chain.length ? `${chain.length} issuer certificate${chain.length === 1 ? '' : 's'} stored with this certificate` : 'No issuer certificates were provided. Upload the chain with the next renewal to include it in outputs.'} />
            <ol className="space-y-2">
              <li className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3">
                <ShieldCheck className="size-4 text-brand-700" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-950 truncate">{c.commonName}</div>
                  <div className="text-[12px] text-ink-500">Leaf · expires {formatDate(c.notAfter)}</div>
                </div>
                <Badge tone="brand">This certificate</Badge>
              </li>
              {chain.map((x, i) => (
                <li key={x.fingerprintSha256} className="flex items-center gap-3 rounded-xl border border-ink-200 px-4 py-3 ml-6">
                  <Link2 className="size-4 text-ink-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900 truncate">{x.commonName}</div>
                    <div className="text-[12px] text-ink-500">{x.isSelfSigned ? 'Root CA' : 'Intermediate CA'} · expires {formatDate(x.notAfter)}</div>
                  </div>
                  <span className="text-[11px] text-ink-400 tnum">#{i + 1}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Renewal history" description="Each renewal replaces the material in place; identity, profiles and tags are kept." />
            {renewals.length === 0 ? (
              <p className="text-[13px] text-ink-500">Not renewed through Vigil yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100 -mx-6">
                {renewals.map((r) => (
                  <li key={r.id} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900">
                        {r.method === 'internal-ca' ? 'Internal CA' : r.method === 'self-signed' ? 'Self-signed' : 'External CA (CSR)'}
                        <span className="text-ink-400"> · </span>
                        <span className="text-ink-600">{r.keyMode === 'reuse' ? 'key reused' : `new ${r.keyMode.toUpperCase().replace('-', ' ')}`}</span>
                      </div>
                      <div className="text-[12px] text-ink-500 tnum">
                        {formatDateTime(r.createdAt)}
                        {r.previousNotAfter && r.newNotAfter && <> · {formatDate(r.previousNotAfter)} → {formatDate(r.newNotAfter)}</>}
                        {r.outputs.length > 0 && <> · {r.outputs.length} file{r.outputs.length === 1 ? '' : 's'}</>}
                      </div>
                    </div>
                    <Badge tone={r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'crit' : 'warn'}>{r.status === 'pending-csr' ? 'Awaiting signed cert' : r.status}</Badge>
                    <LinkButton to={`/certificates/${c.id}/renew?renewal=${r.id}`} size="sm" variant="ghost">View</LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <button type="button" className="flex items-center justify-between w-full text-left" onClick={() => setShowText((s) => !s)}>
              <div>
                <h3 className="text-[15px] font-semibold text-ink-950">OpenSSL view</h3>
                <p className="text-[13px] text-ink-500 mt-0.5">openssl x509 -noout -text, straight from the vault copy.</p>
              </div>
              <ChevronDown className={`size-4 text-ink-400 transition-transform ${showText ? 'rotate-180' : ''}`} />
            </button>
            {showText && (
              <div className="mt-4 space-y-3">
                {text.isLoading ? <Loading /> : <CodeBlock className="max-h-[420px] overflow-y-auto">{text.data ?? ''}</CodeBlock>}
                <CodeBlock className="max-h-[220px] overflow-y-auto">{pem}</CodeBlock>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Reference profiles" description="Outputs rendered and deployed on every renewal." action={<LinkButton to="/profiles/new" size="sm" variant="ghost">New</LinkButton>} />
            {profiles.data?.length === 0 ? (
              <p className="text-[13px] text-ink-500">
                No profiles yet. <Link to="/profiles/new" className="text-brand-700 font-medium">Create one</Link> from your reference files.
              </p>
            ) : (
              <ul className="space-y-3">
                {profiles.data?.map((p) => (
                  <li key={p.id}>
                    <Checkbox
                      checked={c.profileIds.includes(p.id)}
                      onChange={(on) => toggleProfile(p.id, on)}
                      label={p.name}
                      description={`${p.outputs.length} output${p.outputs.length === 1 ? '' : 's'}${p.destinationPath ? ` → ${p.destinationPath}` : ''}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Tags & notes" action={<Button size="sm" variant="ghost" onClick={() => setEdit(true)}>Edit</Button>} />
            <div className="flex flex-wrap gap-1.5 mb-3">{c.tags.length ? c.tags.map((t) => <Badge key={t}>{t}</Badge>) : <span className="text-[13px] text-ink-400">No tags</span>}</div>
            <p className="text-[13px] text-ink-700 whitespace-pre-wrap">{c.notes || <span className="text-ink-400">No notes</span>}</p>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            {events.length === 0 ? (
              <p className="text-[13px] text-ink-500">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {events.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <span className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${EVENT_META[e.type]?.className}`}>{EVENT_META[e.type]?.label}</span>
                    <div className="min-w-0">
                      <div className="text-[13px] text-ink-900">{e.title}</div>
                      <div className="text-[11px] text-ink-500 tnum">{timeAgo(e.createdAt)} · saved {humanMinutes(e.minutesSaved)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Danger zone" />
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete certificate</Button>
            <p className="text-[12px] text-ink-500 mt-2">Removes the record, vault material and renewal history. Files already deployed are left untouched.</p>
          </Card>
        </div>
      </div>

      {edit && (
        <EditModal open onClose={() => setEdit(false)} initial={{ name: c.name, tags: c.tags.join(', '), notes: c.notes }} saving={update.isPending} onSave={(v) => update.mutate({ name: v.name, tags: v.tags.split(',').map((s) => s.trim()).filter(Boolean), notes: v.notes })} />
      )}
      {download && <DownloadModal open onClose={() => setDownload(false)} id={c.id} hasKey={c.hasKey} chainCount={c.chainCount} />}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${c.name}?`}
        description="This permanently removes the certificate, its private key from the vault and its renewal history."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">Files already written to destination paths are not affected.</p>
      </Modal>
    </>
  );
}

function EditModal({ open, onClose, initial, onSave, saving }: { open: boolean; onClose: () => void; initial: { name: string; tags: string; notes: string }; onSave: (v: { name: string; tags: string; notes: string }) => void; saving: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <Modal open={open} onClose={onClose} title="Edit certificate" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => onSave(v)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Display name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder="web, prod, iis" /></Field>
        <Field label="Notes"><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function DownloadModal({ open, onClose, id, hasKey, chainCount }: { open: boolean; onClose: () => void; id: string; hasKey: boolean; chainCount: number }) {
  const [format, setFormat] = useState<OutputFormat>('pem-fullchain');
  const [password, setPassword] = useState('');
  const [includeRoot, setIncludeRoot] = useState(false);
  const [keyEncoding, setKeyEncoding] = useState<'pkcs8' | 'pkcs1'>('pkcs8');
  const [lineEnding, setLineEnding] = useState<'lf' | 'crlf'>('lf');
  const qc = useQueryClient();
  const needsKey = ['pem-bundle', 'pkcs12', 'pem-key', 'pem-key-encrypted', 'der-key'].includes(format);
  const needsPassword = format === 'pkcs12' || format === 'pem-key-encrypted';
  const url = api.downloadUrl(id, { format, password: needsPassword ? password : undefined, includeRoot: includeRoot ? 'true' : undefined, keyEncoding, lineEnding });
  return (
    <Modal open={open} onClose={onClose} title="Download in any format" description="Converted on demand with OpenSSL. This counts as an automated conversion." footer={<><Button variant="ghost" onClick={onClose}>Close</Button><a href={url} onClick={() => setTimeout(() => qc.invalidateQueries({ queryKey: ['dashboard'] }), 800)} className={`inline-flex items-center gap-2 h-9.5 px-4 rounded-xl text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 ${(needsKey && !hasKey) || (needsPassword && !password) ? 'pointer-events-none opacity-50' : ''}`}><Download className="size-4" /> Download</a></>}>
      <div className="space-y-4">
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>
            {(Object.keys(FORMAT_LABELS) as OutputFormat[]).map((f) => (
              <option key={f} value={f} disabled={['pem-bundle', 'pkcs12', 'pem-key', 'pem-key-encrypted', 'der-key'].includes(f) && !hasKey}>{FORMAT_LABELS[f]}</option>
            ))}
          </Select>
        </Field>
        {needsPassword && (
          <Field label="Password" required hint={format === 'pkcs12' ? 'Protects the PFX. Required by Windows import.' : 'AES-256 encrypted PKCS#8.'}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        {(format === 'pem-fullchain' || format === 'pem-chain' || format.startsWith('pkcs7') || format === 'pem-bundle') && (
          <Checkbox checked={includeRoot} onChange={setIncludeRoot} label="Include root CA" description={chainCount ? 'Append the self-signed root at the end of the chain.' : 'No chain stored for this certificate.'} disabled={!chainCount} />
        )}
        {(format === 'pem-key' || format === 'pem-key-encrypted' || format === 'pem-bundle') && (
          <Field label="Key encoding">
            <Select value={keyEncoding} onChange={(e) => setKeyEncoding(e.target.value as 'pkcs8' | 'pkcs1')}>
              <option value="pkcs8">PKCS#8 — BEGIN PRIVATE KEY (modern)</option>
              <option value="pkcs1">PKCS#1 / SEC1 — BEGIN RSA/EC PRIVATE KEY (traditional)</option>
            </Select>
          </Field>
        )}
        {(format.startsWith('pem-') || format === 'pkcs7-pem') && (
          <Field label="Line endings">
            <Select value={lineEnding} onChange={(e) => setLineEnding(e.target.value as 'lf' | 'crlf')}>
              <option value="lf">LF (Linux, macOS)</option>
              <option value="crlf">CRLF (Windows)</option>
            </Select>
          </Field>
        )}
        {needsKey && !hasKey && <p className="text-[13px] text-crit-600 flex items-center gap-1.5"><KeyRound className="size-3.5" /> This certificate has no private key in the vault.</p>}
      </div>
    </Modal>
  );
}
