import { db } from '../db.js';
import { DEFAULT_SETTINGS, type Settings } from '../types.js';

export function getSettings(): Settings {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get('app') as { value: string } | undefined;
  if (!row) return { ...DEFAULT_SETTINGS, baselines: { ...DEFAULT_SETTINGS.baselines } };
  const parsed = JSON.parse(row.value) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    baselines: { ...DEFAULT_SETTINGS.baselines, ...(parsed.baselines ?? {}) },
  };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    baselines: { ...current.baselines, ...(patch.baselines ?? {}) },
  };
  for (const k of Object.keys(next.baselines) as (keyof Settings['baselines'])[]) {
    const v = Number(next.baselines[k]);
    next.baselines[k] = Number.isFinite(v) && v >= 0 ? v : current.baselines[k];
  }
  next.expiringThresholdDays = clampInt(next.expiringThresholdDays, 1, 365, current.expiringThresholdDays);
  next.criticalThresholdDays = clampInt(next.criticalThresholdDays, 1, next.expiringThresholdDays, current.criticalThresholdDays);
  next.defaultValidityDays = clampInt(next.defaultValidityDays, 1, 3650, current.defaultValidityDays);
  db().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('app', JSON.stringify(next));
  return next;
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
