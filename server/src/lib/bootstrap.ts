import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config, ensureDirs, loadSecretKeyFromDisk, secretKeyMaterial } from '../config.js';
import { db } from '../db.js';
import { createUser, listUsers } from '../services/auth.js';
import { log } from './logger.js';

export function generateSecretKeyHex(): string {
  return randomBytes(32).toString('hex');
}

export function writeSecretKeyFile(hex: string): string {
  ensureDirs();
  const file = path.join(config.dataDir, 'secret.key');
  fs.writeFileSync(file, hex, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* windows */
  }
  return file;
}

export function bootstrapIfNeeded(): { adminPassword?: string; secretFile?: string } {
  const out: { adminPassword?: string; secretFile?: string } = {};
  loadSecretKeyFromDisk();
  if (!secretKeyMaterial()) {
    const hex = generateSecretKeyHex();
    out.secretFile = writeSecretKeyFile(hex);
    process.env.VIGIL_SECRET_KEY = hex;
    log.warn(`First-run: wrote VIGIL_SECRET_KEY to ${out.secretFile}. Export it in the service environment and keep the file at mode 0600.`);
  }

  const users = listUsers();
  if (users.length === 0) {
    const password = randomBytes(12).toString('base64url');
    createUser({
      username: 'admin',
      password,
      displayName: 'Administrator',
      role: 'admin',
    });
    out.adminPassword = password;
    log.warn(`First-run admin user created. Username: admin  One-time password: ${password}  Change it after first login.`);
  }
  return out;
}

export function credentialsExist(): boolean {
  const row = db().prepare('SELECT COUNT(*) AS n FROM credentials').get() as { n: number };
  return Number(row.n) > 0;
}
