import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, ensureDirs } from './config.js';
import {
  applyLineEnding,
  detectLineEnding,
  isCertType,
  isKeyType,
  isPem,
  keyBlockEncrypted,
  keyEncodingFromType,
  normalisePem,
  splitPemBlocks,
} from './lib/pem.js';
import type { DetectedFormat, KeyEncoding, KeyMode, LineEnding, OutputFormat, OutputSpec } from './types.js';

export class OpenSslError extends Error {
  constructor(message: string, public readonly stderr: string, public readonly command: string) {
    super(message);
    this.name = 'OpenSslError';
  }
}

export interface CommandLog {
  commands: string[];
}

export function newLog(): CommandLog {
  return { commands: [] };
}

function quote(arg: string) {
  return /[\s"'$`\\]/.test(arg) ? `'${arg.replace(/'/g, `'\\''`)}'` : arg;
}

export function formatCommand(args: string[]) {
  const shown = args.map((a) => (a.startsWith('pass:') && a.length > 5 ? 'pass:••••' : a));
  return ['openssl', ...shown.map(quote)].join(' ');
}

export async function openssl(
  args: string[],
  opts: { cwd?: string; log?: CommandLog; allowFailure?: boolean } = {},
): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  const command = formatCommand(args);
  opts.log?.commands.push(command);
  return new Promise((resolve, reject) => {
    // detached (POSIX) → no controlling TTY, so OpenSSL can never block on an interactive
    // passphrase prompt. On Windows a detached child would get its own console instead, so we
    // rely on windowsHide plus the explicit -passin arguments used throughout.
    const child = spawn(config.opensslBin, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) =>
      reject(
        new OpenSslError(
          `Failed to start OpenSSL ("${config.opensslBin}"): ${e.message}. Install OpenSSL 3 or set OPENSSL_BIN to the binary path.`,
          '',
          command,
        ),
      ),
    );
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8');
      const stdout = Buffer.concat(out);
      if (code !== 0 && !opts.allowFailure) {
        reject(new OpenSslError(summariseError(stderr), stderr, command));
      } else {
        resolve({ stdout, stderr, code: code ?? -1 });
      }
    });
  });
}

function summariseError(stderr: string) {
  const lower = stderr.toLowerCase();
  if (lower.includes('mac verify failure') || lower.includes('invalid password') || lower.includes('bad decrypt')) {
    return 'Incorrect password for the supplied file.';
  }
  if (lower.includes('unsupported') || lower.includes('digital envelope routines')) {
    return 'The file uses a legacy algorithm that OpenSSL 3 needs the -legacy provider for.';
  }
  const line = stderr.split('\n').find((l) => l.trim() && !l.includes('Enter'));
  return line ? `OpenSSL: ${line.trim()}` : 'OpenSSL command failed.';
}

export async function opensslVersion(): Promise<string> {
  try {
    const { stdout } = await openssl(['version']);
    return stdout.toString('utf8').trim();
  } catch {
    return 'openssl not found';
  }
}

