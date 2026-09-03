import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

const ROUTES = [
  { label: 'Dashboard', to: '/' },
  { label: 'Certificates', to: '/certificates' },
  { label: 'Import certificate', to: '/certificates/import' },
  { label: 'Renewals', to: '/renewals' },
  { label: 'Expiry calendar', to: '/calendar' },
  { label: 'Output profiles', to: '/profiles' },
  { label: 'Identity templates', to: '/identities' },
  { label: 'Tags & groups', to: '/tags' },
  { label: 'Activity', to: '/activity' },
  { label: 'Settings', to: '/settings' },
];

type Hit = { key: string; label: string; hint: string; to: string };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const certs = useQuery({ queryKey: ['certificates', {}], queryFn: () => api.certificates({}), enabled: open });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.profiles(), enabled: open });
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.tags, enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ('');
      setIdx(0);
    }
  }, [open]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const out: Hit[] = [];
    for (const r of ROUTES) {
      if (match(r.label)) out.push({ key: `r-${r.to}`, label: r.label, hint: 'Page', to: r.to });
    }
    for (const c of certs.data ?? []) {
      if (match(c.name) || match(c.commonName) || c.tags.some(match)) {
        out.push({ key: `c-${c.id}`, label: c.name, hint: c.commonName, to: `/certificates/${c.id}` });
      }
    }
    for (const p of profiles.data ?? []) {
      if (match(p.name)) out.push({ key: `p-${p.id}`, label: p.name, hint: 'Profile', to: `/profiles/${p.id}` });
    }
    for (const t of tags.data?.tags ?? []) {
      if (match(t.tag)) out.push({ key: `t-${t.tag}`, label: t.tag, hint: `${t.count} certificates`, to: `/certificates?tag=${encodeURIComponent(t.tag)}` });
    }
    return out.slice(0, 20);
  }, [q, certs.data, profiles.data, tags.data]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-ink-950/40" onClick={() => setOpen(false)} />
      <div role="dialog" aria-label="Command palette" className="relative w-full max-w-xl card p-0 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-ink-100">
          <Search className="size-4 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search certificates, profiles, tags, pages…"
            className="flex-1 h-12 bg-transparent text-sm text-ink-900 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(hits.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && hits[idx]) {
                e.preventDefault();
                go(hits[idx].to);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
        </div>
        <ul className="max-h-[360px] overflow-y-auto py-2 scrollbar-thin">
          {hits.length === 0 && <li className="px-4 py-6 text-[13px] text-ink-500">Nothing matches.</li>}
          {hits.map((h, i) => (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => go(h.to)}
                className={`w-full text-left px-4 py-2.5 ${i === idx ? 'bg-brand-50' : 'hover:bg-ink-50'}`}
              >
                <div className="text-sm text-ink-950">{h.label}</div>
                <div className="text-[12px] text-ink-500">{h.hint}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
