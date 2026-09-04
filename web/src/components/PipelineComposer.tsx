import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import type { PipelineStep, StepTypeInfo, VerifyAssertion } from '@/types/automation';

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? `stp_${crypto.randomUUID().slice(0, 8)}` : `stp_${Date.now().toString(36)}`;
}

function refsInConfig(config: Record<string, unknown>): string[] {
  const raw = JSON.stringify(config);
  return [...raw.matchAll(/\{steps\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]!);
}

function KnownFields({
  step,
  steps,
  onChange,
}: {
  step: PipelineStep;
  steps: PipelineStep[];
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cfg = step.config;
  const set = (patch: Record<string, unknown>) => onChange({ ...cfg, ...patch });
  const earlier = steps.filter((s) => s.id !== step.id);

  if (step.type === 'copy') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Source path"><Input value={String(cfg.source ?? '')} onChange={(e) => set({ source: e.target.value })} placeholder="{stagingDir}/cert.pem" /></Field>
        <Field label="Destination"><Input value={String(cfg.destination ?? '')} onChange={(e) => set({ destination: e.target.value })} placeholder="{prodDir}" /></Field>
      </div>
    );
  }
  if (step.type === 'backup' || step.type === 'swap') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={step.type === 'swap' ? 'Staging / source' : 'Source'}>
          <Input value={String(cfg.source ?? cfg.stagingDir ?? '')} onChange={(e) => set(step.type === 'swap' ? { stagingDir: e.target.value } : { source: e.target.value })} />
        </Field>
        <Field label={step.type === 'backup' ? 'Backup root' : 'Destination'}>
          <Input value={String(step.type === 'backup' ? (cfg.backupRoot ?? '') : (cfg.destination ?? ''))} onChange={(e) => set(step.type === 'backup' ? { backupRoot: e.target.value } : { destination: e.target.value })} />
        </Field>
        {step.type === 'swap' && (
          <Field label="Render step">
            <Select value={String(cfg.renderStepId ?? '')} onChange={(e) => set({ renderStepId: e.target.value || undefined })}>
              <option value="">None</option>
              {earlier.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
            </Select>
          </Field>
        )}
      </div>
    );
  }
  if (step.type === 'run-command') {
    return (
      <div className="space-y-3">
        <Field label="Command"><Input value={String(cfg.command ?? '')} onChange={(e) => set({ command: e.target.value })} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Shell">
            <Select value={String(cfg.shell ?? 'bash')} onChange={(e) => set({ shell: e.target.value })}>
              <option value="bash">bash</option>
              <option value="powershell">powershell</option>
              <option value="cmd">cmd</option>
            </Select>
          </Field>
          <Field label="Timeout (ms)"><Input type="number" value={String(cfg.timeoutMs ?? 60000)} onChange={(e) => set({ timeoutMs: Number(e.target.value) || 60000 })} /></Field>
          <Field label="Expected exit"><Input type="number" value={String(cfg.expectedExitCode ?? 0)} onChange={(e) => set({ expectedExitCode: Number(e.target.value) })} /></Field>
        </div>
      </div>
    );
  }
  if (step.type === 'verify') {
    const assertions = (Array.isArray(cfg.assertions) ? cfg.assertions : []) as VerifyAssertion[];
    const update = (i: number, patch: Partial<VerifyAssertion>) => {
      const next = assertions.map((a, j) => (j === i ? { ...a, ...patch } : a));
      set({ assertions: next });
    };
    return (
      <div className="space-y-3">
        {assertions.map((a, i) => (
          <div key={i} className="rounded-xl border border-line p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Select value={a.type} onChange={(e) => update(i, { type: e.target.value as VerifyAssertion['type'] })}>
                <option value="file-exists">file-exists</option>
                <option value="hash-matches">hash-matches</option>
                <option value="key-matches-cert">key-matches-cert</option>
                <option value="expiry-after">expiry-after</option>
                <option value="backup-contains">backup-contains</option>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => set({ assertions: assertions.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
            <Field label="Path"><Input value={a.path ?? ''} onChange={(e) => update(i, { path: e.target.value })} /></Field>
            {a.type === 'hash-matches' && (
              <Field label="Hash from step">
                <Select value={a.hashFromStep ?? ''} onChange={(e) => update(i, { hashFromStep: e.target.value || undefined })}>
                  <option value="">Manual hash</option>
                  {earlier.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                </Select>
              </Field>
            )}
          </div>
        ))}
        <Button size="sm" onClick={() => set({ assertions: [...assertions, { type: 'file-exists', path: '' }] })}>Add assertion</Button>
      </div>
    );
  }
  if (step.type === 'webhook') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="URL" className="sm:col-span-2"><Input value={String(cfg.url ?? '')} onChange={(e) => set({ url: e.target.value })} /></Field>
        <Field label="Method">
          <Select value={String(cfg.method ?? 'POST')} onChange={(e) => set({ method: e.target.value })}>
            <option>POST</option>
            <option>PUT</option>
            <option>GET</option>
          </Select>
        </Field>
      </div>
    );
  }
  if (step.type === 'approval') {
    return <Field label="Message"><Input value={String(cfg.message ?? '')} onChange={(e) => set({ message: e.target.value })} placeholder="Manual approval required" /></Field>;
  }
  if (step.type === 'render-output') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Staging directory"><Input value={String(cfg.stagingDir ?? '')} onChange={(e) => set({ stagingDir: e.target.value })} placeholder="{stagingDir}" /></Field>
        <Field label="Certificate id" hint="Leave blank to use the run’s certificate"><Input value={String(cfg.certificateId ?? '')} onChange={(e) => set({ certificateId: e.target.value || undefined })} /></Field>
      </div>
    );
  }
  return (
    <Field label="Config (JSON)" hint="Unknown step type — edit as JSON.">
      <Textarea
        className="font-mono text-[12px]"
        value={JSON.stringify(cfg, null, 2)}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value) as Record<string, unknown>;
            onChange(parsed);
          } catch {
            /* keep typing */
          }
        }}
      />
    </Field>
  );
}

