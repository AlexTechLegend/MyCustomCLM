// Mirrors server/src/types.ts automation section — keep in sync.

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
  status?: 'unknown' | 'known' | 'known-but-different';
  certificateName?: string;
  error?: string;
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
  | 'remote-copy'
  | 'iis-rebind'
  | 'restart-service'
  | (string & {});

export type VerifyAssertionType = 'file-exists' | 'hash-matches' | 'key-matches-cert' | 'expiry-after' | 'backup-contains';

export interface VerifyAssertion {
  type: VerifyAssertionType;
  path?: string;
  expectedHash?: string;
  hashFromStep?: string;
  certPemPath?: string;
  keyPemPath?: string;
  after?: string;
  backupDir?: string;
  filename?: string;
}

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  name: string;
  config: Record<string, unknown>;
  continueOnError: boolean;
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

export interface StepTypeInfo {
  type: string;
  implemented: boolean;
}

export type PipelineRunState =
  | 'pending'
  | 'running'
  | 'awaiting-approval'
  | 'succeeded'
  | 'failed'
  | 'rolled-back'
  | 'cancelled'
  | 'rejected';

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
  decisionNote: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RenewalPolicy {
  nthWindowBeforeExpiry: number;
  requiresApproval: boolean;
  leadDays?: number;
}

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  identityTemplateId: string | null;
  profileIds: string[];
  issuanceMethod: 'internal-ca' | 'self-signed' | 'csr';
  caTemplate: string;
  keyMode: string;
  validityDays: number;
  pipelineId: string | null;
  renewalPolicy: RenewalPolicy;
  maintenanceWindowId: string | null;
  notificationTargets: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriftFinding {
  certificateId: string;
  certificateName: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface BlueprintDrift {
  blueprint: Blueprint;
  drifted: boolean;
  findings: DriftFinding[];
}

export interface CertificateSchedule {
  certificateId: string;
  nextRenewalAt: string | null;
  occurrences: string[];
  window: MaintenanceWindow | null;
  policy: RenewalPolicy | null;
  blueprintId: string | null;
}

export interface MaintenanceWindow {
  id: string;
  name: string;
  weekday: number;
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
}

export interface InstantiateBody {
  commonName: string;
  sans?: string[];
  hostIds?: string[];
  destinationPath?: string;
  mode?: 'internal-ca' | 'self-signed' | 'csr';
  name?: string;
  notes?: string;
  tags?: string[];
}
