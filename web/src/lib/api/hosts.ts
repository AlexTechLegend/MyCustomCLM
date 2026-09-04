import type { Host } from '@/types/automation';
import { json, request } from './client';

export const hostsApi = {
  list: () => request<Host[]>('/api/hosts'),
  get: (id: string) => request<Host>(`/api/hosts/${id}`),
  create: (body: Partial<Host>) => request<Host>('/api/hosts', json('POST', body)),
  update: (id: string, body: Partial<Host>) => request<Host>(`/api/hosts/${id}`, json('PUT', body)),
  delete: (id: string) => request<void>(`/api/hosts/${id}`, { method: 'DELETE' }),
  linkCertificate: (hostId: string, certificateId: string) =>
    request<Host>(`/api/hosts/${hostId}/certificates/${certificateId}`, { method: 'POST' }),
  unlinkCertificate: (hostId: string, certificateId: string) =>
    request<void>(`/api/hosts/${hostId}/certificates/${certificateId}`, { method: 'DELETE' }),
  setCertificateHosts: (certificateId: string, hostIds: string[]) =>
    request<Host[]>(`/api/certificates/${certificateId}/hosts`, json('PUT', { hostIds })),
};
