#!/usr/bin/env node
/**
 * Quick environment check for Vigil. Run with:  npm run doctor
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let ok = true;
const say = (pass, msg) => {
  console.log(`${pass ? '✔' : '✖'} ${msg}`);
  if (!pass) ok = false;
};

const major = Number(process.versions.node.split('.')[0]);
say(major >= 20, `Node ${process.versions.node}${major >= 20 ? '' : ' — install Node 20 LTS from https://nodejs.org and re-open the terminal'}`);

// Probe OpenSSL the same way the server does
const candidates = process.platform === 'win32'
  ? [
      'openssl',
      path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'OpenSSL-Win64', 'bin', 'openssl.exe'),
      path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe'),
      path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Git', 'mingw64', 'bin', 'openssl.exe'),
    ]
  : process.platform === 'darwin'
    ? ['/opt/homebrew/opt/openssl@3/bin/openssl', '/usr/local/opt/openssl@3/bin/openssl', 'openssl']
    : ['openssl'];

let openssl = null;
for (const bin of candidates) {
  const r = spawnSync(bin, ['version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (r.status === 0 && r.stdout) {
    openssl = { bin, version: r.stdout.trim() };
    if (/^OpenSSL 3/.test(openssl.version)) break;
  }
}
if (!openssl) {
  say(false, 'OpenSSL not found — install OpenSSL 3 (Windows: winget install ShiningLight.OpenSSL.Light)');
} else if (!/^OpenSSL 3/.test(openssl.version)) {
  say(false, `Found ${openssl.version} at ${openssl.bin} — need OpenSSL 3.x`);
} else {
  say(true, `${openssl.version} (${openssl.bin})`);
}

try {
  const Database = require(path.join(root, 'node_modules', 'better-sqlite3'));
  const d = new Database(':memory:');
  const v = d.prepare('select sqlite_version() as v').get().v;
  d.close();
  say(true, `better-sqlite3 works (SQLite ${v})`);
} catch (e) {
  say(false, `better-sqlite3 failed to load: ${e instanceof Error ? e.message : e}\n    Fix: npm rebuild better-sqlite3`);
}

console.log(ok ? '\nEnvironment looks good. Run:  npm run seed' : '\nFix the items marked ✖, then re-run:  npm run doctor');
process.exit(ok ? 0 : 1);
