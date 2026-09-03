import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui';
import { dayKey } from './helpers';
import type { TileContext } from './types';

export function CalendarMiniTile({ certificates }: TileContext) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const counts = new Map<string, number>();
  for (const c of certificates) {
    const k = dayKey(c.notAfter);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  const today = dayKey(now.toISOString());
  const cells: Array<{ key: string; day: number | null; count: number }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ key: `pad-${i}`, day: null, count: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ key, day: d, count: counts.get(key) ?? 0 });
  }

  return (
    <Card>
      <CardHeader
        title="Expiry calendar"
        description={now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        action={
          <Link to="/calendar" className="text-[13px] font-medium text-brand-700 hover:text-brand-800">
            Open
          </Link>
        }
      />
      <div className="grid grid-cols-7 gap-1 text-[10px] text-ink-400 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`${d}-${i}`} className="text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const weekend = c.day != null && [0, 6].includes(new Date(year, month, c.day).getDay());
          const intensity = c.count ? Math.min(1, 0.2 + (c.count / max) * 0.8) : 0;
          return (
            <div
              key={c.key}
              className={`aspect-square rounded-md text-[10px] tnum flex items-center justify-center ${
                c.day == null ? '' : c.key === today ? 'ring-1 ring-brand-600 text-ink-950' : weekend ? 'text-ink-400' : 'text-ink-700'
              }`}
              style={c.count ? { backgroundColor: `color-mix(in srgb, var(--color-warn-500) ${Math.round(intensity * 100)}%, transparent)` } : undefined}
              title={c.count ? `${c.count} expir${c.count === 1 ? 'y' : 'ies'}` : undefined}
            >
              {c.day ?? ''}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
