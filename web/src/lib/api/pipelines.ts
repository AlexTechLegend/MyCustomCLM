import type { Pipeline, PipelineRun, StepTypeInfo } from '@/types/automation';
import { json, request } from './client';

export interface PipelineDetail {
  pipeline: Pipeline;
  runs: PipelineRun[];
}

export const pipelinesApi = {
  list: () => request<Pipeline[]>('/api/pipelines'),
  steps: () => request<StepTypeInfo[]>('/api/pipelines/steps'),
  get: (id: string) => request<PipelineDetail>(`/api/pipelines/${id}`),
  create: (body: Partial<Pipeline>) => request<Pipeline>('/api/pipelines', json('POST', body)),
  update: (id: string, body: Partial<Pipeline>) => request<Pipeline>(`/api/pipelines/${id}`, json('PUT', body)),
  delete: (id: string) => request<void>(`/api/pipelines/${id}`, { method: 'DELETE' }),
  plan: (id: string, body: { certificateId?: string; hostId?: string; params?: Record<string, unknown> }) =>
    request<unknown>(`/api/pipelines/${id}/plan`, json('POST', body)),
  run: (id: string, body: { certificateId?: string; hostId?: string; renewalId?: string; params?: Record<string, unknown>; dryRun?: boolean }) =>
    request<PipelineRun>(`/api/pipelines/${id}/run`, json('POST', body)),
  runs: (params?: { certificateId?: string; pipelineId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.certificateId) qs.set('certificateId', params.certificateId);
    if (params?.pipelineId) qs.set('pipelineId', params.pipelineId);
    const q = qs.toString();
    return request<PipelineRun[]>(`/api/pipeline-runs${q ? `?${q}` : ''}`);
  },
  runById: (id: string) => request<PipelineRun>(`/api/pipeline-runs/${id}`),
  approve: (id: string, note?: string) => request<PipelineRun>(`/api/pipeline-runs/${id}/approve`, json('POST', { note })),
  reject: (id: string, note?: string) => request<PipelineRun>(`/api/pipeline-runs/${id}/reject`, json('POST', { note })),
};
