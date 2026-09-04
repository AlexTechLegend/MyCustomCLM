import type { Certificate, Profile } from '@/types';

export type CoverageKind = 'automated' | 'partial' | 'manual';

/** Automated = linked profile with a destination (or cert override). Partial = profile, no dest. */
export function coverageOf(cert: Certificate, profiles: Profile[]): CoverageKind {
  if (cert.destinationOverride.trim()) return cert.profileIds.length ? 'automated' : 'partial';
  const linked = profiles.filter((p) => cert.profileIds.includes(p.id));
  if (linked.length === 0) return 'manual';
  if (linked.some((p) => p.destinationPath.trim())) return 'automated';
  return 'partial';
}

export function coverageCounts(certs: Certificate[], profiles: Profile[]) {
  const counts = { automated: 0, partial: 0, manual: 0, total: certs.length };
  for (const c of certs) counts[coverageOf(c, profiles)]++;
  return counts;
}
