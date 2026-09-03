export interface PemBlock {
  type: string;
  pem: string;
  headers: string[];
}

const BLOCK_RE = /-----BEGIN ([A-Z0-9 ]+)-----\r?\n([\s\S]*?)-----END \1-----/g;

export function splitPemBlocks(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  for (const m of text.matchAll(BLOCK_RE)) {
    const type = m[1];
    const rawBody = m[2];
    const lines = rawBody.split(/\r?\n/);
    const headers: string[] = [];
    const bodyLines: string[] = [];
    let inHeaders = true;
    for (const line of lines) {
      if (inHeaders && line.includes(':')) {
        headers.push(line.trim());
        continue;
      }
      if (inHeaders && line.trim() === '' && headers.length > 0) {
        inHeaders = false;
        continue;
      }
      inHeaders = false;
      if (line.trim()) bodyLines.push(line.trim());
    }
    const pem = `-----BEGIN ${type}-----\n${headers.length ? headers.join('\n') + '\n\n' : ''}${bodyLines.join('\n')}\n-----END ${type}-----\n`;
    blocks.push({ type, pem, headers });
  }
  return blocks;
}

export function isPem(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString('utf8');
  return head.includes('-----BEGIN ');
}

export function detectLineEnding(text: string): 'lf' | 'crlf' {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? 'crlf' : 'lf';
}

export function normalisePem(pem: string): string {
  return pem.replace(/\r\n/g, '\n').trim() + '\n';
}

export function applyLineEnding(text: string, ending: 'lf' | 'crlf', trailingNewline: boolean): string {
  let t = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  if (trailingNewline) t += '\n';
  if (ending === 'crlf') t = t.replace(/\n/g, '\r\n');
  return t;
}

export function isCertType(type: string) {
  return type === 'CERTIFICATE' || type === 'TRUSTED CERTIFICATE' || type === 'X509 CERTIFICATE';
}

export function isKeyType(type: string) {
  return (
    type === 'PRIVATE KEY' ||
    type === 'ENCRYPTED PRIVATE KEY' ||
    type === 'RSA PRIVATE KEY' ||
    type === 'EC PRIVATE KEY' ||
    type === 'DSA PRIVATE KEY'
  );
}

export function keyEncodingFromType(type: string): 'pkcs8' | 'pkcs1' | 'sec1' {
  if (type === 'RSA PRIVATE KEY') return 'pkcs1';
  if (type === 'EC PRIVATE KEY') return 'sec1';
  return 'pkcs8';
}

export function keyBlockEncrypted(block: PemBlock): boolean {
  if (block.type === 'ENCRYPTED PRIVATE KEY') return true;
  return block.headers.some((h) => /Proc-Type:\s*4,\s*ENCRYPTED/i.test(h));
}
