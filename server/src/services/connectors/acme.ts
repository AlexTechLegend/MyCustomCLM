import { createHash } from 'node:crypto';
import { spawnCaptured } from '../transport/local.js';
import type { IssuanceConnector, IssueRequest, IssuedCertificate } from './types.js';

export interface DnsProvider {
  name: string;
  upsert(recordName: string, value: string): Promise<void>;
  remove(recordName: string, value: string): Promise<void>;
}

/** Writes the TXT record via an operator-supplied hook. Args only — never a shell string. */
export class HookDnsProvider implements DnsProvider {
  readonly name = 'hook';
  constructor(private readonly bin: string, private readonly extraArgs: string[] = []) {}

  async upsert(recordName: string, value: string): Promise<void> {
    const result = await spawnCaptured(this.bin, [...this.extraArgs, 'upsert', recordName, value], { timeoutMs: 60_000 });
    if (result.code !== 0) throw new Error(`DNS hook upsert failed: ${result.stderr || result.stdout}`);
  }

  async remove(recordName: string, value: string): Promise<void> {
    const result = await spawnCaptured(this.bin, [...this.extraArgs, 'remove', recordName, value], { timeoutMs: 60_000 });
    if (result.code !== 0) throw new Error(`DNS hook remove failed: ${result.stderr || result.stdout}`);
  }
}

/** Records the challenge and throws so an operator can create the TXT by hand. */
export class ManualDnsProvider implements DnsProvider {
  readonly name = 'manual';
  last?: { recordName: string; value: string };

  async upsert(recordName: string, value: string): Promise<void> {
    this.last = { recordName, value };
    throw new Error(`ACME DNS-01 manual: create TXT ${recordName} = ${value} then retry`);
  }

  async remove(): Promise<void> {
    this.last = undefined;
  }
}

export class NoopDnsProvider implements DnsProvider {
  readonly name = 'noop';
  async upsert(): Promise<void> {}
  async remove(): Promise<void> {}
}

export function resolveDnsProvider(kind?: string): DnsProvider {
  const hook = process.env.VIGIL_DNS_HOOK;
  if (kind === 'hook' || hook) return new HookDnsProvider(hook || kind || 'vigil-dns');
  if (kind === 'noop') return new NoopDnsProvider();
  return new ManualDnsProvider();
}

/**
 * ACME client (RFC 8555) using DNS-01. Directory URL comes from the
 * blueprint (`acme:https://...`) or VIGIL_ACME_DIRECTORY.
 */
export class AcmeConnector implements IssuanceConnector {
  readonly kind = 'acme' as const;
  constructor(
    private readonly opts: {
      directoryUrl?: string;
      dns?: DnsProvider;
      contactEmail?: string;
    } = {},
  ) {}

  async issue(req: IssueRequest): Promise<IssuedCertificate> {
    const directoryUrl = this.opts.directoryUrl || process.env.VIGIL_ACME_DIRECTORY;
    if (!directoryUrl) {
      throw new Error('ACME directory URL is not configured (blueprint caTemplate acme:<url> or VIGIL_ACME_DIRECTORY)');
    }
    const dns = this.opts.dns ?? resolveDnsProvider();
    const directory = (await (await fetch(directoryUrl)).json()) as {
      newNonce: string;
      newAccount: string;
      newOrder: string;
    };
    const accountKey = await generateAccountKey();
    let nonce = (await fetch(directory.newNonce, { method: 'HEAD' })).headers.get('replay-nonce') || '';
    const account = await jwsPost(directory.newAccount, accountKey, nonce, directoryUrl, {
      termsOfServiceAgreed: true,
      contact: this.opts.contactEmail ? [`mailto:${this.opts.contactEmail}`] : undefined,
    });
    nonce = account.nonce;
    const identifiers = hostsFor(req).map((h) => ({ type: 'dns', value: h }));
    const order = await jwsPost(directory.newOrder, accountKey, nonce, account.kid || directoryUrl, { identifiers });
    nonce = order.nonce;
    const orderBody = order.body as { authorizations?: string[]; finalize?: string; certificate?: string; status?: string };

    for (const authzUrl of orderBody.authorizations ?? []) {
      const authz = await jwsPost(authzUrl, accountKey, nonce, account.kid || directoryUrl, {});
      nonce = authz.nonce;
      const authzBody = authz.body as {
        identifier?: { value?: string };
        challenges?: Array<{ type: string; url: string; token: string; status?: string }>;
      };
      const challenge = authzBody.challenges?.find((c) => c.type === 'dns-01');
      if (!challenge) throw new Error(`ACME authz for ${authzBody.identifier?.value} has no dns-01 challenge`);
      const keyAuth = `${challenge.token}.${accountKey.thumbprint}`;
      const txt = base64url(createHash('sha256').update(keyAuth).digest());
      const record = `_acme-challenge.${authzBody.identifier?.value ?? ''}`;
      await dns.upsert(record, txt);
      try {
        const ch = await jwsPost(challenge.url, accountKey, nonce, account.kid || directoryUrl, {});
        nonce = ch.nonce;
        await waitForStatus(async () => {
          const poll = await jwsPost(authzUrl, accountKey, nonce, account.kid || directoryUrl, {});
          nonce = poll.nonce;
          return String((poll.body as { status?: string }).status ?? '');
        }, ['valid']);
      } finally {
        await dns.remove(record, txt).catch(() => undefined);
      }
    }

    const der = await csrToDer(req.csrPem);
    const finalized = await jwsPost(orderBody.finalize!, accountKey, nonce, account.kid || directoryUrl, {
      csr: base64url(der),
    });
    nonce = finalized.nonce;
    let certUrl = (finalized.body as { certificate?: string }).certificate;
    if (!certUrl) {
      const ready = await waitForStatus(async () => {
        const poll = await jwsPost(order.location || directory.newOrder, accountKey, nonce, account.kid || directoryUrl, {});
        nonce = poll.nonce;
        certUrl = (poll.body as { certificate?: string }).certificate;
        return String((poll.body as { status?: string }).status ?? '');
      }, ['valid']);
      void ready;
    }
    if (!certUrl) throw new Error('ACME order finalized without a certificate URL');
    const bundle = await (await fetch(certUrl, { headers: { accept: 'application/pem-certificate-chain' } })).text();
    const pems = bundle.split(/(?=-----BEGIN CERTIFICATE-----)/).map((p) => p.trim()).filter(Boolean);
    if (!pems.length) throw new Error('ACME certificate URL returned no PEM');
    return { leafPem: pems[0], chainPems: pems.slice(1) };
  }
}

