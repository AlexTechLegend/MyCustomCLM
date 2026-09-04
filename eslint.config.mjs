// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/**
 * Flat config covering both workspaces. Untyped (no `project` service) on
 * purpose for this pass -- type-aware linting needs a correctly wired
 * tsconfig `project` per workspace and is meaningfully slower; landing the
 * config and the syntactic/hooks/a11y rule set first is the higher-value
 * step, with type-aware rules a natural follow-up once this baseline is
 * clean. See Tasks/009/PLAN-modernization.md, Phase 3.2.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain Node CLI scripts (scripts/doctor.mjs, server/scripts/run-tests.mjs) --
    // not part of either workspace's tsconfig, so they need their own globals.
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['server/src/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Re-enable explicitly: several `require()` interop call sites in
      // db.ts (better-sqlite3 / node:sqlite fallback) carry a deliberate
      // `// eslint-disable-next-line @typescript-eslint/no-require-imports`
      // already. Without the rule turned on here those directives report as
      // unused, which is more confusing than just enabling the rule they
      // were clearly written against.
      '@typescript-eslint/no-require-imports': 'error',
    },
  },
  {
    // openssl.ts strips/validates control characters from process output —
    // \x00 and \x1f in that regex are the point, not a mistake.
    files: ['server/src/openssl.ts'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2021 } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // `any` shows up deliberately at a handful of API/JSON boundaries in
      // this codebase; banning it outright is a larger, separate cleanup.
      '@typescript-eslint/no-explicit-any': 'off',

      // eslint-plugin-react-hooks v7 ships several new, stricter rules aimed
      // at React Compiler compatibility (set-state-in-effect, refs, purity,
      // immutability, preserve-manual-memoization). They found ~24 real
      // instances across this codebase on first run -- each one needs a
      // judgement call about whether the pattern is actually safe here, not
      // a mechanical fix, so they are 'warn' rather than 'error' for now
      // rather than blocking CI on a backlog nobody has reviewed yet. The
      // two classic, well-understood rules stay at full severity.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      // Same reasoning for accessibility: real findings (autofocus, missing
      // keyboard handlers on custom interactive elements, an unlabelled
      // control), but each needs its own look at the actual markup and
      // behaviour rather than a blanket fix in this pass.
      ...Object.fromEntries(Object.keys(jsxA11y.configs.recommended.rules).map((rule) => [rule, 'warn'])),
    },
  },
);
