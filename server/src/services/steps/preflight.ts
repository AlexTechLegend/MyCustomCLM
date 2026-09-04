import { X509Certificate } from 'node:crypto';
import { getCertificate } from '../certificates.js';
import { fingerprintsMatch } from '../tls-verify.js';
import type { StepContext } from './types.js';

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheck[];
}

/**
 * Cheap assertions before a pipeline spends a CA issuance or touches live
 * files. Not a PipelineStepType — called as an implicit first action.
 */
export async function runPipelinePreflight(ctx: StepContext): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const t = ctx.transport;
  const prodDir = String(ctx.params.prodDir || '');
  const backupRoot = String(ctx.params.backupRoot || '');

  try {
    await t.ping();
    checks.push({ name: 'transport', ok: true, detail: `transport ${t.kind} answered` });
  } catch (err) {
    checks.push({
      name: 'transport',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (prodDir) {
    checks.push(await assertDestWritable(t, 'prodDir', prodDir));
  } else {
    checks.push({ name: 'prodDir', ok: true, detail: 'no prodDir configured — skipped' });
  }

  if (backupRoot) {
    checks.push(await assertDestWritable(t, 'backupRoot', backupRoot));
  } else {
    checks.push({ name: 'backupRoot', ok: true, detail: 'no backupRoot configured — skipped' });
  }

  if (ctx.certificateId && prodDir) {
    checks.push(await assertOnDiskMatchesDb(ctx, prodDir));
  }

  return { ok: checks.every((c) => c.ok), checks };
}

async function assertDestWritable(
  t: StepContext['transport'],
  name: string,
  dir: string,
): Promise<PreflightCheck> {
  try {
    const exists = await t.exists(dir);
    if (!exists) {
      const parent = parentOf(dir, t);
      if (parent && (await t.exists(parent))) {
        const probe = t.join(parent, `.vigil-preflight-${process.pid}`);
        await t.writeFile(probe, Buffer.from('ok'));
        await t.unlink(probe);
        return { name, ok: true, detail: `${dir} missing; parent ${parent} is writable` };
      }
      return { name, ok: false, detail: `${dir} does not exist and parent is not writable` };
    }
    const probe = t.join(dir, `.vigil-preflight-${process.pid}`);
    await t.writeFile(probe, Buffer.from('ok'));
    await t.unlink(probe);
    return { name, ok: true, detail: `${dir} exists and is writable` };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function parentOf(dir: string, t: StepContext['transport']): string {
  const norm = dir.replace(/[\\/]+$/, '');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return t.join(dir, '..');
  return norm.slice(0, idx);
}

async function assertOnDiskMatchesDb(ctx: StepContext, prodDir: string): Promise<PreflightCheck> {
  const cert = getCertificate(ctx.certificateId!);
  if (!cert) return { name: 'on-disk', ok: false, detail: 'Certificate not in database' };
  const t = ctx.transport;
  try {
    const names = await t.readdir(prodDir);
    const candidate = names.find((n) => /\.(cer|crt|pem|der)$/i.test(n));
    if (!candidate) {
      return { name: 'on-disk', ok: true, detail: 'no on-disk cert to compare' };
    }
    const buf = await t.readFile(t.join(prodDir, candidate));
    const text = buf.toString('utf8');
    const x509 = text.includes('BEGIN CERTIFICATE') ? new X509Certificate(text) : new X509Certificate(buf);
    const ok = fingerprintsMatch(x509.fingerprint256, cert.fingerprintSha256);
    return {
      name: 'on-disk',
      ok,
      detail: ok
        ? `${candidate} matches database fingerprint`
        : `${candidate} SHA-256 differs from database — aborting before issuance`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|no such file/i.test(msg)) {
      return { name: 'on-disk', ok: true, detail: 'prodDir empty — nothing to compare' };
    }
    return { name: 'on-disk', ok: false, detail: msg };
  }
}
