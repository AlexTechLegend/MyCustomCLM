import path from 'node:path';

/**
 * Resolve `template` under `root`. Tokens like `{cn}` are treated as a single path
 * segment. Any `..` segment, or a result that escapes `root`, is rejected.
 */
export function resolveUnderRoot(root: string, template: string): string {
  const base = path.resolve(root);
  const blanked = template.replace(/\{[a-z0-9_]+\}/gi, '_token_');
  const parts = blanked.split(/[\\/]+/).filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) {
    throw new Error('Destination template must not contain ".." segments.');
  }
  const resolved = path.resolve(base, ...parts);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Destination escapes its root (${base}).`);
  }
  return resolved;
}
