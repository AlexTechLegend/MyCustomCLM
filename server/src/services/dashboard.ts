import { ttlMemo } from '../lib/memo.js';
import { listCertificates } from './certificates.js';
import { listEvents, timeSavedSummary } from './events.js';
import { listProfiles } from './profiles.js';
import { getSettings } from './settings.js';

function computeDashboard() {
  const certs = listCertificates({ sort: 'expiry' });
  const settings = getSettings();
  const counts = { total: certs.length, healthy: 0, expiring: 0, critical: 0, expired: 0, withoutKey: 0, withoutProfile: 0 };
  const issuers = new Map<string, number>();
  const horizon = [
    { label: '≤ 7 d', max: 7, count: 0 },
    { label: '8–30 d', max: 30, count: 0 },
    { label: '31–60 d', max: 60, count: 0 },
    { label: '61–90 d', max: 90, count: 0 },
    { label: '> 90 d', max: Infinity, count: 0 },
  ];
  for (const c of certs) {
    counts[c.status]++;
    if (!c.hasKey) counts.withoutKey++;
    if (c.profileIds.length === 0) counts.withoutProfile++;
    issuers.set(c.issuerCommonName, (issuers.get(c.issuerCommonName) ?? 0) + 1);
    if (c.daysRemaining >= 0) {
      const bucket = horizon.find((h) => c.daysRemaining <= h.max);
      if (bucket) bucket.count++;
    }
  }
  const expiringSoon = certs.filter((c) => c.daysRemaining <= 60).slice(0, 8);
  return {
    counts,
    horizon: horizon.map(({ label, count }) => ({ label, count })),
    issuers: [...issuers.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    expiringSoon,
    timeSaved: timeSavedSummary(6),
    recentEvents: listEvents({ limit: 8 }),
    profiles: listProfiles().length,
    settings: { organisation: settings.organisation, expiringThresholdDays: settings.expiringThresholdDays, criticalThresholdDays: settings.criticalThresholdDays },
  };
}

// 5s TTL: cheap enough that a stale expiry count is never noticed, and it
// collapses the health strip's 30s poll plus a concurrently open dashboard
// page plus a second browser tab into a single computation.
export const dashboard = ttlMemo(computeDashboard, 5_000);