export async function withWorkdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  ensureDirs();
  const dir = await fs.mkdtemp(path.join(config.tmpDir, 'op-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writePassFile(dir: string, name: string, password: string) {
  const p = path.join(dir, name);
  await fs.writeFile(p, password, { mode: 0o600 });
  return `file:${name}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedCert {
  pem: string;
  subject: string;
  subjectComponents: string[];
  commonName: string;
  issuer: string;
  issuerCommonName: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  sans: string[];
  keyAlgo: string;
  keyBits: number | null;
  sigAlgo: string;
  fingerprintSha256: string;
  isCa: boolean;
  isSelfSigned: boolean;
  keyUsage: string[];
  x509: crypto.X509Certificate;
}

function dnToString(dn: string) {
  return dn.split('\n').filter(Boolean).join(', ');
}

function cnOf(dn: string) {
  const m = dn.split('\n').find((l) => l.startsWith('CN='));
  return m ? m.slice(3) : dn.split('\n')[0] ?? '';
}

function toDate(x: crypto.X509Certificate, which: 'from' | 'to'): string {
  const anyX = x as unknown as { validFromDate?: Date; validToDate?: Date };
  const d = which === 'from' ? anyX.validFromDate : anyX.validToDate;
  if (d instanceof Date) return d.toISOString();
  return new Date(which === 'from' ? x.validFrom : x.validTo).toISOString();
}

export async function parseCertificate(pemInput: string, log?: CommandLog): Promise<ParsedCert> {
  const pem = normalisePem(pemInput);
  const x = new crypto.X509Certificate(pem);
  const key = x.publicKey;
  const details = key.asymmetricKeyDetails ?? {};
  const keyAlgo =
    key.asymmetricKeyType === 'rsa'
      ? 'RSA'
      : key.asymmetricKeyType === 'ec'
        ? `EC ${curveLabel((details as { namedCurve?: string }).namedCurve)}`.trim()
        : (key.asymmetricKeyType ?? 'unknown').toUpperCase();
  const keyBits = (details as { modulusLength?: number }).modulusLength ?? curveBits((details as { namedCurve?: string }).namedCurve);
  let sigAlgo = '';
  try {
    const text = await inspectText(pem, log);
    const m = text.match(/Signature Algorithm:\s*([^\s]+)/);
    sigAlgo = m ? m[1] : '';
  } catch {
    sigAlgo = '';
  }
  const sans = (x.subjectAltName ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^IP Address:/, 'IP:'));
  const isSelfSigned = x.subject === x.issuer && x.checkIssued(x);
  return {
    pem,
    subject: dnToString(x.subject),
    subjectComponents: x.subject.split('\n').filter(Boolean),
    commonName: cnOf(x.subject),
    issuer: dnToString(x.issuer),
    issuerCommonName: cnOf(x.issuer),
    serial: x.serialNumber,
    notBefore: toDate(x, 'from'),
    notAfter: toDate(x, 'to'),
    sans,
    keyAlgo,
    keyBits,
    sigAlgo,
    fingerprintSha256: x.fingerprint256,
    isCa: x.ca,
    isSelfSigned,
    keyUsage: x.keyUsage ?? [],
    x509: x,
  };
}

function curveLabel(curve?: string): string {
  const map: Record<string, string> = { prime256v1: 'P-256', secp256r1: 'P-256', secp384r1: 'P-384', secp521r1: 'P-521' };
  return curve ? map[curve] ?? curve : '';
}

function curveBits(curve?: string): number | null {
  if (!curve) return null;
  const m = curve.match(/(\d{3})/);
  return m ? Number(m[1]) : null;
}

export async function inspectText(pem: string, log?: CommandLog): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'cert.pem'), pem);
    const { stdout } = await openssl(['x509', '-in', 'cert.pem', '-noout', '-text', '-fingerprint', '-sha256'], { cwd: dir, log });
    return stdout.toString('utf8');
  });
}

export async function inspectKeyText(keyPem: string): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'key.pem'), keyPem, { mode: 0o600 });
    const { stdout } = await openssl(['pkey', '-in', 'key.pem', '-noout', '-text_pub'], { cwd: dir });
    return stdout.toString('utf8');
  });
}

export function keyMatchesCert(certPem: string, keyPem: string): boolean {
  try {
    const x = new crypto.X509Certificate(certPem);
    return x.checkPrivateKey(crypto.createPrivateKey(keyPem));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Material loading (import)
// ---------------------------------------------------------------------------

export interface Material {
  leaf: ParsedCert;
  chain: ParsedCert[]; // ordered: issuer of leaf first … root last (if present)
  keyPem: string | null;
}

export async function unpackPkcs12(buffer: Buffer, password: string, log?: CommandLog): Promise<{ certs: string[]; keyPem: string | null; legacy: boolean }> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'in.p12'), buffer);
    const passin = await writePassFile(dir, 'pw.txt', password);
    const base = ['pkcs12', '-in', 'in.p12', '-passin', passin, '-nodes', '-out', 'all.pem'];
    let legacy = false;
    const first = await openssl(base, { cwd: dir, log, allowFailure: true });
    if (first.code !== 0) {
      const lower = first.stderr.toLowerCase();
      if (lower.includes('mac verify failure') || lower.includes('invalid password')) {
        throw new OpenSslError('Incorrect PKCS#12 password.', first.stderr, formatCommand(base));
      }
      const second = await openssl([...base, '-legacy'], { cwd: dir, log, allowFailure: true });
      if (second.code !== 0) throw new OpenSslError(summariseError(second.stderr), second.stderr, formatCommand([...base, '-legacy']));
      legacy = true;
    }
    const all = await fs.readFile(path.join(dir, 'all.pem'), 'utf8');
    const blocks = splitPemBlocks(all);
    const certs = blocks.filter((b) => isCertType(b.type)).map((b) => b.pem);
    const keyBlock = blocks.find((b) => isKeyType(b.type));
    return { certs, keyPem: keyBlock ? await toPkcs8(keyBlock.pem, log) : null, legacy };
  });
}

export async function derToPem(buffer: Buffer, log?: CommandLog): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'in.der'), buffer);
    const { stdout } = await openssl(['x509', '-inform', 'DER', '-in', 'in.der', '-outform', 'PEM', '-passin', 'pass:'], { cwd: dir, log });
    return stdout.toString('utf8');
  });
}

export async function pkcs7ToPems(buffer: Buffer, inform: 'DER' | 'PEM', log?: CommandLog): Promise<string[]> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'in.p7b'), buffer);
    const { stdout } = await openssl(['pkcs7', '-inform', inform, '-in', 'in.p7b', '-print_certs'], { cwd: dir, log });
    return splitPemBlocks(stdout.toString('utf8')).filter((b) => isCertType(b.type)).map((b) => b.pem);
  });
}

export async function toPkcs8(keyPem: string, log?: CommandLog, password?: string): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'key.pem'), keyPem, { mode: 0o600 });
    const args = ['pkey', '-in', 'key.pem', '-passin', password ? await writePassFile(dir, 'pw.txt', password) : 'pass:'];
    const { stdout } = await openssl(args, { cwd: dir, log });
    return normalisePem(stdout.toString('utf8'));
  });
}

export async function derKeyToPem(buffer: Buffer, log?: CommandLog): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'key.der'), buffer, { mode: 0o600 });
    const { stdout } = await openssl(['pkey', '-inform', 'DER', '-in', 'key.der', '-passin', 'pass:'], { cwd: dir, log });
    return normalisePem(stdout.toString('utf8'));
  });
}

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export async function loadMaterial(
  files: UploadedFile[],
  opts: { password?: string; keyPassword?: string; log?: CommandLog },
): Promise<Material> {
  const certPems: string[] = [];
  let keyPem: string | null = null;

  for (const f of files) {
    const ext = path.extname(f.originalname).toLowerCase();
    if (isPem(f.buffer)) {
      const blocks = splitPemBlocks(f.buffer.toString('utf8'));
      for (const b of blocks) {
        if (isCertType(b.type)) certPems.push(b.pem);
        else if (isKeyType(b.type)) {
          const encrypted = keyBlockEncrypted(b);
          if (encrypted && !opts.keyPassword && !opts.password) {
            throw new Error(`The private key in ${f.originalname} is encrypted. Provide the key password.`);
          }
          keyPem = await toPkcs8(b.pem, opts.log, encrypted ? (opts.keyPassword || opts.password) : undefined);
        } else if (b.type === 'PKCS7') {
          certPems.push(...(await pkcs7ToPems(Buffer.from(b.pem), 'PEM', opts.log)));
        }
      }
      continue;
    }
    // binary
    if (['.pfx', '.p12'].includes(ext) || (await looksLikePkcs12(f.buffer))) {
      const r = await unpackPkcs12(f.buffer, opts.password ?? '', opts.log);
      certPems.push(...r.certs);
      if (r.keyPem) keyPem = r.keyPem;
      continue;
    }
    if (['.p7b', '.p7c'].includes(ext)) {
      certPems.push(...(await pkcs7ToPems(f.buffer, 'DER', opts.log)));
      continue;
    }
    if (ext === '.key' || ext === '.pk8') {
      keyPem = await derKeyToPem(f.buffer, opts.log);
      continue;
    }
    try {
      certPems.push(await derToPem(f.buffer, opts.log));
    } catch {
      try {
        keyPem = await derKeyToPem(f.buffer, opts.log);
      } catch {
        throw new Error(`Could not recognise ${f.originalname} as a certificate, key, PKCS#12 or PKCS#7 file.`);
      }
    }
  }

  if (certPems.length === 0) throw new Error('No certificate was found in the uploaded files.');

  const unique = dedupePems(certPems);
  const parsed = await Promise.all(unique.map((p) => parseCertificate(p, opts.log)));
  const { leaf, chain } = orderChain(parsed, keyPem ?? undefined);
  if (keyPem && !keyMatchesCert(leaf.pem, keyPem)) {
    throw new Error('The private key does not match the certificate.');
  }
  return { leaf, chain, keyPem };
}

