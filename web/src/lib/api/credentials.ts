import type { CredentialKind, CredentialMeta } from '@/types/automation';
import { json, request } from './client';

export interface CredentialWrite {
  name?: string;
  kind?: CredentialKind;
  username?: string;
  secret?: string;
  description?: string;
}

export const credentialsApi = {
  list: () => request<CredentialMeta[]>('/api/credentials'),
  get: (id: string) => request<CredentialMeta>(`/api/credentials/${id}`),
  create: (body: CredentialWrite) => request<CredentialMeta>('/api/credentials', json('POST', body)),
  update: (id: string, body: CredentialWrite) => request<CredentialMeta>(`/api/credentials/${id}`, json('PUT', body)),
  delete: (id: string) => request<void>(`/api/credentials/${id}`, { method: 'DELETE' }),
};
