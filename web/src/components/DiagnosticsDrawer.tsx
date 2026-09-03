import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '@/components/CopyButton';
import { Badge, Chips, CodeBlock, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { EVENT_META, formatDateTime } from '@/lib/format';

type Kind = 'all' | 'renewal' | 'deployment' | 'other';

type Failure = {
  id: string;
  kind: Kind;
  title: string;
  when: string;
  command?: string;
  stderr?: string;
  href?: string;
};

function parseCommand(raw: string): { command: string; stderr?: string; exit?: string } {
  const exit = raw.match(/exit(?:ed)?(?: code)?[:\s]+(\d+)/i)?.[1];
  const stderrIdx = raw.search(/stderr[:\s]/i);
  if (stderrIdx >= 0) {
    return { command: raw.slice(0, stderrIdx).trim(), stderr: raw.slice(stderrIdx).replace(/^stderr[:\s]*/i, '').trim(), exit };
  }
  return { command: raw, exit };
}

export function DiagnosticsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('all');
  const activity = useQuery({ queryKey: ['activity', 'all'], queryFn: () => api.activity(), enabled: open });
  const renewals = useQuery({ queryKey: ['renewals'], queryFn: api.renewals, enabled: open });

  const items = useMemo(() => {
    const out: Failure[] = [];
    for (const r of renewals.data ?? []) {
      const deployFails = r.outputs.filter((o) => o.deployStatus === 'failed');
      if (r.status !== 'failed' && deployFails.length === 0) continue;
      const cmd = r.commands[r.commands.length - 1];
      const parsed = cmd ? parseCommand(cmd) : { command: undefined, stderr: undefined };
      out.push({
        id: `ren-${r.id}`,
        kind: deployFails.length ? 'deployment' : 'renewal',
        title: r.error || deployFails[0]?.deployError || `${r.certificateName} renewal failed`,
        when: r.completedAt ?? r.createdAt,
        command: parsed.command,
        stderr: parsed.stderr || r.error || undefined,
        href: `/certificates/${r.certificateId}/renew?renewal=${r.id}`,
      });
    }
    for (const e of activity.data?.events ?? []) {
      const blob = `${e.title} ${e.detail}`.toLowerCase();
      if (!/fail|error|stderr|denied/.test(blob)) continue;
      const cmd = e.commands[e.commands.length - 1];
      const parsed = cmd ? parseCommand(cmd) : { command: undefined, stderr: undefined };
      out.push({
        id: `ev-${e.id}`,
        kind: e.type === 'renewal' || e.type === 'deployment' ? e.type : 'other',
        title: e.title,
        when: e.createdAt,
        command: parsed.command,
        stderr: parsed.stderr || e.detail,
        href: e.certificateId
          ? e.renewalId
            ? `/certificates/${e.certificateId}/renew?renewal=${e.renewalId}`
            : `/certificates/${e.certificateId}`
          : undefined,
      });
    }
    return out.sort((a, b) => b.when.localeCompare(a.when));
  }, [activity.data, renewals.data]);

  const filtered = items.filter((i) => kind === 'all' || i.kind === kind);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside role="dialog" aria-label="Diagnostics" className="relative w-full max-w-lg h-full bg-surface border-l border-line shadow-2xl flex flex-col">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-line">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">Diagnostics</h2>
            <p className="text-[13px] text-ink-500 mt-0.5">Recent failures with the command trail. Nothing is persisted here.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-3">
          <Chips
            value={kind}
            onChange={setKind}
            options={[
              { id: 'all', label: 'All' },
              { id: 'renewal', label: EVENT_META.renewal?.label ?? 'Renewal' },
              { id: 'deployment', label: EVENT_META.deployment?.label ?? 'Deploy' },
              { id: 'other', label: 'Other' },
            ]}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6 scrollbar-thin">
          {filtered.length === 0 ? (
            <EmptyState title="No recent failures" description="Failed renewals and deploy errors will collect here." />
          ) : (
            <ul className="space-y-4">
              {filtered.map((f) => {
                const copy = [f.title, f.command, f.stderr].filter(Boolean).join('\n');
                return (
                  <li key={f.id} className="rounded-xl border border-ink-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Badge tone="crit">{f.kind}</Badge>
                        {f.href ? (
                          <Link to={f.href} className="block text-sm font-medium text-ink-950 hover:text-brand-700 mt-2" onClick={onClose}>
                            {f.title}
                          </Link>
                        ) : (
                          <div className="text-sm font-medium text-ink-950 mt-2">{f.title}</div>
                        )}
                        <div className="text-[11px] text-ink-500 tnum mt-0.5">{formatDateTime(f.when)}</div>
                      </div>
                      <CopyButton value={copy} label="Copy" size="md" />
                    </div>
                    {f.command && (
                      <div className="mt-3">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400 mb-1">Command</div>
                        <CodeBlock className="max-h-32 overflow-y-auto">{f.command}</CodeBlock>
                      </div>
                    )}
                    {f.stderr && (
                      <div className="mt-3">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400 mb-1">stderr</div>
                        <CodeBlock className="max-h-32 overflow-y-auto">{f.stderr}</CodeBlock>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
