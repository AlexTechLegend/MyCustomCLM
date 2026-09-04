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
  /** Optional per-certificate deploy directory. Overrides the profile destination when set. */
  destinationOverride: string;
  renewalCount: number;
  /** Blueprint this certificate was instantiated from, if any. */
  blueprintId: string | null;
  /** Blueprint version at instantiate / last sync time. */
  blueprintVersion: number | null;
  /** Next computed scheduled renewal (ISO), if a policy is attached. */
  nextRenewalAt: string | null;
  /** SANs recorded at blueprint instantiate — used for drift. */
  blueprintSans: string[];
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

export type ProfileScope = 'general' | 'specialized';

export interface Profile {
  id: string;
  name: string;
  description: string;
  /** Absolute / UNC directory. Tokens {cn} {cn_safe} {profile} {year} {date} allowed. */
  destinationPath: string;
  outputs: OutputSpec[];
  /** general = available for any certificate; specialized = only for matched certs/servers. */
  scope: ProfileScope;
  /** When specialized: match certificates that have any of these tags (e.g. server roles). */
  serverTags: string[];
  /** When specialized: explicitly assigned certificate ids. */
  certificateIds: string[];
  createdAt: string;
  updatedAt: string;
  certificateCount?: number;
}

/** Reusable subject / key defaults applied when issuing or renewing. */
export interface IdentityTemplate {
  id: string;
  name: string;
  description: string;
  country: string;
  state: string;
  locality: string;
  organisation: string;
  organisationalUnit: string;
  email: string;
  /** Default key mode suggested on renew (not forced). */
  defaultKeyMode: KeyMode;
  defaultValidityDays: number;
  createdAt: string;
  updatedAt: string;
}

/** A named collection of tags used for bulk filtering. */
export interface TagGroup {
  id: string;
  name: string;
  description: string;
  tags: string[];
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

// ---------------------------------------------------------------------------
// Automation backbone (Task 4)
// ---------------------------------------------------------------------------

export type JobState = 'queued' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobType = 'renewal' | 'pipeline-run' | 'notification' | 'drift-scan';

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  state: JobState;
  priority: number;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  certificateId: string | null;
  createdAt: string;
}

export type HostPlatform = 'windows' | 'linux' | 'other';
export type AgentStatus = 'unknown' | 'online' | 'offline' | 'disabled';
export type HostTransport = 'none' | 'winrm' | 'ssh' | 'agent';

export interface Host {
  id: string;
  name: string;
  hostname: string;
  address: string;
  platform: HostPlatform;
  environment: string;
  owner: string;
  credentialId: string | null;
  agentStatus: AgentStatus;
  agentLastSeen: string | null;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  certificateIds?: string[];
  /** Optional until the automation-engine agent maps the new columns. */
  transport?: HostTransport;
  transportConfig?: Record<string, unknown>;
  agentTokenCredentialId?: string | null;
}

export interface DiscoveryResult {
  id: string;
  scanId: string;
  address: string;
  port: number;
  hostname: string;
  subject: string;
  issuer: string;
  notAfter: string | null;
  fingerprintSha256: string;
  matchedCertificateId: string | null;
  firstSeen: string;
  lastSeen: string;
}

export type CredentialKind = 'password' | 'service-account' | 'api-token' | 'ssh-key' | 'pfx-password';

/** Metadata only — the secret is never serialised. */
export interface CredentialMeta {
  id: string;
  name: string;
  kind: CredentialKind;
  username: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  hasSecret: boolean;
}

export type PipelineStepType =
  | 'render-output'
  | 'copy'
  | 'backup'
  | 'swap'
  | 'verify'
  | 'run-command'
  | 'webhook'
  | 'approval'
  /** Extension points — not implemented in this task. */
  | 'remote-copy'
  | 'iis-rebind'
  | 'restart-service';

export type VerifyAssertionType = 'file-exists' | 'hash-matches' | 'key-matches-cert' | 'expiry-after' | 'backup-contains';

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  name: string;
  config: Record<string, unknown>;
  continueOnError: boolean;
  /** Optional expression; currently supports "always" | "on-success" | "on-failure". */
  condition: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PipelineRunState = 'pending' | 'running' | 'awaiting-approval' | 'succeeded' | 'failed' | 'rolled-back' | 'cancelled' | 'rejected';

export interface PipelineStepResult {
  stepId: string;
  type: PipelineStepType;
  name: string;
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'awaiting-approval';
  startedAt: string | null;
  finishedAt: string | null;
  stdout: string;
  stderr: string;
  error: string | null;
  outputs: Record<string, unknown>;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  pipelineName: string;
  renewalId: string | null;
  certificateId: string | null;
  hostId: string | null;
  state: PipelineRunState;
  steps: PipelineStepResult[];
  params: Record<string, unknown>;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Optional note from the approver / rejector. Stored in params.decisionNote. */
  decisionNote: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RenewalPolicy {
  /** Renew on the Nth occurrence of the attached window before expiry. */
  nthWindowBeforeExpiry: number;
  requiresApproval: boolean;
  /** Days before expiry to start considering (informational). */
  leadDays?: number;
}

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  identityTemplateId: string | null;
  profileIds: string[];
  issuanceMethod: RenewalMethod;
  caTemplate: string;
  keyMode: KeyMode;
  validityDays: number;
  pipelineId: string | null;
  renewalPolicy: RenewalPolicy;
  maintenanceWindowId: string | null;
  notificationTargets: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceWindow {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** HH:MM local to timezone */
  startTime: string;
  endTime: string;
  timezone: string;
  recurrence: 'weekly';
  blackoutRanges: { start: string; end: string; reason?: string }[];
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'viewer' | 'operator' | 'approver' | 'admin';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  source: 'local' | 'ldap';
  scopeTags: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type NotificationKind = 'email' | 'webhook' | 'teams' | 'slack';
export type NotificationEvent =
  | 'renewal.succeeded'
  | 'renewal.failed'
  | 'pipeline.step_failed'
  | 'expiry.threshold'
  | 'approval.requested'
  | 'drift.detected';

export interface NotificationTarget {
  id: string;
  name: string;
  kind: NotificationKind;
  config: Record<string, unknown>;
  events: NotificationEvent[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorType: 'user' | 'scheduler' | 'service-account';
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  commandTrail: string[];
  createdAt: string;
}

export interface SchedulerHeartbeat {
  lastTickAt: string | null;
  lastEnqueueAt: string | null;
  lastClaimAt: string | null;
  ticks: number;
  owner: string;
  enabled: boolean;
  leader?: boolean;
  leaderOwner?: string | null;
}
