export type { ExecOpts, ExecResult, PathStat, Transport, TransportKind } from './types.js';
export { localTransport, spawnCaptured } from './local.js';
export { AgentTransport, AGENT_WIRE_FORMAT, pollAgentJob, completeAgentJob } from './agent.js';
export { WinRmTransport } from './winrm.js';
export { SshTransport } from './ssh.js';
export { resolveTransport } from './resolve.js';
export type { ResolvedTransport } from './resolve.js';
