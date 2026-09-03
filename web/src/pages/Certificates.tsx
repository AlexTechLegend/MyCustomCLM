import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowUpDown, Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, KeyRound, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BulkBar, TableCheckbox } from '@/components/BulkBar';
import { CertRowMenu } from '@/components/CertRowMenu';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, Chips, EmptyState, ErrorBox, Field, Input, LifetimeBar, LinkButton, Loading, Modal, PageHeader, Select, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, relativeDays, SOURCE_LABEL } from '@/lib/format';
import { deleteView, loadSavedViews, normalizeQuery, saveView, viewsEqual, type SavedView } from '@/lib/savedViews';
import type { CertStatus, Certificate } from '@/types';

type StatusFilter = 'all' | CertStatus;
type SortKey = 'expiry' | 'name' | 'issuer' | 'updated' | 'status';
type Dir = 'asc' | 'desc';

const STATUS_RANK: Record<CertStatus, number> = { expired: 0, critical: 1, expiring: 2, healthy: 3 };
const DEFAULT_SORT: SortKey = 'expiry';
const PAGE_SIZES = [25, 50, 100, 'all'] as const;
const SORT_LABELS: Record<SortKey, string> = {
  expiry: 'Soonest expiry',
  name: 'Name A–Z',
  issuer: 'Issuer',
  updated: 'Recently updated',
  status: 'Status',
};
const STATUS_LABEL: Record<CertStatus, string> = {
  healthy: 'Healthy',
  expiring: 'Expiring',
  critical: 'Critical',
  expired: 'Expired',
};

