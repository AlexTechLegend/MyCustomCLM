// Mirrors server/src/types.ts — keep in sync.
export type CertStatus = 'healthy' | 'expiring' | 'critical' | 'expired';
export type CertSource = 'imported' | 'internal-ca' | 'self-signed' | 'external-ca';

export interface Certificate {
  id: string;
  name: string;
  subject: string;
  commonName: string;
  issuer: string;
  issuerCommonName: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  sans: string[];
  keyAlgo: string;
  keyBits: number | null;
  sigAlgo: string;
  fingerprintSha256: string;
  hasKey: boolean;
  chainCount: number;
  source: CertSource;
  tags: string[];
  notes: string;
  profileIds: string[];
  renewalCount: number;
  createdAt: string;
  updatedAt: string;
  status: CertStatus;
  daysRemaining: number;
  lifetimeUsed: number;
}

export type OutputFormat =
  | 'pem-cert'
  | 'pem-fullchain'
  | 'pem-chain'
  | 'pem-bundle'
  | 'der-cert'
  | 'pkcs12'
  | 'pkcs7-pem'
  | 'pkcs7-der'
  | 'pem-key'
  | 'pem-key-encrypted'
  | 'der-key';

export type LineEnding = 'lf' | 'crlf';
export type KeyEncoding = 'pkcs8' | 'pkcs1' | 'sec1';

export interface OutputSpec {
  id: string;
  label: string;
  filename: string;
  format: OutputFormat;
  lineEnding: LineEnding;
  includeRoot: boolean;
  keyEncoding: KeyEncoding;
  password: string;
  friendlyName: string;
  legacyPkcs12: boolean;
  trailingNewline: boolean;
  detected: DetectedFormat | null;
}

export interface DetectedFormat {
  container: 'pem' | 'der' | 'pkcs12' | 'pkcs7' | 'unknown';
  format: OutputFormat | null;
  summary: string;
  details: string[];
  certCount: number;
  hasKey: boolean;
  keyEncoding: KeyEncoding | null;
  keyEncrypted: boolean;
  includesRoot: boolean;
  lineEnding: LineEnding;
  trailingNewline: boolean;
  legacyPkcs12: boolean;
  passwordVerified: boolean;
  sourceFilename: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  destinationPath: string;
  outputs: OutputSpec[];
  createdAt: string;
  updatedAt: string;
  certificateCount?: number;
}

export type RenewalMethod = 'internal-ca' | 'self-signed' | 'csr';
export type RenewalStatus = 'pending-csr' | 'completed' | 'failed';
export type KeyMode = 'reuse' | 'rsa-2048' | 'rsa-3072' | 'rsa-4096' | 'ec-p256' | 'ec-p384';

export interface RenewalOutput {
  index: number;
  profileId: string;
  profileName: string;
  specId: string;
  label: string;
  filename: string;
  format: OutputFormat;
  size: number;
  stagedPath: string;
  deployedTo: string | null;
  deployStatus: 'skipped' | 'deployed' | 'failed';
  deployError: string | null;
}

export interface Renewal {
  id: string;
  certificateId: string;
  certificateName: string;
  method: RenewalMethod;
  status: RenewalStatus;
  keyMode: KeyMode;
  validityDays: number;
  csrPem: string | null;
  previousNotAfter: string | null;
  newNotAfter: string | null;
  profileIds: string[];
  deploy: boolean;
  outputs: RenewalOutput[];
  commands: string[];
  minutesSaved: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type EventType = 'import' | 'csr' | 'renewal' | 'conversion' | 'deployment' | 'ca' | 'profile';

export interface AutomationEvent {
  id: string;
  type: EventType;
  certificateId: string | null;
  certificateName: string | null;
  renewalId: string | null;
  title: string;
  detail: string;
  commands: string[];
  minutesSaved: number;
  createdAt: string;
}

export interface TimeBaselines {
  import: number;
  csr: number;
  renewal: number;
  conversion: number;
  deployment: number;
}

export interface Settings {
  organisation: string;
  baselines: TimeBaselines;
  expiringThresholdDays: number;
  criticalThresholdDays: number;
  defaultValidityDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  organisation: 'Your organisation',
  baselines: { import: 10, csr: 15, renewal: 45, conversion: 8, deployment: 15 },
  expiringThresholdDays: 30,
  criticalThresholdDays: 7,
  defaultValidityDays: 397,
};