async function looksLikePkcs12(buffer: Buffer): Promise<boolean> {
  if (buffer[0] !== 0x30) return false;
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'in.p12'), buffer);
    const r = await openssl(['pkcs12', '-in', 'in.p12', '-info', '-noout', '-passin', 'pass:'], { cwd: dir, allowFailure: true });
    if (r.code === 0) return true;
    const lower = r.stderr.toLowerCase();
    return lower.includes('mac verify') || lower.includes('invalid password') || lower.includes('pkcs12') || lower.includes('unsupported');
  });
}

function dedupePems(pems: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pems) {
    const n = normalisePem(p);
    const h = crypto.createHash('sha256').update(n).digest('hex');
    if (!seen.has(h)) {
      seen.add(h);
      out.push(n);
    }
  }
  return out;
}

export function orderChain(certs: ParsedCert[], keyPem?: string): { leaf: ParsedCert; chain: ParsedCert[] } {
  if (certs.length === 0) throw new Error('No certificates to order.');
  let leaf: ParsedCert | undefined;
  if (keyPem) leaf = certs.find((c) => keyMatchesCert(c.pem, keyPem));
  if (!leaf) {
    // A leaf is a certificate that did not issue any other certificate in the set.
    const issuers = new Set<ParsedCert>();
    for (const a of certs) for (const b of certs) if (a !== b && b.x509.checkIssued(a.x509)) issuers.add(a);
    const candidates = certs.filter((c) => !issuers.has(c));
    leaf = candidates.find((c) => !c.isCa) ?? candidates[0] ?? certs[0];
  }
  const chain: ParsedCert[] = [];
  let current = leaf;
  const used = new Set<ParsedCert>([leaf]);
  for (let i = 0; i < certs.length; i++) {
    if (current.isSelfSigned) break;
    const cur = current;
    const issuer = certs.find((c) => !used.has(c) && cur.x509.checkIssued(c.x509));
    if (!issuer) break;
    chain.push(issuer);
    used.add(issuer);
    current = issuer;
  }
  return { leaf, chain };
}

// ---------------------------------------------------------------------------
// Reference file analysis
// ---------------------------------------------------------------------------

