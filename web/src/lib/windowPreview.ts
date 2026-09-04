import type { MaintenanceWindow } from '@/types/automation';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayLabel(n: number): string {
  return WEEKDAYS[n] ?? `Day ${n}`;
}

function isBlackedOut(at: Date, win: MaintenanceWindow): boolean {
  const t = at.getTime();
  return win.blackoutRanges.some((r) => {
    const start = Date.parse(r.start);
    const end = Date.parse(r.end);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return t >= start && t <= end;
  });
}

/** Next occurrences of a weekly window, skipping blackouts. */
export function nextWindowOccurrences(win: MaintenanceWindow, count = 6, from = new Date()): Date[] {
  const [hh, mm] = (win.startTime || '00:00').split(':').map((x) => Number(x) || 0);
  const out: Date[] = [];
  for (let i = 0; i < 400 && out.length < count; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (day.getDay() !== win.weekday) continue;
    const occ = new Date(day);
    occ.setHours(hh, mm, 0, 0);
    if (occ.getTime() < from.getTime()) continue;
    if (isBlackedOut(occ, win)) continue;
    out.push(occ);
  }
  return out;
}

export function windowOnDay(win: MaintenanceWindow, date: Date): boolean {
  if (date.getDay() !== win.weekday) return false;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return !win.blackoutRanges.some((r) => {
    const a = Date.parse(r.start);
    const b = Date.parse(r.end);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return a <= end.getTime() && b >= start.getTime() && date.getDay() === win.weekday;
  });
}
