import type { OutputFormat, OutputSpec } from '@/types';

export interface FormatPreview {
  kind: 'pem' | 'binary' | 'pkcs12';
  heading: string;
  sample: string;
  notes: string[];
}

export interface FormatPreset {
  id: string;
  title: string;
  description: string;
  category: 'certificate' | 'key' | 'bundle';
  defaults: Pick<OutputSpec, 'format' | 'filename' | 'label' | 'lineEnding' | 'includeRoot' | 'keyEncoding' | 'password' | 'friendlyName' | 'legacyPkcs12' | 'trailingNewline'>;
}

const PEM_LEAF = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIUQmVnaW4tbGVhZi4uLjANBgkqhkiG9w0BAQsFADBN
... leaf  ·  CN=portal.contoso.com  ·  RSA 2048  ·  SHA-256 ...
-----END CERTIFICATE-----`;

const PEM_INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIDQzCCAiugAwIBAgIUSW50ZXJtZWRpYXRlLjANBgkqhkiG9w0BAQsFADBN
... intermediate  ·  Contoso Enterprise CA 01 ...
-----END CERTIFICATE-----`;

const PEM_ROOT = `-----BEGIN CERTIFICATE-----
MIIDQzCCAiugAwIBAgIUVGhlLXJvb3QuLi4wDQYJKoZIhvcNAQELBQAwTQ==
... root  ·  Contoso Root CA ...
-----END CERTIFICATE-----`;

const PEM_KEY8 = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
... decrypted PKCS#8  ·  no passphrase ...
-----END PRIVATE KEY-----`;

const PEM_KEY1 = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAy8...
... traditional PKCS#1  ·  BEGIN RSA PRIVATE KEY ...
-----END RSA PRIVATE KEY-----`;

