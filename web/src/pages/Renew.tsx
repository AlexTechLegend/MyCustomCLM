import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, ChevronRight, Download, FileSignature, FolderOutput, Landmark, RefreshCw, Terminal, Timer, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileDrop } from '@/components/FileDrop';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, Checkbox, CodeBlock, CommandTrail, ErrorBox, Field, Input, LinkButton, Loading, PageHeader, RadioCard, Select, StatusBadge, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { bytes, FORMAT_SHORT, formatDate, formatNeedsKey, humanMinutes } from '@/lib/format';
import type { KeyMode, Renewal, RenewalMethod } from '@/types';

export function Renew() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const renewalId = params.get('renewal');
  const detail = useQuery({ queryKey: ['certificate', id], queryFn: () => api.certificate(id) });

  if (detail.isLoading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox error={detail.error} />;
  const c = detail.data.certificate;

  return (
    <>
      <div className="mb-2">
        <Link to={`/certificates/${c.id}`} className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> {c.name}
        </Link>
      </div>
      {renewalId ? <RenewalResult renewalId={renewalId} certId={c.id} /> : <RenewForm certId={c.id} certName={c.name} hasKey={c.hasKey} linkedProfileIds={c.profileIds} notAfter={c.notAfter} status={c.status} days={c.daysRemaining} />}
    </>
  );
}

