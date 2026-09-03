import { createRequire } from 'node:module';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import './lib/quiet-sqlite-warning.js';
import { config, ensureDirs } from './config.js';

// Loaded lazily with require() so the experimental-warning filter above is installed first;
// a static ESM import of a builtin is evaluated at link time, before any module body runs.
const require = createRequire(import.meta.url);
function loadSqlite(): typeof import('node:sqlite') {
  return require('node:sqlite') as typeof import('node:sqlite');
}

type Row = Record<string, unknown>;
// Positional values, or a single object of named parameters (extra keys are ignored).
type Params = unknown[];

export interface Statement {
  run(...params: Params): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: Params): unknown;
  all(...params: Params): unknown[];
}

export interface Db {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}

let _db: Db | null = null;

export function db(): Db {
  if (_db) return _db;
  ensureDirs();
  const { DatabaseSync } = loadSqlite();
  const raw = new DatabaseSync(config.dbPath);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  _db = wrap(raw);
  migrate(_db);
  return _db;
}

/**
 * Thin adapter over node:sqlite. Named parameters are passed as plain objects; any keys the
 * statement does not reference are dropped, so a full row object can be handed to a partial
 * UPDATE without error.
 */
function wrap(raw: DatabaseSync): Db {
  return {
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      const named = new Set([...sql.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
      const bind = (params: Params): SQLInputValue[] => {
        if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0]) && !(params[0] instanceof Uint8Array)) {
          const src = params[0] as Record<string, SQLInputValue | undefined>;
          const filtered: Record<string, SQLInputValue> = {};
          for (const k of named) filtered[k] = src[k] === undefined ? null : (src[k] as SQLInputValue);
          return [filtered as unknown as SQLInputValue];
        }
        return params.map((p) => (p === undefined ? null : p)) as SQLInputValue[];
      };
      return {
        run: (...p) => stmt.run(...bind(p)),
        get: (...p) => stmt.get(...bind(p)) as Row | undefined,
        all: (...p) => stmt.all(...bind(p)) as Row[],
      };
    },
  };
}

function migrate(d: Db) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      common_name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      issuer_common_name TEXT NOT NULL,
      serial TEXT NOT NULL,
      not_before TEXT NOT NULL,
      not_after TEXT NOT NULL,
      sans TEXT NOT NULL DEFAULT '[]',
      key_algo TEXT NOT NULL DEFAULT '',
      key_bits INTEGER,
      sig_algo TEXT NOT NULL DEFAULT '',
      fingerprint_sha256 TEXT NOT NULL,
      has_key INTEGER NOT NULL DEFAULT 0,
      chain_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'imported',
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      profile_ids TEXT NOT NULL DEFAULT '[]',
      renewal_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_certificates_not_after ON certificates(not_after);

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      destination_path TEXT NOT NULL DEFAULT '',
      outputs TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS renewals (
      id TEXT PRIMARY KEY,
      certificate_id TEXT NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      key_mode TEXT NOT NULL,
      validity_days INTEGER NOT NULL,
      csr_pem TEXT,
      previous_not_after TEXT,
      new_not_after TEXT,
      profile_ids TEXT NOT NULL DEFAULT '[]',
      deploy INTEGER NOT NULL DEFAULT 0,
      outputs TEXT NOT NULL DEFAULT '[]',
      commands TEXT NOT NULL DEFAULT '[]',
      minutes_saved REAL NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_renewals_cert ON renewals(certificate_id);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      certificate_id TEXT,
      certificate_name TEXT,
      renewal_id TEXT,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      commands TEXT NOT NULL DEFAULT '[]',
      minutes_saved REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
