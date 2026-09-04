import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import type { Certificate, Profile } from '@/types';
import type { Blueprint, MaintenanceWindow } from '@/types/automation';

export const CERT_TABLE_COLUMNS = 8;
export const PEEK_HOVER_MS = 320;

export function formatSansPreview(sans: string[]): string {
  if (sans.length === 0) return '—';
  if (sans.length <= 6) return sans.join(', ');
  return `${sans.slice(0, 6).join(', ')} +${sans.length - 6} more`;
}

export function deployPreview(cert: Certificate, profiles: Profile[]): string {
  const override = cert.destinationOverride?.trim();
  if (override) return override;
  const paths = [...new Set(
    cert.profileIds
      .map((id) => profiles.find((p) => p.id === id)?.destinationPath.trim())
      .filter((p): p is string => !!p),
  )];
  return paths.length ? paths.join(' · ') : 'download only';
}

export function CertPeekPanel({
  cert,
  profiles,
  blueprints,
  windows,
}: {
  cert: Certificate;
  profiles: Profile[];
  blueprints: Blueprint[];
  windows: MaintenanceWindow[];
}) {
  const blueprint = cert.blueprintId ? blueprints.find((b) => b.id === cert.blueprintId) : undefined;
  const window = blueprint?.maintenanceWindowId
    ? windows.find((w) => w.id === blueprint.maintenanceWindowId)
    : undefined;
  const nextAt = cert.nextRenewalAt ?? null;

  const blueprintLabel = !cert.blueprintId ? '— none linked —' : (blueprint?.name ?? '—');
  const renewalLabel = nextAt
    ? [formatDateTime(nextAt), window ? window.name : null].filter(Boolean).join(' · ')
    : 'not scheduled';

  return (
    <div className="bg-ink-50/60 px-6 py-3">
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-[13px]">
        <div>
          <dt className="text-ink-500">Subject alt names</dt>
          <dd className="text-ink-800 break-words">{formatSansPreview(cert.sans)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Blueprint</dt>
          <dd className="text-ink-800">{blueprintLabel}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Next renewal</dt>
          <dd className="text-ink-800 tnum">{renewalLabel}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Deploys to</dt>
          <dd className="text-ink-800 font-mono text-[12.5px] break-all">{deployPreview(cert, profiles)}</dd>
        </div>
      </dl>
      <Link
        to={`/certificates/${cert.id}`}
        className="mt-3 inline-flex text-[13px] font-medium text-brand-700 hover:underline"
      >
        Open certificate →
      </Link>
    </div>
  );
}

export function isPeekGuardTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('a, button, input, label, [role="menu"]');
}
