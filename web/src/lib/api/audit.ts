import type { AuditEntry } from '@/types/automation';
import { request } from './client';

export const auditApi = {
  list: (params?: { entityType?: string; entityId?: string; action?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.entityType) qs.set('entityType', params.entityType);
    if (params?.entityId) qs.set('entityId', params.entityId);
    if (params?.action) qs.set('action', params.action);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<AuditEntry[]>(`/api/audit${q ? `?${q}` : ''}`);
  },
};
