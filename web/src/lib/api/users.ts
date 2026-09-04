import type { User, UserRole } from '@/types/automation';
import { json, request } from './client';

export const usersApi = {
  list: () => request<User[]>('/api/users'),
  get: (id: string) => request<User>(`/api/users/${id}`),
  create: (body: { username: string; password: string; displayName?: string; email?: string; role?: UserRole; scopeTags?: string[] }) =>
    request<User>('/api/users', json('POST', body)),
  update: (id: string, body: Partial<Pick<User, 'displayName' | 'email' | 'role' | 'scopeTags' | 'isActive'>> & { password?: string }) =>
    request<User>(`/api/users/${id}`, json('PUT', body)),
  delete: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  me: () => request<{ user: User | null; authEnabled: boolean }>('/api/auth/me'),
};
