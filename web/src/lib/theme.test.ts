import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, cycleTheme, persistTheme, readTheme, THEME_STORAGE_KEY } from './theme';

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: prefersDark, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readTheme', () => {
  it('defaults to light when nothing is stored', () => {
    expect(readTheme()).toBe('light');
  });

  it('reads back an explicitly stored light or dark value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readTheme()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readTheme()).toBe('light');
  });

  it('migrates the legacy "system" value to dark when the OS prefers dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    mockMatchMedia(true);
    expect(readTheme()).toBe('dark');
  });

  it('migrates the legacy "system" value to light when the OS does not prefer dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    mockMatchMedia(false);
    expect(readTheme()).toBe('light');
  });

  it('falls back to light for garbage values without throwing', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readTheme()).toBe('light');
  });

  it('falls back to light when localStorage.getItem throws (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => readTheme()).not.toThrow();
    expect(readTheme()).toBe('light');
    spy.mockRestore();
  });
});

describe('applyTheme', () => {
  it('stamps data-theme on the document element', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('persistTheme', () => {
  it('writes the value to storage and applies it immediately', () => {
    persistTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('still applies the theme in-session even if storage write fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => persistTheme('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    spy.mockRestore();
  });
});

describe('cycleTheme', () => {
  it('toggles between light and dark', () => {
    expect(cycleTheme('light')).toBe('dark');
    expect(cycleTheme('dark')).toBe('light');
  });
});
