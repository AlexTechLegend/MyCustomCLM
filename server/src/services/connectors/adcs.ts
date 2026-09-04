import { spawnCaptured } from '../transport/local.js';
import type { IssuanceConnector, IssueRequest, IssuedCertificate } from './types.js';

/**
 * Active Directory Certificate Services connector.
 *
 * Prefer the Certificate Enrollment Web Service when `cesUrl` is set.
 * Otherwise fall back to `certreq` on the Vigil host (argument array only).
 *
 * Task 8 should mount:
 *   GET /api/connectors/adcs/templates  → listAdcsTemplates()
 */
export class AdcsConnector implements IssuanceConnector {
  readonly kind = 'adcs' as const;
  constructor(
    private readonly opts: {
      cesUrl?: string;
      template?: string;
      username?: string;
      password?: string;
    } = {},
  ) {}

  async listTemplates(): Promise<string[]> {
    if (this.opts.cesUrl) {
      const url = `${this.opts.cesUrl.replace(/\/$/, '')}/templates`;
      const res = await fetch(url, { headers: this.authHeaders() });
      if (!res.ok) throw new Error(`ADCS CES templates returned ${res.status}`);
      const body = (await res.json()) as { templates?: string[] } | string[];
      return Array.isArray(body) ? body : body.templates ?? [];
    }
    const result = await spawnCaptured('certutil', ['-CATemplates'], { timeoutMs: 30_000 });
    if (result.code !== 0) {
      throw new Error(`certutil -CATemplates failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('CertUtil') && !l.startsWith('-----'));
  }

  async issue(req: IssueRequest): Promise<IssuedCertificate> {
    const template = req.template || this.opts.template;
    if (!template) throw new Error('ADCS issuance requires a template name (blueprint.caTemplate)');

    if (this.opts.cesUrl) {
      return this.issueViaCes(req.csrPem, template);
    }
    return this.issueViaCertreq(req.csrPem, template);
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.opts.username && this.opts.password) {
      headers.authorization = `Basic ${Buffer.from(`${this.opts.username}:${this.opts.password}`).toString('base64')}`;
    }
    return headers;
  }

  private async issueViaCes(csrPem: string, template: string): Promise<IssuedCertificate> {
    const base = this.opts.cesUrl!.replace(/\/$/, '');
    const submit = await fetch(`${base}/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ csr: csrPem, template }),
    });
    if (!submit.ok) throw new Error(`ADCS CES enroll returned ${submit.status}: ${await submit.text()}`);
    const body = (await submit.json()) as { requestId?: string; certificate?: string; chain?: string[]; status?: string };
    if (body.certificate) {
      return { leafPem: body.certificate, chainPems: body.chain ?? [] };
    }
    const requestId = body.requestId;
    if (!requestId) throw new Error('ADCS CES enroll returned neither a certificate nor a requestId');
    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 2_000));
      const poll = await fetch(`${base}/request/${encodeURIComponent(requestId)}`, { headers: this.authHeaders() });
      if (!poll.ok) continue;
      const issued = (await poll.json()) as { certificate?: string; chain?: string[]; status?: string };
      if (issued.certificate) return { leafPem: issued.certificate, chainPems: issued.chain ?? [] };
      if (issued.status === 'denied' || issued.status === 'failed') {
        throw new Error(`ADCS request ${requestId} ${issued.status}`);
      }
    }
    throw new Error(`ADCS request ${requestId} was not issued within the poll window`);
  }

  private async issueViaCertreq(csrPem: string, template: string): Promise<IssuedCertificate> {
    const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'vigil-adcs-'));
    const csrPath = join(dir, 'req.csr');
    const cerPath = join(dir, 'out.cer');
    try {
      await writeFile(csrPath, csrPem, { mode: 0o600 });
      const result = await spawnCaptured(
        'certreq',
        ['-submit', '-attrib', `CertificateTemplate:${template}`, csrPath, cerPath],
        { timeoutMs: 120_000 },
      );
      if (result.code !== 0) {
        throw new Error(`certreq -submit failed (${result.code}): ${result.stderr || result.stdout}`);
      }
      const leafPem = await readFile(cerPath, 'utf8');
      return { leafPem, chainPems: [] };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export async function listAdcsTemplates(opts?: { cesUrl?: string }): Promise<string[]> {
  return new AdcsConnector(opts ?? {}).listTemplates();
}