export function PipelineComposer({
  steps,
  onChange,
  library,
}: {
  steps: PipelineStep[];
  onChange: (steps: PipelineStep[]) => void;
  library: StepTypeInfo[];
}) {
  const types = library.length ? library : [{ type: 'copy', implemented: true }];
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item!);
    onChange(next);
  };
  const add = (type: string) => {
    onChange([
      ...steps,
      { id: newId(), type, name: type, config: {}, continueOnError: false, condition: 'always' },
    ]);
  };
  const patch = (i: number, p: Partial<PipelineStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const refs = refsInConfig(step.config);
        const known = types.some((t) => t.type === step.type);
        return (
          <div key={step.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[12px] text-text-soft tnum w-6">{i + 1}</span>
              <Select value={step.type} onChange={(e) => patch(i, { type: e.target.value, name: step.name === step.type ? e.target.value : step.name })} className="w-44 h-8 text-[13px]">
                {types.map((t) => (
                  <option key={t.type} value={t.type}>{t.type}{t.implemented ? '' : ' (stub)'}</option>
                ))}
                {!known && <option value={step.type}>{step.type} (unknown)</option>}
              </Select>
              <Input className="h-8 max-w-xs" value={step.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} icon={<ChevronUp className="size-3.5" />} aria-label="Move up" />
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1} icon={<ChevronDown className="size-3.5" />} aria-label="Move down" />
                <Button size="sm" variant="danger" onClick={() => onChange(steps.filter((_, j) => j !== i))} icon={<Trash2 className="size-3.5" />} />
              </div>
            </div>
            <KnownFields step={step} steps={steps} onChange={(config) => patch(i, { config })} />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Checkbox checked={step.continueOnError} onChange={(v) => patch(i, { continueOnError: v })} label="Continue on error" />
              <Field label="Condition" className="w-40">
                <Select value={step.condition || 'always'} onChange={(e) => patch(i, { condition: e.target.value })} className="h-8 text-[13px]">
                  <option value="always">always</option>
                  <option value="on-success">on-success</option>
                  <option value="on-failure">on-failure</option>
                </Select>
              </Field>
            </div>
            {refs.length > 0 && (
              <p className="mt-2 text-[12px] text-text-soft">
                References earlier step{refs.length === 1 ? '' : 's'}: {refs.map((id) => steps.find((s) => s.id === id)?.name || id).join(', ')}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <Button key={t.type} size="sm" icon={<Plus className="size-3.5" />} onClick={() => add(t.type)}>
            {t.type}
          </Button>
        ))}
      </div>
    </div>
  );
}
