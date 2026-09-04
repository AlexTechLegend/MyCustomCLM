import { z } from 'zod';

export const userRoleSchema = z.enum(['viewer', 'operator', 'approver', 'admin']);

export const loginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createUserBody = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
  displayName: z.string().optional(),
  email: z.string().optional(),
  role: userRoleSchema.optional(),
  scopeTags: z.array(z.string()).optional(),
});

export const credentialBody = z.object({
  name: z.string().optional(),
  kind: z.enum(['password', 'service-account', 'api-token', 'ssh-key', 'pfx-password']).optional(),
  username: z.string().optional(),
  secret: z.string().optional(),
  description: z.string().optional(),
});

export const hostBody = z.object({
  name: z.string().optional(),
  hostname: z.string().optional(),
  address: z.string().optional(),
  platform: z.enum(['windows', 'linux', 'other']).optional(),
  environment: z.string().optional(),
  owner: z.string().optional(),
  credentialId: z.string().nullable().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  transport: z.enum(['none', 'winrm', 'ssh', 'agent']).optional(),
  transportConfig: z.record(z.unknown()).optional(),
  agentTokenCredentialId: z.string().nullable().optional(),
});

export const renewBody = z.object({
  method: z.enum(['internal-ca', 'self-signed', 'csr']),
  keyMode: z.string().optional(),
  validityDays: z.number().int().positive().optional(),
  profileIds: z.array(z.string()).optional(),
  deploy: z.boolean().optional(),
  pipelineId: z.string().nullable().optional(),
  runNow: z.boolean().optional(),
  commonName: z.string().optional(),
  sans: z.array(z.string()).optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  locality: z.string().optional(),
  organisation: z.string().optional(),
  organisationalUnit: z.string().optional(),
  email: z.string().optional(),
  identityTemplateId: z.string().optional(),
});

export const instantiateBody = z.object({
  commonName: z.string().min(1),
  sans: z.array(z.string()).optional(),
  hostIds: z.array(z.string()).optional(),
  destinationPath: z.string().optional(),
  mode: z.enum(['internal-ca', 'self-signed', 'csr']).optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const pipelineRunBody = z.object({
  certificateId: z.string().optional(),
  hostId: z.string().optional(),
  renewalId: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  dryRun: z.boolean().optional(),
});

export const pipelinePreflightBody = z.object({
  certificateId: z.string().optional(),
  hostId: z.string().optional(),
  renewalId: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});

export const discoveryScanBody = z.object({
  targets: z.array(z.string()).min(1),
  ports: z.array(z.number().int().positive()).optional(),
  concurrency: z.number().int().positive().optional(),
  delayMs: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const agentResultBody = z.object({
  jobId: z.string().min(1),
  stdout: z.string().optional().default(''),
  stderr: z.string().optional().default(''),
  exitCode: z.number().int().optional().default(0),
  error: z.string().optional(),
  files: z.array(z.object({ path: z.string(), b64: z.string() })).optional(),
  stat: z
    .object({
      isFile: z.boolean(),
      isDirectory: z.boolean(),
      size: z.number(),
    })
    .nullable()
    .optional(),
  exists: z.boolean().optional(),
});

export const agentStreamBody = z.object({
  jobId: z.string().min(1),
  channel: z.enum(['stdout', 'stderr']),
  chunk: z.string(),
});

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const err = new Error(result.error.issues.map((i) => i.message).join('; '));
    (err as { status?: number }).status = 400;
    throw err;
  }
  return result.data;
}

export type LoginBody = z.infer<typeof loginBody>;
export type CreateUserBody = z.infer<typeof createUserBody>;
export type CredentialBody = z.infer<typeof credentialBody>;
export type HostBody = z.infer<typeof hostBody>;
export type RenewBody = z.infer<typeof renewBody>;
export type InstantiateBody = z.infer<typeof instantiateBody>;
export type PipelineRunBody = z.infer<typeof pipelineRunBody>;
export type PipelinePreflightBody = z.infer<typeof pipelinePreflightBody>;
export type DiscoveryScanBody = z.infer<typeof discoveryScanBody>;
export type AgentResultBody = z.infer<typeof agentResultBody>;
