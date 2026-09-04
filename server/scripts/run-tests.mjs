#!/usr/bin/env node
/**
 * Recursively finds every src/**\/*.test.ts file and runs them through tsx's
 * test runner with explicit paths, instead of `tsx --test "src/**\/*.test.ts"`.
 *
 * That glob string was silently matching nothing on this toolchain (Node
 * 20.16 / tsx 4.23): Node's --test recursive globstar support is inconsistent
 * across Node/tsx versions, and directory-mode discovery (`tsx --test src`)
 * only recognises .js/.mjs/.cjs by default, not .test.ts. Walking the
 * filesystem ourselves in plain Node and passing explicit file paths sidesteps
 * both problems and works identically on Windows and POSIX.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = walk('src').sort();

if (!files.length) {
  console.error('No *.test.ts files found under src/ — that is almost certainly a bug in this script, not an empty test suite.');
  process.exit(1);
}

console.log(`Running ${files.length} test file${files.length === 1 ? '' : 's'}...`);

// shell: true so this resolves the `tsx` binary via node_modules/.bin on the
// PATH npm already sets up for scripts, on both Windows and POSIX.
const result = spawnSync('tsx', ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', shell: true });

process.exit(result.status ?? 1);
