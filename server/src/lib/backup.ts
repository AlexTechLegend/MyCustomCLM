import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDirs } from '../config.js';
import { db } from '../db.js';
import { log } from './logger.js';

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

export function backupVigil(destDir: string): string {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.resolve(destDir, `vigil-backup-${stamp}`);
  fs.mkdirSync(dest, { recursive: true });
  try {
    db().exec(`VACUUM INTO '${path.join(dest, 'vigil.sqlite').replace(/'/g, "''")}'`);
  } catch {
    fs.copyFileSync(config.dbPath, path.join(dest, 'vigil.sqlite'));
    const wal = `${config.dbPath}-wal`;
    const shm = `${config.dbPath}-shm`;
    if (fs.existsSync(wal)) fs.copyFileSync(wal, path.join(dest, 'vigil.sqlite-wal'));
    if (fs.existsSync(shm)) fs.copyFileSync(shm, path.join(dest, 'vigil.sqlite-shm'));
  }
  copyDir(config.vaultDir, path.join(dest, 'vault'));
  copyDir(config.caDir, path.join(dest, 'ca'));
  fs.writeFileSync(
    path.join(dest, 'manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), dataDir: config.dataDir }, null, 2),
  );
  log.info('backup written', { dest });
  return dest;
}

export function restoreVigil(srcDir: string) {
  const src = path.resolve(srcDir);
  const dbFile = path.join(src, 'vigil.sqlite');
  if (!fs.existsSync(dbFile)) throw new Error(`No vigil.sqlite in ${src}`);
  ensureDirs();
  fs.copyFileSync(dbFile, config.dbPath);
  const wal = path.join(src, 'vigil.sqlite-wal');
  const shm = path.join(src, 'vigil.sqlite-shm');
  if (fs.existsSync(wal)) fs.copyFileSync(wal, `${config.dbPath}-wal`);
  if (fs.existsSync(shm)) fs.copyFileSync(shm, `${config.dbPath}-shm`);
  if (fs.existsSync(path.join(src, 'vault'))) {
    fs.rmSync(config.vaultDir, { recursive: true, force: true });
    copyDir(path.join(src, 'vault'), config.vaultDir);
  }
  if (fs.existsSync(path.join(src, 'ca'))) {
    fs.rmSync(config.caDir, { recursive: true, force: true });
    copyDir(path.join(src, 'ca'), config.caDir);
  }
  log.info('restore complete', { src, dataDir: config.dataDir });
}