export async function detectFormat(buffer: Buffer, filename: string, password?: string): Promise<DetectedFormat> {
  const base: DetectedFormat = {
    container: 'unknown',
    format: null,
    summary: 'Unrecognised file',
    details: [],
    certCount: 0,
    hasKey: false,
    keyEncoding: null,
    keyEncrypted: false,
    includesRoot: false,
    lineEnding: 'lf',
    trailingNewline: true,
    legacyPkcs12: false,
    passwordVerified: false,
    sourceFilename: filename,
  };

  if (isPem(buffer)) {
    const text = buffer.toString('utf8');
    const blocks = splitPemBlocks(text);
    const certBlocks = blocks.filter((b) => isCertType(b.type));
    const keyBlocks = blocks.filter((b) => isKeyType(b.type));
    const p7 = blocks.find((b) => b.type === 'PKCS7');
    const r: DetectedFormat = {
      ...base,
      container: 'pem',
      lineEnding: detectLineEnding(text),
      trailingNewline: /\r?\n$/.test(text),
      certCount: certBlocks.length,
      hasKey: keyBlocks.length > 0,
    };
    r.details.push(`Line endings: ${r.lineEnding.toUpperCase()}${r.trailingNewline ? ', trailing newline' : ', no trailing newline'}`);
    if (p7) {
      r.container = 'pkcs7';
      r.format = 'pkcs7-pem';
      const certs = await pkcs7ToPems(Buffer.from(p7.pem), 'PEM');
      r.certCount = certs.length;
      r.summary = `PKCS#7 bundle (PEM), ${certs.length} certificate${certs.length === 1 ? '' : 's'}`;
      return r;
    }
    if (certBlocks.length > 0) {
      const parsed = await Promise.all(certBlocks.map((b) => parseCertificate(b.pem)));
      r.includesRoot = parsed.some((c) => c.isSelfSigned && c.isCa);
      r.details.push(...parsed.map((c, i) => `#${i + 1} ${c.commonName || c.subject}${c.isCa ? (c.isSelfSigned ? ' (root CA)' : ' (intermediate CA)') : ' (leaf)'}`));
    }
    if (keyBlocks.length > 0) {
      const kb = keyBlocks[0];
      r.keyEncoding = keyEncodingFromType(kb.type);
      r.keyEncrypted = keyBlockEncrypted(kb);
      r.details.push(
        `Private key: ${kb.type} → ${r.keyEncoding.toUpperCase()}${r.keyEncrypted ? ', encrypted' : ', unencrypted (decrypted)'}`,
      );
    }
    if (certBlocks.length > 0 && keyBlocks.length > 0) {
      r.format = 'pem-bundle';
      r.summary = `PEM bundle: ${certBlocks.length} certificate${certBlocks.length === 1 ? '' : 's'} + private key`;
    } else if (certBlocks.length > 1) {
      r.format = 'pem-fullchain';
      r.summary = `PEM full chain, ${certBlocks.length} certificates${r.includesRoot ? ' (root included)' : ' (root not included)'}`;
    } else if (certBlocks.length === 1) {
      r.format = 'pem-cert';
      r.summary = 'PEM certificate (leaf only)';
    } else if (keyBlocks.length > 0) {
      r.format = r.keyEncrypted ? 'pem-key-encrypted' : 'pem-key';
      r.summary = `PEM private key, ${r.keyEncoding?.toUpperCase()}${r.keyEncrypted ? ', encrypted' : ', decrypted'}`;
    } else {
      r.summary = `PEM file with ${blocks.map((b) => b.type).join(', ') || 'no recognised blocks'}`;
    }
    return r;
  }

  // Binary candidates
  return withWorkdir(async (dir) => {
    const file = path.join(dir, 'in.bin');
    await fs.writeFile(file, buffer);

    const x509 = await openssl(['x509', '-inform', 'DER', '-in', 'in.bin', '-noout', '-subject', '-passin', 'pass:'], { cwd: dir, allowFailure: true });
    if (x509.code === 0) {
      return { ...base, container: 'der', format: 'der-cert', certCount: 1, summary: 'DER-encoded X.509 certificate (binary .cer)', details: [x509.stdout.toString('utf8').trim()] };
    }

    const passin = await writePassFile(dir, 'pw.txt', password ?? '');
    const p12 = await openssl(['pkcs12', '-in', 'in.bin', '-info', '-noout', '-passin', passin], { cwd: dir, allowFailure: true });
    const p12Lower = p12.stderr.toLowerCase();
    let legacy = false;
    let p12Ok = p12.code === 0;
    if (!p12Ok && (p12Lower.includes('unsupported') || p12Lower.includes('digital envelope'))) {
      const l = await openssl(['pkcs12', '-in', 'in.bin', '-info', '-noout', '-passin', passin, '-legacy'], { cwd: dir, allowFailure: true });
      legacy = true;
      p12Ok = l.code === 0;
      if (p12Ok) p12.stderr = l.stderr;
    }
    const isP12 = p12Ok || p12Lower.includes('mac verify') || p12Lower.includes('invalid password') || p12Lower.includes('pkcs12');
    if (isP12) {
      const r: DetectedFormat = { ...base, container: 'pkcs12', format: 'pkcs12', legacyPkcs12: legacy, passwordVerified: p12Ok, summary: 'PKCS#12 archive (.pfx / .p12)' };
      if (p12Ok) {
        const info = p12.stderr;
        const certMatches = info.match(/Certificate bag/g)?.length ?? 0;
        r.certCount = certMatches;
        r.hasKey = /Key bag|Shrouded Keybag/i.test(info);
        r.details.push(`${certMatches} certificate bag${certMatches === 1 ? '' : 's'}${r.hasKey ? ', private key present' : ', no private key'}`);
        const pbe = info.match(/PKCS12 MAC: ([^;\n]+)/);
        if (pbe) r.details.push(`MAC: ${pbe[1].trim()}`);
        const encMatch = info.match(/PKCS7 Encrypted data: ([^\n,]+)/);
        if (encMatch) r.details.push(`Encryption: ${encMatch[1].trim()}`);
        if (legacy) r.details.push('Legacy (RC2/3DES) algorithms — requires -legacy provider');
        r.summary += r.hasKey ? ' with private key' : ' (certificates only)';
      } else {
        r.details.push('Password not supplied or incorrect — format identified, contents not inspected');
      }
      return r;
    }

    const p7 = await openssl(['pkcs7', '-inform', 'DER', '-in', 'in.bin', '-print_certs', '-noout'], { cwd: dir, allowFailure: true });
    if (p7.code === 0) {
      const certs = await pkcs7ToPems(buffer, 'DER');
      return { ...base, container: 'pkcs7', format: 'pkcs7-der', certCount: certs.length, summary: `PKCS#7 bundle (DER .p7b), ${certs.length} certificate${certs.length === 1 ? '' : 's'}` };
    }

    const key = await openssl(['pkey', '-inform', 'DER', '-in', 'in.bin', '-noout', '-passin', 'pass:'], { cwd: dir, allowFailure: true });
    if (key.code === 0) {
      return { ...base, container: 'der', format: 'der-key', hasKey: true, keyEncoding: 'pkcs8', summary: 'DER-encoded private key' };
    }
    return base;
  });
}

