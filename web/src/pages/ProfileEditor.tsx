import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileSearch, GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileDrop } from '@/components/FileDrop';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, Checkbox, ErrorBox, Field, Input, LinkButton, Loading, Modal, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { FORMAT_LABELS, formatIsPem, formatNeedsKey } from '@/lib/format';
import type { DetectedFormat, OutputFormat, OutputSpec, Profile } from '@/types';

const TOKENS = ['{cn}', '{cn_safe}', '{date}', '{year}', '{serial}', '{profile}'];

function blankSpec(): OutputSpec {
  return {
    id: `new_${Math.random().toString(36).slice(2, 8)}`,
    label: 'PEM full chain',
    filename: 'fullchain.pem',
    format: 'pem-fullchain',
    lineEnding: 'lf',
    includeRoot: false,
    keyEncoding: 'pkcs8',
    password: '',
    friendlyName: '{cn}',
    legacyPkcs12: false,
    trailingNewline: true,
    detected: null,
  };
}

export function ProfileEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ['profile', id], queryFn: () => api.profile(id!), enabled: !isNew });

  const [form, setForm] = useState<Pick<Profile, 'name' | 'description' | 'destinationPath' | 'outputs'>>({ name: '', description: '', destinationPath: '', outputs: [] });
  const [loaded, setLoaded] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing.data && !loaded) {
      const p = existing.data.profile;
      setForm({ name: p.name, description: p.description, destinationPath: p.destinationPath, outputs: p.outputs });
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  const save = useMutation({
    mutationFn: () => (isNew ? api.createProfile(form) : api.updateProfile(id!, form)),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['profiles'] });
      qc.invalidateQueries({ queryKey: ['profile', p.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isNew ? 'Profile created' : 'Profile saved');
      if (isNew) nav(`/profiles/${p.id}`, { replace: true });
    },
    onError: (e) => toast.error('Could not save profile', e),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteProfile(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] });
      toast.success('Profile deleted');
      nav('/profiles');
    },
    onError: (e) => toast.error('Could not delete profile', e),
  });

  const updateSpec = (specId: string, patch: Partial<OutputSpec>) =>
    setForm((f) => ({ ...f, outputs: f.outputs.map((o) => (o.id === specId ? { ...o, ...patch } : o)) }));
  const removeSpec = (specId: string) => setForm((f) => ({ ...f, outputs: f.outputs.filter((o) => o.id !== specId) }));
  const move = (index: number, dir: -1 | 1) =>
    setForm((f) => {
      const next = [...f.outputs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return f;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...f, outputs: next };
    });

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} />;

  return (
    <>
      <div className="mb-2">
        <Link to="/profiles" className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> Reference profiles
        </Link>
      </div>
      <PageHeader
        title={isNew ? 'New reference profile' : form.name || 'Profile'}
        description="Describe the deliverables once. Vigil renders them identically on every renewal."
        actions={
          <>
            {!isNew && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>{isNew ? 'Create profile' : 'Save changes'}</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="IIS – Web Farm" /></Field>
              <Field label="Destination path" hint="Absolute directory. Files are written here on renewal when deployment is enabled. Leave empty for download only.">
                <Input value={form.destinationPath} onChange={(e) => setForm({ ...form, destinationPath: e.target.value })} placeholder="/etc/ssl/webfarm  or  D:\Certs\WebFarm" className="font-mono text-[13px]" />
              </Field>
            </div>
            <Field label="Description" className="mt-4"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What consumes these files and any handling notes." className="min-h-16" /></Field>
          </Card>

          <Card>
            <CardHeader
              title="Output files"
              description="Rendered in this order. Filenames accept tokens."
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setForm({ ...form, outputs: [...form.outputs, blankSpec()] })}>Add manually</Button>
                  <Button size="sm" variant="primary" icon={<FileSearch className="size-3.5" />} onClick={() => setAnalyzeOpen(true)}>Add from reference file</Button>
                </div>
              }
            />
            {form.outputs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center">
                <Sparkles className="size-5 text-brand-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-ink-900">Start from a reference file</div>
                <p className="text-[13px] text-ink-500 mt-1 max-w-md mx-auto">Upload a certificate or key exactly as you issue it today — for example a full-chain <span className="font-mono">.cer</span> and a decrypted <span className="font-mono">private.key</span>. Vigil detects the container, chain depth, key encoding and line endings.</p>
                <Button className="mt-4" variant="primary" onClick={() => setAnalyzeOpen(true)}>Analyse a reference file</Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {form.outputs.map((o, i) => (
                  <li key={o.id}>
                    <SpecEditor spec={o} index={i} total={form.outputs.length} onChange={(p) => updateSpec(o.id, p)} onRemove={() => removeSpec(o.id)} onMove={(d) => move(i, d)} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-500">
              <span>Tokens:</span>
              {TOKENS.map((t) => (
                <code key={t} className="font-mono bg-ink-100 rounded px-1.5 py-0.5 text-ink-700">{t}</code>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {!isNew && existing.data && (
            <Card>
              <CardHeader title="Linked certificates" description="Renewing any of these renders this profile." action={<LinkButton to={`/certificates?profileId=${id}`} size="sm" variant="ghost">Browse</LinkButton>} />
              {existing.data.certificates.length === 0 ? (
                <p className="text-[13px] text-ink-500">No certificates use this profile yet. Link it from a certificate page.</p>
              ) : (
                <ul className="space-y-2">
                  {existing.data.certificates.slice(0, 10).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <Link to={`/certificates/${c.id}`} className="text-sm text-ink-900 hover:text-brand-700 truncate">{c.name}</Link>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card className="bg-ink-50/60">
            <h3 className="text-[13px] font-semibold text-ink-800 mb-2">How rendering works</h3>
            <ul className="text-[13px] text-ink-600 space-y-1.5 list-disc pl-4">
              <li>Each output is produced from the vault copy with OpenSSL — never by string-editing your files.</li>
              <li>Chain outputs include intermediates; the root is appended only when the reference had one.</li>
              <li>Keys are re-encoded to the detected encoding (PKCS#8 / PKCS#1) and encrypted only if the reference was.</li>
              <li>Line endings and trailing newline are reproduced for PEM outputs.</li>
              <li>Files are staged for download and, if a destination is set, written there with keys at 0600.</li>
            </ul>
          </Card>
        </div>
      </div>

      {analyzeOpen && (
        <AnalyzeModal
          onClose={() => setAnalyzeOpen(false)}
          onAdd={(spec) => {
            setForm((f) => ({ ...f, outputs: [...f.outputs, spec] }));
            setAnalyzeOpen(false);
          }}
        />
      )}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this profile?"
        description="Certificates linked to it will simply lose the link."
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete</Button></>}
      >
        <p className="text-sm text-ink-600">Previously rendered files are not affected.</p>
      </Modal>
    </>
  );
}

function SpecEditor({ spec, index, total, onChange, onRemove, onMove }: { spec: OutputSpec; index: number; total: number; onChange: (p: Partial<OutputSpec>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const isPem = formatIsPem(spec.format);
  const needsKey = formatNeedsKey(spec.format);
  const needsPassword = spec.format === 'pkcs12' || spec.format === 'pem-key-encrypted';
  const chainish = ['pem-fullchain', 'pem-chain', 'pem-bundle', 'pkcs7-pem', 'pkcs7-der', 'pkcs12'].includes(spec.format);
  const keyish = ['pem-key', 'pem-key-encrypted', 'pem-bundle'].includes(spec.format);
  return (
    <div className="rounded-xl border border-ink-200 p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-0.5 text-ink-300 pt-1">
          <button type="button" className="hover:text-ink-600 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">▲</button>
          <GripVertical className="size-4" />
          <button type="button" className="hover:text-ink-600 disabled:opacity-30" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">▼</button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Label"><Input value={spec.label} onChange={(e) => onChange({ label: e.target.value })} /></Field>
          <Field label="Filename pattern"><Input value={spec.filename} onChange={(e) => onChange({ filename: e.target.value })} className="font-mono text-[13px]" /></Field>
          <Field label="Format" className="md:col-span-2">
            <Select value={spec.format} onChange={(e) => onChange({ format: e.target.value as OutputFormat })}>
              {(Object.keys(FORMAT_LABELS) as OutputFormat[]).map((f) => (
                <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
              ))}
            </Select>
          </Field>
          {isPem && (
            <Field label="Line endings">
              <Select value={spec.lineEnding} onChange={(e) => onChange({ lineEnding: e.target.value as 'lf' | 'crlf' })}>
                <option value="lf">LF (Linux, macOS)</option>
                <option value="crlf">CRLF (Windows)</option>
              </Select>
            </Field>
          )}
          {keyish && (
            <Field label="Key encoding">
              <Select value={spec.keyEncoding} onChange={(e) => onChange({ keyEncoding: e.target.value as OutputSpec['keyEncoding'] })}>
                <option value="pkcs8">PKCS#8 — BEGIN PRIVATE KEY</option>
                <option value="pkcs1">PKCS#1 — BEGIN RSA PRIVATE KEY (SEC1 for EC)</option>
              </Select>
            </Field>
          )}
          {needsPassword && (
            <Field label={spec.format === 'pkcs12' ? 'PFX password' : 'Key password'} hint="Stored with the profile so renewals are unattended." required>
              <Input type="password" value={spec.password} onChange={(e) => onChange({ password: e.target.value })} autoComplete="new-password" />
            </Field>
          )}
          {spec.format === 'pkcs12' && (
            <Field label="Friendly name" hint="Shown in Windows certificate stores. Tokens allowed.">
              <Input value={spec.friendlyName} onChange={(e) => onChange({ friendlyName: e.target.value })} className="font-mono text-[13px]" />
            </Field>
          )}
          <div className="md:col-span-2 flex flex-wrap gap-x-8 gap-y-3 pt-1">
            {chainish && <Checkbox checked={spec.includeRoot} onChange={(v) => onChange({ includeRoot: v })} label="Include root CA" />}
            {isPem && <Checkbox checked={spec.trailingNewline} onChange={(v) => onChange({ trailingNewline: v })} label="Trailing newline" />}
            {spec.format === 'pkcs12' && <Checkbox checked={spec.legacyPkcs12} onChange={(v) => onChange({ legacyPkcs12: v })} label="Legacy algorithms (RC2/3DES)" description="For very old Windows / Java consumers." />}
          </div>
          <div className="md:col-span-2 flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-[12px] text-ink-500">
              {spec.detected ? (
                <>
                  <Badge tone="brand">Learned from {spec.detected.sourceFilename}</Badge>
                  <span className="truncate">{spec.detected.summary}</span>
                </>
              ) : (
                <Badge>Manual</Badge>
              )}
              {needsKey && <span className="text-ink-400">· requires private key</span>}
            </div>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={onRemove}>Remove</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyzeModal({ onClose, onAdd }: { onClose: () => void; onAdd: (s: OutputSpec) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<{ detected: DetectedFormat; spec: OutputSpec } | null>(null);
  const analyze = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', files[0]);
      if (password) fd.append('password', password);
      return api.analyze(fd);
    },
    onSuccess: setResult,
  });
  const isP12 = files[0] && /\.(pfx|p12)$/i.test(files[0].name);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add output from a reference file"
      description="Upload one file in exactly the form you issue today. Its format becomes the template."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!result ? (
            <Button variant="primary" loading={analyze.isPending} disabled={!files.length} onClick={() => analyze.mutate()}>Analyse with OpenSSL</Button>
          ) : (
            <Button variant="primary" onClick={() => onAdd(result.spec)}>Add this output</Button>
          )}
        </>
      }
    >
      {!result ? (
        <div className="space-y-4">
          <FileDrop files={files} onChange={setFiles} multiple={false} compact title="Drop a reference file" hint=".cer .crt .pem .der .pfx .p12 .p7b .key" />
          {isP12 && (
            <Field label="PKCS#12 password" hint="Needed to inspect the archive; also becomes the default password for rendered PFX files.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </Field>
          )}
          <ErrorBox error={analyze.error} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-700" />
              <div className="text-sm font-medium text-ink-950">{result.detected.summary}</div>
            </div>
            <ul className="mt-2 text-[13px] text-ink-700 space-y-0.5 pl-6 list-disc">
              {result.detected.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
              {result.detected.container === 'pem' && <li>Line endings {result.detected.lineEnding.toUpperCase()}{result.detected.trailingNewline ? '' : ', no trailing newline'}</li>}
            </ul>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Label"><Input value={result.spec.label} onChange={(e) => setResult({ ...result, spec: { ...result.spec, label: e.target.value } })} /></Field>
            <Field label="Filename pattern" hint="Tokens: {cn} {cn_safe} {date} {year} {serial} {profile}">
              <Input value={result.spec.filename} onChange={(e) => setResult({ ...result, spec: { ...result.spec, filename: e.target.value } })} className="font-mono text-[13px]" />
            </Field>
            {(result.spec.format === 'pkcs12' || result.spec.format === 'pem-key-encrypted') && (
              <Field label="Password for rendered files" required hint="You can change it later in the profile.">
                <Input type="password" value={result.spec.password} onChange={(e) => setResult({ ...result, spec: { ...result.spec, password: e.target.value } })} autoComplete="new-password" />
              </Field>
            )}
          </div>
          <button type="button" className="text-[13px] text-brand-700 font-medium hover:underline" onClick={() => { setResult(null); setFiles([]); }}>Analyse a different file</button>
        </div>
      )}
    </Modal>
  );
}
