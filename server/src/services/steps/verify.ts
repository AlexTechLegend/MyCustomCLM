import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { keyMatchesCert } from '../../openssl.js';
import type { VerifyAssertionType } from '../../types.js';
import { readVault } from '../certificates.js';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

interface Assertion {
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

export const verifyStep: StepHandler = {
  type: 'verify',
  async run(step, ctx) {
    const assertions = (step.config.assertions as Assertion[] | undefined) ?? [];
    if (!assertions.length) throw new Error('verify requires config.assertions');
    const results: { type: string; ok: boolean; detail: string }[] = [];

    for (const a of assertions) {
      if (ctx.dryRun) {
        results.push({ type: a.type, ok: true, detail: `Would assert ${a.type}` });
        continue;
      }
      switch (a.type) {
        case 'file-exists': {
          const p = resolvePathTemplate(String(a.path || ''), ctx);
          try {
            await fs.access(p);
            results.push({ type: a.type, ok: true, detail: p });
          } catch {
            results.push({ type: a.type, ok: false, detail: `Missing: ${p}` });
          }
          break;
        }
        case 'hash-matches': {
          const p = resolvePathTemplate(String(a.path || ''), ctx);
          const buf = await fs.readFile(p);
          const actual = createHash('sha256').update(buf).digest('hex');
          let expected = a.expectedHash;
          if (!expected && a.hashFromStep) {
            const files = ctx.prior[a.hashFromStep]?.files as { path: string; sha256?: string }[] | undefined;
            expected = files?.find((f) => f.path === p || path.basename(f.path) === path.basename(p))?.sha256;
          }
          const ok = !!expected && expected === actual;
          results.push({ type: a.type, ok, detail: ok ? `${path.basename(p)} matches` : `Hash mismatch for ${p}` });
          break;
        }
        case 'key-matches-cert': {
          const certId = ctx.certificateId;
          if (!certId) {
            results.push({ type: a.type, ok: false, detail: 'No certificateId on run' });
            break;
          }
          const vault = await readVault(certId);
          if (!vault.keyPem) {
            results.push({ type: a.type, ok: false, detail: 'No key in vault' });
            break;
          }
          const ok = keyMatchesCert(vault.certPem, vault.keyPem);
          results.push({ type: a.type, ok, detail: ok ? 'Key matches certificate' : 'Key does not match certificate' });
          break;
        }
        case 'expiry-after': {
          const after = new Date(String(a.after || '')).getTime();
          const certId = ctx.certificateId;
          if (!certId || !Number.isFinite(after)) {
            results.push({ type: a.type, ok: false, detail: 'expiry-after needs certificateId and config.after' });
            break;
          }
          const { getCertificate } = await import('../certificates.js');
          const cert = getCertificate(certId);
          const ok = !!cert && new Date(cert.notAfter).getTime() > after;
          results.push({ type: a.type, ok, detail: ok ? `notAfter ${cert!.notAfter} > ${a.after}` : 'Expiry check failed' });
          break;
        }
        case 'backup-contains': {
          const backupDir = resolvePathTemplate(String(a.backupDir || `{steps.${step.config.backupStepId || 'backup'}.backupDir}`), ctx);
          const fromPrior = step.config.backupStepId ? String(ctx.prior[String(step.config.backupStepId)]?.backupDir || '') : '';
          const dir = fromPrior || backupDir;
          const name = String(a.filename || '');
          try {
            const entries = await fs.readdir(dir);
            const ok = !name || entries.includes(name);
            results.push({ type: a.type, ok, detail: ok ? `Backup ${dir} ok` : `${name} not in backup` });
          } catch {
            results.push({ type: a.type, ok: false, detail: `Backup dir missing: ${dir}` });
          }
          break;
        }
        default:
          results.push({ type: a.type, ok: false, detail: `Unknown assertion ${(a as Assertion).type}` });
      }
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      const err = failed.map((f) => `${f.type}: ${f.detail}`).join('; ');
      throw new Error(`Verification failed — ${err}`);
    }
    return { outputs: { assertions: results }, stdout: `All ${results.length} assertion(s) passed` };
  },
};
