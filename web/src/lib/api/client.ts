export class ApiError extends Error {
  constructor(message: string, public status: number, public command?: string, public stderr?: string) {
    super(message);
  }
}

function authMessage(status: number, fallback: string): string {
  if (status === 401) return 'You need to sign in to do that.';
  if (status === 403) return 'You do not have permission for this action.';
  return fallback;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const raw = typeof body === 'object' && body && 'error' in body ? String((body as { error: string }).error) : `Request failed (${res.status})`;
    const msg = authMessage(res.status, raw);
    throw new ApiError(msg, res.status, typeof body === 'object' ? body?.command : undefined, typeof body === 'object' ? body?.stderr : undefined);
  }
  return body as T;
}

export const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});