export function specFromDetected(d: DetectedFormat, id: string): OutputSpec {
  const ext = path.extname(d.sourceFilename);
  const baseName = path.basename(d.sourceFilename, ext);
  const isKeyOnly = d.format === 'pem-key' || d.format === 'pem-key-encrypted' || d.format === 'der-key';
  const filename = isKeyOnly || /^(private|server|tls|key|fullchain|chain|cert|certificate|bundle)$/i.test(baseName) ? d.sourceFilename : `{cn_safe}${ext}`;
  const labels: Partial<Record<OutputFormat, string>> = {
    'pem-cert': 'Certificate (PEM)',
    'pem-fullchain': d.includesRoot ? 'Full chain incl. root (PEM)' : 'Full chain (PEM)',
    'pem-bundle': 'Certificate + key bundle (PEM)',
    'der-cert': 'Certificate (DER)',
    pkcs12: 'PKCS#12 archive',
    'pkcs7-pem': 'PKCS#7 bundle (PEM)',
    'pkcs7-der': 'PKCS#7 bundle (DER)',
    'pem-key': `Private key (${(d.keyEncoding ?? 'pkcs8').toUpperCase()}, decrypted)`,
    'pem-key-encrypted': `Private key (${(d.keyEncoding ?? 'pkcs8').toUpperCase()}, encrypted)`,
    'der-key': 'Private key (DER)',
  };
  return {
    id,
    label: (d.format && labels[d.format]) || d.summary,
    filename,
    format: d.format ?? 'pem-cert',
    lineEnding: d.lineEnding,
    includeRoot: d.includesRoot,
    keyEncoding: d.keyEncoding ?? 'pkcs8',
    password: '',
    friendlyName: '{cn}',
    legacyPkcs12: d.legacyPkcs12,
    trailingNewline: d.trailingNewline,
    detected: d,
  };
}

// ---------------------------------------------------------------------------
// Rendering outputs
// ---------------------------------------------------------------------------

export interface RenderMaterial {
  certPem: string;
  chainPems: string[]; // intermediates + maybe root, ordered
  keyPem: string | null;
}

export interface RenderTokens {
  cn: string;
  serial: string;
  profile: string;
  date: Date;
}

function tokenValues(t: RenderTokens) {
  const iso = t.date.toISOString();
  return {
    cn: t.cn.replace(/^\*\./, 'wildcard.'),
    cn_safe: t.cn.replace(/^\*\./, 'wildcard.').replace(/[^A-Za-z0-9._-]+/g, '_'),
    date: iso.slice(0, 10),
    year: iso.slice(0, 4),
    serial: t.serial.slice(0, 16),
    profile: t.profile.replace(/[^A-Za-z0-9._-]+/g, '_'),
  };
}

export function renderFilename(pattern: string, t: RenderTokens): string {
  const v = tokenValues(t);
  const out = pattern
    .replace(/\{cn\}/g, v.cn)
    .replace(/\{cn_safe\}/g, v.cn_safe)
    .replace(/\{date\}/g, v.date)
    .replace(/\{year\}/g, v.year)
    .replace(/\{serial\}/g, v.serial)
    .replace(/\{profile\}/g, v.profile);
  return sanitiseFilename(out);
}

