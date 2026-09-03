import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, KeyRound, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, Chips, EmptyState, ErrorBox, Input, LifetimeBar, LinkButton, Loading, PageHeader, Select, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, relativeDays, SOURCE_LABEL } from '@/lib/format';
import type { CertStatus } from '@/types';

type StatusFilter = 'all' | CertStatus;

export function Certificates() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') ?? 'all') as StatusFilter;
  const source = params.get('source') ?? 'all';
  const sort = params.get('sort') ?? 'expiry';
  const profileId = params.get('profileId') ?? undefined;
  const tag = params.get('tag') ?? undefined;
  const groupId = params.get('groupId') ?? undefined;

  // Local state for the search box so fast typing is never throttled by URL updates.
  const [search, setSearch] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (search !== q) set({ q: search });
    }, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== 'all' && v !== '') next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const all = useQuery({ queryKey: ['certificates', { profileId, tag, groupId }], queryFn: () => api.certificates({ profileId, tag, groupId, sort: 'expiry' }) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: api.profiles });
  const tagsMeta = useQuery({ queryKey: ['tags'], queryFn: api.tags });

  const filtered = useMemo(() => {
    let list = all.data ?? [];
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((c) => [c.name, c.commonName, c.issuer, c.serial, ...c.sans, ...c.tags].some((v) => v.toLowerCase().includes(needle)));
    }
    if (status !== 'all') list = list.filter((c) => c.status === status);
    if (source !== 'all') list = list.filter((c) => c.source === source);
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'issuer') return a.issuerCommonName.localeCompare(b.issuerCommonName);
      if (sort === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
      return a.notAfter.localeCompare(b.notAfter);
    });
  }, [all.data, q, status, source, sort]);

  const counts = useMemo(() => {
    const c = { all: 0, healthy: 0, expiring: 0, critical: 0, expired: 0 };
    for (const x of all.data ?? []) {
      c.all++;
      c[x.status]++;
    }
    return c;
  }, [all.data]);

  const profileName = (id: string) => profiles.data?.find((p) => p.id === id)?.name ?? '…';

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Search across common names, SANs, issuers, serials and tags."
        actions={<LinkButton to="/certificates/import" variant="primary">Import certificate</LinkButton>}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="size-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search certificates…" className="pl-9" autoFocus />
        </div>
        <Chips
          value={status}
          onChange={(v) => set({ status: v })}
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'healthy', label: 'Healthy', count: counts.healthy },
            { id: 'expiring', label: 'Expiring', count: counts.expiring },
            { id: 'critical', label: 'Critical', count: counts.critical },
            { id: 'expired', label: 'Expired', count: counts.expired },
          ]}
        />
        <div className="flex items-center gap-2 ml-auto shrink-0 flex-wrap justify-end">
          <div className="w-40">
            <Select value={tag ?? 'all'} onChange={(e) => set({ tag: e.target.value === 'all' ? undefined : e.target.value, groupId: undefined })} className="h-8 text-[13px] rounded-lg">
              <option value="all">All tags</option>
              {(tagsMeta.data?.tags ?? []).map((t) => (
                <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select value={groupId ?? 'all'} onChange={(e) => set({ groupId: e.target.value === 'all' ? undefined : e.target.value, tag: undefined })} className="h-8 text-[13px] rounded-lg">
              <option value="all">All groups</option>
              {(tagsMeta.data?.groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={source} onChange={(e) => set({ source: e.target.value })} className="h-8 text-[13px] rounded-lg">
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div className="relative w-48">
            <ArrowUpDown className="size-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Select value={sort} onChange={(e) => set({ sort: e.target.value })} className="h-8 text-[13px] rounded-lg pl-8">
              <option value="expiry">Soonest expiry</option>
              <option value="name">Name A–Z</option>
              <option value="issuer">Issuer</option>
              <option value="updated">Recently updated</option>
            </Select>
          </div>
        </div>
      </div>

      {(profileId || tag || groupId) && (
        <div className="mb-4 text-[13px] text-ink-600 flex flex-wrap items-center gap-2">
          {profileId && (
            <>
              Profile <Badge tone="brand">{profileName(profileId)}</Badge>
            </>
          )}
          {tag && (
            <>
              Tag <Badge tone="brand">{tag}</Badge>
            </>
          )}
          {groupId && (
            <>
              Group <Badge tone="brand">{tagsMeta.data?.groups.find((g) => g.id === groupId)?.name ?? '…'}</Badge>
              {!!tagsMeta.data?.groups.find((g) => g.id === groupId)?.tags.length && (
                <span className="text-ink-400">({tagsMeta.data.groups.find((g) => g.id === groupId)!.tags.join(', ')})</span>
              )}
            </>
          )}
          <button type="button" className="text-brand-700 font-medium hover:underline" onClick={() => set({ profileId: undefined, tag: undefined, groupId: undefined })}>
            Clear filters
          </button>
        </div>
      )}

      {all.isLoading ? (
        <Loading />
      ) : all.error ? (
        <ErrorBox error={all.error} />
      ) : filtered.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title={counts.all === 0 ? 'No certificates yet' : 'No certificates match'}
            description={counts.all === 0 ? 'Import a .pfx, .cer or .pem to get started.' : 'Try a different search or clear the filters.'}
            action={counts.all === 0 ? <LinkButton to="/certificates/import" variant="primary">Import certificate</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-500 border-b border-ink-200">
                <th className="font-medium px-6 py-3">Certificate</th>
                <th className="font-medium px-4 py-3">Issuer</th>
                <th className="font-medium px-4 py-3 w-[220px]">Expires</th>
                <th className="font-medium px-4 py-3">Key</th>
                <th className="font-medium px-4 py-3">Profiles</th>
                <th className="font-medium px-4 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50/70 transition-colors group">
                  <td className="px-6 py-3.5">
                    <Link to={`/certificates/${c.id}`} className="font-medium text-ink-950 hover:text-brand-700 block truncate max-w-[280px]">
                      {c.name}
                    </Link>
                    <div className="text-[12px] text-ink-500 truncate max-w-[280px]">
                      {c.sans.length > 1 ? `${c.sans.length} SANs · ` : ''}
                      {c.tags.length ? c.tags.join(', ') : SOURCE_LABEL[c.source]}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-ink-700 truncate max-w-[200px]">{c.issuerCommonName}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-ink-900 tnum">{formatDate(c.notAfter)}</span>
                      <span className={`text-[12px] tnum ${c.daysRemaining <= 7 ? 'text-crit-600 font-medium' : 'text-ink-500'}`}>{relativeDays(c.daysRemaining)}</span>
                    </div>
                    <LifetimeBar used={c.lifetimeUsed} status={c.status} className="mt-1.5" />
                  </td>
                  <td className="px-4 py-3.5 text-ink-700 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {c.hasKey && <KeyRound className="size-3.5 text-ink-400" />}
                      {c.keyAlgo} {c.keyBits ?? ''}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {c.profileIds.length === 0 ? <span className="text-[12px] text-ink-400">—</span> : c.profileIds.map((id) => <Badge key={id}>{profileName(id)}</Badge>)}
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={c.status} /></td>
                  <td className="px-6 py-3.5 text-right">
                    <LinkButton to={`/certificates/${c.id}/renew`} size="sm" icon={<RefreshCw className="size-3.5" />} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                      Renew
                    </LinkButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
