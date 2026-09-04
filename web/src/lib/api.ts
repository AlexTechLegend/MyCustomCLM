import type { AutomationEvent, Certificate, DetectedFormat, IdentityTemplate, OutputSpec, Profile, Renewal, Settings, TagGroup, User, UserRole } from '@/types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public command?: string, public stderr?: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === 'object' && body?.error ? body.error : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body?.command, body?.stderr);
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export interface DashboardData {
  counts: { total: number; healthy: number; expiring: number; critical: number; expired: number; withoutKey: number; withoutProfile: number };
  horizon: { label: string; count: number }[];
  issuers: { name: string; count: number }[];
  expiringSoon: Certificate[];
  timeSaved: TimeSavedSummary;
  recentEvents: AutomationEvent[];
  profiles: number;
  settings: { organisation: string; expiringThresholdDays: number; criticalThresholdDays: number };
}

export interface TimeSavedSummary {
  totalMinutes: number;
  totalEvents: number;
  thisMonthMinutes: number;
  thisMonthEvents: number;
  byType: { type: string; minutes: number; count: number }[];
  monthly: { month: string; label: string; minutes: number; count: number }[];
}

export interface CertificateDetail {
  certificate: Certificate;
  pem: string;
  chain: { subject: string; commonName: string; issuer: string; notAfter: string; isSelfSigned: boolean; fingerprintSha256: string }[];
  renewals: Renewal[];
  events: AutomationEvent[];
  profiles: Profile[];
}

export interface CaInfo {
  exists: boolean;
  subject?: string;
  commonName?: string;
  notBefore?: string;
  notAfter?: string;
  fingerprintSha256?: string;
  keyAlgo?: string;
  keyBits?: number;
  pem?: string;
}

export interface SystemInfo {
  openssl: string;
  node: string;
  platform: string;
  dataDir: string;
  vaultDir: string;
  renewalsDir: string;
  caDir: string;
  formats: Record<string, string>;
}

export const api = {
  dashboard: () => request<DashboardData>('/api/dashboard'),
  system: () => request<SystemInfo>('/api/system'),

  certificates: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<Certificate[]>(`/api/certificates?${qs}`);
  },
  certificate: (id: string) => request<CertificateDetail>(`/api/certificates/${id}`),
  certificateText: (id: string) => request<string>(`/api/certificates/${id}/text`),
  importCertificate: (form: FormData) => request<{ certificate: Certificate; commands: string[] }>('/api/certificates/import', { method: 'POST', body: form }),
  updateCertificate: (id: string, patch: Partial<Pick<Certificate, 'name' | 'tags' | 'notes' | 'profileIds' | 'destinationOverride'>>) =>
    request<Certificate>(`/api/certificates/${id}`, json('PATCH', patch)),
  deleteCertificate: (id: string) => request<void>(`/api/certificates/${id}`, { method: 'DELETE' }),
  downloadUrl: (id: string, params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return `/api/certificates/${id}/download?${qs}`;
  },

  renew: (
    id: string,
    body: {
      method: string;
      keyMode: string;
      validityDays: number;
      profileIds: string[];
      deploy: boolean;
      commonName?: string;
      sans?: string[];
      country?: string;
      state?: string;
      locality?: string;
      organisation?: string;
      organisationalUnit?: string;
      email?: string;
      identityTemplateId?: string;
    },
  ) => request<Renewal>(`/api/certificates/${id}/renew`, json('POST', body)),
  renewal: (id: string) => request<Renewal>(`/api/renewals/${id}`),
  renewals: () => request<Renewal[]>('/api/renewals'),
  completeRenewal: (id: string, form: FormData) => request<Renewal>(`/api/renewals/${id}/complete`, { method: 'POST', body: form }),

  profiles: (certificateId?: string) => request<Profile[]>(`/api/profiles${certificateId ? `?certificateId=${encodeURIComponent(certificateId)}` : ''}`),
  identities: () => request<IdentityTemplate[]>('/api/identities'),
  createIdentity: (t: Partial<IdentityTemplate>) => request<IdentityTemplate>('/api/identities', json('POST', t)),
  updateIdentity: (id: string, t: Partial<IdentityTemplate>) => request<IdentityTemplate>(`/api/identities/${id}`, json('PUT', t)),
  deleteIdentity: (id: string) => request<void>(`/api/identities/${id}`, { method: 'DELETE' }),
  profile: (id: string) => request<{ profile: Profile; certificates: Certificate[] }>(`/api/profiles/${id}`),
  analyze: (form: FormData) => request<{ detected: DetectedFormat; spec: OutputSpec }>('/api/profiles/analyze', { method: 'POST', body: form }),
  createProfile: (p: Partial<Profile>) => request<Profile>('/api/profiles', json('POST', p)),
  updateProfile: (id: string, p: Partial<Profile>) => request<Profile>(`/api/profiles/${id}`, json('PUT', p)),
  deleteProfile: (id: string) => request<void>(`/api/profiles/${id}`, { method: 'DELETE' }),

  tags: () => request<{ tags: { tag: string; count: number }[]; groups: TagGroup[] }>('/api/tags'),
  tagGroups: () => request<TagGroup[]>('/api/tag-groups'),
  createTagGroup: (g: Partial<TagGroup>) => request<TagGroup>('/api/tag-groups', json('POST', g)),
  updateTagGroup: (id: string, g: Partial<TagGroup>) => request<TagGroup>(`/api/tag-groups/${id}`, json('PUT', g)),
  deleteTagGroup: (id: string) => request<void>(`/api/tag-groups/${id}`, { method: 'DELETE' }),

  activity: (type?: string) => request<{ events: AutomationEvent[]; summary: TimeSavedSummary }>(`/api/activity${type ? `?type=${type}` : ''}`),

  settings: () => request<Settings>('/api/settings'),
  saveSettings: (s: Partial<Settings>) => request<Settings>('/api/settings', json('PUT', s)),
  me: () => request<{ user: User | null; authEnabled: boolean }>('/api/auth/me'),
  users: () => request<User[]>('/api/users'),
  dashboardTemplates: () =>
    request<{
      templates: { id: string; name: string; layout: { version: 2; cols: 12 | 24 | 36; rows: number; items: { id: string; x: number; y: number; w: number; h: number }[] } }[];
      roleAssignments: Partial<Record<UserRole, string>>;
      userAssignments: Record<string, string>;
      defaultId: string;
      resolvedId: string;
    }>('/api/dashboard-templates'),
  saveDashboardTemplates: (body: {
    templates: { id: string; name: string; layout: unknown }[];
    roleAssignments: Partial<Record<UserRole, string>>;
    userAssignments: Record<string, string>;
    defaultId: string;
  }) => request<typeof body>('/api/dashboard-templates', json('PUT', body)),
  ca: () => request<CaInfo>('/api/ca'),
  createCa: (body: { commonName: string; organisation: string; days: number }) => request<{ ok: true }>('/api/ca', json('POST', body)),
  deleteCa: () => request<void>('/api/ca', { method: 'DELETE' }),
};