/**
 * Expand tokens in a destination directory. Path separators are preserved; each path
 * segment is sanitised so tokens cannot introduce `..` or drive letters mid-path.
 */
export function renderDestinationPath(pattern: string, t: RenderTokens): string {
  const v = tokenValues(t);
  const expanded = pattern
    .replace(/\{cn\}/g, v.cn)
    .replace(/\{cn_safe\}/g, v.cn_safe)
    .replace(/\{date\}/g, v.date)
    .replace(/\{year\}/g, v.year)
    .replace(/\{serial\}/g, v.serial)
    .replace(/\{profile\}/g, v.profile);
  const unc = expanded.startsWith('\\\\');
  const parts = expanded.replace(/\//g, '\\').split('\\');
  const cleaned = parts.map((seg, i) => {
    if (unc && i < 2) return seg; // keep \\server\share
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) return seg; // drive
    if (i === 0 && seg === '') return ''; // leading /
    return seg.replace(/[:*?"<>|\u0000-\u001f]/g, '_').replace(/\.\.+/g, '.').replace(/^\.+$/, '_');
  });
  let out = cleaned.join(expanded.includes('/') && !unc ? '/' : '\\');
  if (unc && !out.startsWith('\\\\')) out = '\\\\' + out.replace(/^\\+/, '');
  return out;
}

export function sanitiseFilename(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.\.+/g, '.').trim();
  return cleaned || 'output';
}

async function splitChain(chainPems: string[]) {
  const parsed = await Promise.all(chainPems.map((p) => parseCertificate(p)));
  const intermediates = parsed.filter((c) => !c.isSelfSigned).map((c) => c.pem);
  const root = parsed.find((c) => c.isSelfSigned)?.pem ?? null;
  return { intermediates, root };
}

export async function renderOutput(spec: OutputSpec, m: RenderMaterial, tokens: RenderTokens, log?: CommandLog): Promise<Buffer> {
  const { intermediates, root } = await splitChain(m.chainPems);
  const chain = spec.includeRoot && root ? [...intermediates, root] : intermediates;
  const pemOut = (text: string) => Buffer.from(applyLineEnding(text, spec.lineEnding, spec.trailingNewline), 'utf8');
  const needsKey = ['pem-bundle', 'pkcs12', 'pem-key', 'pem-key-encrypted', 'der-key'].includes(spec.format);
  if (needsKey && !m.keyPem) throw new Error(`Output "${spec.label}" needs a private key, but this certificate has none.`);

  switch (spec.format) {
    case 'pem-cert':
      return pemOut(m.certPem);
    case 'pem-fullchain':
      return pemOut([m.certPem, ...chain].map(normalisePem).join(''));
    case 'pem-chain':
      return pemOut(chain.map(normalisePem).join(''));
    case 'pem-bundle': {
      const key = await encodeKey(m.keyPem!, spec.keyEncoding, undefined, log);
      return pemOut([m.certPem, ...chain, key].map(normalisePem).join(''));
    }
    case 'pem-key':
      return pemOut(await encodeKey(m.keyPem!, spec.keyEncoding, undefined, log));
    case 'pem-key-encrypted': {
      if (!spec.password) throw new Error(`Output "${spec.label}" is an encrypted key but has no password set.`);
      return pemOut(await encodeKey(m.keyPem!, spec.keyEncoding, spec.password, log));
    }
    case 'der-key':
      return withWorkdir(async (dir) => {
        await fs.writeFile(path.join(dir, 'key.pem'), m.keyPem!, { mode: 0o600 });
        const { stdout } = await openssl(['pkey', '-in', 'key.pem', '-outform', 'DER'], { cwd: dir, log });
        return stdout;
      });
    case 'der-cert':
      return withWorkdir(async (dir) => {
        await fs.writeFile(path.join(dir, 'cert.pem'), m.certPem);
        const { stdout } = await openssl(['x509', '-in', 'cert.pem', '-outform', 'DER'], { cwd: dir, log });
        return stdout;
      });
    case 'pkcs7-pem':
    case 'pkcs7-der':
      return withWorkdir(async (dir) => {
        await fs.writeFile(path.join(dir, 'fullchain.pem'), [m.certPem, ...chain].map(normalisePem).join(''));
        const args = ['crl2pkcs7', '-nocrl', '-certfile', 'fullchain.pem'];
        if (spec.format === 'pkcs7-der') args.push('-outform', 'DER');
        const { stdout } = await openssl(args, { cwd: dir, log });
        return spec.format === 'pkcs7-der' ? stdout : pemOut(stdout.toString('utf8'));
      });
    case 'pkcs12':
      return withWorkdir(async (dir) => {
        await fs.writeFile(path.join(dir, 'cert.pem'), m.certPem);
        await fs.writeFile(path.join(dir, 'key.pem'), m.keyPem!, { mode: 0o600 });
        const passout = await writePassFile(dir, 'pw.txt', spec.password ?? '');
        const args = ['pkcs12', '-export', '-inkey', 'key.pem', '-in', 'cert.pem', '-out', 'out.p12', '-passout', passout];
        if (chain.length) {
          await fs.writeFile(path.join(dir, 'chain.pem'), chain.map(normalisePem).join(''));
          args.push('-certfile', 'chain.pem');
        }
        const friendly = renderFilename(spec.friendlyName || '{cn}', tokens);
        if (friendly) args.push('-name', friendly);
        if (spec.legacyPkcs12) args.push('-legacy');
        await openssl(args, { cwd: dir, log });
        return fs.readFile(path.join(dir, 'out.p12'));
      });
    default:
      throw new Error(`Unsupported output format ${spec.format as string}`);
  }
}

export async function encodeKey(keyPem: string, encoding: KeyEncoding, password: string | undefined, log?: CommandLog): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'key.pem'), keyPem, { mode: 0o600 });
    const keyObj = crypto.createPrivateKey(keyPem);
    const type = keyObj.asymmetricKeyType;
    let args: string[];
    if (encoding === 'pkcs1' && type === 'rsa') {
      args = ['rsa', '-in', 'key.pem', '-traditional'];
    } else if ((encoding === 'sec1' || encoding === 'pkcs1') && type === 'ec') {
      args = ['ec', '-in', 'key.pem'];
    } else {
      args = ['pkey', '-in', 'key.pem'];
    }
    args.push('-passin', 'pass:');
    if (password) {
      args.push('-aes256', '-passout', await writePassFile(dir, 'pw.txt', password));
    }
    const { stdout } = await openssl(args, { cwd: dir, log });
    return normalisePem(stdout.toString('utf8'));
  });
}

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  'pem-cert': 'PEM certificate (leaf only)',
  'pem-fullchain': 'PEM full chain (leaf + intermediates)',
  'pem-chain': 'PEM chain only (intermediates)',
  'pem-bundle': 'PEM bundle (certificate + chain + key)',
  'der-cert': 'DER certificate (binary .cer)',
  pkcs12: 'PKCS#12 archive (.pfx / .p12)',
  'pkcs7-pem': 'PKCS#7 bundle (PEM .p7b)',
  'pkcs7-der': 'PKCS#7 bundle (DER .p7b)',
  'pem-key': 'PEM private key (decrypted)',
  'pem-key-encrypted': 'PEM private key (encrypted)',
  'der-key': 'DER private key',
};

