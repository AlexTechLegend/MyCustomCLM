import { db } from '../../db.js';
import { localTransport } from './local.js';
import { AgentTransport } from './agent.js';
import { WinRmTransport } from './winrm.js';
import { SshTransport } from './ssh.js';
import type { Transport, TransportKind } from './types.js';

export interface ResolvedTransport {
  transport: Transport;
  kind: TransportKind;
  /** True when we fell back because host transport columns are not in the schema yet. */
  deferredLookup: boolean;
}

/**
 * Resolve the transport for a host.
 *
 * Task 8 has not added `transport` / `transport_config` /
 * `agent_token_credential_id` to `hosts` yet. We probe those columns
 * inside try/catch and default to `local` when they are missing. We do
 * not stub the columns.
 */
export async function resolveTransport(hostId: string | null | undefined): Promise<ResolvedTransport> {
  if (!hostId) {
    return { transport: localTransport, kind: 'local', deferredLookup: false };
  }

  try {
    const row = db()
      .prepare(
        `SELECT transport, transport_config, agent_token_credential_id, hostname
           FROM hosts WHERE id = ?`,
      )
      .get(hostId) as
      | {
          transport?: string | null;
          transport_config?: string | null;
          agent_token_credential_id?: string | null;
          hostname?: string | null;
        }
      | undefined;

    if (!row) {
      return { transport: localTransport, kind: 'local', deferredLookup: false };
    }

    const kind = (row.transport || 'local') as TransportKind;
    const cfg = parseConfig(row.transport_config);
    if (kind === 'agent') {
      return {
        transport: new AgentTransport({ hostId, tokenHint: row.agent_token_credential_id ?? undefined }),
        kind,
        deferredLookup: false,
      };
    }
    if (kind === 'winrm') {
      return {
        transport: new WinRmTransport({
          hostname: String(cfg.hostname || row.hostname || ''),
          username: cfg.username ? String(cfg.username) : undefined,
          secret: cfg.secret ? String(cfg.secret) : undefined,
        }),
        kind,
        deferredLookup: false,
      };
    }
    if (kind === 'ssh') {
      return {
        transport: new SshTransport({
          hostname: String(cfg.hostname || row.hostname || ''),
          username: cfg.username ? String(cfg.username) : undefined,
          port: cfg.port ? Number(cfg.port) : undefined,
          identityFile: cfg.identityFile ? String(cfg.identityFile) : undefined,
        }),
        kind,
        deferredLookup: false,
      };
    }
    return { transport: localTransport, kind: 'local', deferredLookup: false };
  } catch {
    return { transport: localTransport, kind: 'local', deferredLookup: true };
  }
}

function parseConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