function defaultDir(sort: SortKey): Dir {
  return sort === 'updated' ? 'desc' : 'asc';
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportCsv(rows: Certificate[]) {
  const header = ['name', 'commonName', 'sans', 'issuer', 'notBefore', 'notAfter', 'daysRemaining', 'status', 'keyAlgo', 'keyBits', 'tags', 'source', 'profileIds'];
  const lines = [
    header.join(','),
    ...rows.map((c) =>
      [
        csvField(c.name),
        csvField(c.commonName),
        csvField(c.sans.join(';')),
        csvField(c.issuer),
        csvField(c.notBefore),
        csvField(c.notAfter),
        String(c.daysRemaining),
        csvField(c.status),
        csvField(c.keyAlgo),
        c.keyBits == null ? '' : String(c.keyBits),
        csvField(c.tags.join(';')),
        csvField(c.source),
        csvField(c.profileIds.join(';')),
      ].join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'certificates.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pageItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const nums = [...new Set([1, total, current, current - 1, current + 1])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const items: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i]! - nums[i - 1]! > 1) items.push('ellipsis');
    items.push(nums[i]!);
  }
  return items;
}

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: Dir;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sort === column;
  return (
    <th className={clsx('font-medium px-4 py-3', className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={clsx(
          'inline-flex items-center gap-1 uppercase tracking-wide text-[12px] hover:text-ink-800',
          active ? 'text-ink-800' : 'text-ink-500',
        )}
      >
        {label}
        {active ? dir === 'desc' ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" /> : <ArrowUpDown className="size-3 opacity-40" />}
      </button>
    </th>
  );
}

export function Certificates() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();

  const q = params.get('q') ?? '';
  const status = (params.get('status') ?? 'all') as StatusFilter;
  const source = params.get('source') ?? 'all';
  const sort = ((params.get('sort') ?? DEFAULT_SORT) as SortKey) || DEFAULT_SORT;
  const dir = ((params.get('dir') as Dir | null) ?? defaultDir(sort)) as Dir;
  const profileId = params.get('profileId') ?? undefined;
  const tag = params.get('tag') ?? undefined;
  const groupId = params.get('groupId') ?? undefined;
  const unprofiled = params.get('unprofiled') === 'true';
  const pageSizeParam = params.get('pageSize');
  const pageSize: number | 'all' = pageSizeParam === 'all' ? 'all' : pageSizeParam && Number(pageSizeParam) ? Number(pageSizeParam) : 50;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() => loadSavedViews());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [deleteViewTarget, setDeleteViewTarget] = useState<SavedView | null>(null);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (search !== q) set({ q: search, page: undefined });
    }, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filterKey = [q, status, source, tag ?? '', groupId ?? '', profileId ?? '', unprofiled ? '1' : ''].join('|');
  useEffect(() => {
    setSelected(new Set());
  }, [filterKey]);

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== 'all' && v !== '') next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const resetPage = (patch: Record<string, string | undefined>) => set({ ...patch, page: undefined });

  const all = useQuery({ queryKey: ['certificates', { profileId, tag, groupId }], queryFn: () => api.certificates({ profileId, tag, groupId, sort: 'expiry' }) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles() });
  const tagsMeta = useQuery({ queryKey: ['tags'], queryFn: api.tags });

  const filtered = useMemo(() => {
    let list = all.data ?? [];
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((c) => [c.name, c.commonName, c.issuer, c.serial, ...c.sans, ...c.tags].some((v) => v.toLowerCase().includes(needle)));
    }
    if (status !== 'all') list = list.filter((c) => c.status === status);
    if (source !== 'all') list = list.filter((c) => c.source === source);
    if (unprofiled) list = list.filter((c) => c.profileIds.length === 0);
    const mul = dir === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name) * mul;
      if (sort === 'issuer') return a.issuerCommonName.localeCompare(b.issuerCommonName) * mul;
      if (sort === 'updated') return a.updatedAt.localeCompare(b.updatedAt) * mul;
      if (sort === 'status') return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * mul;
      return a.notAfter.localeCompare(b.notAfter) * mul;
    });
  }, [all.data, q, status, source, sort, dir, unprofiled]);

  const size = pageSize === 'all' ? Math.max(filtered.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / size) || 1);
  const safePage = Math.min(page, totalPages);
  const paged = pageSize === 'all' ? filtered : filtered.slice((safePage - 1) * size, safePage * size);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * size + 1;
  const rangeEnd = pageSize === 'all' ? filtered.length : Math.min(safePage * size, filtered.length);

  const counts = useMemo(() => {
    const c = { all: 0, healthy: 0, expiring: 0, critical: 0, expired: 0 };
    for (const x of all.data ?? []) {
      c.all++;
      c[x.status]++;
    }
    return c;
  }, [all.data]);

  const profileName = (id: string) => profiles.data?.find((p) => p.id === id)?.name ?? '…';
  const groupName = groupId ? tagsMeta.data?.groups.find((g) => g.id === groupId)?.name ?? '…' : undefined;
  const groupTags = groupId ? tagsMeta.data?.groups.find((g) => g.id === groupId)?.tags ?? [] : [];

  const sortIsDefault = sort === DEFAULT_SORT && dir === defaultDir(DEFAULT_SORT);
  const hasActiveFilters = !!(q || status !== 'all' || source !== 'all' || tag || groupId || profileId || unprofiled || !sortIsDefault);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q) chips.push({ key: 'q', label: `Search: ${q}`, clear: () => { setSearch(''); resetPage({ q: undefined }); } });
  if (status !== 'all') chips.push({ key: 'status', label: `Status: ${STATUS_LABEL[status as CertStatus] ?? status}`, clear: () => resetPage({ status: undefined }) });
  if (source !== 'all') chips.push({ key: 'source', label: `Source: ${SOURCE_LABEL[source] ?? source}`, clear: () => resetPage({ source: undefined }) });
  if (tag) chips.push({ key: 'tag', label: `Tag: ${tag}`, clear: () => resetPage({ tag: undefined }) });
  if (groupId) chips.push({ key: 'groupId', label: `Group: ${groupName}`, clear: () => resetPage({ groupId: undefined }) });
  if (profileId) chips.push({ key: 'profileId', label: `Profile: ${profileName(profileId)}`, clear: () => resetPage({ profileId: undefined }) });
  if (unprofiled) chips.push({ key: 'unprofiled', label: 'No profile linked', clear: () => resetPage({ unprofiled: undefined }) });
  if (!sortIsDefault) {
    const dirHint = dir === 'desc' ? 'desc' : 'asc';
    chips.push({
      key: 'sort',
      label: `Sort: ${SORT_LABELS[sort] ?? sort} (${dirHint})`,
      clear: () => resetPage({ sort: undefined, dir: undefined }),
    });
  }

  const clearAll = () => {
    setSearch('');
    setParams((prev) => {
      const next = new URLSearchParams();
      const ps = prev.get('pageSize');
      if (ps) next.set('pageSize', ps);
      return next;
    }, { replace: true });
  };

  const onHeaderSort = (column: SortKey) => {
    if (sort === column) {
      resetPage({ sort: column, dir: dir === 'asc' ? 'desc' : 'asc' });
    } else {
      const nextDir = defaultDir(column);
      resetPage({ sort: column, dir: nextDir === defaultDir(DEFAULT_SORT) && column === DEFAULT_SORT ? undefined : nextDir });
    }
  };

  const currentQuery = normalizeQuery(params.toString());
  const activeViewId = views.find((v) => viewsEqual(v.query, currentQuery))?.id;

  const applyView = (view: SavedView) => {
    const next = new URLSearchParams(view.query);
    if (pageSizeParam) next.set('pageSize', pageSizeParam);
    next.delete('page');
    setParams(next, { replace: true });
    setSearch(next.get('q') ?? '');
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someSelected = filtered.some((c) => selected.has(c.id));

  const runBulk = async (label: string, ids: string[], fn: (id: string) => Promise<void>) => {
    setBusy(true);
    setProgress({ done: 0, total: ids.length });
    let failed = 0;
    let done = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await fn(id);
      } catch (e) {
        failed++;
        errors.push(e instanceof Error ? e.message : String(e));
      }
      done++;
      setProgress({ done, total: ids.length });
    }
    await Promise.all([qc.invalidateQueries({ queryKey: ['certificates'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['tags'] })]);
    setBusy(false);
    setProgress(null);
    const ok = ids.length - failed;
    if (failed === 0) toast.success(`${label} ${ok} certificate${ok === 1 ? '' : 's'}`);
    else toast.error(`${label} ${ok} of ${ids.length}`, errors[0] ?? `${failed} failed`);
  };

  const selectedIds = [...selected];
  const selectedCerts = (all.data ?? []).filter((c) => selected.has(c.id));

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Search across common names, SANs, issuers, serials and tags."
        actions={<LinkButton to="/certificates/import" variant="primary">Import certificate</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {views.map((v) => {
          const active = v.id === activeViewId;
          return (
            <span
              key={v.id}
              className={clsx(
                'inline-flex items-center gap-1 h-8 rounded-lg border px-2.5 text-[13px] font-medium',
                active ? 'bg-brand-50 text-brand-800 border-brand-300' : 'bg-surface text-ink-600 border-ink-200',
              )}
            >
              <button type="button" onClick={() => applyView(v)} className="hover:text-ink-950">
                {v.name}
              </button>
              {!v.builtin && (
                <button type="button" aria-label={`Delete view ${v.name}`} className="rounded p-0.5 text-ink-400 hover:text-ink-800" onClick={() => setDeleteViewTarget(v)}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          );
        })}
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" icon={<Bookmark className="size-3.5" />} onClick={() => { setSaveName(''); setSaveOpen(true); }}>
            Save current view
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="size-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search certificates…" className="pl-9" autoFocus />
        </div>
        <Chips
          value={status}
          onChange={(v) => resetPage({ status: v })}
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
            <Select value={tag ?? 'all'} onChange={(e) => resetPage({ tag: e.target.value === 'all' ? undefined : e.target.value, groupId: undefined })} className="h-8 text-[13px] rounded-lg">
              <option value="all">All tags</option>
              {(tagsMeta.data?.tags ?? []).map((t) => (
                <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select value={groupId ?? 'all'} onChange={(e) => resetPage({ groupId: e.target.value === 'all' ? undefined : e.target.value, tag: undefined })} className="h-8 text-[13px] rounded-lg">
              <option value="all">All groups</option>
              {(tagsMeta.data?.groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={source} onChange={(e) => resetPage({ source: e.target.value })} className="h-8 text-[13px] rounded-lg">
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div className="relative w-48">
            <ArrowUpDown className="size-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Select
              value={sort}
              onChange={(e) => {
                const next = e.target.value as SortKey;
                resetPage({ sort: next, dir: defaultDir(next) });
              }}
              className="h-8 text-[13px] rounded-lg pl-8"
            >
              <option value="expiry">Soonest expiry</option>
              <option value="name">Name A–Z</option>
              <option value="issuer">Issuer</option>
              <option value="updated">Recently updated</option>
              <option value="status">Status</option>
            </Select>
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mb-4 text-[13px] text-ink-600 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-surface pl-2.5 pr-1 h-7">
              {c.label}
              <button type="button" aria-label={`Clear ${c.label}`} className="rounded p-0.5 text-ink-400 hover:text-ink-800" onClick={c.clear}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {groupId && groupTags.length > 0 && (
            <span className="text-ink-400">({groupTags.join(', ')})</span>
          )}
          <button type="button" className="text-brand-700 font-medium hover:underline" onClick={clearAll}>
            Clear all
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
        <>
          <Card padded={false} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wide text-ink-500 border-b border-ink-200">
                  <th className="font-medium pl-6 pr-2 py-3 w-10">
                    <TableCheckbox
                      checked={allFilteredSelected}
                      indeterminate={someSelected && !allFilteredSelected}
                      onChange={(on) => setSelected(on ? new Set(filtered.map((c) => c.id)) : new Set())}
                      label={filtered.length > paged.length ? `Select all ${filtered.length} matching certificates` : 'Select all'}
                    />
                  </th>
                  <SortHeader label="Certificate" column="name" sort={sort} dir={dir} onSort={onHeaderSort} className="pl-2" />
                  <SortHeader label="Issuer" column="issuer" sort={sort} dir={dir} onSort={onHeaderSort} />
                  <SortHeader label="Expires" column="expiry" sort={sort} dir={dir} onSort={onHeaderSort} className="w-[220px]" />
                  <th className="font-medium px-4 py-3">Key</th>
                  <th className="font-medium px-4 py-3">Profiles</th>
                  <SortHeader label="Status" column="status" sort={sort} dir={dir} onSort={onHeaderSort} />
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {paged.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/70 transition-colors group">
                    <td className="pl-6 pr-2 py-3.5">
                      <TableCheckbox
                        checked={selected.has(c.id)}
                        onChange={(on) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                        label={`Select ${c.name}`}
                      />
                    </td>
                    <td className="px-2 py-3.5">
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
                      <div className="inline-flex items-center justify-end gap-1">
                        <LinkButton to={`/certificates/${c.id}/renew`} variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} className="group-hover:border-ink-300">
                          Renew
                        </LinkButton>
                        <CertRowMenu cert={c} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > paged.length && allFilteredSelected && (
              <p className="px-6 py-2 text-[12px] text-ink-500 border-t border-ink-100">
                All {filtered.length} matching certificates are selected, not only this page.
              </p>
            )}
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-ink-600">
            <span className="tnum">
              Showing {rangeStart}–{rangeEnd} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <span>Per page</span>
              <Select
                value={String(pageSize)}
                onChange={(e) => set({ pageSize: e.target.value === '50' ? undefined : e.target.value, page: undefined })}
                className="h-8 w-[5.5rem] text-[13px] rounded-lg"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n === 'all' ? 'All' : n}</option>
                ))}
              </Select>
            </div>
            {pageSize !== 'all' && totalPages > 1 && (
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={safePage <= 1} onClick={() => set({ page: String(safePage - 1) })} aria-label="Previous page" icon={<ChevronLeft className="size-4" />}>
                  Prev
                </Button>
                {pageItems(safePage, totalPages).map((item, i) =>
                  item === 'ellipsis' ? (
                    <span key={`e${i}`} className="px-1 text-ink-400">…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => set({ page: item === 1 ? undefined : String(item) })}
                      className={clsx(
                        'size-8 rounded-lg text-[13px] font-medium tnum',
                        item === safePage ? 'bg-ink-950 text-white' : 'text-ink-600 hover:bg-ink-100',
                      )}
                    >
                      {item}
                    </button>
                  ),
                )}
                <Button size="sm" variant="ghost" disabled={safePage >= totalPages} onClick={() => set({ page: String(safePage + 1) })} aria-label="Next page" icon={<ChevronRight className="size-4" />}>
                  Next
                </Button>
              </div>
            )}
          </div>

          <BulkBar
            selectedCount={selected.size}
            matchingCount={filtered.length}
            pageCount={paged.length}
            progress={progress}
            busy={busy}
            profiles={profiles.data ?? []}
            onClear={() => setSelected(new Set())}
            onExportCsv={() => exportCsv(selectedCerts)}
            onAddTag={(nextTag) => {
              const byId = new Map((all.data ?? []).map((c) => [c.id, c]));
              void runBulk('Tagged', selectedIds, async (id) => {
                const cert = byId.get(id);
                const tags = cert?.tags ?? [];
                if (tags.includes(nextTag)) return;
                await api.updateCertificate(id, { tags: [...tags, nextTag] });
              });
            }}
            onLinkProfile={(id) => {
              const byId = new Map((all.data ?? []).map((c) => [c.id, c]));
              void runBulk('Linked profile on', selectedIds, async (certId) => {
                const cert = byId.get(certId);
                const ids = cert?.profileIds ?? [];
                if (ids.includes(id)) return;
                await api.updateCertificate(certId, { profileIds: [...ids, id] });
              });
            }}
          />
        </>
      )}

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save current view"
        description="Stores the current filters in this browser."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!saveName.trim()}
              onClick={() => {
                saveView(saveName, params.toString());
                setViews(loadSavedViews());
                setSaveOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Name">
          <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Prod web" autoFocus onKeyDown={(e) => {
            if (e.key === 'Enter' && saveName.trim()) {
              saveView(saveName, params.toString());
              setViews(loadSavedViews());
              setSaveOpen(false);
            }
          }} />
        </Field>
      </Modal>

      <Modal
        open={!!deleteViewTarget}
        onClose={() => setDeleteViewTarget(null)}
        title="Delete saved view?"
        description={deleteViewTarget ? `${deleteViewTarget.name} will be removed from this browser.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteViewTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteViewTarget) deleteView(deleteViewTarget.id);
                setViews(loadSavedViews());
                setDeleteViewTarget(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">Built-in views cannot be deleted. This only removes a view you saved.</p>
      </Modal>
    </>
  );
}
