import path from 'node:path';
import { createHash } from 'node:crypto';
import { config, ensureDirs } from './config.js';
import { db, resetDbHandle } from './db.js';
import { backupVigil, restoreVigil } from './lib/backup.js';
import { bootstrapIfNeeded, writeSecretKeyFile } from './lib/bootstrap.js';
import { log } from './lib/logger.js';
import { rotateCredentialKeys } from './services/credentials.js';

function keyFromRaw(raw: string): Buffer {
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, 'hex');
  return createHash('sha256').update(t).digest();
}

function usage() {
  console.log(`vigil cli
  rotate-key     Re-encrypt credentials. VIGIL_SECRET_KEY=new  VIGIL_SECRET_KEY_OLD=old
  backup [dir]   Snapshot SQLite + vault + CA into dir (default ./backups)
  restore <dir>  Restore a backup directory into VIGIL_DATA_DIR
  bootstrap      Generate VIGIL_SECRET_KEY and the initial admin if missing
`);
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    return;
  }
  ensureDirs();
  db();

  if (cmd === 'bootstrap') {
    const result = bootstrapIfNeeded();
    if (result.secretFile) console.log(`Secret key file: ${result.secretFile}`);
    if (result.adminPassword) console.log(`Admin one-time password: ${result.adminPassword}`);
    if (!result.secretFile && !result.adminPassword) console.log('Nothing to bootstrap — key and users already exist.');
    return;
  }

  if (cmd === 'rotate-key') {
    const oldRaw = process.env.VIGIL_SECRET_KEY_OLD?.trim();
    const nextRaw = process.env.VIGIL_SECRET_KEY?.trim();
    if (!oldRaw || !nextRaw) {
      throw new Error('Set VIGIL_SECRET_KEY_OLD (current) and VIGIL_SECRET_KEY (new) before rotating.');
    }
    const n = rotateCredentialKeys(keyFromRaw(oldRaw), keyFromRaw(nextRaw));
    const file = writeSecretKeyFile(nextRaw);
    log.info(`Re-encrypted ${n} credential(s). Persist VIGIL_SECRET_KEY in the service environment (also written to ${file}).`);
    return;
  }

  if (cmd === 'backup') {
    const dest = process.argv[3] || path.join(config.repoRoot, 'backups');
    const written = backupVigil(dest);
    console.log(written);
    return;
  }

  if (cmd === 'restore') {
    const src = process.argv[3];
    if (!src) throw new Error('restore requires a backup directory');
    restoreVigil(src);
    resetDbHandle();
    db();
    console.log(`Restored into ${config.dataDir}`);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