function RenewForm({ certId, certName, hasKey, linkedProfileIds, notAfter, status, days }: { certId: string; certName: string; hasKey: boolean; linkedProfileIds: string[]; notAfter: string; status: Parameters<typeof StatusBadge>[0]['status']; days: number }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: api.profiles });
  const ca = useQuery({ queryKey: ['ca'], queryFn: api.ca });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  const [method, setMethod] = useState<RenewalMethod>('internal-ca');
  const [keyMode, setKeyMode] = useState<KeyMode>(hasKey ? 'reuse' : 'rsa-2048');
  const [validityDays, setValidityDays] = useState<number>(397);
  const [profileIds, setProfileIds] = useState<string[]>(linkedProfileIds);
  const [deploy, setDeploy] = useState(true);

  useEffect(() => {
    if (settings.data) setValidityDays(settings.data.defaultValidityDays);
  }, [settings.data]);
  useEffect(() => {
    if (ca.data && !ca.data.exists && method === 'internal-ca') setMethod('csr');
  }, [ca.data, method]);

  const start = useMutation({
    mutationFn: () => api.renew(certId, { method, keyMode, validityDays, profileIds, deploy }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['certificate', certId] });
      qc.invalidateQueries({ queryKey: ['certificates'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.status === 'completed') toast.success(`Renewed ${certName}`, `${r.outputs.length} file${r.outputs.length === 1 ? '' : 's'} rendered · ${humanMinutes(r.minutesSaved)} reclaimed`);
      nav(`/certificates/${certId}/renew?renewal=${r.id}`, { replace: true });
    },
  });

  const selected = (profiles.data ?? []).filter((p) => profileIds.includes(p.id));
  const destinations = [...new Set(selected.map((p) => p.destinationPath).filter(Boolean))];
  const fileCount = selected.reduce((n, p) => n + p.outputs.length, 0);
  const b = settings.data?.baselines;
  const estimate = b ? (method === 'csr' ? b.csr : 0) + b.renewal + b.conversion * fileCount + (deploy ? b.deployment * destinations.length : 0) : 0;

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            Renew {certName} <StatusBadge status={status} days={days} />
          </span>
        }
        description={`Currently valid until ${formatDate(notAfter)}. Subject and SANs are carried over unchanged.`}
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="1. Issuance method" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <RadioCard
                checked={method === 'internal-ca'}
                onChange={() => setMethod('internal-ca')}
                disabled={ca.data ? !ca.data.exists : false}
                icon={<Landmark className="size-5" />}
                title="Internal CA"
                description={ca.data?.exists ? `One click. Signed by ${ca.data.commonName}.` : 'No internal CA yet — create one in Settings.'}
              />
              <RadioCard checked={method === 'csr'} onChange={() => setMethod('csr')} icon={<Building2 className="size-5" />} title="External CA" description="Generate a CSR, get it signed by DigiCert, AD CS, etc., then upload the result." />
              <RadioCard checked={method === 'self-signed'} onChange={() => setMethod('self-signed')} icon={<FileSignature className="size-5" />} title="Self-signed" description="For labs and development. No trust chain." />
            </div>
          </Card>

          <Card>
            <CardHeader title="2. Key and validity" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Private key" hint={hasKey ? 'Reusing keeps existing pinning; a new key is best practice.' : 'No key in the vault — a new key will be generated.'}>
                <Select value={keyMode} onChange={(e) => setKeyMode(e.target.value as KeyMode)}>
                  <option value="reuse" disabled={!hasKey}>Reuse existing key</option>
                  <option value="rsa-2048">New RSA 2048</option>
                  <option value="rsa-3072">New RSA 3072</option>
                  <option value="rsa-4096">New RSA 4096</option>
                  <option value="ec-p256">New EC P-256</option>
                  <option value="ec-p384">New EC P-384</option>
                </Select>
              </Field>
              <Field label="Validity (days)" hint={method === 'csr' ? 'Ignored — the external CA decides validity.' : 'Public CAs cap at 397 days; internal CAs can go longer.'}>
                <Input type="number" min={1} max={3650} value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} disabled={method === 'csr'} className="tnum" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="3. Outputs" description="Reference profiles to render once the new certificate is issued." action={<LinkButton to="/profiles/new" size="sm" variant="ghost">New profile</LinkButton>} />
            {profiles.data?.length ? (
              <ul className="space-y-3">
                {profiles.data.map((p) => (
                  <li key={p.id}>
                    <Checkbox
                      checked={profileIds.includes(p.id)}
                      onChange={(on) => setProfileIds(on ? [...profileIds, p.id] : profileIds.filter((x) => x !== p.id))}
                      label={
                        <span className="inline-flex items-center gap-2">
                          {p.name}
                          {linkedProfileIds.includes(p.id) && <Badge tone="brand">Linked</Badge>}
                        </span>
                      }
                      description={
                        <span className="font-mono text-[12px]">
                          {p.outputs.map((o) => o.filename).join('  ·  ')}
                          {p.destinationPath && <span className="text-ink-400"> → {p.destinationPath}</span>}
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-500">No profiles yet — the renewed certificate will still be available for ad-hoc download in any format.</p>
            )}
            <div className="mt-5 pt-5 border-t border-ink-100">
              <Toggle
                checked={deploy}
                onChange={setDeploy}
                disabled={destinations.length === 0}
                label="Write files to destination paths"
                description={destinations.length ? destinations.join(' · ') : 'None of the selected profiles has a destination path.'}
              />
            </div>
          </Card>

          <ErrorBox error={start.error} />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="lg" loading={start.isPending} icon={<RefreshCw className="size-4" />} onClick={() => start.mutate()} disabled={method === 'internal-ca' && !ca.data?.exists}>
              {method === 'csr' ? 'Generate key & CSR' : 'Renew now'}
            </Button>
            <LinkButton to={`/certificates/${certId}`} variant="ghost" size="lg">Cancel</LinkButton>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="What will happen" />
            <ol className="text-[13px] text-ink-700 space-y-2 list-decimal pl-4">
              <li>{keyMode === 'reuse' ? 'Reuse the vaulted private key.' : `Generate a new ${keyMode.toUpperCase().replace('-', ' ')} key with openssl genpkey.`}</li>
              <li>Build a CSR with the current subject and SANs.</li>
              {method === 'internal-ca' && <li>Sign it with the internal CA for {validityDays} days.</li>}
              {method === 'self-signed' && <li>Self-sign it for {validityDays} days.</li>}
              {method === 'csr' && <li>Hand you the CSR; wait for the signed certificate.</li>}
              <li>Render {fileCount} file{fileCount === 1 ? '' : 's'} across {selected.length} profile{selected.length === 1 ? '' : 's'}.</li>
              {deploy && destinations.length > 0 && <li>Write them to {destinations.length} destination{destinations.length === 1 ? '' : 's'}.</li>}
              <li>Update this certificate in place and keep its history.</li>
            </ol>
          </Card>
          <Card className="border-brand-200 bg-brand-50/40">
            <div className="flex items-center gap-2 text-brand-800">
              <Timer className="size-4" />
              <span className="text-[13px] font-medium">Estimated time reclaimed</span>
            </div>
            <div className="text-[28px] font-semibold text-brand-800 tnum mt-1 leading-none">{humanMinutes(estimate)}</div>
            <p className="text-[12px] text-brand-700/80 mt-2">Based on your baselines in Settings.</p>
          </Card>
          {selected.some((p) => p.outputs.some((o) => formatNeedsKey(o.format))) && keyMode === 'reuse' && !hasKey && (
            <ErrorBox error={new Error('Selected outputs need a private key but none is in the vault. Choose a new key.')} />
          )}
        </div>
      </div>
    </>
  );
}

function RenewalResult({ renewalId, certId }: { renewalId: string; certId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['renewal', renewalId], queryFn: () => api.renewal(renewalId) });
  const [files, setFiles] = useState<File[]>([]);
  const complete = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      return api.completeRenewal(renewalId, fd);
    },
    onSuccess: (r) => {
      qc.setQueryData(['renewal', renewalId], r);
      qc.invalidateQueries({ queryKey: ['certificate', certId] });
      qc.invalidateQueries({ queryKey: ['certificates'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Renewal completed', `${r.outputs.length} file${r.outputs.length === 1 ? '' : 's'} rendered`);
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const r: Renewal = q.data;

  if (r.status === 'pending-csr') {
    return (
      <>
        <PageHeader eyebrow="Step 2 of 2" title="Get the CSR signed" description="Submit this request to your external CA. When the certificate comes back, upload it here to finish the renewal." />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <Card>
              <CardHeader title="Certificate signing request" description={`${r.keyMode === 'reuse' ? 'Existing key' : 'New ' + r.keyMode.toUpperCase().replace('-', ' ') + ' key'} · generated ${formatDate(r.createdAt)}`} action={<a href={`/api/renewals/${r.id}/csr`} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-ink-200 text-[13px] font-medium text-ink-800 hover:bg-ink-50"><Download className="size-3.5" /> Download .csr</a>} />
              <CodeBlock className="max-h-[260px] overflow-y-auto">{r.csrPem ?? ''}</CodeBlock>
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigator.clipboard.writeText(r.csrPem ?? '').then(() => toast.success('CSR copied'))}>Copy to clipboard</Button>
            </Card>
            <Card>
              <CardHeader title="Upload the signed certificate" description="Include the issuer chain (.cer/.pem/.p7b) if the CA provided one; otherwise the previous chain is reused when it still matches." />
              <FileDrop files={files} onChange={setFiles} accept=".cer,.crt,.pem,.der,.p7b,.p7c" hint="The signed leaf certificate, plus any intermediates. Only the new key already held by Vigil will be accepted." />
              <ErrorBox error={complete.error} className="mt-4" />
              <div className="mt-5">
                <Button variant="primary" size="lg" loading={complete.isPending} disabled={!files.length} onClick={() => complete.mutate()}>Complete renewal</Button>
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Terminal className="size-4" /> OpenSSL trail</span>} />
              <CommandTrail commands={r.commands} />
            </Card>
          </div>
        </div>
      </>
    );
  }

  const deployed = r.outputs.filter((o) => o.deployStatus === 'deployed');
  const failed = r.outputs.filter((o) => o.deployStatus === 'failed');
  const byProfile = new Map<string, typeof r.outputs>();
  for (const o of r.outputs) byProfile.set(o.profileName, [...(byProfile.get(o.profileName) ?? []), o]);

  return (
    <>
      <PageHeader
        eyebrow={r.status === 'completed' ? 'Renewal complete' : 'Renewal failed'}
        title={r.certificateName}
        description={r.status === 'completed' ? `Now valid until ${formatDate(r.newNotAfter)}${r.previousNotAfter ? ` (was ${formatDate(r.previousNotAfter)})` : ''}.` : r.error ?? 'Something went wrong.'}
        actions={
          <>
            {r.outputs.length > 0 && (
              <a href={`/api/renewals/${r.id}/zip`} className="inline-flex items-center gap-2 h-9.5 px-4 rounded-xl text-sm font-medium bg-brand-600 text-white hover:bg-brand-700">
                <Download className="size-4" /> Download all (.zip)
              </a>
            )}
            <LinkButton to={`/certificates/${certId}`}>Open certificate</LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {r.outputs.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-600">No reference profiles were selected, so nothing was rendered. Use <Link to={`/certificates/${certId}`} className="text-brand-700 font-medium">Download</Link> on the certificate for any format.</p>
            </Card>
          ) : (
            [...byProfile.entries()].map(([profileName, outputs]) => (
              <Card key={profileName} padded={false}>
                <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-ink-950">{profileName}</h3>
                  <span className="text-[12px] text-ink-500">{outputs.length} file{outputs.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {outputs.map((o) => (
                    <li key={o.index} className="px-6 py-3 flex items-center gap-4">
                      <span className="rounded-md bg-ink-100 text-ink-700 px-1.5 py-0.5 text-[11px] font-medium w-[86px] text-center shrink-0">{FORMAT_SHORT[o.format]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[13px] text-ink-900 truncate">{o.filename}</div>
                        <div className="text-[12px] text-ink-500 truncate flex items-center gap-1.5">
                          {o.deployStatus === 'deployed' && <><CheckCircle2 className="size-3.5 text-ok-600" /> Written to <span className="font-mono">{o.deployedTo}</span></>}
                          {o.deployStatus === 'failed' && <><XCircle className="size-3.5 text-crit-600" /> {o.deployError}</>}
                          {o.deployStatus === 'skipped' && <><FolderOutput className="size-3.5 text-ink-400" /> Staged for download{o.size ? ` · ${bytes(o.size)}` : ''}</>}
                        </div>
                      </div>
                      {o.size > 0 && (
                        <a href={`/api/renewals/${r.id}/outputs/${o.index}`} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-ink-200 text-[13px] font-medium text-ink-800 hover:bg-ink-50">
                          <Download className="size-3.5" /> Download
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          )}
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Terminal className="size-4" /> OpenSSL trail</span>} description="Every command that ran for this renewal, in order. Passwords are redacted." />
            <CommandTrail commands={r.commands} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="border-brand-200 bg-brand-50/40">
            <div className="flex items-center gap-2 text-brand-800">
              <Timer className="size-4" />
              <span className="text-[13px] font-medium">Time reclaimed</span>
            </div>
            <div className="text-[28px] font-semibold text-brand-800 tnum mt-1 leading-none">{humanMinutes(r.minutesSaved)}</div>
            <p className="text-[12px] text-brand-700/80 mt-2">Renewal + {r.outputs.filter((o) => o.size > 0).length} conversions{deployed.length ? ` + deployment to ${new Set(deployed.map((o) => o.deployedTo?.replace(/[\\/][^\\/]+$/, ''))).size} location(s)` : ''}.</p>
          </Card>
          <Card>
            <CardHeader title="Summary" />
            <dl className="text-[13px] space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Method</dt><dd className="text-ink-900">{r.method === 'internal-ca' ? 'Internal CA' : r.method === 'self-signed' ? 'Self-signed' : 'External CA (CSR)'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Key</dt><dd className="text-ink-900">{r.keyMode === 'reuse' ? 'Reused' : r.keyMode.toUpperCase().replace('-', ' ')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Files rendered</dt><dd className="text-ink-900 tnum">{r.outputs.filter((o) => o.size > 0).length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Deployed</dt><dd className="text-ink-900 tnum">{deployed.length}{failed.length ? <span className="text-crit-600"> · {failed.length} failed</span> : ''}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Completed</dt><dd className="text-ink-900 tnum">{r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
