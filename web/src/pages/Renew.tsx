import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, Check, CheckCircle2, Download, FileSignature, FolderOutput, Landmark, Plus, RefreshCw, Terminal, Timer, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb';
import { CopyButton } from '@/components/CopyButton';
import { FileDrop } from '@/components/FileDrop';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, Checkbox, CodeBlock, CommandTrail, ErrorBox, Field, Input, LinkButton, Loading, Modal, PageHeader, RadioCard, Select, StatusBadge, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { bytes, FORMAT_SHORT, formatDate, formatNeedsKey, humanMinutes } from '@/lib/format';
import type { Certificate, IdentityTemplate, KeyMode, Renewal, RenewalMethod } from '@/types';

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
      <Breadcrumb
        items={[
          { label: 'Certificates', to: '/certificates' },
          { label: c.name, to: `/certificates/${c.id}` },
          { label: 'Renew' },
        ]}
      />
      {renewalId ? (
        <RenewalResult renewalId={renewalId} certId={c.id} />
      ) : (
        <RenewForm cert={c} />
      )}
    </>
  );
}

function parseSubject(subject: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of subject.split(',')) {
    const i = part.indexOf('=');
    if (i > 0) map[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return map;
}

function RenewForm({ cert }: { cert: Certificate }) {
  const certId = cert.id;
  const certName = cert.name;
  const hasKey = cert.hasKey;
  const linkedProfileIds = cert.profileIds;
  const destinationOverride = cert.destinationOverride;
  const notAfter = cert.notAfter;
  const status = cert.status;
  const days = cert.daysRemaining;
  const initialDn = parseSubject(cert.subject);

  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const profiles = useQuery({ queryKey: ['profiles', certId], queryFn: () => api.profiles(certId) });
  const identities = useQuery({ queryKey: ['identities'], queryFn: api.identities });
  const ca = useQuery({ queryKey: ['ca'], queryFn: api.ca });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  const [method, setMethod] = useState<RenewalMethod>('internal-ca');
  const [keyMode, setKeyMode] = useState<KeyMode>(hasKey ? 'reuse' : 'rsa-2048');
  const [validityDays, setValidityDays] = useState<number>(397);
  const [profileIds, setProfileIds] = useState<string[]>(linkedProfileIds);
  const [deploy, setDeploy] = useState(true);
  const [identityId, setIdentityId] = useState('');
  const [commonName, setCommonName] = useState(cert.commonName);
  const [sans, setSans] = useState<string[]>(cert.sans.length ? cert.sans : [cert.commonName]);
  const [sanDraft, setSanDraft] = useState('');
  const [country, setCountry] = useState(initialDn.C ?? '');
  const [state, setState] = useState(initialDn.ST ?? '');
  const [locality, setLocality] = useState(initialDn.L ?? '');
  const [organisation, setOrganisation] = useState(initialDn.O ?? '');
  const [organisationalUnit, setOrganisationalUnit] = useState(initialDn.OU ?? '');
  const [email, setEmail] = useState(initialDn.emailAddress ?? '');

  useEffect(() => {
    if (settings.data) setValidityDays(settings.data.defaultValidityDays);
  }, [settings.data]);
  useEffect(() => {
    if (ca.data && !ca.data.exists && method === 'internal-ca') setMethod('csr');
  }, [ca.data, method]);

  const applyIdentity = (t: IdentityTemplate | undefined) => {
    if (!t) {
      setIdentityId('');
      return;
    }
    setIdentityId(t.id);
    setCountry(t.country);
    setState(t.state);
    setLocality(t.locality);
    setOrganisation(t.organisation);
    setOrganisationalUnit(t.organisationalUnit);
    setEmail(t.email);
    if (t.defaultKeyMode !== 'reuse' || hasKey) setKeyMode(t.defaultKeyMode);
    setValidityDays(t.defaultValidityDays);
  };

  const addSan = () => {
    const v = sanDraft.trim();
    if (!v || sans.includes(v)) return;
    setSans([...sans, v]);
    setSanDraft('');
  };

  const start = useMutation({
    mutationFn: () =>
      api.renew(certId, {
        method,
        keyMode,
        validityDays,
        profileIds,
        deploy,
        commonName,
        sans,
        country,
        state,
        locality,
        organisation,
        organisationalUnit,
        email,
        identityTemplateId: identityId || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['certificate', certId] });
      qc.invalidateQueries({ queryKey: ['certificates'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.status === 'completed') toast.success(`Renewed ${certName}`, `${r.outputs.length} file${r.outputs.length === 1 ? '' : 's'} rendered · ${humanMinutes(r.minutesSaved)} reclaimed`);
      nav(`/certificates/${certId}/renew?renewal=${r.id}`, { replace: true });
    },
  });

  const [confirm, setConfirm] = useState(false);

  const selected = (profiles.data ?? []).filter((p) => profileIds.includes(p.id));
  const destinations = destinationOverride
    ? [destinationOverride]
    : [...new Set(selected.map((p) => p.destinationPath).filter(Boolean))];
  const fileCount = selected.reduce((n, p) => n + p.outputs.length, 0);
  const b = settings.data?.baselines;
  const estimate = b ? (method === 'csr' ? b.csr : 0) + b.renewal + b.conversion * fileCount + (deploy ? b.deployment * Math.max(destinations.length, destinations.length ? 1 : 0) : 0) : 0;

  const keyNeedsVault = selected.some((p) => p.outputs.some((o) => formatNeedsKey(o.format))) && keyMode === 'reuse' && !hasKey;
  const methodFail = method === 'internal-ca' && ca.data?.exists === false;
  const cnFail = !commonName.trim();
  const sansEmpty = sans.length === 0;
  const cnMissingFromSans = Boolean(commonName.trim()) && !sans.includes(commonName.trim());
  const outputsWarn = selected.length === 0;
  const deployWarn = deploy && destinations.length === 0;
  const validityWarn = method !== 'csr' && validityDays > 397;

  type Tone = 'ok' | 'fail' | 'warn';
  const checks: { id: string; href: string; label: string; tone: Tone; detail: string }[] = [
    {
      id: 'method',
      href: '#method',
      label: 'Issuance method',
      tone: methodFail ? 'fail' : 'ok',
      detail: methodFail ? 'No internal CA exists' : method === 'internal-ca' ? 'Internal CA' : method === 'self-signed' ? 'Self-signed' : 'External CA CSR',
    },
    {
      id: 'cn',
      href: '#names',
      label: 'Common name',
      tone: cnFail ? 'fail' : 'ok',
      detail: cnFail ? 'Required' : commonName.trim(),
    },
    {
      id: 'sans',
      href: '#names',
      label: 'SANs',
      tone: sansEmpty || cnMissingFromSans ? 'warn' : 'ok',
      detail: sansEmpty
        ? 'None listed — browsers may reject this'
        : cnMissingFromSans
          ? 'Common name is not among the SANs'
          : `${sans.length} name${sans.length === 1 ? '' : 's'}`,
    },
    {
      id: 'key',
      href: '#key',
      label: 'Key',
      tone: keyNeedsVault ? 'fail' : 'ok',
      detail: keyNeedsVault
        ? 'Outputs need a private key, but reuse is selected and none is in the vault'
        : keyMode === 'reuse'
          ? 'Reuse existing key'
          : `New ${keyMode.toUpperCase().replace('-', ' ')}`,
    },
    {
      id: 'outputs',
      href: '#outputs',
      label: 'Outputs',
      tone: outputsWarn ? 'warn' : 'ok',
      detail: outputsWarn ? 'No profile selected — nothing will be rendered' : `${fileCount} file${fileCount === 1 ? '' : 's'} across ${selected.length} profile${selected.length === 1 ? '' : 's'}`,
    },
    {
      id: 'deploy',
      href: '#outputs',
      label: 'Deploy',
      tone: deployWarn ? 'warn' : 'ok',
      detail: !deploy
        ? 'Files will not be written to disk'
        : destinations.length === 0
          ? 'Deploy is on but no destination is set'
          : `${destinations.length} path${destinations.length === 1 ? '' : 's'}`,
    },
    {
      id: 'validity',
      href: '#key',
      label: 'Validity',
      tone: validityWarn ? 'warn' : 'ok',
      detail: method === 'csr' ? 'Set by the external CA' : validityWarn ? `${validityDays} days exceeds the 397-day public-CA cap` : `${validityDays} days`,
    },
  ];

  const blocking = checks.filter((c) => c.tone === 'fail');
  const blocked = blocking.length > 0;
  const blockingReason = blocking[0]?.detail;

  const methodLabel = method === 'internal-ca' ? 'Internal CA' : method === 'self-signed' ? 'Self-signed' : 'External CA CSR';
  const keyLabel = keyMode === 'reuse' ? 'Reuse the vaulted private key' : `Generate a new ${keyMode.toUpperCase().replace('-', ' ')} key`;
  const willWrite = deploy && destinations.length > 0;
  const confirmAction =
    method === 'csr' ? 'Generate CSR' : willWrite ? 'Issue and deploy' : 'Issue';

  const jump = (href: string) => {
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            Renew {certName} <StatusBadge status={status} days={days} />
          </span>
        }
        description={`Currently valid until ${formatDate(notAfter)}. Review the common name and SANs before you issue — add or remove names here.`}
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div id="method">
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
          </div>

          <div id="names">
          <Card>
            <CardHeader
              title="2. Names"
              description="These become the new certificate’s common name and subject alternative names. Removing a SAN drops it from the next issuance."
            />
            <Field label="Common name" required>
              <Input value={commonName} onChange={(e) => setCommonName(e.target.value)} className="font-mono text-[13px]" />
            </Field>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium text-ink-800">Subject alternative names</span>
                <button
                  type="button"
                  className="text-[12px] text-brand-700 font-medium hover:underline"
                  onClick={() => {
                    setCommonName(cert.commonName);
                    setSans(cert.sans.length ? cert.sans : [cert.commonName]);
                  }}
                >
                  Reset to current
                </button>
              </div>
              <ul className="flex flex-wrap gap-1.5 mb-3">
                {sans.map((s) => (
                  <li key={s} className="inline-flex items-center gap-1 rounded-lg bg-ink-100/80 border border-ink-200 px-2 py-1 text-[12px] font-mono text-ink-800">
                    {s}
                    <button type="button" onClick={() => setSans(sans.filter((x) => x !== s))} className="text-ink-400 hover:text-crit-600" aria-label={`Remove ${s}`}>
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
                {sans.length === 0 && <li className="text-[13px] text-ink-500">No SANs — the common name will be used.</li>}
              </ul>
              <div className="flex gap-2">
                <Input
                  value={sanDraft}
                  onChange={(e) => setSanDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSan();
                    }
                  }}
                  placeholder="www.portal.contoso.com or IP:10.0.0.8"
                  className="font-mono text-[13px]"
                />
                <Button type="button" icon={<Plus className="size-3.5" />} onClick={addSan} disabled={!sanDraft.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </Card>
          </div>

          <div id="identity">
          <Card>
            <CardHeader
              title="3. Identity"
              description="Apply a saved organisation template, or edit the distinguished-name fields for this renewal only."
              action={<LinkButton to="/identities" size="sm" variant="ghost">Manage templates</LinkButton>}
            />
            {identities.data?.length ? (
              <Field label="Identity template">
                <Select
                  value={identityId}
                  onChange={(e) => applyIdentity(identities.data.find((t) => t.id === e.target.value))}
                >
                  <option value="">Keep current subject fields</option>
                  {identities.data.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-[13px] text-ink-500 mb-4">No identity templates yet. Current subject fields are prefilled.</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <Field label="Country (C)">
                <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} className="uppercase" />
              </Field>
              <Field label="State (ST)">
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </Field>
              <Field label="Locality (L)">
                <Input value={locality} onChange={(e) => setLocality(e.target.value)} />
              </Field>
              <Field label="Organisation (O)">
                <Input value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
              </Field>
              <Field label="Unit (OU)">
                <Input value={organisationalUnit} onChange={(e) => setOrganisationalUnit(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </Card>
          </div>

          <div id="key">
          <Card>
            <CardHeader title="4. Key and validity" />
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
          </div>

          <div id="outputs">
          <Card>
            <CardHeader title="5. Outputs" description="General profiles always appear. Specialized profiles only show when this certificate matches their tags or assignments." action={<LinkButton to="/profiles/new" size="sm" variant="ghost">New profile</LinkButton>} />
            {profiles.data?.length ? (
              <ul className="space-y-3">
                {profiles.data.map((p) => {
                  const available = p.applicable !== false;
                  return (
                  <li key={p.id} className={available ? '' : 'opacity-50'}>
                    <Checkbox
                      checked={profileIds.includes(p.id)}
                      disabled={!available && !profileIds.includes(p.id)}
                      onChange={(on) => setProfileIds(on ? [...profileIds, p.id] : profileIds.filter((x) => x !== p.id))}
                      label={
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          {p.name}
                          {linkedProfileIds.includes(p.id) && <Badge tone="brand">Linked</Badge>}
                          <Badge tone={p.scope === 'specialized' ? 'warn' : 'neutral'}>{p.scope === 'specialized' ? 'Specialized' : 'General'}</Badge>
                          {!available && <span className="text-[11px] text-ink-500">Not assigned to this certificate</span>}
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
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-500">No profiles yet — the renewed certificate will still be available for ad-hoc download in any format.</p>
            )}
            <div className="mt-5 pt-5 border-t border-ink-100">
              <Toggle
                checked={deploy}
                onChange={setDeploy}
                disabled={destinations.length === 0}
                label="Copy files to deploy location"
                description={
                  destinations.length
                    ? destinationOverride
                      ? `Certificate override: ${destinationOverride}`
                      : destinations.join(' · ')
                    : 'Set a deploy location on this certificate or on a selected profile.'
                }
              />
            </div>
          </Card>
          </div>

          <ErrorBox error={start.error} />
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="primary"
              size="lg"
              icon={<RefreshCw className="size-4" />}
              onClick={() => setConfirm(true)}
              disabled={blocked}
            >
              {method === 'csr' ? 'Generate key & CSR' : 'Renew now'}
            </Button>
            <LinkButton to={`/certificates/${certId}`} variant="ghost" size="lg">Cancel</LinkButton>
            {blocked && <span className="text-[13px] text-crit-600">{blockingReason}</span>}
          </div>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto scrollbar-thin">
          <Card>
            <CardHeader title="Readiness" />
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => jump(c.href)}
                    className="w-full flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-ink-50 transition-colors"
                  >
                    {c.tone === 'ok' && <Check className="size-3.5 text-ok-600 mt-0.5 shrink-0" />}
                    {c.tone === 'fail' && <X className="size-3.5 text-crit-600 mt-0.5 shrink-0" />}
                    {c.tone === 'warn' && <AlertTriangle className="size-3.5 text-warn-600 mt-0.5 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink-900">{c.label}</span>
                      <span className={`block text-[12px] ${c.tone === 'fail' ? 'text-crit-600' : c.tone === 'warn' ? 'text-warn-700' : 'text-ink-500'}`}>{c.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="What will happen" />
            <ol className="text-[13px] text-ink-700 space-y-2 list-decimal pl-4">
              <li>{keyMode === 'reuse' ? 'Reuse the vaulted private key.' : `Generate a new ${keyMode.toUpperCase().replace('-', ' ')} key with openssl genpkey.`}</li>
              <li>Build a CSR for {commonName || 'this certificate'} with {sans.length} SAN{sans.length === 1 ? '' : 's'}.</li>
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
          {keyNeedsVault && (
            <ErrorBox error={new Error('Selected outputs need a private key but none is in the vault. Choose a new key.')} />
          )}
        </div>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={
          method === 'csr'
            ? 'Generate a CSR?'
            : willWrite
              ? 'Issue and deploy this certificate?'
              : 'Issue this certificate?'
        }
        description={
          method === 'csr'
            ? 'A certificate signing request will be generated. Nothing is issued and no files are written to disk until you upload the signed certificate.'
            : willWrite
              ? 'This issues a new certificate and writes files to the destinations below.'
              : 'This issues a new certificate. No files will be written to disk.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={start.isPending}
              onClick={() => start.mutate()}
            >
              {confirmAction}
            </Button>
          </>
        }
      >
        <dl className="text-[13px] space-y-3">
          <div>
            <dt className="text-ink-500">Method</dt>
            <dd className="text-ink-900 mt-0.5">
              {methodLabel}
              {method !== 'csr' && <span className="text-ink-500"> · {validityDays} days</span>}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Key</dt>
            <dd className="text-ink-900 mt-0.5">{keyLabel}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Names</dt>
            <dd className="text-ink-900 mt-0.5 font-mono text-[12.5px]">
              {commonName || '—'}
              <span className="font-sans text-ink-500"> · {sans.length} SAN{sans.length === 1 ? '' : 's'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Destinations</dt>
            <dd className="mt-1">
              {method === 'csr' || !willWrite ? (
                <p className="text-ink-600">No files will be written.</p>
              ) : (
                <ul className="space-y-1">
                  {destinations.map((d) => (
                    <li key={d} className="font-mono text-[12.5px] text-ink-900 break-all">{d}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
        <ErrorBox error={start.error} className="mt-3" />
      </Modal>
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
              <CopyButton value={r.csrPem ?? ''} label="Copy to clipboard" success="CSR copied" className="mt-3" />
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
            <LinkButton to={`/certificates/${certId}/renew`}>Renew again</LinkButton>
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
                          {o.size > 0 ? (
                            <a href={`/api/renewals/${r.id}/outputs/${o.index}`} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-ink-200 text-[13px] font-medium text-ink-800 hover:bg-ink-50">
                              <Download className="size-3.5" /> Download
                            </a>
                          ) : (
                            <span className="text-[11px] text-ink-400">Receipt only</span>
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
