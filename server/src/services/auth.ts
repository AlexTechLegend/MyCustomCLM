import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { db, newId, nowIso, parseJson } from '../db.js';
import type { User, UserRole } from '../types.js';
import { writeAudit } from './audit.js';
import { hashPassword, hashToken, randomToken, verifyPassword } from './crypto.js';

const COOKIE = 'vigil_session';
const SESSION_DAYS = 14;

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  source: 'local' | 'ldap';
  scope_tags: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}

function mapUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    email: r.email,
    role: r.role,
    source: r.source,
    scopeTags: parseJson(r.scope_tags, []),
    isActive: !!r.is_active,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  };
}

export type AuthedRequest = Request & { user?: User };

/**
 * LDAP/AD bind seam — not implemented in this task.
 * When source=ldap, authenticateLocal will refuse; wire an LDAP binder here later.
 */
export async function authenticateLdap(_username: string, _password: string): Promise<User | null> {
  throw new Error('LDAP/AD authentication is not implemented yet. Use a local user, or set VIGIL_AUTH=0.');
}

export function listUsers(): User[] {
  return (db().prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all() as UserRow[]).map(mapUser);
}

export function getUser(id: string): User | null {
  const row = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(input: {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
  role?: UserRole;
  scopeTags?: string[];
}): User {
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error('Username is required.');
  if (!input.password || input.password.length < 8) throw new Error('Password must be at least 8 characters.');
  const now = nowIso();
  const row: UserRow = {
    id: newId('usr'),
    username,
    display_name: input.displayName ?? username,
    email: input.email ?? '',
    password_hash: hashPassword(input.password),
    role: input.role ?? 'operator',
    source: 'local',
    scope_tags: JSON.stringify(input.scopeTags ?? []),
    is_active: 1,
    last_login_at: null,
    created_at: now,
  };
  db()
    .prepare(
      `INSERT INTO users (id, username, display_name, email, password_hash, role, source, scope_tags, is_active, last_login_at, created_at)
       VALUES (@id, @username, @display_name, @email, @password_hash, @role, @source, @scope_tags, @is_active, @last_login_at, @created_at)`,
    )
    .run(row);
  writeAudit({ actorType: 'service-account', action: 'user.create', entityType: 'user', entityId: row.id, after: { username } });
  return mapUser(row);
}

export function updateUser(
  id: string,
  input: { displayName?: string; email?: string; role?: UserRole; scopeTags?: string[]; isActive?: boolean; password?: string },
): User | null {
  const existing = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!existing) return null;
  let passwordHash = existing.password_hash;
  if (input.password !== undefined) {
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters.');
    passwordHash = hashPassword(input.password);
  }
  db()
    .prepare(
      `UPDATE users SET display_name = ?, email = ?, role = ?, scope_tags = ?, is_active = ?, password_hash = ? WHERE id = ?`,
    )
    .run(
      input.displayName ?? existing.display_name,
      input.email ?? existing.email,
      input.role ?? existing.role,
      JSON.stringify(input.scopeTags ?? parseJson(existing.scope_tags, [])),
      input.isActive === false ? 0 : input.isActive === true ? 1 : existing.is_active,
      passwordHash,
      id,
    );
  writeAudit({ action: 'user.update', entityType: 'user', entityId: id });
  return getUser(id);
}

export function deleteUser(id: string): boolean {
  db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  const res = db().prepare('DELETE FROM users WHERE id = ?').run(id);
  if (Number(res.changes) > 0) writeAudit({ action: 'user.delete', entityType: 'user', entityId: id });
  return Number(res.changes) > 0;
}

export function authenticateLocal(username: string, password: string): User | null {
  const row = db().prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase()) as UserRow | undefined;
  if (!row || !row.is_active) return null;
  if (row.source === 'ldap') return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  db().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id);
  return mapUser(row);
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db()
    .prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(newId('ses'), userId, hashToken(token), expiresAt, nowIso());
  return { token, expiresAt };
}

export function destroySession(token: string) {
  db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function userFromToken(token: string): User | null {
  const row = db()
    .prepare(
      `SELECT u.* FROM users u INNER JOIN sessions s ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`,
    )
    .get(hashToken(token), nowIso()) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(res: Response, token: string, expiresAt: string) {
  const secure = process.env.VIGIL_TLS === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/**
 * Auth middleware. Disabled unless VIGIL_AUTH=1 so in-flight UI work keeps running.
 * When enabled, mutating routes require a valid session cookie.
 */
export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!config.authEnabled) return next();
  const token = parseCookie(req.headers.cookie, COOKIE);
  if (token) {
    const user = userFromToken(token);
    if (user) req.user = user;
  }
  // Login / logout must work without an existing session.
  const open = req.path === '/auth/login' || req.path === '/auth/logout';
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (mutating && !req.user && !open) {
    return res.status(401).json({ error: 'Authentication required (VIGIL_AUTH=1). POST /api/auth/login first.' });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!config.authEnabled) return next();
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Requires role: ${roles.join(' | ')}` });
    }
    next();
  };
}
