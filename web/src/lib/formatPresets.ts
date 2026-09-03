import type { OutputFormat, OutputSpec } from '@/types';

export interface FormatPreset {
  id: string;
  title: string;
  description: string;
  category: 'certificate' | 'key' | 'bundle';
  defaults: Pick<OutputSpec, 'format' | 'filename' | 'label' | 'lineEnding' | 'includeRoot' | 'keyEncoding' | 'password' | 'friendlyName' | 'legacyPkcs12' | 'trailingNewline'>;
}

/** Catalogue of every deliverable format Vigil can produce — used by the profile builder. */
export const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: 'fullchain-cer-crlf',
    title: 'Full chain .cer (Windows)',
    description: 'Leaf + intermediates as PEM with CRLF endings. Tick “include root” for leaf + intermediate + root.',
    category: 'certificate',
    defaults: { format: 'pem-fullchain', filename: 'fullchain.cer', label: 'Full chain (.cer, CRLF)', lineEnding: 'crlf', includeRoot: true, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'fullchain-pem-lf',
    title: 'Full chain .pem (Linux)',
    description: 'Leaf + intermediates, LF endings — the Nginx / Apache standard.',
    category: 'certificate',
    defaults: { format: 'pem-fullchain', filename: 'fullchain.pem', label: 'fullchain.pem', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'leaf-pem',
    title: 'Leaf certificate only (PEM)',
    description: 'Just the end-entity certificate, no chain.',
    category: 'certificate',
    defaults: { format: 'pem-cert', filename: '{cn_safe}.pem', label: 'Leaf certificate (PEM)', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'leaf-der',
    title: 'Leaf certificate (DER / binary .cer)',
    description: 'Binary X.509 — common for appliances and some Windows tools.',
    category: 'certificate',
    defaults: { format: 'der-cert', filename: '{cn_safe}.cer', label: 'Leaf certificate (DER)', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'chain-only',
    title: 'Chain only (intermediates)',
    description: 'Issuer certificates without the leaf — useful alongside a separate leaf file.',
    category: 'certificate',
    defaults: { format: 'pem-chain', filename: 'chain.pem', label: 'Chain only', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'pkcs7-der',
    title: 'PKCS#7 chain (.p7b DER)',
    description: 'Binary PKCS#7 bundle of the chain — Java keystores and many network appliances.',
    category: 'certificate',
    defaults: { format: 'pkcs7-der', filename: '{cn_safe}-chain.p7b', label: 'PKCS#7 chain (DER)', lineEnding: 'lf', includeRoot: true, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'pkcs7-pem',
    title: 'PKCS#7 chain (.p7b PEM)',
    description: 'PEM-encoded PKCS#7 chain bundle.',
    category: 'certificate',
    defaults: { format: 'pkcs7-pem', filename: '{cn_safe}-chain.p7b', label: 'PKCS#7 chain (PEM)', lineEnding: 'lf', includeRoot: true, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'key-pkcs8',
    title: 'Decrypted private key (.key PKCS#8)',
    description: 'BEGIN PRIVATE KEY — the most common modern key file.',
    category: 'key',
    defaults: { format: 'pem-key', filename: 'private.key', label: 'Decrypted private key (PKCS#8)', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'key-pkcs1',
    title: 'Decrypted private key (PKCS#1 / traditional)',
    description: 'BEGIN RSA PRIVATE KEY / BEGIN EC PRIVATE KEY — older tooling.',
    category: 'key',
    defaults: { format: 'pem-key', filename: 'private.key', label: 'Decrypted private key (PKCS#1)', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs1', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'key-encrypted',
    title: 'Encrypted private key (AES-256)',
    description: 'BEGIN ENCRYPTED PRIVATE KEY — set a password on the output after adding.',
    category: 'key',
    defaults: { format: 'pem-key-encrypted', filename: '{cn_safe}.key', label: 'Encrypted private key', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'privkey-pem',
    title: 'privkey.pem (Nginx / Certbot style)',
    description: 'Decrypted PKCS#8 key named the way Certbot writes it.',
    category: 'key',
    defaults: { format: 'pem-key', filename: 'privkey.pem', label: 'privkey.pem', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'pfx',
    title: 'PKCS#12 archive (.pfx)',
    description: 'Certificate + chain + key in one password-protected file — IIS and Windows import.',
    category: 'bundle',
    defaults: { format: 'pkcs12', filename: '{cn_safe}.pfx', label: 'PKCS#12 (.pfx)', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
  {
    id: 'pem-bundle',
    title: 'PEM bundle (cert + chain + key)',
    description: 'Everything concatenated into one .pem — HAProxy and some appliances.',
    category: 'bundle',
    defaults: { format: 'pem-bundle', filename: '{cn_safe}.bundle.pem', label: 'PEM bundle', lineEnding: 'lf', includeRoot: false, keyEncoding: 'pkcs8', password: '', friendlyName: '{cn}', legacyPkcs12: false, trailingNewline: true },
  },
];

export function specFromPreset(preset: FormatPreset, id: string): OutputSpec {
  return {
    id,
    ...preset.defaults,
    detected: null,
  };
}

export const FORMAT_CATEGORIES: { id: FormatPreset['category']; label: string }[] = [
  { id: 'certificate', label: 'Certificates & chains' },
  { id: 'key', label: 'Private keys' },
  { id: 'bundle', label: 'Bundles archives' },
];

export function needsPassword(format: OutputFormat) {
  return format === 'pkcs12' || format === 'pem-key-encrypted';
}
