import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ChevronRight, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDrop } from '@/components/FileDrop';
import { useToast } from '@/components/Toast';
import { Button, Card, CardHeader, Checkbox, CommandTrail, ErrorBox, Field, Input, LinkButton, PageHeader, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import type { Certificate } from '@/types';

export function ImportCertificate() {
  const qc = useQueryClient();
  const toast = useToast();
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });

  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [keyPassword, setKeyPassword] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [result, setResult] = useState<{ certificate: Certificate; commands: string[] } | null>(null);

  const hasPfx = useMemo(() => files.some((f) => /\.(pfx|p12)$/i.test(f.name)), [files]);
  const hasKeyFile = useMemo(() => files.some((f) => /\.(key|pk8)$/i.test(f.name)), [files]);

  const importMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      if (password) fd.append('password', password);
      if (keyPassword) fd.append('keyPassword', keyPassword);
      if (name) fd.append('name', name);
      fd.append('tags', JSON.stringify(tags.split(',').map((s) => s.trim()).filter(Boolean)));
      if (notes) fd.append('notes', notes);
      fd.append('profileIds', JSON.stringify(profileIds));
      return api.importCertificate(fd);
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['certificates'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Imported ${r.certificate.name}`);
    },
  });

  if (result) {
    const c = result.certificate;
    return (
      <>
        <PageHeader eyebrow="Import complete" title={c.name} description="Canonical PEM material is now in the vault. Renewals and conversions are one click away." />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-6 text-ok-600 shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-ink-900">
                  Issued by <span className="font-medium">{c.issuerCommonName}</span>, valid until <span className="font-medium tnum">{new Date(c.notAfter).toLocaleDateString()}</span> ({c.daysRemaining} days).
                </div>
                <ul className="mt-3 text-[13px] text-ink-600 space-y-1">
                  <li>{c.hasKey ? 'Private key matched and stored (0600).' : 'No private key was included — PFX and key outputs will be unavailable until a renewal generates one.'}</li>
                  <li>{c.chainCount ? `${c.chainCount} issuer certificate${c.chainCount === 1 ? '' : 's'} ordered into the chain.` : 'No issuer chain was provided.'}</li>
                  <li>{c.sans.length} subject alternative name{c.sans.length === 1 ? '' : 's'}; {c.keyAlgo} {c.keyBits ?? ''} key.</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <LinkButton to={`/certificates/${c.id}`} variant="primary" icon={<ArrowRight className="size-4" />}>Open certificate</LinkButton>
              <LinkButton to={`/certificates/${c.id}/renew`}>Renew now</LinkButton>
              <Button variant="ghost" onClick={() => { setResult(null); setFiles([]); setPassword(''); setKeyPassword(''); setName(''); setTags(''); setNotes(''); }}>Import another</Button>
            </div>
          </Card>
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Terminal className="size-4" /> OpenSSL trail</span>} description="Exactly what ran, with passwords redacted." />
            <CommandTrail commands={result.commands} />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-2">
        <Link to="/certificates" className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> Certificates
        </Link>
      </div>
      <PageHeader title="Import certificate" description="Drop a .pfx / .p12, or a .cer / .crt / .pem / .der plus its .key. Vigil unpacks it with OpenSSL, orders the chain and verifies the key." />

      <form
        className="grid grid-cols-1 xl:grid-cols-3 gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (files.length) importMut.mutate();
        }}
      >
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Files" description="Any combination: PKCS#12, PEM/DER certificates, PKCS#7 bundles, PEM/DER private keys." />
            <FileDrop files={files} onChange={setFiles} accept=".pfx,.p12,.cer,.crt,.pem,.der,.key,.p7b,.p7c,.pk8,.txt" hint="Multiple files are merged: the certificate that matches the key becomes the leaf, everything else becomes its chain." />
            {(hasPfx || hasKeyFile || files.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                {hasPfx && (
                  <Field label="PKCS#12 password" hint="Leave empty for an unprotected archive.">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                  </Field>
                )}
                {hasKeyFile && (
                  <Field label="Private key password" hint="Only if the .key file is encrypted.">
                    <Input type="password" value={keyPassword} onChange={(e) => setKeyPassword(e.target.value)} autoComplete="off" />
                  </Field>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Details" description="Optional. The common name is used when no display name is given." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="portal.contoso.com" /></Field>
              <Field label="Tags" hint="Comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="web, prod, iis" /></Field>
            </div>
            <Field label="Notes" className="mt-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where it is deployed, who owns it, change-control references…" /></Field>
          </Card>

          <ErrorBox error={importMut.error} />

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="lg" loading={importMut.isPending} disabled={!files.length}>Import with OpenSSL</Button>
            <LinkButton to="/certificates" variant="ghost" size="lg">Cancel</LinkButton>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Reference profiles" description="Link now so the first renewal already knows what to produce." />
            {profiles.data?.length ? (
              <ul className="space-y-3">
                {profiles.data.map((p) => (
                  <li key={p.id}>
                    <Checkbox checked={profileIds.includes(p.id)} onChange={(on) => setProfileIds(on ? [...profileIds, p.id] : profileIds.filter((x) => x !== p.id))} label={p.name} description={`${p.outputs.length} output${p.outputs.length === 1 ? '' : 's'}${p.destinationPath ? ` → ${p.destinationPath}` : ''}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-500">No profiles yet. You can link them later from the certificate page.</p>
            )}
          </Card>
          <Card className="bg-ink-50/60">
            <h3 className="text-[13px] font-semibold text-ink-800 mb-2">What happens on import</h3>
            <ol className="text-[13px] text-ink-600 space-y-1.5 list-decimal pl-4">
              <li>PKCS#12 archives are unpacked with <code className="font-mono text-[12px]">openssl pkcs12</code> (legacy RC2 files are handled automatically).</li>
              <li>The certificate matching the private key becomes the leaf; the rest are ordered into a chain.</li>
              <li>Everything is normalised to PEM and stored in the vault with the key at 0600.</li>
              <li>The action is credited to your time-reclaimed total.</li>
            </ol>
          </Card>
        </div>
      </form>
    </>
  );
}
