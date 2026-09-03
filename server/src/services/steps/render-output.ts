import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { renderFilename, renderOutput, type RenderMaterial } from '../../openssl.js';
import type { OutputSpec } from '../../types.js';
import { readVault } from '../certificates.js';
import { getCertificate } from '../certificates.js';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

export const renderOutputStep: StepHandler = {
  type: 'render-output',
  async run(step, ctx) {
    const certId = (step.config.certificateId as string) || ctx.certificateId;
    if (!certId) throw new Error('render-output requires a certificateId');
    const cert = getCertificate(certId);
    if (!cert) throw new Error('Certificate not found');
    const vault = await readVault(certId);
    const material: RenderMaterial = { certPem: vault.certPem, chainPems: vault.chainPems, keyPem: vault.keyPem };
    const stagingDir = resolvePathTemplate(String(step.config.stagingDir || ctx.params.stagingDir || path.join(config.stagingDir, ctx.runId)), ctx);
    const specs = (step.config.outputs as OutputSpec[] | undefined) ?? [];
    if (!specs.length) throw new Error('render-output requires config.outputs (OutputSpec[])');

    const files: { filename: string; path: string; size: number; sha256?: string }[] = [];
    if (!ctx.dryRun) await fs.mkdir(stagingDir, { recursive: true, mode: 0o700 });

    for (const spec of specs) {
      const filename = renderFilename(spec.filename, { cn: cert.commonName, serial: cert.serial, date: new Date(), profile: String(step.config.profileName || '') });
      const dest = path.join(stagingDir, filename);
      if (ctx.dryRun) {
        files.push({ filename, path: dest, size: 0 });
        continue;
      }
      const buf = await renderOutput(spec, material, { cn: cert.commonName, serial: cert.serial, date: new Date(), profile: String(step.config.profileName || '') });
      await fs.writeFile(dest, buf, { mode: spec.format.includes('key') || spec.format === 'pkcs12' ? 0o600 : 0o644 });
      const { createHash } = await import('node:crypto');
      files.push({ filename, path: dest, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
    }

    return {
      outputs: { stagingDir, files },
      stdout: `Rendered ${files.length} file(s) into ${stagingDir}${ctx.dryRun ? ' (dry-run)' : ''}`,
    };
  },
};
