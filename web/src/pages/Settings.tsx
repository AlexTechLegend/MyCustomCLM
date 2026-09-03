import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Landmark, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button, Card, CardHeader, CodeBlock, ErrorBox, Field, Input, KeyValue, Loading, Modal, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Settings as SettingsT } from '@/types';

export function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const ca = useQuery({ queryKey: ['ca'], queryFn: api.ca });
  const system = useQuery({ queryKey: ['system'], queryFn: api.system });

  const [form, setForm] = useState<SettingsT | null>(null);
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (s: SettingsT) => api.saveSettings(s),
    onSuccess: (s) => {
      setForm(s);
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['certificates'] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error('Could not save', e),
  });

  const [caForm, setCaForm] = useState({ commonName: '', organisation: '', days: 3650 });
  const [confirmCa, setConfirmCa] = useState(false);
  const [showPem, setShowPem] = useState(false);
  const createCa = useMutation({
    mutationFn: () => api.createCa(caForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ca'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Internal CA created');
    },
    onError: (e) => toast.error('Could not create CA', e),
  });
  const deleteCa = useMutation({
    mutationFn: api.deleteCa,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ca'] });
      setConfirmCa(false);
      toast.success('Internal CA removed');
    },
  });

  if (!form) return <Loading />;
  const setBaseline = (k: keyof SettingsT['baselines'], v: string) => setForm({ ...form, baselines: { ...form.baselines, [k]: Number(v) } });

  return (
    <>
      <PageHeader title="Settings" description="Organisation, how time reclaimed is counted, the internal CA and system information." actions={<Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>Save changes</Button>} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Organisation" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Name" className="md:col-span-3"><Input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} /></Field>
              <Field label="Expiring threshold (days)" hint="Status becomes Expiring at or below this."><Input type="number" min={1} max={365} value={form.expiringThresholdDays} onChange={(e) => setForm({ ...form, expiringThresholdDays: Number(e.target.value) })} className="tnum" /></Field>
              <Field label="Critical threshold (days)" hint="Status becomes Critical at or below this."><Input type="number" min={1} max={form.expiringThresholdDays} value={form.criticalThresholdDays} onChange={(e) => setForm({ ...form, criticalThresholdDays: Number(e.target.value) })} className="tnum" /></Field>
              <Field label="Default validity (days)" hint="Pre-filled on renewals."><Input type="number" min={1} max={3650} value={form.defaultValidityDays} onChange={(e) => setForm({ ...form, defaultValidityDays: Number(e.target.value) })} className="tnum" /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Time reclaimed baselines" description="How many minutes each automated step would take a person by hand. The dashboard figure is simply the sum of these across every action, so make them honest for your team." />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Field label="Import" hint="Unpack, verify, store"><Input type="number" min={0} value={form.baselines.import} onChange={(e) => setBaseline('import', e.target.value)} className="tnum" /></Field>
              <Field label="CSR" hint="Key + request"><Input type="number" min={0} value={form.baselines.csr} onChange={(e) => setBaseline('csr', e.target.value)} className="tnum" /></Field>
              <Field label="Renewal" hint="Issue + validate"><Input type="number" min={0} value={form.baselines.renewal} onChange={(e) => setBaseline('renewal', e.target.value)} className="tnum" /></Field>
              <Field label="Conversion" hint="Per output file"><Input type="number" min={0} value={form.baselines.conversion} onChange={(e) => setBaseline('conversion', e.target.value)} className="tnum" /></Field>
              <Field label="Deployment" hint="Per destination"><Input type="number" min={0} value={form.baselines.deployment} onChange={(e) => setBaseline('deployment', e.target.value)} className="tnum" /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Landmark className="size-4" /> Internal CA</span>} description="A private root used for one-click renewals of internal certificates. RSA 4096, SHA-256, managed with openssl ca." action={ca.data?.exists ? <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmCa(true)}>Remove</Button> : undefined} />
            {ca.isLoading ? (
              <Loading />
            ) : ca.data?.exists ? (
              <>
                <KeyValue
                  items={[
                    { label: 'Subject', value: ca.data.subject },
                    { label: 'Valid', value: `${formatDate(ca.data.notBefore)} → ${formatDate(ca.data.notAfter)}` },
                    { label: 'Key', value: `${ca.data.keyAlgo} ${ca.data.keyBits}` },
                    { label: 'SHA-256', value: ca.data.fingerprintSha256, mono: true },
                  ]}
                />
                <div className="mt-4 flex items-center gap-2">
                  <a href="/api/ca/certificate" className="inline-flex items-center gap-2 h-9.5 px-4 rounded-xl text-sm font-medium border border-ink-200 text-ink-800 hover:bg-ink-50"><Download className="size-4" /> Download CA certificate</a>
                  <Button variant="ghost" onClick={() => setShowPem((s) => !s)}>{showPem ? 'Hide PEM' : 'Show PEM'}</Button>
                </div>
                {showPem && <CodeBlock className="mt-4 max-h-[240px] overflow-y-auto">{ca.data.pem ?? ''}</CodeBlock>}
                <p className="text-[12px] text-ink-500 mt-4">Distribute this certificate to the trust stores of machines that need to trust internally issued certificates.</p>
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <Field label="Common name"><Input value={caForm.commonName} onChange={(e) => setCaForm({ ...caForm, commonName: e.target.value })} placeholder={`${form.organisation} Internal CA`} /></Field>
                <Field label="Organisation"><Input value={caForm.organisation} onChange={(e) => setCaForm({ ...caForm, organisation: e.target.value })} placeholder={form.organisation} /></Field>
                <Field label="Validity (days)"><Input type="number" min={365} max={7300} value={caForm.days} onChange={(e) => setCaForm({ ...caForm, days: Number(e.target.value) })} className="tnum" /></Field>
                <div className="md:col-span-3">
                  <Button variant="primary" loading={createCa.isPending} onClick={() => createCa.mutate()}>Create internal CA</Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="System" />
            {system.data ? (
              <KeyValue
                className="grid-cols-[90px_1fr]"
                items={[
                  { label: 'OpenSSL', value: system.data.openssl },
                  { label: 'Node', value: system.data.node },
                  { label: 'Platform', value: system.data.platform },
                  { label: 'Data', value: system.data.dataDir, mono: true },
                  { label: 'Vault', value: system.data.vaultDir, mono: true },
                  { label: 'Renewals', value: system.data.renewalsDir, mono: true },
                ]}
              />
            ) : (
              <ErrorBox error={system.error} />
            )}
          </Card>
          <Card className="bg-ink-50/60">
            <h3 className="text-[13px] font-semibold text-ink-800 mb-2">Security notes</h3>
            <ul className="text-[13px] text-ink-600 space-y-1.5 list-disc pl-4">
              <li>Private keys are stored in the vault with mode 0600 and never leave the server except through the downloads you trigger.</li>
              <li>OpenSSL is invoked with argument arrays — no shell — and passwords are passed through temporary files, not the command line.</li>
              <li>Vigil currently has no user accounts. Run it behind your VPN or a reverse proxy with authentication.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal open={confirmCa} onClose={() => setConfirmCa(false)} title="Remove the internal CA?" description="Certificates it issued stay valid until they expire, but you will not be able to renew them with one click until a new CA exists." footer={<><Button variant="ghost" onClick={() => setConfirmCa(false)}>Cancel</Button><Button variant="danger" loading={deleteCa.isPending} onClick={() => deleteCa.mutate()}>Remove CA</Button></>}>
        <p className="text-sm text-ink-600">The CA private key is deleted from disk. This cannot be undone.</p>
      </Modal>
    </>
  );
}
