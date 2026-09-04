import clsx from 'clsx';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { prefetchRoute, prefetchRouteChunk } from '@/lib/lazyRoutes';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const FLYOUT_WIDTH = 190;
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;
const VIEW_MARGIN = 8;

export function navItemActive(pathname: string, item: NavItem): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function navItemBadge(item: NavItem, attention: number, waiting: number): number {
  if (item.to === '/certificates') return attention;
  if (item.to === '/approvals') return waiting;
  return 0;
}

function finePointerHover(): boolean {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function ExpandedNav({
  groups,
  pathname,
  attention,
  waiting,
}: {
  groups: NavGroup[];
  pathname: string;
  attention: number;
  waiting: number;
}) {
  const queryClient = useQueryClient();
  const onIntent = useCallback((to: string) => prefetchRoute(to, queryClient), [queryClient]);
  return (
    <>
      {groups.map((group, index) => (
        <div key={group.id}>
          <div
            className={clsx(
              'pb-1 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-white/40',
              index === 0 ? 'pt-0' : 'pt-4',
            )}
          >
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = navItemActive(pathname, item);
            const badge = navItemBadge(item, attention, waiting);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onMouseEnter={() => onIntent(item.to)}
                onFocus={() => onIntent(item.to)}
                className={clsx(
                  'relative flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-white/10'
                    : 'text-white/60 hover:text-white hover:bg-white/8',
                )}
              >
                <item.icon className="size-[18px] shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {badge > 0 && item.to === '/certificates' && (
                  <span className="rounded-md bg-crit-500/25 text-crit-200 px-1.5 text-[11px] font-semibold tnum">{badge}</span>
                )}
                {badge > 0 && item.to === '/approvals' && (
                  <span className="rounded-md bg-warn-500/25 text-warn-100 px-1.5 text-[11px] font-semibold tnum">{badge}</span>
                )}
              </NavLink>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function NavRail({
  groups,
  railWidth,
  attention,
  waiting,
}: {
  groups: NavGroup[];
  railWidth: number;
  attention: number;
  waiting: number;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const onIntent = useCallback((to: string) => prefetchRoute(to, queryClient), [queryClient]);
  const menuId = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState({ top: VIEW_MARGIN });
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Array<HTMLAnchorElement | null>>([]);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const ignoreFocus = useRef(false);

  const clearOpenTimer = () => {
    if (openTimer.current != null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const close = useCallback((restore = false) => {
    clearOpenTimer();
    clearCloseTimer();
    const id = openId;
    setOpenId(null);
    setPinned(false);
    if (restore && id) {
      ignoreFocus.current = true;
      buttons.current[id]?.focus();
      requestAnimationFrame(() => {
        ignoreFocus.current = false;
      });
    }
  }, [openId]);

  useEffect(() => {
    clearOpenTimer();
    clearCloseTimer();
    setOpenId(null);
    setPinned(false);
  }, [location.pathname, location.search]);

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  }, []);

  const openGroup = useCallback((id: string, pin = false) => {
    clearOpenTimer();
    clearCloseTimer();
    setOpenId(id);
    setPinned(pin);
  }, []);

  const scheduleOpen = (id: string) => {
    if (!finePointerHover()) return;
    clearCloseTimer();
    if (openId === id) return;
    clearOpenTimer();
    // Hovering the group icon is the earliest real signal of intent — the
    // items inside aren't hoverable yet, so warm their chunks now rather
    // than waiting for the flyout to open and the pointer to reach one.
    for (const item of groups.find((g) => g.id === id)?.items ?? []) prefetchRouteChunk(item.to);
    openTimer.current = window.setTimeout(() => openGroup(id, false), OPEN_DELAY_MS);
  };

  const scheduleClose = () => {
    if (pinned) return;
    clearOpenTimer();
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpenId(null);
      setPinned(false);
    }, CLOSE_DELAY_MS);
  };

  const openGroupData = groups.find((g) => g.id === openId) ?? null;

  const place = useCallback(() => {
    if (!openId) return;
    const trigger = buttons.current[openId];
    const panel = panelRef.current;
    if (!trigger) return;
    const top = trigger.getBoundingClientRect().top;
    const height = panel?.offsetHeight ?? 0;
    const maxTop = window.innerHeight - height - VIEW_MARGIN;
    setPos({ top: Math.max(VIEW_MARGIN, height ? Math.min(top, maxTop) : top) });
  }, [openId]);

  useLayoutEffect(() => {
    place();
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(panel);
    return () => ro.disconnect();
  }, [place, openId]);

  useLayoutEffect(() => {
    itemsRef.current.length = openGroupData?.items.length ?? 0;
  }, [openId, openGroupData?.items.length]);

  useEffect(() => {
    if (!openId) return;
    const onScrollOrResize = () => place();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [openId, place]);

  useEffect(() => {
    if (!openId) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      const trigger = buttons.current[openId];
      if (trigger?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(true);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [openId, close]);

  const focusItem = (index: number) => {
    const items = itemsRef.current.filter(Boolean) as HTMLAnchorElement[];
    if (!items.length) return;
    const next = (index + items.length) % items.length;
    items[next]?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = itemsRef.current.filter(Boolean) as HTMLAnchorElement[];
    const i = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(i < 0 ? 0 : i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(i < 0 ? items.length - 1 : i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(items.length - 1);
    }
  };

  return (
    <>
      {groups.map((group) => {
        const active = group.items.some((item) => navItemActive(location.pathname, item));
        const rolled = group.items.reduce((sum, item) => sum + navItemBadge(item, attention, waiting), 0);
        const expanded = openId === group.id;
        return (
          <button
            key={group.id}
            ref={(el) => {
              buttons.current[group.id] = el;
            }}
            type="button"
            aria-label={group.label}
            aria-haspopup="menu"
            aria-expanded={expanded}
            aria-controls={expanded ? menuId : undefined}
            className={clsx(
              'relative flex items-center justify-center h-10 w-full rounded-xl text-sm font-medium transition-all duration-150',
              active
                ? 'bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-white/10'
                : 'text-white/60 hover:text-white hover:bg-white/8',
            )}
            onMouseEnter={() => scheduleOpen(group.id)}
            onMouseLeave={scheduleClose}
            onFocus={() => {
              if (ignoreFocus.current) return;
              openGroup(group.id, false);
            }}
            onClick={() => {
              if (openId === group.id && pinned) close();
              else openGroup(group.id, true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                openGroup(group.id, pinned);
                requestAnimationFrame(() => focusItem(0));
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                close(true);
              }
            }}
          >
            <group.icon className="size-[18px] shrink-0" />
            {rolled > 0 && (
              <span
                className={clsx(
                  'absolute top-1.5 right-1.5 size-1.5 rounded-full',
                  group.items.some((item) => item.to === '/certificates') ? 'bg-crit-300' : 'bg-warn-300',
                )}
                aria-hidden
              />
            )}
          </button>
        );
      })}

      {openGroupData &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={openGroupData.label}
            style={{ left: railWidth, top: pos.top, width: FLYOUT_WIDTH }}
            className="fixed z-50 glass-dark text-white/75 border border-white/12 rounded-xl py-1 shadow-lg shadow-black/20"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onKeyDown={onMenuKey}
          >
            {openGroupData.items.map((item, index) => {
              const active = navItemActive(location.pathname, item);
              const badge = navItemBadge(item, attention, waiting);
              return (
                <NavLink
                  key={item.to}
                  ref={(el) => {
                    itemsRef.current[index] = el;
                  }}
                  to={item.to}
                  end={item.end}
                  role="menuitem"
                  tabIndex={-1}
                  onMouseEnter={() => onIntent(item.to)}
                  onFocus={() => onIntent(item.to)}
                  className={clsx(
                    'flex items-center gap-3 px-3 h-10 text-sm font-medium',
                    active
                      ? 'bg-white/14 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/8',
                  )}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className={clsx(
                        'rounded-md px-1.5 text-[11px] font-semibold tnum',
                        item.to === '/certificates' ? 'bg-crit-500/25 text-crit-200' : 'bg-warn-500/25 text-warn-100',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
