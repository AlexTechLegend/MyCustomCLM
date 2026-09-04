export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'vigil:theme';

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    // One-time migration from the old "system" value.
    if (stored === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Private mode / blocked storage.
  }
  return 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
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
  return current === 'light' ? 'dark' : 'light';
}
