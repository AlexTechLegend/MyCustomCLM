import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-disc-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
const { expandCidr, expandDiscoveryTargets, listDiscoveryResults, persistDiscoveryHits } = await import('./discovery.js');

describe('expandCidr', () => {
  it('expands a /30 into two usable hosts', () => {
    const hosts = expandCidr('10.0.0.0/30');
    assert.deepEqual(hosts, ['10.0.0.1', '10.0.0.2']);
  });

  it('returns a single address for /32', () => {
    assert.deepEqual(expandCidr('192.0.2.10/32'), ['192.0.2.10']);
  });

  it('caps expansion at the remaining budget', () => {
    const hosts = expandCidr('10.1.0.0/24', 4);
    assert.equal(hosts.length, 4);
    assert.equal(hosts[0], '10.1.0.1');
  });
});

describe('expandDiscoveryTargets', () => {
  it('mixes hostnames and CIDRs', () => {
    const out = expandDiscoveryTargets(['example.test', '10.0.0.0/30']);
    assert.ok(out.includes('example.test'));
    assert.ok(out.includes('10.0.0.1'));
  });
});

describe('persistDiscoveryHits', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    resetDbHandle();
    db();
  });

  it('inserts then updates last_seen on the same fingerprint', () => {
    const first = persistDiscoveryHits('scan_a', [
      { host: '192.0.2.10', port: 443, fingerprintSha256: 'bb'.repeat(32), commonName: 'a.example', status: 'unknown' },
    ]);
    assert.equal(first.length, 1);
    const second = persistDiscoveryHits('scan_b', [
      { host: '192.0.2.10', port: 443, fingerprintSha256: 'bb'.repeat(32), commonName: 'a.example', status: 'known' },
    ]);
    assert.equal(second.length, 1);
    assert.equal(second[0].id, first[0].id);
    assert.equal(second[0].scanId, 'scan_b');
    assert.equal(second[0].firstSeen, first[0].firstSeen);
    const listed = listDiscoveryResults({ scanId: 'scan_b' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].address, '192.0.2.10');
  });
});
