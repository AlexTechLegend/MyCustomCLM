import Database from 'better-sqlite3';
import { config, ensureDirs } from './config.js';

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  ensureDirs();
  _db = new Database(config.dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function migrate(d: Database.Database) {
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
