/** Theme-aware chart fills. Values are CSS custom properties so they follow light/dark. */
export const STATUS_FILLS = {
  healthy: 'var(--color-ok-500)',
  expiring: 'var(--color-warn-500)',
  critical: 'var(--color-crit-500)',
  expired: 'var(--color-dead-500)',
} as const;

export const CHART = {
  brand: 'var(--color-brand-600)',
  brandMuted: 'var(--color-brand-300)',
  tick: 'var(--color-ink-500)',
  tickMuted: 'var(--color-ink-400)',
  cursor: 'var(--color-ink-100)',
  line: 'var(--color-ink-200)',
} as const;

export function readCssColor(token: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
  } catch {
    return fallback;
  }
}
