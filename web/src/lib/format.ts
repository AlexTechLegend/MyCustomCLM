import type { CertStatus, OutputFormat } from '@/types';

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeDays(days: number) {
  if (days < 0) return `${Math.abs(days)} d ago`;
  if (days === 0) return 'today';
  return `in ${days} d`;
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(iso);
}

export function hours(minutes: number, digits = 1) {
  return (minutes / 60).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function humanMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const STATUS_META: Record<CertStatus, { label: string; badge: string; dot: string; bar: string; text: string }> = {
  healthy: { label: 'Healthy', badge: 'bg-ok-100 text-ok-700', dot: 'bg-ok-500', bar: 'bg-ok-500', text: 'text-ok-600' },
  expiring: { label: 'Expiring', badge: 'bg-warn-100 text-warn-700', dot: 'bg-warn-500', bar: 'bg-warn-500', text: 'text-warn-600' },
  critical: { label: 'Critical', badge: 'bg-crit-100 text-crit-700', dot: 'bg-crit-500', bar: 'bg-crit-500', text: 'text-crit-600' },
  expired: { label: 'Expired', badge: 'bg-dead-100 text-dead-600', dot: 'bg-dead-500', bar: 'bg-dead-500', text: 'text-dead-600' },
};

export const SOURCE_LABEL: Record<string, string> = {
  imported: 'Imported',
  'internal-ca': 'Internal CA',
  'self-signed': 'Self-signed',
  'external-ca': 'External CA',
};

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  'pem-cert': 'PEM certificate (leaf only)',
  'pem-fullchain': 'PEM full chain (leaf + intermediates)',
  'pem-chain': 'PEM chain only (intermediates)',
  'pem-bundle': 'PEM bundle (certificate + chain + key)',
  'der-cert': 'DER certificate (binary .cer)',
  pkcs12: 'PKCS#12 archive (.pfx / .p12)',
  'pkcs7-pem': 'PKCS#7 bundle (PEM .p7b)',
  'pkcs7-der': 'PKCS#7 bundle (DER .p7b)',
  'pem-key': 'PEM private key (decrypted)',
  'pem-key-encrypted': 'PEM private key (encrypted)',
  'der-key': 'DER private key',
};

export const FORMAT_SHORT: Record<OutputFormat, string> = {
  'pem-cert': 'PEM',
  'pem-fullchain': 'PEM chain',
  'pem-chain': 'PEM inter.',
  'pem-bundle': 'PEM bundle',
  'der-cert': 'DER',
  pkcs12: 'PFX',
  'pkcs7-pem': 'P7B',
  'pkcs7-der': 'P7B (DER)',
  'pem-key': 'Key',
  'pem-key-encrypted': 'Key (enc)',
  'der-key': 'Key (DER)',
};

export function formatNeedsKey(f: OutputFormat) {
  return ['pem-bundle', 'pkcs12', 'pem-key', 'pem-key-encrypted', 'der-key'].includes(f);
}

export function formatIsPem(f: OutputFormat) {
  return f.startsWith('pem-') || f === 'pkcs7-pem';
}

export const EVENT_META: Record<string, { label: string; className: string }> = {
  import: { label: 'Import', className: 'bg-ink-100 text-ink-700' },
  csr: { label: 'CSR', className: 'bg-brand-50 text-brand-700' },
  renewal: { label: 'Renewal', className: 'bg-brand-100 text-brand-800' },
  conversion: { label: 'Conversion', className: 'bg-ok-100 text-ok-700' },
  deployment: { label: 'Deployment', className: 'bg-warn-100 text-warn-700' },
  ca: { label: 'CA', className: 'bg-ink-100 text-ink-700' },
  profile: { label: 'Profile', className: 'bg-ink-100 text-ink-700' },
};
