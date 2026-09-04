import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-cred-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_SECRET_KEY = 'cd'.repeat(32);
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
const { createCredential, getCredentialMeta, listCredentials, revealCredentialSecret, rotateCredentialKeys } = await import('./credentials.js');
const { encryptSecret, decryptSecret } = await import('./crypto.js');

describe('credential encryption', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    process.env.VIGIL_SECRET_KEY = 'cd'.repeat(32);
    resetDbHandle();
    db();
  });

  it('round-trips a secret and never serialises it', () => {
    const secret = 's3cret-value-do-not-leak';
    const created = createCredential({ name: 'demo', kind: 'password', username: 'svc', secret, description: 'test' });
    const listed = listCredentials();
    const meta = getCredentialMeta(created.id);
    const blob = JSON.stringify({ created, listed, meta });
    assert.equal(blob.includes(secret), false);
    assert.equal(blob.includes('secret_encrypted'), false);
    assert.equal(meta?.hasSecret, true);
    const revealed = revealCredentialSecret(created.id);
    assert.equal(revealed?.secret, secret);
  });

  it('encrypt / decrypt helpers agree', () => {
    const enc = encryptSecret('hello');
    assert.equal(decryptSecret(enc.ciphertext, enc.iv, enc.tag), 'hello');
  });

  it('rotation re-encrypts under a new key', () => {
    const secret = 'rotate-me';
    const row = createCredential({ name: 'rot', secret });
    const oldKey = Buffer.from('cd'.repeat(32), 'hex');
    const newKey = Buffer.from('ef'.repeat(32), 'hex');
    rotateCredentialKeys(oldKey, newKey);
    process.env.VIGIL_SECRET_KEY = 'ef'.repeat(32);
    assert.equal(revealCredentialSecret(row.id)?.secret, secret);
    process.env.VIGIL_SECRET_KEY = 'cd'.repeat(32);
  });
});
