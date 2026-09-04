import type { Certificate } from '@/types';

export function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function certsByMonth(certs: Certificate[], field: 'notAfter' | 'createdAt', months = 12): number[] {
  const keys = lastNMonths(months);
  const map = new Map(keys.map((k) => [k, 0]));
  for (const c of certs) {
    const k = monthKey(c[field]);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((k) => map.get(k) ?? 0);
}

export function deltaFromSeries(series: number[]): { label: string; direction: 'up' | 'down' | 'flat' } | undefined {
  if (series.length < 2) return undefined;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  if (prev === cur) return { label: 'unchanged vs last period', direction: 'flat' };
  if (cur < prev) return { label: `down from ${prev}`, direction: 'down' };
  return { label: `up from ${prev}`, direction: 'up' };
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
