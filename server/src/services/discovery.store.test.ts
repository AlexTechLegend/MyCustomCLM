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
const { latestDiscoveryScanId, listDiscoveryResults, persistDiscoveryHits } = await import('./discovery.js');

describe('discovery_results persistence', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    resetDbHandle();
    db();
  });

  it('writes hits and upserts the same address/port/fingerprint', () => {
    const first = persistDiscoveryHits('scan_a', [
      { host: 'web.example.test', port: 443, fingerprintSha256: 'aa', commonName: 'web.example.test', status: 'unknown' },
    ]);
    assert.equal(first.length, 1);
    assert.equal(first[0].scanId, 'scan_a');
    const second = persistDiscoveryHits('scan_b', [
      { host: 'web.example.test', port: 443, fingerprintSha256: 'aa', commonName: 'web.example.test', status: 'known', certificateId: 'crt_1' },
    ]);
    assert.equal(second[0].id, first[0].id);
    assert.equal(second[0].scanId, 'scan_b');
    assert.equal(second[0].matchedCertificateId, 'crt_1');
    assert.equal(listDiscoveryResults().length, 1);
    assert.equal(latestDiscoveryScanId(), 'scan_b');
  });
});
