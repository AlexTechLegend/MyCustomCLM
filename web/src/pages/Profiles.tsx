import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FolderCog, FolderOutput } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, ErrorBox, LinkButton, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { FORMAT_SHORT } from '@/lib/format';

export function Profiles() {
  const q = useQuery({ queryKey: ['profiles'], queryFn: api.profiles });
  return (
    <>
      <PageHeader
        title="Reference profiles"
        description="A profile is the exact set of files you hand out — learned from your own reference files — plus where they live. Every renewal renders and deploys them."
        actions={<LinkButton to="/profiles/new" variant="primary">New profile</LinkButton>}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !q.data?.length ? (
        <Card padded={false}>
          <EmptyState
            icon={<FolderCog className="size-5" />}
            title="No reference profiles yet"
            description="Upload a certificate and key in the format you already issue. Vigil will fingerprint the format and reproduce it on every renewal."
            action={<LinkButton to="/profiles/new" variant="primary">Create your first profile</LinkButton>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {q.data.map((p) => (
            <Link key={p.id} to={`/profiles/${p.id}`} className="card p-5 flex flex-col hover:border-ink-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-ink-950 truncate">{p.name}</h3>
                  <p className="text-[13px] text-ink-500 mt-0.5 line-clamp-2">{p.description || 'No description'}</p>
                </div>
                <Badge tone="brand">{p.certificateCount ?? 0} cert{p.certificateCount === 1 ? '' : 's'}</Badge>
              </div>
              <ul className="mt-4 space-y-1.5 flex-1">
                {p.outputs.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 text-[13px]">
                    <span className="rounded-md bg-ink-100 text-ink-700 px-1.5 py-0.5 text-[11px] font-medium w-[86px] text-center shrink-0">{FORMAT_SHORT[o.format]}</span>
                    <span className="font-mono text-[12px] text-ink-800 truncate">{o.filename}</span>
                    {o.lineEnding === 'crlf' && <span className="text-[10px] text-ink-400 ml-auto">CRLF</span>}
                  </li>
                ))}
                {p.outputs.length === 0 && <li className="text-[13px] text-ink-400">No outputs defined</li>}
              </ul>
              <div className="mt-4 pt-4 border-t border-ink-100 flex items-center gap-2 text-[12px] text-ink-500">
                <FolderOutput className="size-3.5 shrink-0" />
                <span className="font-mono truncate flex-1">{p.destinationPath || 'Download only — no destination'}</span>
                <ArrowRight className="size-3.5 text-ink-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
