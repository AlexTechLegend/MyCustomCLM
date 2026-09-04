import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expandCidr, expandDiscoveryTargets } from './discovery.js';

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
