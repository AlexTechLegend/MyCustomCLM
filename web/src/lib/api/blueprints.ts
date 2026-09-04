import type { Certificate } from '@/types';
import type { Blueprint, BlueprintDrift, CertificateSchedule, InstantiateBody } from '@/types/automation';
import { json, request } from './client';

export const blueprintsApi = {
  list: () => request<Blueprint[]>('/api/blueprints'),
  get: (id: string) => request<Blueprint>(`/api/blueprints/${id}`),
  create: (body: Partial<Blueprint>) => request<Blueprint>('/api/blueprints', json('POST', body)),
  update: (id: string, body: Partial<Blueprint>) => request<Blueprint>(`/api/blueprints/${id}`, json('PUT', body)),
  delete: (id: string) => request<void>(`/api/blueprints/${id}`, { method: 'DELETE' }),
  instantiate: (id: string, body: InstantiateBody) => request<Certificate>(`/api/blueprints/${id}/instantiate`, json('POST', body)),
  drift: (id: string) => request<BlueprintDrift>(`/api/blueprints/${id}/drift`),
  certificateSchedule: (certificateId: string) => request<CertificateSchedule>(`/api/certificates/${certificateId}/schedule`),
};
