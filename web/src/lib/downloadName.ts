import type { OutputFormat } from '@/types';

const EXT: Record<OutputFormat, string> = {
  'pem-cert': '.pem',
  'pem-fullchain': '.fullchain.pem',
  'pem-chain': '.chain.pem',
  'pem-bundle': '.bundle.pem',
  'der-cert': '.cer',
  pkcs12: '.pfx',
  'pkcs7-pem': '.p7b',
  'pkcs7-der': '.p7b',
  'pem-key': '.key',
  'pem-key-encrypted': '.enc.key',
  'der-key': '.key.der',
};

/** Mirrors server adhocDownload filename derivation. */
export function adhocDownloadName(commonName: string, format: OutputFormat): string {
  const base = commonName.replace(/^\*\./, 'wildcard.').replace(/[^A-Za-z0-9._-]+/g, '_');
  return base + EXT[format];
}

export const FORMAT_CONTENTS: Record<OutputFormat, string> = {
  'pem-cert': 'Leaf certificate only, no chain or private key',
  'pem-fullchain': 'Leaf certificate plus intermediates, no private key',
  'pem-chain': 'Intermediate certificates only — no leaf and no private key',
  'pem-bundle': 'Leaf, intermediates and private key in one PEM file',
  'der-cert': 'Binary leaf certificate (.cer), no chain or private key',
  pkcs12: 'PKCS#12 archive with certificate, chain and private key (.pfx)',
  'pkcs7-pem': 'PKCS#7 certificate bundle in PEM (.p7b) — no private key',
  'pkcs7-der': 'PKCS#7 certificate bundle in DER (.p7b) — no private key',
  'pem-key': 'Unencrypted private key (PEM)',
  'pem-key-encrypted': 'Password-protected private key (PEM)',
  'der-key': 'Private key in DER — no certificate',
};

const KEY_FORMATS = new Set<OutputFormat>(['pem-bundle', 'pkcs12', 'pem-key', 'pem-key-encrypted', 'der-key']);

export function formatNeedsPrivateKey(format: OutputFormat) {
  return KEY_FORMATS.has(format);
}
