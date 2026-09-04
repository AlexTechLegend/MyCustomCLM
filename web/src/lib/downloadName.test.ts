import { describe, expect, it } from 'vitest';
import { adhocDownloadName, formatNeedsPrivateKey } from './downloadName';
import type { OutputFormat } from '@/types';

describe('adhocDownloadName', () => {
  it('squashes runs of unsafe characters to a single underscore, but leaves dots alone', () => {
    // Dots are in the allowed set ([^A-Za-z0-9._-]) alongside underscore and
    // hyphen, since a common name is itself dot-separated -- only genuinely
    // unsafe characters (spaces, parens, etc.) collapse to "_".
    expect(adhocDownloadName('my server (prod)!', 'pem-cert')).toBe('my_server_prod_.pem');
    expect(adhocDownloadName('host.example.com', 'pem-cert')).toBe('host.example.com.pem');
  });

  it('rewrites a leading wildcard to "wildcard."', () => {
    expect(adhocDownloadName('*.contoso.com', 'pem-fullchain')).toBe('wildcard.contoso.com.fullchain.pem');
  });

  it('picks the right extension per format', () => {
    const cases: [OutputFormat, string][] = [
      ['pem-cert', '.pem'],
      ['pem-fullchain', '.fullchain.pem'],
      ['der-cert', '.cer'],
      ['pkcs12', '.pfx'],
      ['pkcs7-pem', '.p7b'],
      ['pem-key', '.key'],
      ['pem-key-encrypted', '.enc.key'],
      ['der-key', '.key.der'],
    ];
    for (const [format, ext] of cases) {
      expect(adhocDownloadName('host.example.com', format)).toBe(`host.example.com${ext}`);
    }
  });
});

describe('formatNeedsPrivateKey', () => {
  it('is true for every format that bundles a key', () => {
    for (const f of ['pem-bundle', 'pkcs12', 'pem-key', 'pem-key-encrypted', 'der-key'] as OutputFormat[]) {
      expect(formatNeedsPrivateKey(f)).toBe(true);
    }
  });

  it('is false for certificate-only formats', () => {
    for (const f of ['pem-cert', 'pem-fullchain', 'pem-chain', 'der-cert', 'pkcs7-pem', 'pkcs7-der'] as OutputFormat[]) {
      expect(formatNeedsPrivateKey(f)).toBe(false);
    }
  });
});
