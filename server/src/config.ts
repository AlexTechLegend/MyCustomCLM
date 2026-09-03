import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src or server/dist → repo root
const repoRoot = path.resolve(here, '..', '..');

const dataDir = process.env.VIGIL_DATA_DIR
  ? path.resolve(process.env.VIGIL_DATA_DIR)
  : path.join(repoRoot, 'data');

export const config = {
  port: Number(process.env.PORT ?? 4180),
  repoRoot,
  dataDir,
  dbPath: path.join(dataDir, 'vigil.sqlite'),
  vaultDir: path.join(dataDir, 'vault'),
  renewalsDir: path.join(dataDir, 'renewals'),
  caDir: path.join(dataDir, 'ca'),
  tmpDir: path.join(dataDir, 'tmp'),
  webDist: path.join(repoRoot, 'web', 'dist'),
  opensslBin: process.env.OPENSSL_BIN ?? 'openssl',
};

export function ensureDirs() {
  for (const d of [config.dataDir, config.vaultDir, config.renewalsDir, config.caDir, config.tmpDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
