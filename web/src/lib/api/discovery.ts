import type { DiscoveryResult } from '@/types/automation';
import { json, request } from './client';

export interface DiscoveryHit {
  host: string;
  port: number;
  fingerprintSha256: string;
  commonName: string;
  notAfter?: string;
  status: 'unknown' | 'known' | 'known-but-different';
  certificateId?: string;
  certificateName?: string;
  error?: string;
}

export const discoveryApi = {
  list: (scanId?: string) => {
    const q = scanId ? `?scanId=${encodeURIComponent(scanId)}` : '';
    return request<{ scanId: string | null; results: DiscoveryResult[] }>(`/api/discovery${q}`);
  },
  scan: (body: { targets: string[]; ports?: number[] }) =>
    request<{ scanId: string; hits: DiscoveryHit[]; results: DiscoveryResult[] }>('/api/discovery/scan', json('POST', body)),
};
