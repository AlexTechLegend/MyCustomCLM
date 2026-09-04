import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIisRebindScript } from './iis-rebind.js';

describe('IIS rebind script', () => {
  const script = buildIisRebindScript();

  it('reads the PFX password from the environment, never argv', () => {
    assert.match(script, /VIGIL_CRED_SECRET/);
    assert.doesNotMatch(script, /ConvertTo-SecureString\s+'[^']+'/);
  });

  it('is idempotent: only rebinds bindings still on the old thumbprint', () => {
    assert.match(script, /\$thumb -eq \$oldThumb/);
    assert.match(script, /\$thumb -ne \$newThumb/);
  });

  it('fails closed if any binding remains on the old thumbprint', () => {
    assert.match(script, /Rebind incomplete/);
    assert.match(script, /still on old thumbprint/);
  });

  it('optionally removes the superseded certificate', () => {
    assert.match(script, /VIGIL_REMOVE_OLD/);
    assert.match(script, /REMOVED:/);
  });
});
