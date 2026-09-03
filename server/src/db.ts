import fs from 'node:fs';
import { createRequire } from 'node:module';
import { config, ensureDirs } from './config.js';

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

const require = createRequire(import.meta.url);

let _db: Db | null = null;
let _backend: string | null = null;

export function dbBackend() {
  return _backend;
}

export function db(): Db {
  if (_db) return _db;
  ensureDirs();
  const opened = openDatabase(config.dbPath);
  _db = opened.db;
  _backend = opened.backend;
  migrate(_db);
  return _db;
}

function openDatabase(dbPath: string): { db: Db; backend: string } {
  // Prefer better-sqlite3: works on Node 20+ with prebuilt binaries (incl. Windows).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): {
        run(...p: unknown[]): { changes: number; lastInsertRowid: number | bigint };
        get(...p: unknown[]): unknown;
        all(...p: unknown[]): unknown[];
      };
      pragma(p: string): unknown;
    };
    const raw = new Database(dbPath);
    raw.pragma('journal_mode = WAL');
    raw.pragma('foreign_keys = ON');
    return { db: wrapBetter(raw), backend: 'better-sqlite3' };
  } catch (betterErr) {
    // Fall back to Node's built-in sqlite (Node 22.5+).
    try {
      // Quiet the experimental warning before the first load.
      require('./lib/quiet-sqlite-warning.js');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite') as {
        DatabaseSync: new (path: string) => {
          exec(sql: string): void;
          prepare(sql: string): {
            run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
            get(...p: unknown[]): unknown;
            all(...p: unknown[]): unknown[];
          };
        };
      };
      const raw = new DatabaseSync(dbPath);
      raw.exec('PRAGMA journal_mode = WAL');
      raw.exec('PRAGMA foreign_keys = ON');
      return { db: wrapNamed(raw), backend: 'node:sqlite' };
    } catch (sqliteErr) {
      const betterMsg = betterErr instanceof Error ? betterErr.message : String(betterErr);
      const sqliteMsg = sqliteErr instanceof Error ? sqliteErr.message : String(sqliteErr);
      throw new Error(
        [
          'Could not open the Vigil database.',
          '',
          `  better-sqlite3: ${betterMsg}`,
          `  node:sqlite:    ${sqliteMsg}`,
          '',
          'Fix: use Node 20 LTS (or newer) from https://nodejs.org, then from the repo root run:',
          '  npm install',
          '  npm rebuild better-sqlite3',
          '  npm run seed',
        ].join('\n'),
      );
    }
  }
}

/** better-sqlite3 already accepts named objects and ignores unused keys. */
function wrapBetter(raw: {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): unknown[];
  };
}): Db {
  return {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const stmt = raw.prepare(sql);
      return {
        run: (...p) => stmt.run(...normalise(p)),
        get: (...p) => stmt.get(...normalise(p)),
        all: (...p) => stmt.all(...normalise(p)),
      };
    },
  };
}

/**
 * node:sqlite rejects unknown named parameters, so filter the object down to the
 * names the statement actually references.
 */
function wrapNamed(raw: {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): unknown[];
  };
}): Db {
  return {
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      const named = new Set([...sql.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
      const bind = (params: Params): unknown[] => {
        if (params.length === 1 && isPlainObject(params[0])) {
          const src = params[0] as Record<string, unknown>;
          const filtered: Record<string, unknown> = {};
          for (const k of named) filtered[k] = src[k] === undefined ? null : src[k];
          return [filtered];
        }
        return params.map((p) => (p === undefined ? null : p));
      };
      return {
        run: (...p) => stmt.run(...bind(p)),
        get: (...p) => stmt.get(...bind(p)),
        all: (...p) => stmt.all(...bind(p)),
      };
    },
  };
}

function normalise(params: Params): unknown[] {
  if (params.length === 1 && isPlainObject(params[0])) return [params[0]];
  return params.map((p) => (p === undefined ? null : p));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array) && !Buffer.isBuffer(v);
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
      destination_override TEXT NOT NULL DEFAULT '',
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
      scope TEXT NOT NULL DEFAULT 'general',
      server_tags TEXT NOT NULL DEFAULT '[]',
      certificate_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identity_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      locality TEXT NOT NULL DEFAULT '',
      organisation TEXT NOT NULL DEFAULT '',
      organisational_unit TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      default_key_mode TEXT NOT NULL DEFAULT 'rsa-2048',
      default_validity_days INTEGER NOT NULL DEFAULT 397,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tag_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
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
  // Additive migrations for databases created before these columns existed.
  ensureColumn(d, 'certificates', 'destination_override', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(d, 'profiles', 'scope', "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn(d, 'profiles', 'server_tags', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(d, 'profiles', 'certificate_ids', "TEXT NOT NULL DEFAULT '[]'");
}

function ensureColumn(d: Db, table: string, column: string, ddl: string) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
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

/** Used by tests / diagnostics — closes nothing (process exit cleans up). */
export function ensureDataDirWritable() {
  ensureDirs();
  fs.accessSync(config.dataDir, fs.constants.W_OK);
}
