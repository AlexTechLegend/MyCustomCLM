import { db, newId, nowIso, parseJson } from '../db.js';
import type { AutomationEvent, EventType } from '../types.js';

interface EventRow {
  id: string;
  type: EventType;
  certificate_id: string | null;
  certificate_name: string | null;
  renewal_id: string | null;
  title: string;
  detail: string;
  commands: string;
  minutes_saved: number;
  created_at: string;
}

function mapRow(r: EventRow): AutomationEvent {
  return {
    id: r.id,
    type: r.type,
    certificateId: r.certificate_id,
    certificateName: r.certificate_name,
    renewalId: r.renewal_id,
    title: r.title,
    detail: r.detail,
    commands: parseJson<string[]>(r.commands, []),
    minutesSaved: r.minutes_saved,
    createdAt: r.created_at,
  };
}

export function recordEvent(e: {
  type: EventType;
  certificateId?: string | null;
  certificateName?: string | null;
  renewalId?: string | null;
  title: string;
  detail?: string;
  commands?: string[];
  minutesSaved: number;
  createdAt?: string;
}): AutomationEvent {
  const row: EventRow = {
    id: newId('evt'),
    type: e.type,
    certificate_id: e.certificateId ?? null,
    certificate_name: e.certificateName ?? null,
    renewal_id: e.renewalId ?? null,
    title: e.title,
    detail: e.detail ?? '',
    commands: JSON.stringify(e.commands ?? []),
    minutes_saved: e.minutesSaved,
    created_at: e.createdAt ?? nowIso(),
  };
  db()
    .prepare(
      `INSERT INTO events (id, type, certificate_id, certificate_name, renewal_id, title, detail, commands, minutes_saved, created_at)
       VALUES (@id, @type, @certificate_id, @certificate_name, @renewal_id, @title, @detail, @commands, @minutes_saved, @created_at)`,
    )
    .run(row);
  return mapRow(row);
}

export function listEvents(opts: { limit?: number; certificateId?: string; type?: string } = {}): AutomationEvent[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.certificateId) {
    where.push('certificate_id = @certificateId');
    params.certificateId = opts.certificateId;
  }
  if (opts.type) {
    where.push('type = @type');
    params.type = opts.type;
  }
  const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT @limit`;
  params.limit = opts.limit ?? 200;
  return (db().prepare(sql).all(params) as EventRow[]).map(mapRow);
}

export interface TimeSavedSummary {
  totalMinutes: number;
  totalEvents: number;
  thisMonthMinutes: number;
  thisMonthEvents: number;
  byType: { type: EventType; minutes: number; count: number }[];
  monthly: { month: string; label: string; minutes: number; count: number }[];
}

export function timeSavedSummary(months = 6): TimeSavedSummary {
  const d = db();
  const total = d.prepare('SELECT COALESCE(SUM(minutes_saved),0) m, COUNT(*) c FROM events').get() as { m: number; c: number };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const thisMonth = d.prepare('SELECT COALESCE(SUM(minutes_saved),0) m, COUNT(*) c FROM events WHERE created_at >= ?').get(monthStart) as { m: number; c: number };
  const byType = d
    .prepare('SELECT type, COALESCE(SUM(minutes_saved),0) minutes, COUNT(*) count FROM events GROUP BY type ORDER BY minutes DESC')
    .all() as { type: EventType; minutes: number; count: number }[];
  const rows = d
    .prepare(`SELECT substr(created_at,1,7) month, COALESCE(SUM(minutes_saved),0) minutes, COUNT(*) count FROM events GROUP BY month`)
    .all() as { month: string; minutes: number; count: number }[];
  const map = new Map(rows.map((r) => [r.month, r]));
  const monthly: TimeSavedSummary['monthly'] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = dt.toISOString().slice(0, 7);
    const r = map.get(key);
    monthly.push({ month: key, label: dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), minutes: r?.minutes ?? 0, count: r?.count ?? 0 });
  }
  return {
    totalMinutes: total.m,
    totalEvents: total.c,
    thisMonthMinutes: thisMonth.m,
    thisMonthEvents: thisMonth.c,
    byType,
    monthly,
  };
}
