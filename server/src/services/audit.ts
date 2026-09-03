import { db, newId, nowIso, parseJson } from '../db.js';
import type { AuditEntry } from '../types.js';

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  actor_type: AuditEntry['actorType'];
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  command_trail: string;
  created_at: string;
}

function mapRow(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    actorUserId: r.actor_user_id,
    actorType: r.actor_type,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before_json ? parseJson(r.before_json, null) : null,
    after: r.after_json ? parseJson(r.after_json, null) : null,
    commandTrail: parseJson(r.command_trail, []),
    createdAt: r.created_at,
  };
}

/** Append-only. There is intentionally no update or delete path. */
export function writeAudit(entry: {
  actorUserId?: string | null;
  actorType?: AuditEntry['actorType'];
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  commandTrail?: string[];
}): AuditEntry {
  const row: AuditRow = {
    id: newId('aud'),
    actor_user_id: entry.actorUserId ?? null,
    actor_type: entry.actorType ?? 'service-account',
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before_json: entry.before ? JSON.stringify(entry.before) : null,
    after_json: entry.after ? JSON.stringify(entry.after) : null,
    command_trail: JSON.stringify(entry.commandTrail ?? []),
    created_at: nowIso(),
  };
  db()
    .prepare(
      `INSERT INTO audit_log (id, actor_user_id, actor_type, action, entity_type, entity_id, before_json, after_json, command_trail, created_at)
       VALUES (@id, @actor_user_id, @actor_type, @action, @entity_type, @entity_id, @before_json, @after_json, @command_trail, @created_at)`,
    )
    .run(row);
  return mapRow(row);
}

export function listAudit(opts: { entityType?: string; entityId?: string; action?: string; limit?: number } = {}): AuditEntry[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit ?? 200 };
  if (opts.entityType) {
    where.push('entity_type = @entityType');
    params.entityType = opts.entityType;
  }
  if (opts.entityId) {
    where.push('entity_id = @entityId');
    params.entityId = opts.entityId;
  }
  if (opts.action) {
    where.push('action = @action');
    params.action = opts.action;
  }
  const sql = `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT @limit`;
  return (db().prepare(sql).all(params) as AuditRow[]).map(mapRow);
}

export function auditToCsv(entries: AuditEntry[]): string {
  const header = ['id', 'createdAt', 'actorType', 'actorUserId', 'action', 'entityType', 'entityId'];
  const lines = [header.join(',')];
  for (const e of entries) {
    lines.push(
      [e.id, e.createdAt, e.actorType, e.actorUserId ?? '', e.action, e.entityType, e.entityId ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  return lines.join('\n');
}