const PEM_KEY_ENC = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQI...
... AES-256  ·  password required to unwrap ...
-----END ENCRYPTED PRIVATE KEY-----`;

function withEndings(text: string, ending: 'lf' | 'crlf') {
  const body = text.replace(/\r\n/g, '\n');
  return ending === 'crlf' ? body.replace(/\n/g, '\r\n') : body;
}

export function previewForSpec(spec: Pick<OutputSpec, 'format' | 'filename' | 'lineEnding' | 'includeRoot' | 'keyEncoding'>): FormatPreview {
  const endingNote = spec.lineEnding === 'crlf' ? 'CRLF line endings (Windows).' : 'LF line endings (Linux / macOS).';
  const root = spec.includeRoot;
  switch (spec.format) {
    case 'pem-cert':
      return { kind: 'pem', heading: spec.filename, notes: ['Leaf only — no issuer certificates.', endingNote], sample: withEndings(PEM_LEAF, spec.lineEnding) };
    case 'pem-fullchain':
      return {
        kind: 'pem',
        heading: spec.filename,
        notes: [root ? 'Order: leaf, intermediate, root.' : 'Order: leaf, then intermediates. Root omitted.', endingNote],
        sample: withEndings([PEM_LEAF, PEM_INTERMEDIATE, root ? PEM_ROOT : ''].filter(Boolean).join('\n'), spec.lineEnding),
      };
    case 'pem-chain':
      return {
        kind: 'pem',
        heading: spec.filename,
        notes: [root ? 'Intermediates plus root — no leaf.' : 'Intermediates only — pair with a separate leaf file.', endingNote],
        sample: withEndings([PEM_INTERMEDIATE, root ? PEM_ROOT : ''].filter(Boolean).join('\n'), spec.lineEnding),
      };
    case 'pem-bundle':
      return {
        kind: 'pem',
        heading: spec.filename,
        notes: ['Concatenated PEM: certificate, chain, then the private key.', 'HAProxy and some appliances consume this as a single file.', endingNote],
        sample: withEndings([PEM_LEAF, PEM_INTERMEDIATE, spec.keyEncoding === 'pkcs1' ? PEM_KEY1 : PEM_KEY8].join('\n'), spec.lineEnding),
      };
    case 'der-cert':
      return {
        kind: 'binary',
        heading: spec.filename,
        notes: ['Binary X.509 (DER). Not human-readable.', 'Common for appliances and some Windows tools.'],
        sample: '30 82 03 5d 30 82 02 45 a0 03 02 01 02 02 14 42\n65 67 69 6e 2d 6c 65 61 66 2e 2e 2e 30 0d 06 09\n2a 86 48 86 f7 0d 01 01 0b 05 00 30 4d 31 …\n\n[ binary DER  ·  ~1.2 KB  ·  leaf only ]',
      };
    case 'pkcs7-der':
      return {
        kind: 'binary',
        heading: spec.filename,
        notes: [root ? 'PKCS#7 SignedData of the chain including the root.' : 'PKCS#7 SignedData of the chain, root omitted.', 'Java keystores and many network appliances.'],
        sample: '30 82 04 1a 06 09 2a 86 48 86 f7 0d 01 07 02 a0\n82 04 0b 30 82 04 07 02 01 01 31 00 30 0b 06 09\n2a 86 48 86 f7 0d 01 07 01 …\n\n[ binary PKCS#7  ·  chain bundle  ·  no private key ]',
      };
    case 'pkcs7-pem':
      return {
        kind: 'pem',
        heading: spec.filename,
        notes: ['PEM-wrapped PKCS#7 (BEGIN PKCS7).', root ? 'Includes the root CA.' : 'Root omitted.'],
        sample: withEndings(`-----BEGIN PKCS7-----\nMIIEGjAJBgUrDgMCGgUAMIIECzCCAQcCAQExADALBgkqhkiG9w0BBwGgggQHMIIE\n... chain  ·  ${root ? 'leaf + intermediate + root' : 'leaf + intermediate'} ...\n-----END PKCS7-----`, spec.lineEnding),
      };
    case 'pem-key':
      return {
        kind: 'pem',
        heading: spec.filename,
        notes: [
          spec.keyEncoding === 'pkcs1' ? 'Traditional encoding — BEGIN RSA PRIVATE KEY / BEGIN EC PRIVATE KEY.' : 'Modern PKCS#8 — BEGIN PRIVATE KEY.',
          'Unencrypted. Restrict filesystem permissions (0600).',
          endingNote,
        ],
        sample: withEndings(spec.keyEncoding === 'pkcs1' ? PEM_KEY1 : PEM_KEY8, spec.lineEnding),
      };
    case 'pem-key-encrypted':
      return {
        kind: 'pem',
        heading: spec.filename,
        notes: ['BEGIN ENCRYPTED PRIVATE KEY — AES-256.', 'Set the password on the output after adding.', endingNote],
        sample: withEndings(PEM_KEY_ENC, spec.lineEnding),
      };
    case 'der-key':
      return {
        kind: 'binary',
        heading: spec.filename,
        notes: ['Binary private key (DER). Not human-readable.'],
        sample: '30 82 04 a2 02 01 00 30 0d 06 09 2a 86 48 86 f7\n0d 01 01 01 05 00 04 82 04 8c 30 82 04 88 02 01 …\n\n[ binary PKCS#8 key  ·  ~1.7 KB ]',
      };
    case 'pkcs12':
      return {
        kind: 'pkcs12',
        heading: spec.filename,
        notes: ['Password-protected archive: leaf + chain + private key.', 'IIS, Windows MMC, and many browsers import this directly.'],
        sample: 'PKCS#12 / PFX archive\n\n  Friendly name   portal.contoso.com\n  Bag 1           certificate  ·  leaf\n  Bag 2           certificate  ·  intermediate\n  Bag 3           private key  ·  encrypted\n\n[ binary  ·  typically 3–6 KB  ·  password required ]',
      };
    default:
      return { kind: 'pem', heading: spec.filename, notes: [], sample: '' };
  }
}

export function folderPreview(files: { filename: string; label?: string }[], destinationPath = '') {
  const dir = destinationPath.trim() || '{deploy location}';
  return { directory: dir, files };
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
