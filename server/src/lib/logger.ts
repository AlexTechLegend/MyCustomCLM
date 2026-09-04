import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  requestId?: string;
  jobId?: string;
  [key: string]: unknown;
};

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = (process.env.VIGIL_LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'test' ? 'error' : 'info');

export const logContext = new AsyncLocalStorage<LogContext>();

export function newCorrelationId(prefix = 'req'): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function currentContext(): LogContext {
  return { ...(logContext.getStore() ?? {}) };
}

export function runWithContext<T>(ctx: LogContext, fn: () => T): T {
  const parent = currentContext();
  return logContext.run({ ...parent, ...ctx }, fn);
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= (LEVELS[minLevel] ?? 20);
}

function emit(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const ctx = currentContext();
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...ctx,
    ...extra,
  };
  const line = process.stdout.isTTY ? formatTty(level, message, record) : JSON.stringify(record);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

function formatTty(level: LogLevel, message: string, record: Record<string, unknown>): string {
  const bits = [level.toUpperCase().padEnd(5), message];
  if (record.requestId) bits.push(`[${String(record.requestId)}]`);
  if (record.jobId) bits.push(`[job ${String(record.jobId)}]`);
  return bits.join(' ');
}

export const log = {
  debug: (message: string, extra?: Record<string, unknown>) => emit('debug', message, extra),
  info: (message: string, extra?: Record<string, unknown>) => emit('info', message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => emit('warn', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => emit('error', message, extra),
};