export function defaultExtension(format: OutputFormat, lineEnding: LineEnding = 'lf'): string {
  switch (format) {
    case 'pem-cert':
    case 'pem-fullchain':
    case 'pem-chain':
      return lineEnding === 'crlf' ? '.cer' : '.pem';
    case 'pem-bundle':
      return '.pem';
    case 'der-cert':
      return '.cer';
    case 'pkcs12':
      return '.pfx';
    case 'pkcs7-pem':
    case 'pkcs7-der':
      return '.p7b';
    case 'pem-key':
    case 'pem-key-encrypted':
      return '.key';
    case 'der-key':
      return '.der';
  }
}

// ---------------------------------------------------------------------------
// Keys, CSRs, signing
// ---------------------------------------------------------------------------

export async function generateKey(mode: Exclude<KeyMode, 'reuse'>, log?: CommandLog): Promise<string> {
  return withWorkdir(async (dir) => {
    const args = ['genpkey', '-out', 'key.pem'];
    if (mode.startsWith('rsa-')) {
      args.push('-algorithm', 'RSA', '-pkeyopt', `rsa_keygen_bits:${mode.slice(4)}`);
    } else {
      const curve = mode === 'ec-p384' ? 'P-384' : 'P-256';
      args.push('-algorithm', 'EC', '-pkeyopt', `ec_paramgen_curve:${curve}`, '-pkeyopt', 'ec_param_enc:named_curve');
    }
    await openssl(args, { cwd: dir, log });
    return normalisePem(await fs.readFile(path.join(dir, 'key.pem'), 'utf8'));
  });
}

export function subjectComponentsToArg(components: string[]): string {
  const esc = (v: string) => v.replace(/([\\/])/g, '\\$1');
  return '/' + components.map((c) => {
    const i = c.indexOf('=');
    return `${c.slice(0, i)}=${esc(c.slice(i + 1))}`;
  }).join('/');
}

export function sanFromList(sans: string[]): string {
  return sans
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes(':') ? s : `DNS:${s}`))
    .map((s) => s.replace(/^IP:/, 'IP:'))
    .join(',');
}

export async function createCsr(
  keyPem: string,
  subjectComponents: string[],
  sans: string[],
  log?: CommandLog,
  opts: { serverAuth?: boolean } = { serverAuth: true },
): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'key.pem'), keyPem, { mode: 0o600 });
    const args = ['req', '-new', '-key', 'key.pem', '-passin', 'pass:', '-out', 'req.csr', '-subj', subjectComponentsToArg(subjectComponents)];
    const san = sanFromList(sans);
    if (san) args.push('-addext', `subjectAltName=${san}`);
    args.push('-addext', 'keyUsage=critical,digitalSignature,keyEncipherment');
    if (opts.serverAuth !== false) args.push('-addext', 'extendedKeyUsage=serverAuth,clientAuth');
    await openssl(args, { cwd: dir, log });
    return normalisePem(await fs.readFile(path.join(dir, 'req.csr'), 'utf8'));
  });
}

