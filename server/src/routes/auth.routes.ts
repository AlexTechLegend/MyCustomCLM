import { Router } from 'express';
import { config } from '../config.js';
import { writeAudit } from '../services/audit.js';
import {
  authenticateLocal,
  clearSessionCookie,
  createSession,
  createUser,
  deleteUser,
  destroySession,
  getUser,
  listUsers,
  parseSessionCookie,
  requireRole,
  setSessionCookie,
  updateUser,
  type AuthedRequest,
} from '../services/auth.js';
import type { UserRole } from '../types.js';
import { createUserBody, loginBody, parseBody } from '../lib/schema.js';
import { list, str, wrap } from './http.js';

export const authRoutes = Router();

authRoutes.post(
  '/auth/login',
  wrap((req, res) => {
    const body = parseBody(loginBody, req.body);
    const username = body.username;
    const password = body.password;
    const user = authenticateLocal(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
    const session = createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    writeAudit({ actorUserId: user.id, actorType: 'user', action: 'auth.login', entityType: 'user', entityId: user.id });
    res.json({ user, expiresAt: session.expiresAt });
  }),
);

authRoutes.post(
  '/auth/logout',
  wrap((req, res) => {
    const token = parseSessionCookie(req.headers.cookie);
    if (token) destroySession(token);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

authRoutes.get(
  '/auth/me',
  wrap((req, res) => {
    const user = (req as AuthedRequest).user;
    if (!user) return res.json({ user: null, authEnabled: config.authEnabled });
    res.json({ user, authEnabled: config.authEnabled });
  }),
);

authRoutes.get('/users', requireRole('admin'), wrap((_req, res) => res.json(listUsers())));
authRoutes.post(
  '/users',
  requireRole('admin'),
  wrap((req, res) => {
    const body = parseBody(createUserBody, req.body);
    const user = createUser({
      username: body.username,
      password: body.password,
      displayName: body.displayName,
      email: body.email,
      role: body.role,
      scopeTags: body.scopeTags,
    });
    res.status(201).json(user);
  }),
);
authRoutes.get(
  '/users/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const user = getUser(req.params.id as string);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  }),
);
authRoutes.put(
  '/users/:id',
  requireRole('admin'),
  wrap((req, res) => {
    const user = updateUser(req.params.id as string, {
      displayName: str(req.body.displayName),
      email: str(req.body.email),
      role: str(req.body.role) as UserRole | undefined,
      scopeTags: req.body.scopeTags !== undefined ? list(req.body.scopeTags) : undefined,
      isActive: req.body.isActive,
      password: str(req.body.password),
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  }),
);
authRoutes.delete('/users/:id', requireRole('admin'), wrap((req, res) => res.status(deleteUser(req.params.id as string) ? 204 : 404).end()));
