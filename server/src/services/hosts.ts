import { db, newId, nowIso, parseJson } from '../db.js';
import type { AgentStatus, Host, HostPlatform, HostTransport } from '../types.js';

interface HostRow {
  id: string;
  name: string;
  hostname: string;
  address: string;
  platform: HostPlatform;
  environment: string;
  owner: string;
  credential_id: string | null;
  agent_status: AgentStatus;
  agent_last_seen: string | null;
  notes: string;
  tags: string;
  created_at: string;
  updated_at: string;
  transport?: string | null;
  transport_config?: string | null;
  agent_token_credential_id?: string | null;
}

function parseTransport(value: unknown): HostTransport {
  return value === 'winrm' || value === 'ssh' || value === 'agent' ? value : 'none';
}

function mapRow(r: HostRow): Host {
  return {
    id: r.id,
    name: r.name,
    hostname: r.hostname,
    address: r.address,
    platform: r.platform,
    environment: r.environment,
    owner: r.owner,
    credentialId: r.credential_id,
    agentStatus: r.agent_status,
    agentLastSeen: r.agent_last_seen,
    notes: r.notes,
    tags: parseJson(r.tags, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    transport: parseTransport(r.transport),
    transportConfig: parseJson(r.transport_config, {}),
    agentTokenCredentialId: r.agent_token_credential_id ?? null,
  };
}

function withCerts(h: Host): Host {
  const rows = db().prepare('SELECT certificate_id FROM certificate_hosts WHERE host_id = ?').all(h.id) as { certificate_id: string }[];
  return { ...h, certificateIds: rows.map((r) => r.certificate_id) };
}

export function listHosts(): Host[] {
  return (db().prepare('SELECT * FROM hosts ORDER BY name COLLATE NOCASE').all() as HostRow[]).map((r) => withCerts(mapRow(r)));
}

export function getHost(id: string): Host | null {
  const row = db().prepare('SELECT * FROM hosts WHERE id = ?').get(id) as HostRow | undefined;
  return row ? withCerts(mapRow(row)) : null;
}

export function createHost(input: Partial<Host>): Host {
  const now = nowIso();
  const row: HostRow = {
    id: newId('hst'),
    name: (input.name ?? '').trim() || 'Untitled host',
    hostname: input.hostname ?? '',
    address: input.address ?? '',
    platform: input.platform === 'windows' || input.platform === 'linux' ? input.platform : 'other',
    environment: input.environment ?? '',
    owner: input.owner ?? '',
    credential_id: input.credentialId ?? null,
    agent_status: input.agentStatus ?? 'unknown',
    agent_last_seen: input.agentLastSeen ?? null,
    notes: input.notes ?? '',
    tags: JSON.stringify(input.tags ?? []),
    created_at: now,
    updated_at: now,
    transport: parseTransport(input.transport),
    transport_config: JSON.stringify(input.transportConfig ?? {}),
    agent_token_credential_id: input.agentTokenCredentialId ?? null,
  };
  db()
    .prepare(
      `INSERT INTO hosts (id, name, hostname, address, platform, environment, owner, credential_id, agent_status, agent_last_seen, notes, tags, created_at, updated_at, transport, transport_config, agent_token_credential_id)
       VALUES (@id, @name, @hostname, @address, @platform, @environment, @owner, @credential_id, @agent_status, @agent_last_seen, @notes, @tags, @created_at, @updated_at, @transport, @transport_config, @agent_token_credential_id)`,
    )
    .run(row);
  const created = getHost(row.id)!;
  queueMicrotask(() => {
    void import('./auto-enrol.js')
      .then((m) => m.autoEnrolOnHostCreate(created))
      .catch(() => undefined);
    void import('./digest.js')
      .then((m) => m.ensureDigestJob())
      .catch(() => undefined);
  });
  return created;
}

export function updateHost(id: string, input: Partial<Host>): Host | null {
  const existing = getHost(id);
  if (!existing) return null;
  db()
    .prepare(
      `UPDATE hosts SET name = ?, hostname = ?, address = ?, platform = ?, environment = ?, owner = ?, credential_id = ?, agent_status = ?, agent_last_seen = ?, notes = ?, tags = ?, transport = ?, transport_config = ?, agent_token_credential_id = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      (input.name ?? existing.name).trim() || existing.name,
      input.hostname ?? existing.hostname,
      input.address ?? existing.address,
      input.platform ?? existing.platform,
      input.environment ?? existing.environment,
      input.owner ?? existing.owner,
      input.credentialId !== undefined ? input.credentialId : existing.credentialId,
      input.agentStatus ?? existing.agentStatus,
      input.agentLastSeen !== undefined ? input.agentLastSeen : existing.agentLastSeen,
      input.notes ?? existing.notes,
      JSON.stringify(input.tags ?? existing.tags),
      parseTransport(input.transport ?? existing.transport),
      JSON.stringify(input.transportConfig ?? existing.transportConfig ?? {}),
      input.agentTokenCredentialId !== undefined ? input.agentTokenCredentialId : existing.agentTokenCredentialId ?? null,
      nowIso(),
      id,
    );
  return getHost(id);
}

/** Mark a host's installed agent as online after a successful poll/result. */
export function markHostAgentSeen(id: string): Host | null {
  const existing = getHost(id);
  if (!existing) return null;
  const now = nowIso();
  db().prepare(`UPDATE hosts SET agent_status = ?, agent_last_seen = ?, updated_at = ? WHERE id = ?`).run('online', now, now, id);
  return getHost(id);
}

export function deleteHost(id: string): boolean {
  return db().prepare('DELETE FROM hosts WHERE id = ?').run(id).changes > 0;
}

export function linkCertificateHost(certificateId: string, hostId: string) {
  db().prepare('INSERT OR IGNORE INTO certificate_hosts (certificate_id, host_id) VALUES (?, ?)').run(certificateId, hostId);
}

export function unlinkCertificateHost(certificateId: string, hostId: string) {
  db().prepare('DELETE FROM certificate_hosts WHERE certificate_id = ? AND host_id = ?').run(certificateId, hostId);
}

export function hostsForCertificate(certificateId: string): Host[] {
  const rows = db()
    .prepare(
      `SELECT h.* FROM hosts h INNER JOIN certificate_hosts ch ON ch.host_id = h.id WHERE ch.certificate_id = ? ORDER BY h.name COLLATE NOCASE`,
    )
    .all(certificateId) as HostRow[];
  return rows.map((r) => withCerts(mapRow(r)));
}

export function setCertificateHosts(certificateId: string, hostIds: string[]) {
  db().prepare('DELETE FROM certificate_hosts WHERE certificate_id = ?').run(certificateId);
  const ins = db().prepare('INSERT OR IGNORE INTO certificate_hosts (certificate_id, host_id) VALUES (?, ?)');
  for (const hid of hostIds) ins.run(certificateId, hid);
}