export async function selfSign(csrPem: string, keyPem: string, days: number, log?: CommandLog): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'req.csr'), csrPem);
    await fs.writeFile(path.join(dir, 'key.pem'), keyPem, { mode: 0o600 });
    await fs.writeFile(path.join(dir, 'ext.cnf'), 'basicConstraints=CA:FALSE\nsubjectKeyIdentifier=hash\n');
    await openssl(
      ['x509', '-req', '-in', 'req.csr', '-signkey', 'key.pem', '-passin', 'pass:', '-days', String(days), '-copy_extensions', 'copy', '-extfile', 'ext.cnf', '-out', 'cert.pem'],
      { cwd: dir, log },
    );
    return normalisePem(await fs.readFile(path.join(dir, 'cert.pem'), 'utf8'));
  });
}

// ---------------------------------------------------------------------------
// Internal CA (openssl ca)
// ---------------------------------------------------------------------------

const caPaths = () => ({
  dir: config.caDir,
  key: path.join(config.caDir, 'ca.key'),
  cert: path.join(config.caDir, 'ca.crt'),
  cnf: path.join(config.caDir, 'ca.cnf'),
  index: path.join(config.caDir, 'index.txt'),
  serial: path.join(config.caDir, 'serial'),
  newcerts: path.join(config.caDir, 'newcerts'),
});

export async function caExists(): Promise<boolean> {
  const p = caPaths();
  try {
    await fs.access(p.key);
    await fs.access(p.cert);
    return true;
  } catch {
    return false;
  }
}

export async function readCaCert(): Promise<string | null> {
  if (!(await caExists())) return null;
  return fs.readFile(caPaths().cert, 'utf8');
}

function caConfig(): string {
  const p = caPaths();
  const posix = (s: string) => s.split(path.sep).join('/');
  return `
[ ca ]
default_ca = CA_default

[ CA_default ]
dir              = ${posix(p.dir)}
database         = ${posix(p.index)}
new_certs_dir    = ${posix(p.newcerts)}
serial           = ${posix(p.serial)}
certificate      = ${posix(p.cert)}
private_key      = ${posix(p.key)}
default_md       = sha256
default_days     = 365
policy           = policy_loose
copy_extensions  = copy
unique_subject   = no
x509_extensions  = v3_leaf
email_in_dn      = no
name_opt         = ca_default
cert_opt         = ca_default

[ policy_loose ]
countryName             = optional
stateOrProvinceName     = optional
localityName            = optional
organizationName        = optional
organizationalUnitName  = optional
commonName              = supplied
emailAddress            = optional

[ v3_leaf ]
basicConstraints        = CA:FALSE
subjectKeyIdentifier    = hash
authorityKeyIdentifier  = keyid,issuer
`.trimStart();
}

export async function createCa(opts: { commonName: string; organisation: string; days: number }, log?: CommandLog): Promise<string> {
  const p = caPaths();
  ensureDirs();
  await fs.mkdir(p.newcerts, { recursive: true });
  await openssl(['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:4096', '-out', p.key], { log });
  await fs.chmod(p.key, 0o600);
  const subj = subjectComponentsToArg([`O=${opts.organisation}`, `CN=${opts.commonName}`]);
  await openssl(
    [
      'req', '-x509', '-new', '-key', p.key, '-passin', 'pass:', '-out', p.cert, '-days', String(opts.days), '-subj', subj,
      '-addext', 'basicConstraints=critical,CA:TRUE',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-addext', 'subjectKeyIdentifier=hash',
    ],
    { log },
  );
  await fs.writeFile(p.index, '');
  await fs.writeFile(p.index + '.attr', 'unique_subject = no\n');
  await fs.writeFile(p.serial, crypto.randomBytes(8).toString('hex').toUpperCase() + '\n');
  await fs.writeFile(p.cnf, caConfig());
  return fs.readFile(p.cert, 'utf8');
}

export async function deleteCa() {
  await fs.rm(config.caDir, { recursive: true, force: true });
  await fs.mkdir(config.caDir, { recursive: true });
}

function asn1Time(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export async function signWithCa(
  csrPem: string,
  validity: { days: number } | { start: Date; end: Date },
  log?: CommandLog,
): Promise<string> {
  if (!(await caExists())) throw new Error('No internal CA exists yet. Create one in Settings.');
  const p = caPaths();
  await fs.writeFile(p.cnf, caConfig());
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, 'req.csr'), csrPem);
    const args = ['ca', '-config', p.cnf, '-batch', '-notext', '-passin', 'pass:', '-in', 'req.csr', '-out', 'cert.pem'];
    if ('days' in validity) args.push('-days', String(validity.days));
    else args.push('-startdate', asn1Time(validity.start), '-enddate', asn1Time(validity.end));
    await openssl(args, { cwd: dir, log });
    return normalisePem(await fs.readFile(path.join(dir, 'cert.pem'), 'utf8'));
  });
}
