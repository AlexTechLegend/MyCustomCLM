import type { Job, SchedulerHeartbeat } from '@/types/automation';
import { request } from './client';

export const jobsApi = {
  list: (params?: { state?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.state) qs.set('state', params.state);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<Job[]>(`/api/jobs${q ? `?${q}` : ''}`);
  },
  get: (id: string) => request<Job>(`/api/jobs/${id}`),
  cancel: (id: string) => request<Job>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  retry: (id: string) => request<Job>(`/api/jobs/${id}/retry`, { method: 'POST' }),
  scheduler: () => request<SchedulerHeartbeat>('/api/scheduler'),
};
