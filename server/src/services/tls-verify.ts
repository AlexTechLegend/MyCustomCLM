import { createHash } from 'node:crypto';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

/** Strip colons/spaces and lowercase so OpenSSL `AA:BB:CC` matches Node DER hashes. */
export function normalizeFingerprint(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

export function fingerprintDer(der: Buffer): string {
  return createHash('sha256').update(der).digest('hex');
}

export function fingerprintsMatch(a: string, b: string): boolean {
  const left = normalizeFingerprint(a);
  const right = normalizeFingerprint(b);
  return left.length > 0 && left === right;
}

export interface TlsEndpointResult {
  ok: boolean;
  detail: string;
  fingerprint: string;
  chainCount: number;
  commonName: string;
  pem: string;
}

export async function verifyTlsEndpoint(opts: {
  host: string;
  port?: number;
  servername?: string;
  timeoutMs?: number;
  expectedFingerprint: string;
  expectChain?: boolean;
}): Promise<TlsEndpointResult> {
  const port = opts.port ?? 443;
  const timeoutMs = Math.min(60_000, Math.max(500, opts.timeoutMs ?? 8_000));
  const servername = opts.servername || opts.host;
  const presented = await collectPeerCertificate({ host: opts.host, port, servername, timeoutMs });
  const actual = fingerprintDer(presented.raw);
  const expected = normalizeFingerprint(opts.expectedFingerprint);
  const match = actual === expected;
  if (!match) {
    return {
      ok: false,
      detail: `Served SHA-256 ${colonize(actual)} does not match deployed ${colonize(expected)}`,
      fingerprint: colonize(actual),
      chainCount: presented.chainCount,
      commonName: presented.commonName,
      pem: presented.pem,
    };
  }
  if (opts.expectChain && presented.chainCount < 2) {
    return {
      ok: false,
      detail: `Expected a chain; server presented ${presented.chainCount} certificate(s)`,
      fingerprint: colonize(actual),
      chainCount: presented.chainCount,
      commonName: presented.commonName,
      pem: presented.pem,
    };
  }
  return {
    ok: true,
    detail: `Endpoint ${opts.host}:${port} serves ${presented.commonName} (${colonize(actual)})`,
    fingerprint: colonize(actual),
    chainCount: presented.chainCount,
    commonName: presented.commonName,
    pem: presented.pem,
  };
}

export async function harvestTlsCertificate(opts: {
  host: string;
  port?: number;
  servername?: string;
  timeoutMs?: number;
}): Promise<TlsEndpointResult> {
  const port = opts.port ?? 443;
  const presented = await collectPeerCertificate({
    host: opts.host,
    port,
    servername: opts.servername || opts.host,
    timeoutMs: opts.timeoutMs ?? 5_000,
  });
  const hex = fingerprintDer(presented.raw);
  return {
    ok: true,
    detail: `${opts.host}:${port}`,
    fingerprint: colonize(hex),
    chainCount: presented.chainCount,
    commonName: presented.commonName,
    pem: presented.pem,
  };
}

function colonize(hex: string): string {
  const clean = normalizeFingerprint(hex);
  return (clean.match(/.{1,2}/g) ?? []).join(':').toUpperCase();
}

function collectPeerCertificate(opts: {
  host: string;
  port: number;
  servername: string;
  timeoutMs: number;
}): Promise<{ raw: Buffer; chainCount: number; commonName: string; pem: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: opts.host,
        port: opts.port,
        servername: opts.servername,
        rejectUnauthorized: false,
        timeout: opts.timeoutMs,
      },
      () => {
        try {
          const peer = socket.getPeerCertificate(true);
          socket.end();
          if (!peer || !peer.raw) {
            reject(new Error(`No certificate presented by ${opts.host}:${opts.port}`));
            return;
          }
          const x509 = new X509Certificate(peer.raw);
          let chainCount = 1;
          let issuer: typeof peer.issuerCertificate | undefined = peer.issuerCertificate;
          const seen = new Set<string>([x509.fingerprint256]);
          while (issuer && issuer.raw && issuer !== peer) {
            const fp = new X509Certificate(issuer.raw).fingerprint256;
            if (seen.has(fp)) break;
            seen.add(fp);
            chainCount += 1;
            issuer = issuer.issuerCertificate;
          }
          resolve({
            raw: Buffer.from(peer.raw),
            chainCount,
            commonName:
              (Array.isArray(peer.subject?.CN) ? peer.subject.CN[0] : peer.subject?.CN) ||
              x509.subject.split('\n').find((l) => l.startsWith('CN='))?.slice(3) ||
              opts.host,
            pem: x509.toString(),
          });
        } catch (err) {
          reject(err);
        }
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`TLS handshake to ${opts.host}:${opts.port} timed out after ${opts.timeoutMs}ms`));
    });
    socket.on('error', (err) => {
      reject(err);
    });
  });
}