function hostsFor(req: IssueRequest): string[] {
  const names = new Set<string>();
  if (req.commonName) names.add(req.commonName);
  for (const s of req.sans ?? []) names.add(s.replace(/^DNS:/i, ''));
  if (!names.size) throw new Error('ACME issuance needs a commonName or SAN');
  return [...names];
}

async function csrToDer(csrPem: string): Promise<Buffer> {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'vigil-acme-'));
  try {
    const inPath = join(dir, 'req.pem');
    const outPath = join(dir, 'req.der');
    await writeFile(inPath, csrPem);
    const { config } = await import('../../config.js');
    const result = await spawnCaptured(config.opensslBin, ['req', '-in', inPath, '-outform', 'DER', '-out', outPath], {
      timeoutMs: 15_000,
    });
    if (result.code !== 0) throw new Error(`openssl req -outform DER failed: ${result.stderr}`);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function generateAccountKey(): Promise<{ n: string; e: string; d: string; p: string; q: string; dp: string; dq: string; qi: string; thumbprint: string }> {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' }) as {
    n: string;
    e: string;
    d: string;
    p: string;
    q: string;
    dp: string;
    dq: string;
    qi: string;
  };
  const thumbprint = base64url(createHash('sha256').update(JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n })).digest());
  return { ...jwk, thumbprint };
}

async function jwsPost(
  url: string,
  key: { n: string; e: string; d: string; thumbprint: string },
  nonce: string,
  kidOrDir: string,
  payload: Record<string, unknown>,
): Promise<{ body: unknown; nonce: string; kid?: string; location?: string }> {
  const { createPrivateKey, sign } = await import('node:crypto');
  const protectedHeader: Record<string, unknown> = {
    alg: 'RS256',
    nonce,
    url,
  };
  if (kidOrDir.startsWith('http')) {
    if (kidOrDir !== url && !kidOrDir.includes('newAccount') && !kidOrDir.includes('directory')) {
      protectedHeader.kid = kidOrDir;
    } else {
      protectedHeader.jwk = { kty: 'RSA', n: key.n, e: key.e };
    }
  } else {
    protectedHeader.jwk = { kty: 'RSA', n: key.n, e: key.e };
  }
  const prot = base64url(Buffer.from(JSON.stringify(protectedHeader)));
  const pay = Object.keys(payload).length ? base64url(Buffer.from(JSON.stringify(payload))) : '';
  const pem = createPrivateKey({ key: { kty: 'RSA', n: key.n, e: key.e, d: key.d }, format: 'jwk' });
  const sig = base64url(sign('sha256', Buffer.from(`${prot}.${pay}`), pem));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/jose+json' },
    body: JSON.stringify({ protected: prot, payload: pay, signature: sig }),
  });
  const nextNonce = res.headers.get('replay-nonce') || nonce;
  const location = res.headers.get('location') || undefined;
  const kid = res.headers.get('location') || undefined;
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    throw new Error(`ACME ${url} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return { body, nonce: nextNonce, kid, location };
}

async function waitForStatus(poll: () => Promise<string>, want: string[]): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const status = await poll();
    if (want.includes(status)) return status;
    if (status === 'invalid') throw new Error('ACME authorization invalid');
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error('ACME authorization timed out');
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
