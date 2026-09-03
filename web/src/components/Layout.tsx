import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity,
  CalendarDays,
  Fingerprint,
  FolderCog,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Tags,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { DiagnosticsDrawer } from './DiagnosticsDrawer';
import { HealthStrip } from './HealthStrip';
import { Logo, Mark } from './Logo';
import { ShortcutMap } from './ShortcutMap';
import { ThemeToggle } from './ThemeToggle';
import { api } from '@/lib/api';
import { hours } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/certificates', label: 'Certificates', icon: ShieldCheck },
  { to: '/renewals', label: 'Renewals', icon: RefreshCw },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/profiles', label: 'Output profiles', icon: FolderCog },
  { to: '/identities', label: 'Identity templates', icon: Fingerprint },
  { to: '/tags', label: 'Tags & groups', icon: Tags },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const G_JUMP: Record<string, string> = {
  d: '/',
  c: '/certificates',
  p: '/profiles',
  r: '/renewals',
  a: '/activity',
  s: '/settings',
  k: '/calendar',
};

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

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function Layout() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 30_000 });
  const location = useLocation();
  const nav = useNavigate();
  const lgUp = useIsLgUp();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const pendingG = useRef<number | null>(null);
  const attention = (data?.counts.critical ?? 0) + (data?.counts.expired ?? 0);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (lgUp) setMobileOpen(false);
  }, [lgUp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        setDiagnostics(false);
        setShortcuts(false);
        setMobileOpen(false);
        return;
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcuts((v) => !v);
        return;
      }
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (pendingG.current) window.clearTimeout(pendingG.current);
        pendingG.current = window.setTimeout(() => {
          pendingG.current = null;
        }, 800);
        return;
      }
      if (pendingG.current && !e.metaKey && !e.ctrlKey) {
        const to = G_JUMP[e.key.toLowerCase()];
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (to) {
          e.preventDefault();
          nav(to);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

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
      {!lgUp && mobileOpen && <div className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />}

      <aside
        className={clsx(
          'glass-dark text-ink-300 flex flex-col fixed inset-y-0 left-0 border-r border-white/8 z-50 transition-[width,transform] duration-200 ease-out',
          lgUp ? 'translate-x-0' : drawerVisible ? 'translate-x-0 w-[256px]' : '-translate-x-full w-[256px]',
          lgUp && (collapsed ? 'w-[64px]' : 'w-[256px]'),
        )}
      >
        <div className="absolute inset-x-0 top-0 h-40 pointer-events-none bg-brand-500/20" />

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

        <nav className={clsx('relative flex-1 space-y-0.5 overflow-y-auto scrollbar-thin', rail ? 'px-2' : 'px-3')}>
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
                {!rail && <span className="flex-1 truncate">{n.label}</span>}
                {!rail && n.to === '/certificates' && attention > 0 && (
                  <span className="rounded-md bg-crit-500/25 text-crit-200 px-1.5 text-[11px] font-semibold tnum">{attention}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className={clsx('relative', rail ? 'p-2' : 'p-3')}>
          <NavLink
            to="/certificates/import"
            title={rail ? 'Import certificate' : undefined}
            className={clsx(
              'flex items-center justify-center rounded-xl bg-brand-600 hover:bg-brand-500 text-white h-10 text-sm font-medium transition-colors',
              rail ? '' : 'gap-2',
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
              <ThemeToggle className="mt-2 w-full justify-start" />
            </>
          )}
          {lgUp && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className={clsx(
                'mt-2 flex items-center rounded-xl text-ink-400 hover:text-white hover:bg-white/6 h-10 text-sm font-medium w-full',
                rail ? 'justify-center' : 'gap-2 px-3',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!rail && 'Collapse'}
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 transition-[margin] duration-200" style={{ marginLeft: lgUp ? sidebarWidth : 0 }}>
        {!lgUp && (
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 h-12 border-b border-ink-100 bg-canvas/80 backdrop-blur-md">
            <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-ink-600 hover:bg-ink-50" aria-label="Open menu">
              <Menu className="size-4" />
            </button>
            <Logo />
          </div>
        )}
        <HealthStrip onOpenDiagnostics={() => setDiagnostics(true)} />
        <div className="max-w-[1280px] mx-auto px-8 py-9">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <DiagnosticsDrawer open={diagnostics} onClose={() => setDiagnostics(false)} />
      <ShortcutMap open={shortcuts} onClose={() => setShortcuts(false)} />
    </div>
  );
}
