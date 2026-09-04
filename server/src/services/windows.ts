import { db, newId, nowIso, parseJson } from '../db.js';
import type { MaintenanceWindow, RenewalPolicy } from '../types.js';

interface WindowRow {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  recurrence: string;
  blackout_ranges: string;
  created_at: string;
  updated_at: string;
}

function mapRow(r: WindowRow): MaintenanceWindow {
  return {
    id: r.id,
    name: r.name,
    weekday: r.weekday,
    startTime: r.start_time,
    endTime: r.end_time,
    timezone: r.timezone,
    recurrence: 'weekly',
    blackoutRanges: parseJson(r.blackout_ranges, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listWindows(): MaintenanceWindow[] {
  return (db().prepare('SELECT * FROM maintenance_windows ORDER BY name COLLATE NOCASE').all() as WindowRow[]).map(mapRow);
}

export function getWindow(id: string): MaintenanceWindow | null {
  const row = db().prepare('SELECT * FROM maintenance_windows WHERE id = ?').get(id) as WindowRow | undefined;
  return row ? mapRow(row) : null;
}

export function createWindow(input: Partial<MaintenanceWindow>): MaintenanceWindow {
  const now = nowIso();
  const row: WindowRow = {
    id: newId('win'),
    name: (input.name ?? '').trim() || 'Untitled window',
    weekday: clampWeekday(input.weekday ?? 3),
    start_time: input.startTime ?? '02:00',
    end_time: input.endTime ?? '04:00',
    timezone: input.timezone ?? 'UTC',
    recurrence: 'weekly',
    blackout_ranges: JSON.stringify(input.blackoutRanges ?? []),
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare(
      `INSERT INTO maintenance_windows (id, name, weekday, start_time, end_time, timezone, recurrence, blackout_ranges, created_at, updated_at)
       VALUES (@id, @name, @weekday, @start_time, @end_time, @timezone, @recurrence, @blackout_ranges, @created_at, @updated_at)`,
    )
    .run(row);
  return mapRow(row);
}

export function updateWindow(id: string, input: Partial<MaintenanceWindow>): MaintenanceWindow | null {
  const existing = getWindow(id);
  if (!existing) return null;
  db()
    .prepare(
      `UPDATE maintenance_windows SET name = ?, weekday = ?, start_time = ?, end_time = ?, timezone = ?, blackout_ranges = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      clampWeekday(input.weekday ?? existing.weekday),
      input.startTime ?? existing.startTime,
      input.endTime ?? existing.endTime,
      input.timezone ?? existing.timezone,
      JSON.stringify(input.blackoutRanges ?? existing.blackoutRanges),
      nowIso(),
      id,
    );
  return getWindow(id);
}

export function deleteWindow(id: string): boolean {
  return db().prepare('DELETE FROM maintenance_windows WHERE id = ?').run(id).changes > 0;
}

function clampWeekday(n: number) {
  return Math.min(6, Math.max(0, Math.round(n)));
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

/**
 * Build a Date in the window's timezone approximation using UTC offset-less
 * interpretation: we treat start_time as wall-clock on that calendar day in the
 * named zone by formatting via Intl when available, falling back to UTC.
 */
export function windowOccurrenceOn(dateUtc: Date, win: MaintenanceWindow): Date {
  const { h, m } = parseHm(win.startTime);
  // Use the calendar parts of dateUtc in the window timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: win.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateUtc);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const mo = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  // Construct as if the wall time were UTC, then shift by the zone offset at that instant.
  const asUtc = new Date(Date.UTC(y, mo - 1, d, h, m, 0));
  const offsetMin = zoneOffsetMinutes(asUtc, win.timezone || 'UTC');
  return new Date(asUtc.getTime() - offsetMin * 60_000);
}

function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const name = fmt.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return 0;
  }
}

function weekdayInZone(d: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? d.getUTCDay();
}

function isBlackedOut(when: Date, win: MaintenanceWindow): boolean {
  const t = when.getTime();
  for (const b of win.blackoutRanges) {
    const start = new Date(b.start).getTime();
    const end = new Date(b.end).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && t >= start && t <= end) return true;
  }
  return false;
}

/**
 * Renew on the Nth occurrence of the maintenance window before expiry.
 * Walks backward week-by-week from notAfter, collecting matching weekday
 * windows, skipping blackouts, and returns the Nth one (1-indexed).
 */
export function resolveNthWindowBeforeExpiry(
  notAfterIso: string,
  win: MaintenanceWindow,
  policy: Pick<RenewalPolicy, 'nthWindowBeforeExpiry'>,
): Date | null {
  const nth = Math.max(1, Math.round(policy.nthWindowBeforeExpiry || 1));
  const expiry = new Date(notAfterIso);
  if (!Number.isFinite(expiry.getTime())) return null;

  const found: Date[] = [];
  // Start from the calendar day of expiry and walk back up to ~3 years of weeks.
  let cursor = new Date(expiry.getTime());
  for (let i = 0; i < 200 && found.length < nth; i++) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    if (weekdayInZone(cursor, win.timezone || 'UTC') !== win.weekday) continue;
    const occurrence = windowOccurrenceOn(cursor, win);
    if (occurrence.getTime() >= expiry.getTime()) continue;
    if (isBlackedOut(occurrence, win)) continue;
    found.push(occurrence);
  }
  return found[nth - 1] ?? null;
}

/** Next several computed renewal datetimes for UI preview. */
export function previewRenewalSchedule(
  notAfterIso: string,
  win: MaintenanceWindow,
  policy: Pick<RenewalPolicy, 'nthWindowBeforeExpiry'>,
  count = 4,
): string[] {
  const out: string[] = [];
  let expiry = notAfterIso;
  for (let i = 0; i < count; i++) {
    const next = resolveNthWindowBeforeExpiry(expiry, win, policy);
    if (!next) break;
    out.push(next.toISOString());
    // Simulate next cert lifetime for subsequent previews (validity not known → +397d from occurrence).
    expiry = new Date(next.getTime() + 397 * 24 * 60 * 60 * 1000).toISOString();
  }
  return out;
}
