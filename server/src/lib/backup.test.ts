import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-bak-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db, newId } = await import('../db.js');
const { backupVigil, restoreVigil } = await import('./backup.js');
const { config, ensureDirs } = await import('../config.js');

describe('backup / restore', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    resetDbHandle();
    ensureDirs();
    db();
  });

  it('round-trips the SQLite file and vault', () => {
    const marker = newId('bak');
    db().prepare("INSERT INTO settings(key, value) VALUES (?, ?)").run('backup.test', marker);
    const vaultFile = path.join(config.vaultDir, 'probe.txt');
    fs.writeFileSync(vaultFile, 'vault-bytes', 'utf8');

    const destRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-bak-out-'));
    const snapshot = backupVigil(destRoot);
    assert.equal(fs.existsSync(path.join(snapshot, 'vigil.sqlite')), true);
    assert.equal(fs.existsSync(path.join(snapshot, 'vault', 'probe.txt')), true);

    db().prepare('DELETE FROM settings WHERE key = ?').run('backup.test');
    fs.rmSync(vaultFile, { force: true });
    resetDbHandle();

    restoreVigil(snapshot);
    resetDbHandle();
    const row = db().prepare('SELECT value FROM settings WHERE key = ?').get('backup.test') as { value: string } | undefined;
    assert.equal(row?.value, marker);
    assert.equal(fs.readFileSync(path.join(config.vaultDir, 'probe.txt'), 'utf8'), 'vault-bytes');
  });
});
