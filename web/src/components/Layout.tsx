import clsx from 'clsx';
import { Activity, Fingerprint, FolderCog, LayoutDashboard, Plus, Settings, ShieldCheck, Tags } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Logo } from './Logo';
import { api } from '@/lib/api';
import { hours } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/certificates', label: 'Certificates', icon: ShieldCheck },
  { to: '/profiles', label: 'Output profiles', icon: FolderCog },
  { to: '/identities', label: 'Identity templates', icon: Fingerprint },
  { to: '/tags', label: 'Tags & groups', icon: Tags },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 30_000 });
  const location = useLocation();
  const attention = (data?.counts.critical ?? 0) + (data?.counts.expired ?? 0);

  return (
    <div className="min-h-screen flex">
      <aside className="w-[256px] shrink-0 glass-dark text-ink-300 flex flex-col fixed inset-y-0 left-0 border-r border-white/8">
        <div className="absolute inset-x-0 top-0 h-40 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(20,161,159,0.22),_transparent_70%)]" />
        <div className="relative px-6 pt-7 pb-5">
          <Logo onDark />
        </div>
        <nav className="relative px-3 flex-1 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all duration-150',
                  isActive ||
                  (n.to !== '/' && location.pathname.startsWith(n.to))
                    ? 'bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                    : 'text-ink-400 hover:text-white hover:bg-white/6',
                )
              }
            >
              <n.icon className="size-[18px]" />
              <span className="flex-1">{n.label}</span>
              {n.to === '/certificates' && attention > 0 && (
                <span className="rounded-md bg-crit-500/25 text-crit-200 px-1.5 text-[11px] font-semibold tnum">{attention}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="relative p-3">
          <NavLink to="/certificates/import" className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white h-10 text-sm font-medium transition-colors shadow-[0_8px_24px_-8px_rgba(14,124,123,0.7),inset_0_1px_0_rgba(255,255,255,0.18)]">
            <Plus className="size-4" /> Import certificate
          </NavLink>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 font-medium">Time reclaimed</div>
            <div className="mt-1.5 text-[22px] font-semibold text-white tnum leading-none">
              {data ? hours(data.timeSaved.totalMinutes) : '—'}
              <span className="text-[13px] font-medium text-ink-400 ml-1">hours</span>
            </div>
            <div className="text-[12px] text-ink-500 mt-1.5 tnum">{data ? `${data.timeSaved.totalEvents} automated actions` : 'Loading…'}</div>
          </div>
          <div className="mt-3 px-1 text-[11px] text-ink-500 truncate">{data?.settings.organisation}</div>
        </div>
      </aside>
      <main className="flex-1 ml-[256px] min-w-0">
        <div className="max-w-[1280px] mx-auto px-8 py-9">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
