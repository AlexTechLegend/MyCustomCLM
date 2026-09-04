import { db, newId, nowIso, parseJson } from '../db.js';
import type { NotificationEvent, NotificationKind, NotificationTarget } from '../types.js';
import { enqueueJob } from './jobs.js';
import { smtpSend } from './smtp.js';

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
  void import('./digest.js').then((m) => m.ensureDigestJob()).catch(() => undefined);
}

export function renderTemplate(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const val = key.split('.').reduce<unknown>((acc, k) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
      return undefined;
    }, scope);
    return val == null ? '' : String(val);
  });
}

export function enrichNotificationScope(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    certificate: lookupNamed('certificates', body.certificateId),
    host: lookupHost(body.hostId),
    blueprint: lookupNamed('blueprints', body.blueprintId),
    error: body.error ?? '',
  };
}

function lookupNamed(table: 'certificates' | 'blueprints', id: unknown): { id: string; name: string; commonName?: string } | null {
  if (!id) return null;
  try {
    const row = db()
      .prepare(`SELECT id, name${table === 'certificates' ? ', common_name AS commonName' : ''} FROM ${table} WHERE id = ?`)
      .get(String(id)) as { id: string; name: string; commonName?: string } | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

function lookupHost(id: unknown): { id: string; name: string; hostname: string } | null {
  if (!id) return null;
  try {
    const row = db()
      .prepare('SELECT id, name, hostname FROM hosts WHERE id = ?')
      .get(String(id)) as { id: string; name: string; hostname: string } | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

function defaultCopy(event: string, scope: Record<string, unknown>): { title: string; text: string } {
  if (scope.kind === 'digest') {
    return {
      title: String(scope.title || 'Vigil weekly digest'),
      text: String(scope.text || JSON.stringify(scope.summary ?? scope, null, 2)),
    };
  }
  const cert = (scope.certificate as { name?: string; commonName?: string } | null)?.name
    || (scope.certificate as { commonName?: string } | null)?.commonName
    || String(scope.certificateId || '');
  const titles: Record<string, string> = {
    'renewal.succeeded': `Renewal succeeded${cert ? ` — ${cert}` : ''}`,
    'renewal.failed': `Renewal failed${cert ? ` — ${cert}` : ''}`,
    'pipeline.step_failed': `Pipeline step failed${cert ? ` — ${cert}` : ''}`,
    'expiry.threshold': `Certificate nearing expiry${cert ? ` — ${cert}` : ''}`,
    'approval.requested': `Approval requested${cert ? ` — ${cert}` : ''}`,
    'drift.detected': 'Blueprint drift detected',
  };
  const title = titles[event] || `Vigil: ${event}`;
  const lines = [title];
  if (scope.error) lines.push(`Error: ${String(scope.error)}`);
  if (scope.message) lines.push(String(scope.message));
  if (scope.newNotAfter) lines.push(`New expiry: ${String(scope.newNotAfter)}`);
  if (hostLine(scope)) lines.push(hostLine(scope));
  return { title, text: lines.join('\n') };
}

function hostLine(scope: Record<string, unknown>): string {
  const host = scope.host as { name?: string; hostname?: string } | null;
  if (!host) return '';
  return `Host: ${host.name || host.hostname}`;
}

export function slackCard(title: string, text: string): Record<string, unknown> {
  return {
    text: title,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150), emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 3000) } },
    ],
  };
}

export function teamsCard(title: string, text: string): Record<string, unknown> {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: title,
    themeColor: '2B4C7E',
    title,
    text,
  };
}

function renderTargetCopy(target: NotificationTarget, event: string, body: Record<string, unknown>): { title: string; text: string } {
  const scope = enrichNotificationScope(body);
  const fallback = defaultCopy(event, scope);
  const titleTpl = String(target.config.titleTemplate || '');
  const bodyTpl = String(target.config.bodyTemplate || target.config.template || '');
  return {
    title: titleTpl ? renderTemplate(titleTpl, scope) : fallback.title,
    text: bodyTpl ? renderTemplate(bodyTpl, scope) : fallback.text,
  };
}

/** Deliver a single notification job. Slack/Teams render as cards; email uses SMTP. */
export async function deliverNotification(
  targetId: string,
  event: NotificationEvent | string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const target = getNotificationTarget(targetId);
  if (!target) throw new Error('Notification target not found');
  const copy = renderTargetCopy(target, String(event), body);

  if (target.kind === 'email') {
    await deliverEmail(target, copy);
    return { delivered: true, kind: 'email' };
  }

  const url = String(target.config.url ?? '');
  if (!url) throw new Error(`Notification target ${target.name} has no url in config.`);
  const payload =
    target.kind === 'slack'
      ? slackCard(copy.title, copy.text)
      : target.kind === 'teams'
        ? teamsCard(copy.title, copy.text)
        : { event, title: copy.title, text: copy.text, ...body, target: target.name };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(target.config.headers as Record<string, string> | undefined) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${target.kind} webhook returned ${res.status}`);
  return { delivered: true, status: res.status, kind: target.kind };
}

async function deliverEmail(target: NotificationTarget, copy: { title: string; text: string }): Promise<void> {
  const cfg = target.config;
  const host = String(cfg.host || cfg.smtpHost || process.env.VIGIL_SMTP_HOST || '');
  if (!host) throw new Error(`Email target ${target.name} has no SMTP host`);
  const to = (cfg.to as string | string[] | undefined) || (cfg.recipient as string | undefined) || '';
  await smtpSend({
    host,
    port: cfg.port ? Number(cfg.port) : cfg.smtpPort ? Number(cfg.smtpPort) : undefined,
    secure: Boolean(cfg.secure ?? cfg.smtpSecure),
    username: cfg.username ? String(cfg.username) : cfg.smtpUsername ? String(cfg.smtpUsername) : process.env.VIGIL_SMTP_USERNAME,
    password: cfg.password ? String(cfg.password) : cfg.smtpPassword ? String(cfg.smtpPassword) : process.env.VIGIL_SMTP_PASSWORD,
    from: String(cfg.from || cfg.smtpFrom || process.env.VIGIL_SMTP_FROM || 'vigil@localhost'),
    to,
    subject: copy.title,
    text: copy.text,
  });
}

/** Send a one-off test message to a target (exported for a Task 8 route). */
export async function testSendNotification(targetId: string): Promise<Record<string, unknown>> {
  return deliverNotification(targetId, 'renewal.succeeded', {
    kind: 'test',
    message: 'Vigil test notification. If you can read this, delivery works.',
  });
}
