/** Optional automation endpoints. Missing routes degrade to null — do not invent data. */

export type SchedulerInfo = {
  lastRunAt: string | null;
  configured: boolean;
  label: string;
};

async function tryJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function pickTime(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  for (const k of ['lastTickAt', 'lastRunAt', 'lastRun', 'ranAt', 'completedAt', 'updatedAt']) {
    if (typeof o[k] === 'string' && o[k]) return o[k] as string;
  }
  return null;
}

/** Probe known-future scheduler URLs. Until they exist this is "not configured". */
export async function fetchSchedulerInfo(): Promise<SchedulerInfo> {
  for (const url of ['/api/scheduler', '/api/jobs/status', '/api/schedule']) {
    const body = await tryJson(url);
    if (body) {
      const lastRunAt = pickTime(body);
      return { lastRunAt, configured: true, label: lastRunAt ?? 'Configured' };
    }
  }
  return { lastRunAt: null, configured: false, label: 'Not configured' };
}
