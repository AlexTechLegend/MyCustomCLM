import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, FileSearch, FolderOutput, GripVertical, Plus, Sparkles, Trash2, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileDrop } from '@/components/FileDrop';
import { FormatPreviewPane } from '@/components/FormatPreview';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, Checkbox, ErrorBox, Field, Input, LinkButton, Loading, Modal, PageHeader, RadioCard, Select, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { FORMAT_LABELS, formatIsPem, formatNeedsKey } from '@/lib/format';
import { FORMAT_CATEGORIES, FORMAT_PRESETS, needsPassword, specFromPreset } from '@/lib/formatPresets';
import type { DetectedFormat, OutputFormat, OutputSpec, Profile, ProfileScope } from '@/types';

const TOKENS = ['{cn}', '{cn_safe}', '{date}', '{year}', '{serial}', '{profile}'];

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ProfileEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ['profile', id], queryFn: () => api.profile(id!), enabled: !isNew });

  const certs = useQuery({ queryKey: ['certificates'], queryFn: () => api.certificates({}) });
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.tags });
  const [form, setForm] = useState<Pick<Profile, 'name' | 'description' | 'destinationPath' | 'outputs' | 'scope' | 'serverTags' | 'certificateIds'>>({
    name: '',
    description: '',
    destinationPath: '',
    outputs: [],
    scope: 'general',
    serverTags: [],
    certificateIds: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing.data && !loaded) {
      const p = existing.data.profile;
      setForm({
        name: p.name,
        description: p.description,
        destinationPath: p.destinationPath,
        outputs: p.outputs,
        scope: p.scope ?? 'general',
        serverTags: p.serverTags ?? [],
        certificateIds: p.certificateIds ?? [],
      });
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
  const addSpec = (spec: OutputSpec) => setForm((f) => ({ ...f, outputs: [...f.outputs, spec] }));

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} />;

  return (
    <>
      <div className="mb-2">
        <Link to="/profiles" className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> Output profiles
        </Link>
      </div>
      <PageHeader
        title={isNew ? 'New output profile' : form.name || 'Profile'}
        description="Choose the formats you want delivered on every renewal — build them from the catalogue, or learn them from your own reference files. Set a deploy location and Vigil will copy the files there."
        actions={
          <>
            {!isNew && (
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>
              {isNew ? 'Create profile' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Windows Web Servers" />
              </Field>
              <Field
                label="Deploy location"
                hint="Absolute or UNC path. Files are written here on renewal when deployment is on. Tokens allowed: {cn_safe} {profile} {date}."
              >
                <Input
                  value={form.destinationPath}
                  onChange={(e) => setForm({ ...form, destinationPath: e.target.value })}
                  placeholder="C:\Windows\Temp  or  \\fileserver\certs\{cn_safe}  or  /etc/ssl/webfarm"
                  className="font-mono text-[13px]"
                />
              </Field>
            </div>
            <Field label="Description" className="mt-4">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What consumes these files and any handling notes." className="min-h-16" />
            </Field>
            {form.destinationPath && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50/80 border border-brand-100 px-3.5 py-3 text-[13px] text-brand-800">
                <FolderOutput className="size-4 mt-0.5 shrink-0" />
                <span>
                  On renew, each output below is rendered and copied to <span className="font-mono">{form.destinationPath}</span>
                  {form.destinationPath.includes('{') ? ' (tokens expanded per certificate).' : '.'}
                </span>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Availability" description="General profiles are offered on every renewal. Specialized profiles only appear for the servers or certificates you assign." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RadioCard
                checked={form.scope === 'general'}
                onChange={() => setForm({ ...form, scope: 'general' })}
                title="General use"
                description="Available for any certificate — the everyday profile."
              />
              <RadioCard
                checked={form.scope === 'specialized'}
                onChange={() => setForm({ ...form, scope: 'specialized' as ProfileScope })}
                title="Specialized"
                description="Only for certificates that match the tags or assignments below."
              />
            </div>
            {form.scope === 'specialized' && (
              <div className="mt-5 space-y-5">
                <Field label="Server tags" hint="Any certificate carrying one of these tags can use this profile.">
                  <div className="flex flex-wrap gap-1.5">
                    {(tags.data?.tags ?? []).map((t) => {
                      const on = form.serverTags.includes(t.tag);
                      return (
                        <button
                          key={t.tag}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              serverTags: on ? form.serverTags.filter((x) => x !== t.tag) : [...form.serverTags, t.tag],
                            })
                          }
                          className={`h-8 rounded-lg px-2.5 text-[13px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 text-ink-700 border-ink-200 hover:border-ink-300'}`}
                        >
                          {t.tag}
                        </button>
                      );
                    })}
                    {(tags.data?.tags ?? []).length === 0 && <span className="text-[13px] text-ink-500">No tags in the estate yet — assign specific certificates below.</span>}
                  </div>
                </Field>
                <Field label="Specific certificates" hint="Optional extra assignments on top of tag matching.">
                  <div className="max-h-[220px] overflow-y-auto rounded-xl border border-ink-200 divide-y divide-ink-100">
                    {(certs.data ?? []).map((c) => {
                      const on = form.certificateIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-ink-50/70 cursor-pointer">
                          <input
                            type="checkbox"
                            className="size-4 accent-brand-600"
                            checked={on}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                certificateIds: e.target.checked ? [...form.certificateIds, c.id] : form.certificateIds.filter((x) => x !== c.id),
                              })
                            }
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-ink-900 truncate">{c.name}</span>
                            <span className="block text-[11px] text-ink-500 truncate">{c.tags.join(', ') || 'No tags'}</span>
                          </span>
                          <StatusBadge status={c.status} />
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Output files"
              description="These are the specialised forms produced on every renewal — PFX, full chain, decrypted key, and anything else you need."
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" icon={<FileSearch className="size-3.5" />} onClick={() => setInspectOpen(true)}>
                    From reference file
                  </Button>
                  <Button size="sm" variant="primary" icon={<Wrench className="size-3.5" />} onClick={() => setBuilderOpen(true)}>
                    Build from catalogue
                  </Button>
                </div>
              }
            />
            {form.outputs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center">
                <Wrench className="size-5 text-brand-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-ink-900">Build the deliverables for this profile</div>
                <p className="text-[13px] text-ink-500 mt-1 max-w-md mx-auto">
                  Pick formats from the catalogue (full chain .cer, decrypted .key, .pfx…), or drop a reference file you already issue so Vigil can match it exactly.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button variant="primary" icon={<Wrench className="size-3.5" />} onClick={() => setBuilderOpen(true)}>
                    Open format builder
                  </Button>
                  <Button variant="secondary" icon={<FileSearch className="size-3.5" />} onClick={() => setInspectOpen(true)}>
                    Inspect a reference file
                  </Button>
                </div>
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
              <span>Filename tokens:</span>
              {TOKENS.map((t) => (
                <code key={t} className="font-mono bg-ink-100 rounded px-1.5 py-0.5 text-ink-700">
                  {t}
                </code>
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
                      <Link to={`/certificates/${c.id}`} className="text-sm text-ink-900 hover:text-brand-700 truncate">
                        {c.name}
                      </Link>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card className="bg-ink-50/60">
            <h3 className="text-[13px] font-semibold text-ink-800 mb-2">How renewals use this profile</h3>
            <ol className="text-[13px] text-ink-600 space-y-1.5 list-decimal pl-4">
              <li>Link the profile to a certificate (or select it at renew time).</li>
              <li>On renew, Vigil issues the new certificate, then renders every output below with OpenSSL.</li>
              <li>You get a ZIP plus individual downloads of the main and specialised forms.</li>
              <li>If a deploy location is set (here or on the certificate), the same files are copied there — including UNC network shares the server can write to.</li>
            </ol>
          </Card>
        </div>
      </div>

      {builderOpen && (
        <BuilderModal
          destinationPath={form.destinationPath}
          onClose={() => setBuilderOpen(false)}
          onAdd={(specs) => {
            specs.forEach(addSpec);
            setBuilderOpen(false);
            toast.success(`Added ${specs.length} output${specs.length === 1 ? '' : 's'}`);
          }}
        />
      )}
      {inspectOpen && (
        <InspectModal
          onClose={() => setInspectOpen(false)}
          onAdd={(spec) => {
            addSpec(spec);
            setInspectOpen(false);
          }}
        />
      )}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this profile?"
        description="Certificates linked to it will simply lose the link."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">Previously rendered files are not affected.</p>
      </Modal>
    </>
  );
}

function SpecEditor({
  spec,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  spec: OutputSpec;
  index: number;
  total: number;
  onChange: (p: Partial<OutputSpec>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const isPem = formatIsPem(spec.format);
  const needsKey = formatNeedsKey(spec.format);
  const pwd = needsPassword(spec.format);
  const chainish = ['pem-fullchain', 'pem-chain', 'pem-bundle', 'pkcs7-pem', 'pkcs7-der', 'pkcs12'].includes(spec.format);
  const keyish = ['pem-key', 'pem-key-encrypted', 'pem-bundle'].includes(spec.format);
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div className="rounded-xl border border-ink-200/80 bg-white/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-0.5 text-ink-300 pt-1">
          <button type="button" className="hover:text-ink-600 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
            ▲
          </button>
          <GripVertical className="size-4" />
          <button type="button" className="hover:text-ink-600 disabled:opacity-30" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
            ▼
          </button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Label">
            <Input value={spec.label} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          <Field label="Filename pattern">
            <Input value={spec.filename} onChange={(e) => onChange({ filename: e.target.value })} className="font-mono text-[13px]" />
          </Field>
          <Field label="Format" className="md:col-span-2">
            <Select value={spec.format} onChange={(e) => onChange({ format: e.target.value as OutputFormat })}>
              {(Object.keys(FORMAT_LABELS) as OutputFormat[]).map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
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
          {pwd && (
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
            {chainish && <Checkbox checked={spec.includeRoot} onChange={(v) => onChange({ includeRoot: v })} label="Include root CA (leaf + intermediate + root)" />}
            {isPem && <Checkbox checked={spec.trailingNewline} onChange={(v) => onChange({ trailingNewline: v })} label="Trailing newline" />}
            {spec.format === 'pkcs12' && <Checkbox checked={spec.legacyPkcs12} onChange={(v) => onChange({ legacyPkcs12: v })} label="Legacy algorithms (RC2/3DES)" />}
          </div>
          <div className="md:col-span-2 flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-[12px] text-ink-500">
              {spec.detected ? (
                <>
                  <Badge tone="brand">From {spec.detected.sourceFilename}</Badge>
                  <span className="truncate">{spec.detected.summary}</span>
                </>
              ) : (
                <Badge>Catalogue</Badge>
              )}
              {needsKey && <span className="text-ink-400">· requires private key</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? 'Hide preview' : 'Preview'}
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={onRemove}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      </div>
      {showPreview && (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <FormatPreviewPane spec={spec} destinationPath="{cn_safe}" />
        </div>
      )}
    </div>
  );
}

type FormatPresetCategory = (typeof FORMAT_CATEGORIES)[number]['id'];

function BuilderModal({ onClose, onAdd, destinationPath }: { onClose: () => void; onAdd: (specs: OutputSpec[]) => void; destinationPath: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<'all' | FormatPresetCategory>('all');
  const [focusId, setFocusId] = useState<string>(FORMAT_PRESETS[0].id);
  const presets = FORMAT_PRESETS.filter((p) => category === 'all' || p.category === category);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const focused = FORMAT_PRESETS.find((p) => p.id === focusId) ?? FORMAT_PRESETS[0];
  const selectedPresets = FORMAT_PRESETS.filter((p) => selected.includes(p.id));
  const folderFiles = (selectedPresets.length ? selectedPresets : [focused]).map((p) => ({ filename: p.defaults.filename, label: p.title }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Format builder"
      description="Select every form this profile should produce. Preview how it looks in the destination folder and what the file contains."
      width="max-w-5xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!selected.length}
            icon={<Plus className="size-4" />}
            onClick={() => onAdd(selectedPresets.map((p) => specFromPreset(p, newId('out'))))}
          >
            Add {selected.length || ''} selected
          </Button>
        </>
      }
    >
      <Tabs
        tabs={[{ id: 'all' as const, label: 'All' }, ...FORMAT_CATEGORIES.map((c) => ({ id: c.id as 'all' | FormatPresetCategory, label: c.label }))]}
        value={category}
        onChange={setCategory}
      />
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {presets.map((p) => {
            const on = selected.includes(p.id);
            const focusedOn = focusId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    toggle(p.id);
                    setFocusId(p.id);
                  }}
                  onMouseEnter={() => setFocusId(p.id)}
                  className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                    on
                      ? 'border-brand-500 bg-brand-50/70 ring-1 ring-brand-500'
                      : focusedOn
                        ? 'border-ink-300 bg-white/80'
                        : 'border-ink-200 hover:border-ink-300 bg-white/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 size-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300'}`}>
                      {on && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-950">{p.title}</div>
                      <div className="text-[12px] text-ink-500 mt-0.5 leading-5">{p.description}</div>
                      <div className="mt-1.5 font-mono text-[11px] text-ink-400">{p.defaults.filename}</div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="lg:sticky lg:top-0">
          <FormatPreviewPane spec={focused.defaults} destinationPath={destinationPath || '{cn_safe}'} siblings={folderFiles} />
        </div>
      </div>
    </Modal>
  );
}

function InspectModal({ onClose, onAdd }: { onClose: () => void; onAdd: (s: OutputSpec) => void }) {
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
      title="Inspect a reference file"
      description="Drop a certificate or key in the exact form you issue today. Vigil shows how it is built, then turns it into an output for this profile."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!result ? (
            <Button variant="primary" loading={analyze.isPending} disabled={!files.length} onClick={() => analyze.mutate()}>
              Analyse with OpenSSL
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onAdd(result.spec)}>
              Add this output
            </Button>
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
            </ul>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Label">
              <Input value={result.spec.label} onChange={(e) => setResult({ ...result, spec: { ...result.spec, label: e.target.value } })} />
            </Field>
            <Field label="Filename pattern">
              <Input value={result.spec.filename} onChange={(e) => setResult({ ...result, spec: { ...result.spec, filename: e.target.value } })} className="font-mono text-[13px]" />
            </Field>
            {needsPassword(result.spec.format) && (
              <Field label="Password for rendered files" required>
                <Input type="password" value={result.spec.password} onChange={(e) => setResult({ ...result, spec: { ...result.spec, password: e.target.value } })} autoComplete="new-password" />
              </Field>
            )}
          </div>
          <button type="button" className="text-[13px] text-brand-700 font-medium hover:underline" onClick={() => { setResult(null); setFiles([]); }}>
            Analyse a different file
          </button>
        </div>
      )}
    </Modal>
  );
}
