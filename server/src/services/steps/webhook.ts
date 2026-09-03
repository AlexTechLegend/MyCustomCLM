import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

export const webhookStep: StepHandler = {
  type: 'webhook',
  async run(step, ctx) {
    const url = resolvePathTemplate(String(step.config.url || ''), ctx);
    if (!url) throw new Error('webhook requires config.url');
    const method = String(step.config.method || 'POST').toUpperCase();
    const body = {
      runId: ctx.runId,
      certificateId: ctx.certificateId,
      ...(step.config.body as Record<string, unknown> | undefined),
      prior: ctx.prior,
    };
    if (ctx.dryRun) {
      return { outputs: { url, method }, stdout: `Would ${method} ${url}` };
    }
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...(step.config.headers as Record<string, string> | undefined) },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Webhook ${url} returned ${res.status}: ${text.slice(0, 200)}`);
    return { outputs: { status: res.status }, stdout: text.slice(0, 2000) };
  },
};
