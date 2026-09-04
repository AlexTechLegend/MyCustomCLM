import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveUnderRoot } from './paths.js';

describe('resolveUnderRoot', () => {
  const root = path.resolve('/var/vigil/dest');

  it('joins a simple template', () => {
    const out = resolveUnderRoot(root, 'certs/{cn_safe}');
    assert.equal(out, path.resolve(root, 'certs', '_token_'));
  });

  it('rejects .. in the template', () => {
    assert.throws(() => resolveUnderRoot(root, '../etc/passwd'), /must not contain "\.\."/);
  });

  it('rejects a template that would escape the root', () => {
    assert.throws(() => resolveUnderRoot(root, 'ok/../../outside'), /must not contain "\.\."/);
  });
});
