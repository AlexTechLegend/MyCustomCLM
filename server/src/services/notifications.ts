import { db, newId, nowIso, parseJson } from '../db.js';
import type { NotificationEvent, NotificationKind, NotificationTarget } from '../types.js';
import { enqueueJob } from './jobs.js';

interface TargetRow {
  id: string;
  name: string;
  kind: NotificationKind;
  config: string;
  events: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapRow(r: TargetRow): NotificationTarget {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    config: parseJson(r.config, {}),
    events: parseJson(r.events, []),
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listNotificationTargets(): NotificationTarget[] {
  return (db().prepare('SELECT * FROM notification_targets ORDER BY name COLLATE NOCASE').all() as TargetRow[]).map(mapRow);
}

export function getNotificationTarget(id: string): NotificationTarget | null {
  const row = db().prepare('SELECT * FROM notification_targets WHERE id = ?').get(id) as TargetRow | undefined;
  return row ? mapRow(row) : null;
}

export function createNotificationTarget(input: Partial<NotificationTarget>): NotificationTarget {
  const now = nowIso();
  const row: TargetRow = {
    id: newId('ntf'),
    name: (input.name ?? '').trim() || 'Untitled target',
    kind: input.kind ?? 'webhook',
    config: JSON.stringify(input.config ?? {}),
    events: JSON.stringify(input.events ?? []),
    is_active: input.isActive === false ? 0 : 1,
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare(
      `INSERT INTO notification_targets (id, name, kind, config, events, is_active, created_at, updated_at)
       VALUES (@id, @name, @kind, @config, @events, @is_active, @created_at, @updated_at)`,
    )
    .run(row);
  return mapRow(row);
}

export function updateNotificationTarget(id: string, input: Partial<NotificationTarget>): NotificationTarget | null {
  const existing = getNotificationTarget(id);
  if (!existing) return null;
  db()
    .prepare(`UPDATE notification_targets SET name = ?, kind = ?, config = ?, events = ?, is_active = ?, updated_at = ? WHERE id = ?`)
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      input.kind ?? existing.kind,
      JSON.stringify(input.config ?? existing.config),
      JSON.stringify(input.events ?? existing.events),
      (input.isActive ?? existing.isActive) ? 1 : 0,
      nowIso(),
      id,
    );
  return getNotificationTarget(id);
}

export function deleteNotificationTarget(id: string): boolean {
  return db().prepare('DELETE FROM notification_targets WHERE id = ?').run(id).changes > 0;
}

/** Enqueue delivery jobs for every active target subscribed to this event. */
export function emitNotification(event: NotificationEvent, payload: Record<string, unknown>) {
  const targets = listNotificationTargets().filter((t) => t.isActive && t.events.includes(event));
  for (const t of targets) {
    enqueueJob({
      type: 'notification',
      payload: { targetId: t.id, event, body: payload },
      priority: 50,
    });
  }
}

/** Deliver a single notification job (webhook POST). Email/Teams/Slack are stubs that record intent. */
export async function deliverNotification(targetId: string, event: NotificationEvent, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const target = getNotificationTarget(targetId);
  if (!target) throw new Error('Notification target not found');
  if (target.kind === 'webhook' || target.kind === 'slack' || target.kind === 'teams') {
    const url = String(target.config.url ?? '');
    if (!url) throw new Error(`Notification target ${target.name} has no url in config.`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(target.config.headers as Record<string, string> | undefined) },
      body: JSON.stringify({ event, ...body, target: target.name }),
    });
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
    return { delivered: true, status: res.status };
  }
  // email — delivery not wired; record that we would have sent.
  return { delivered: false, deferred: true, kind: target.kind, note: 'Email transport not configured in this build.' };
}
