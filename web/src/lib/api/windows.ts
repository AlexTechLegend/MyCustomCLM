import type { MaintenanceWindow } from '@/types/automation';
import { json, request } from './client';

export const windowsApi = {
  list: () => request<MaintenanceWindow[]>('/api/windows'),
  get: (id: string) => request<MaintenanceWindow>(`/api/windows/${id}`),
  create: (body: Partial<MaintenanceWindow>) => request<MaintenanceWindow>('/api/windows', json('POST', body)),
  update: (id: string, body: Partial<MaintenanceWindow>) => request<MaintenanceWindow>(`/api/windows/${id}`, json('PUT', body)),
  delete: (id: string) => request<void>(`/api/windows/${id}`, { method: 'DELETE' }),
};
