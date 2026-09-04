import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintsMatch, fingerprintDer, normalizeFingerprint } from './tls-verify.js';

describe('normalizeFingerprint', () => {
  it('strips colons and lowercases OpenSSL-style fingerprints', () => {
    assert.equal(normalizeFingerprint('AA:BB:CC:DD'), 'aabbccdd');
    assert.equal(normalizeFingerprint('aabbccdd'), 'aabbccdd');
    assert.equal(normalizeFingerprint('AA BB CC'), 'aabbcc');
  });

  it('matches mixed presentations of the same digest', () => {
    const openssl = 'AB:CD:EF:01:23';
    const raw = 'abcdef0123';
    assert.equal(fingerprintsMatch(openssl, raw), true);
    assert.equal(fingerprintsMatch(openssl, '00:11:22'), false);
  });

  it('hashes DER the same way a TLS handshake will', () => {
    const der = Buffer.from('hello-cert');
    assert.equal(fingerprintDer(der), fingerprintDer(Buffer.from('hello-cert')));
    assert.notEqual(fingerprintDer(der), fingerprintDer(Buffer.from('other')));
  });
});
