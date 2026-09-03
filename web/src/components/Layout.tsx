import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity,
  Fingerprint,
  FolderCog,
  History,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { Logo, Mark } from './Logo';
import { api } from '@/lib/api';
import { hours } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/certificates', label: 'Certificates', icon: ShieldCheck },
  { to: '/renewals', label: 'Renewals', icon: History },
  { to: '/profiles', label: 'Output profiles', icon: FolderCog },
  { to: '/identities', label: 'Identity templates', icon: Fingerprint },
  { to: '/tags', label: 'Tags & groups', icon: Tags },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 64;
const STORAGE_KEY = 'vigil:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function useIsLgUp() {
  const [up, setUp] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setUp(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return up;
}

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function Layout() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 30_000 });
  const location = useLocation();
  const lgUp = useIsLgUp();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const attention = (data?.counts.critical ?? 0) + (data?.counts.expired ?? 0);
  const modKey = isMac() ? '⌘' : 'Ctrl';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (lgUp) setMobileOpen(false);
  }, [lgUp]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      writeCollapsed(next);
      return next;
    });
  };

  const rail = lgUp && collapsed;
  const sidebarWidth = lgUp ? (collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED) : 0;
  const drawerVisible = lgUp || mobileOpen;

  return (
    <div className="min-h-screen flex" style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}>
      {/* Mobile backdrop */}
      {!lgUp && mobileOpen && <div className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />}

      <aside
        className={clsx(
          'glass-dark text-ink-300 flex flex-col fixed inset-y-0 left-0 border-r border-white/8 z-50 transition-[width,transform] duration-200 ease-out',
          lgUp ? 'translate-x-0' : drawerVisible ? 'translate-x-0 w-[256px]' : '-translate-x-full w-[256px]',
          lgUp && (collapsed ? 'w-[64px]' : 'w-[256px]'),
        )}
      >
        <div className="absolute inset-x-0 top-0 h-40 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(20,161,159,0.22),_transparent_70%)]" />

        <div className={clsx('relative flex items-center', rail ? 'justify-center px-2 pt-6 pb-4' : 'justify-between px-5 pt-7 pb-5')}>
          {rail ? (
            <Mark size={30} onDark />
          ) : (
            <>
              <Logo onDark />
              {!lgUp && (
                <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-ink-400 hover:text-white hover:bg-white/10" aria-label="Close menu">
                  <X className="size-4" />
                </button>
              )}
            </>
          )}
        </div>

        <nav className={clsx('relative flex-1 space-y-0.5', rail ? 'px-2' : 'px-3')}>
          {NAV.map((n) => {
            const active = n.end ? location.pathname === n.to : location.pathname === n.to || location.pathname.startsWith(`${n.to}/`);
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                title={rail ? n.label : undefined}
                className={clsx(
                  'relative flex items-center rounded-xl text-sm font-medium transition-all duration-150',
                  rail ? 'justify-center h-10 w-full' : 'gap-3 px-3 h-10',
                  active ? 'bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'text-ink-400 hover:text-white hover:bg-white/6',
                )}
              >
                <n.icon className="size-[18px] shrink-0" />
                {!rail && (
                  <>
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.to === '/certificates' && attention > 0 && (
                      <span className="rounded-md bg-crit-500/25 text-crit-200 px-1.5 text-[11px] font-semibold tnum">{attention}</span>
                    )}
                  </>
                )}
                {rail && n.to === '/certificates' && attention > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-crit-400" aria-hidden />
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className={clsx('relative', rail ? 'p-2' : 'p-3')}>
          {!rail && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mb-3 w-full flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 px-3 h-9 text-[13px] text-ink-400 transition-colors"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="flex-1 text-left truncate">Search…</span>
              <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-400">{modKey}K</kbd>
            </button>
          )}
          {rail && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title={`Search (${modKey}K)`}
              className="mb-2 w-full flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 h-10 text-ink-400 transition-colors"
            >
              <Search className="size-4" />
            </button>
          )}

          <NavLink
            to="/certificates/import"
            title={rail ? 'Import certificate' : undefined}
            className={clsx(
              'flex items-center rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors shadow-[0_8px_24px_-8px_rgba(14,124,123,0.7),inset_0_1px_0_rgba(255,255,255,0.18)]',
              rail ? 'justify-center h-10 w-full' : 'justify-center gap-2 h-10',
            )}
          >
            <Plus className="size-4" />
            {!rail && 'Import certificate'}
          </NavLink>

          {!rail && (
            <>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 font-medium">Time reclaimed</div>
                <div className="mt-1.5 text-[22px] font-semibold text-white tnum leading-none">
                  {data ? hours(data.timeSaved.totalMinutes) : '—'}
                  <span className="text-[13px] font-medium text-ink-400 ml-1">hours</span>
                </div>
                <div className="text-[12px] text-ink-500 mt-1.5 tnum">{data ? `${data.timeSaved.totalEvents} automated actions` : 'Loading…'}</div>
              </div>
              <div className="mt-3 px-1 text-[11px] text-ink-500 truncate">{data?.settings.organisation}</div>
            </>
          )}

          {lgUp && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={clsx(
                'mt-3 w-full flex items-center rounded-xl text-ink-400 hover:text-white hover:bg-white/6 transition-colors',
                rail ? 'justify-center h-9' : 'gap-2 px-3 h-9 text-[13px]',
              )}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!rail && <span>Collapse</span>}
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 transition-[margin] duration-200 ease-out" style={{ marginLeft: 'var(--sidebar-w)' }}>
        {!lgUp && (
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 border-b border-ink-200/60 bg-white/55 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center justify-center size-9 rounded-xl border border-ink-200 bg-white/70 text-ink-700 hover:bg-white"
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </button>
            <Mark size={26} />
            <span className="text-[15px] font-semibold text-ink-950 tracking-tight">Vigil</span>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 h-8 rounded-lg border border-ink-200 bg-white/70 px-2.5 text-[12px] text-ink-500 hover:text-ink-800"
            >
              <Search className="size-3.5" />
              <kbd className="font-medium">{modKey}K</kbd>
            </button>
          </div>
        )}
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-7 sm:py-9">
          <Outlet />
        </div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
