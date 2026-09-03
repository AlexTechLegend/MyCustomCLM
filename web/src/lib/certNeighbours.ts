import type { Certificate, CertStatus } from '@/types';

const STATUS_SEV: Record<CertStatus, number> = {
  expired: 0,
  critical: 1,
  expiring: 2,
  healthy: 3,
};

function parseFrom(from: string | null | undefined): URLSearchParams {
  if (!from) return new URLSearchParams();
  let raw = from.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* already decoded */
  }
  const q = raw.indexOf('?');
  if (q >= 0) raw = raw.slice(q + 1);
  try {
    return new URLSearchParams(raw);
  } catch {
    return new URLSearchParams();
  }
}

/** Apply optional list `?from=` filters, then sort. Default: soonest expiry. */
export function orderCertificates(list: Certificate[], from?: string | null): Certificate[] {
  const p = parseFrom(from ?? null);
  const q = (p.get('q') ?? '').trim().toLowerCase();
  const status = p.get('status') ?? 'all';
  const source = p.get('source') ?? 'all';
  const sort = p.get('sort') ?? 'expiry';
  const dir = p.get('dir');

  let next = list;
  if (q) {
    next = next.filter((c) =>
      [c.name, c.commonName, c.issuer, c.serial, ...c.sans, ...c.tags].some((v) => v.toLowerCase().includes(q)),
    );
  }
  if (status && status !== 'all') next = next.filter((c) => c.status === status);
  if (source && source !== 'all') next = next.filter((c) => c.source === source);

  const sorted = [...next].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'issuer') return a.issuerCommonName.localeCompare(b.issuerCommonName);
    if (sort === 'updated') return a.updatedAt.localeCompare(b.updatedAt);
    if (sort === 'status') return STATUS_SEV[a.status] - STATUS_SEV[b.status];
    return a.notAfter.localeCompare(b.notAfter);
  });

  if (dir === 'desc') sorted.reverse();
  else if (dir === 'asc' && sort === 'updated') {
    /* updated default on the list is newest-first; explicit asc keeps chronological */
  } else if (!dir && sort === 'updated') {
    sorted.reverse();
  }

  return sorted;
}
