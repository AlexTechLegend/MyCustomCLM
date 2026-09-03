import clsx from 'clsx';
import { Activity, FolderCog, LayoutDashboard, Plus, Settings, ShieldCheck, Tags } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Logo } from './Logo';
import { api } from '@/lib/api';
import { hours } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/certificates', label: 'Certificates', icon: ShieldCheck },
  { to: '/profiles', label: 'Output profiles', icon: FolderCog },
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
      <aside className="w-[248px] shrink-0 bg-ink-950 text-ink-300 flex flex-col fixed inset-y-0 left-0">
        <div className="px-6 pt-6 pb-5">
          <Logo onDark />
        </div>
        <nav className="px-3 flex-1 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-colors',
                  isActive ||
                  (n.to !== '/' && location.pathname.startsWith(n.to))
                    ? 'bg-white/10 text-white'
                    : 'text-ink-400 hover:text-white hover:bg-white/5',
                )
              }
            >
              <n.icon className="size-[18px]" />
              <span className="flex-1">{n.label}</span>
              {n.to === '/certificates' && attention > 0 && (
                <span className="rounded-md bg-crit-500/20 text-crit-300 px-1.5 text-[11px] font-semibold tnum">{attention}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <NavLink to="/certificates/import" className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white h-10 text-sm font-medium transition-colors">
            <Plus className="size-4" /> Import certificate
          </NavLink>
          <div className="mt-4 rounded-xl border border-white/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium">Time reclaimed</div>
            <div className="mt-1.5 text-[22px] font-semibold text-white tnum leading-none">
              {data ? hours(data.timeSaved.totalMinutes) : '—'}
              <span className="text-[13px] font-medium text-ink-400 ml-1">hours</span>
            </div>
            <div className="text-[12px] text-ink-500 mt-1.5 tnum">{data ? `${data.timeSaved.totalEvents} automated actions` : 'Loading…'}</div>
          </div>
          <div className="mt-3 px-1 text-[11px] text-ink-600 truncate">{data?.settings.organisation}</div>
        </div>
      </aside>
      <main className="flex-1 ml-[248px] min-w-0">
        <div className="max-w-[1280px] mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
