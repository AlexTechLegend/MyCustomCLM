import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { STATUS_META } from '@/lib/format';
import { dayKey } from '@/components/tiles/helpers';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const pad = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < pad; i++) cells.push({ date: null, key: `p-${year}-${month}-${i}` });
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` });
  }
  while (cells.length % 7) cells.push({ date: null, key: `t-${year}-${month}-${cells.length}` });
  return cells;
}

export function Calendar() {
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const certs = useQuery({ queryKey: ['certificates', { profileId: undefined, tag: undefined, groupId: undefined }], queryFn: () => api.certificates({}) });

  const byDay = useMemo(() => {
    const map = new Map<string, typeof certs.data>();
    for (const c of certs.data ?? []) {
      const k = dayKey(c.notAfter);
      const list = map.get(k) ?? [];
      list.push(c);
      map.set(k, list);
    }
    return map;
  }, [certs.data]);

  const months = mode === 'month' ? [cursor] : [cursor, addMonths(cursor, 1), addMonths(cursor, 2)];
  const today = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const max = Math.max(1, ...[...byDay.values()].map((v) => v?.length ?? 0));

  if (certs.isLoading) return <Loading />;
  if (certs.error) return <ErrorBox error={certs.error} />;

  return (
    <>
      <PageHeader
        title="Expiry calendar"
        description="One cell per day. Intensity is how many certificates expire that day. Maintenance windows will appear in the reserved lane once the scheduler ships."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant={mode === 'month' ? 'primary' : 'secondary'} onClick={() => setMode('month')}>
              Month
            </Button>
            <Button size="sm" variant={mode === 'quarter' ? 'primary' : 'secondary'} onClick={() => setMode('quarter')}>
              Quarter
            </Button>
          </div>
        }
      />
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          icon={<ChevronLeft className="size-4" />}
          onClick={() => setCursor(addMonths(cursor, mode === 'month' ? -1 : -3))}
        >
          Previous
        </Button>
        <div className="text-sm font-medium text-ink-900">
          {mode === 'month'
            ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`}
        </div>
        <Button
          variant="ghost"
          onClick={() => setCursor(addMonths(cursor, mode === 'month' ? 1 : 3))}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className={mode === 'quarter' ? 'grid grid-cols-1 xl:grid-cols-3 gap-6' : ''}>
        {months.map((m) => (
          <Card key={`${m.getFullYear()}-${m.getMonth()}`} padded={false}>
            <div className="px-5 pt-5 pb-3 text-[13px] font-semibold text-ink-900">
              {m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
            <div className="px-3 pb-2 grid grid-cols-7 text-[11px] text-ink-400">
              {DOW.map((d) => (
                <div key={d} className="text-center py-1">{d}</div>
              ))}
            </div>
            <div className="px-3 pb-4 grid grid-cols-7 gap-1">
              {monthCells(m.getFullYear(), m.getMonth()).map((cell) => {
                if (!cell.date) return <div key={cell.key} />;
                const list = byDay.get(cell.key) ?? [];
                const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
                const intensity = list.length ? Math.min(1, 0.18 + (list.length / max) * 0.82) : 0;
                return (
                  <div
                    key={cell.key}
                    className={`min-h-[88px] rounded-lg border p-1.5 ${
                      cell.key === today ? 'border-brand-500' : 'border-ink-100'
                    } ${weekend ? 'bg-ink-50/70' : 'bg-surface'}`}
                    style={list.length ? { backgroundColor: `color-mix(in srgb, var(--color-warn-100) ${Math.round(intensity * 100)}%, transparent)` } : undefined}
                  >
                    <div className={`text-[11px] tnum ${cell.key === today ? 'font-semibold text-brand-700' : 'text-ink-500'}`}>
                      {cell.date.getDate()}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map((c) => (
                        <li key={c.id}>
                          <Link to={`/certificates/${c.id}`} className="flex items-center gap-1 min-w-0">
                            <span className={`size-1.5 rounded-full shrink-0 ${STATUS_META[c.status].dot}`} />
                            <span className="text-[11px] text-ink-800 truncate">{c.name}</span>
                          </Link>
                        </li>
                      ))}
                      {list.length > 3 && <li className="text-[10px] text-ink-400">+{list.length - 3} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="mx-3 mb-4 rounded-lg border border-dashed border-ink-200 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Maintenance windows</div>
              <p className="text-[12px] text-ink-500 mt-0.5">Not available yet — reserved for the scheduler.</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
