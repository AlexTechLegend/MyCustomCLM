import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, FolderCog, Search, ShieldCheck, Tag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import type { Certificate, Profile } from '@/types';

const GO_TO: { label: string; to: string; keywords?: string }[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Certificates', to: '/certificates' },
  { label: 'Renewals', to: '/renewals' },
  { label: 'Output profiles', to: '/profiles' },
  { label: 'Identity templates', to: '/identities' },
  { label: 'Tags & groups', to: '/tags' },
  { label: 'Activity', to: '/activity' },
  { label: 'Settings', to: '/settings' },
  { label: 'Import certificate', to: '/certificates/import', keywords: 'upload pfx' },
  { label: 'New profile', to: '/profiles/new', keywords: 'create output' },
];

const SECTION_CAP = 8;

type Result =
  | { kind: 'cert'; id: string; label: string; detail: string; to: string; status: Certificate['status']; days: number }
  | { kind: 'profile'; id: string; label: string; detail: string; to: string }
  | { kind: 'tag'; id: string; label: string; detail: string; to: string }
  | { kind: 'goto'; id: string; label: string; detail: string; to: string };

function matches(haystack: string, q: string) {
  return haystack.toLowerCase().includes(q);
}

function certHaystack(c: Certificate) {
  return [c.name, c.commonName, c.issuer, c.issuerCommonName, c.serial, ...c.sans, ...c.tags].join(' ');
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const certs = useQuery({
    queryKey: ['command-palette', 'certificates'],
    queryFn: () => api.certificates({}),
    staleTime: 60_000,
    enabled: open,
  });
  const profiles = useQuery({
    queryKey: ['command-palette', 'profiles'],
    queryFn: () => api.profiles(),
    staleTime: 60_000,
    enabled: open,
  });
  const tags = useQuery({
    queryKey: ['command-palette', 'tags'],
    queryFn: api.tags,
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (e.key === '/' && !inField && !open) {
        e.preventDefault();
        onOpenChange(true);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setActive(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  const sections = useMemo(() => {
    const query = q.trim().toLowerCase();
    const certResults: Result[] = (certs.data ?? [])
      .filter((c) => !query || matches(certHaystack(c), query))
      .slice(0, SECTION_CAP)
      .map((c) => ({
        kind: 'cert' as const,
        id: c.id,
        label: c.name,
        detail: c.commonName !== c.name ? c.commonName : c.issuerCommonName,
        to: `/certificates/${c.id}`,
        status: c.status,
        days: c.daysRemaining,
      }));

    const profileResults: Result[] = (profiles.data ?? [])
      .filter((p: Profile) => !query || matches(p.name, query) || matches(p.description ?? '', query))
      .slice(0, SECTION_CAP)
      .map((p) => ({
        kind: 'profile' as const,
        id: p.id,
        label: p.name,
        detail: p.scope === 'specialized' ? 'Specialized profile' : 'General profile',
        to: `/profiles/${p.id}`,
      }));

    const tagResults: Result[] = (tags.data?.tags ?? [])
      .filter((t) => !query || matches(t.tag, query))
      .slice(0, SECTION_CAP)
      .map((t) => ({
        kind: 'tag' as const,
        id: t.tag,
        label: t.tag,
        detail: `${t.count} certificate${t.count === 1 ? '' : 's'}`,
        to: `/certificates?tag=${encodeURIComponent(t.tag)}`,
      }));

    const gotoResults: Result[] = GO_TO.filter((g) => !query || matches(g.label, query) || matches(g.keywords ?? '', query) || matches(g.to, query))
      .slice(0, SECTION_CAP)
      .map((g) => ({
        kind: 'goto' as const,
        id: g.to,
        label: g.label,
        detail: g.to,
        to: g.to,
      }));

    return [
      { id: 'certs', label: 'Certificates', icon: ShieldCheck, items: certResults },
      { id: 'profiles', label: 'Output profiles', icon: FolderCog, items: profileResults },
      { id: 'tags', label: 'Tags', icon: Tag, items: tagResults },
      { id: 'goto', label: 'Go to', icon: ArrowRight, items: gotoResults },
    ].filter((s) => s.items.length > 0);
  }, [q, certs.data, profiles.data, tags.data]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-palette-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open, flat.length]);

  const go = (item: Result) => {
    onOpenChange(false);
    nav(item.to);
  };

  if (!open) return null;

  let index = -1;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-md" onClick={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal
        aria-label="Command palette"
        className="relative w-full max-w-xl card p-0 shadow-2xl shadow-ink-950/30 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 border-b border-ink-100">
          <Search className="size-4 text-ink-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search certificates, profiles, tags…"
            className="flex-1 h-12 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(flat.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = flat[active];
                if (item) go(item);
              }
            }}
          />
          <kbd className="hidden sm:inline-flex h-6 items-center rounded-md border border-ink-200 bg-ink-50 px-1.5 text-[11px] font-medium text-ink-500">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[min(420px,55vh)] overflow-y-auto scrollbar-thin py-2">
          {flat.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-500">
              {certs.isLoading || profiles.isLoading || tags.isLoading ? 'Loading…' : 'No matches.'}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="mb-1">
                <div className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400 flex items-center gap-1.5">
                  <section.icon className="size-3" />
                  {section.label}
                </div>
                <ul>
                  {section.items.map((item) => {
                    index += 1;
                    const i = index;
                    const on = i === active;
                    return (
                      <li key={`${item.kind}-${item.id}`}>
                        <button
                          type="button"
                          data-palette-index={i}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(item)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                            on ? 'bg-brand-50/80 text-ink-950' : 'text-ink-800 hover:bg-ink-50/80',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{item.label}</div>
                            <div className="text-[12px] text-ink-500 truncate">{item.detail}</div>
                          </div>
                          {item.kind === 'cert' && <StatusBadge status={item.status} days={item.days} />}
                          {item.kind === 'goto' && <ArrowRight className={clsx('size-3.5 shrink-0', on ? 'text-brand-600' : 'text-ink-300')} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-ink-100 flex items-center gap-3 text-[11px] text-ink-400">
          <span>
            <kbd className="font-medium text-ink-500">↑↓</kbd> move
          </span>
          <span>
            <kbd className="font-medium text-ink-500">↵</kbd> open
          </span>
          <span className="ml-auto">
            <kbd className="font-medium text-ink-500">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
