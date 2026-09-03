export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'vigil:theme';

const THEMES: Theme[] = ['light', 'dark', 'system'];

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private mode / blocked storage — fall through to system.
  }
  return 'system';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private-mode failures; the in-session stamp still applies.
  }
  applyTheme(theme);
}

export function cycleTheme(current: Theme): Theme {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] ?? 'system';
}
