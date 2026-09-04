import fs from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { config } from '../../config.js';
import { readVault } from '../certificates.js';
import { revealCredentialSecret } from '../credentials.js';
import { verifyTlsEndpoint } from '../tls-verify.js';
import type { StepHandler } from './types.js';
import { resolvePathTemplate } from './types.js';

/**
 * Import a PFX into LocalMachine\My and rebind every IIS site binding that
 * still uses the old SHA-1 thumbprint. Driven entirely through Transport.exec
 * so the same script runs locally or on a remote host.
 *
 * Password travels as VIGIL_CRED_SECRET — never argv.
 * Idempotent: a second run finds no old-thumbprint bindings and succeeds.
 */
export function buildIisRebindScript(): string {
  return `
$ErrorActionPreference = 'Stop'
Import-Module WebAdministration -ErrorAction Stop

$pfxPath = $env:VIGIL_PFX_PATH
if (-not $pfxPath -or -not (Test-Path -LiteralPath $pfxPath)) {
  throw "PFX not found at $pfxPath"
}

$oldThumb = ($env:VIGIL_OLD_THUMBPRINT -replace '[^0-9A-Fa-f]', '').ToUpper()
$removeOld = $env:VIGIL_REMOVE_OLD -eq '1'

$pwd = $null
if ($env:VIGIL_CRED_SECRET) {
  $pwd = ConvertTo-SecureString $env:VIGIL_CRED_SECRET -AsPlainText -Force
}

$imported = if ($pwd) {
  Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\\LocalMachine\\My -Password $pwd
} else {
  Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\\LocalMachine\\My
}
$newThumb = ($imported.Thumbprint -replace '\\s', '').ToUpper()
Write-Output "IMPORTED:$newThumb"

$bindings = @(Get-ChildItem IIS:\\SslBindings)
$targets = @()
foreach ($b in $bindings) {
  $thumb = (($b.Thumbprint | Out-String) -replace '[^0-9A-Fa-f]', '').ToUpper()
  if ($oldThumb -and $thumb -eq $oldThumb -and $thumb -ne $newThumb) { $targets += $b }
}

$rebound = 0
$errors = @()
foreach ($b in $targets) {
  try {
    $ip = if ($b.IPAddress) { $b.IPAddress.IPAddressToString } else { '0.0.0.0' }
    if ($ip -eq '*') { $ip = '0.0.0.0' }
    $port = $b.Port
    $hostHeader = $b.Host
    $store = if ($b.Store) { $b.Store } else { 'My' }
    Remove-Item -LiteralPath $b.PSPath -Force
    $newPath = if ($hostHeader) { "IIS:\\SslBindings\\$ip!$port!$hostHeader" } else { "IIS:\\SslBindings\\$ip!$port" }
    Get-Item "Cert:\\LocalMachine\\$store\\$newThumb" | New-Item $newPath | Out-Null
    $rebound++
    Write-Output "REBOUND:$ip:$port:$hostHeader"
  } catch {
    $errors += $_.Exception.Message
    Write-Output "REBIND_ERROR:$($_.Exception.Message)"
  }
}

$stillOld = @(Get-ChildItem IIS:\\SslBindings | Where-Object {
  ((($_.Thumbprint | Out-String) -replace '[^0-9A-Fa-f]', '').ToUpper()) -eq $oldThumb -and $oldThumb -ne $newThumb
})
if ($stillOld.Count -gt 0) {
  throw "Rebind incomplete: $($stillOld.Count) binding(s) still on old thumbprint. Partial: $rebound rebound. $($errors -join '; ')"
}

if ($removeOld -and $oldThumb -and $oldThumb -ne $newThumb) {
  $old = Get-Item "Cert:\\LocalMachine\\My\\$oldThumb" -ErrorAction SilentlyContinue
  if ($old) { Remove-Item $old.PSPath -Force; Write-Output "REMOVED:$oldThumb" }
}

Write-Output "REBIND_OK:$newThumb:$rebound"
`.trim();
}

export const iisRebindStep: StepHandler = {
  type: 'iis-rebind',
  async run(step, ctx) {
    const t = ctx.transport;
    const pfxPath = resolvePathTemplate(String(step.config.pfxPath || ''), ctx);
    const removeOld = step.config.removeOld !== false && step.config.removeOld !== 'false';
    const verifyHost = step.config.verifyHost ? resolvePathTemplate(String(step.config.verifyHost), ctx) : '';
    const verifyPort = Number(step.config.verifyPort ?? 443);

    if (ctx.dryRun) {
      return {
        outputs: { pfxPath, removeOld },
        stdout: `Would import PFX and rebind IIS bindings (old thumbprint from vault or config)`,
      };
    }

    const { pfxBytes, oldThumb, newSha256, password } = await resolvePfxMaterial(step, ctx, pfxPath);
    const remotePfx = t.join(
      String(ctx.params.stagingDir || config.tmpDir),
      `vigil-rebind-${ctx.runId}.pfx`,
    );
    await t.writeFile(remotePfx, pfxBytes, 0o600);

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    env.VIGIL_PFX_PATH = remotePfx;
    env.VIGIL_OLD_THUMBPRINT = oldThumb;
    env.VIGIL_REMOVE_OLD = removeOld ? '1' : '0';
    if (password) env.VIGIL_CRED_SECRET = password;
    if (step.config.credentialId) {
      const secret = revealCredentialSecret(String(step.config.credentialId));
      if (secret) {
        env.VIGIL_CRED_USERNAME = secret.username;
        env.VIGIL_CRED_SECRET = secret.secret;
      }
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const result = await t.exec(shell, ['-NoProfile', '-NonInteractive', '-Command', buildIisRebindScript()], {
      timeoutMs: Math.min(600_000, Number(step.config.timeoutMs) || 120_000),
      env,
    });

    try {
      await t.unlink(remotePfx);
    } catch {
      /* best-effort cleanup */
    }

    if (result.code !== 0) {
      throw new Error(`IIS rebind failed (${result.code}): ${result.stderr || result.stdout}`.slice(0, 800));
    }

    const okLine = result.stdout.split(/\r?\n/).find((l) => l.startsWith('REBIND_OK:'));
    const imported = result.stdout.split(/\r?\n/).find((l) => l.startsWith('IMPORTED:'));
    const newThumb = (okLine || imported || '').split(':')[1] || '';

    if (verifyHost && newSha256) {
      const tls = await verifyTlsEndpoint({
        host: verifyHost,
        port: verifyPort,
        servername: String(step.config.servername || verifyHost),
        expectedFingerprint: newSha256,
        timeoutMs: Number(step.config.verifyTimeoutMs) || 8_000,
      });
      if (!tls.ok) throw new Error(`IIS rebound but endpoint still stale: ${tls.detail}`);
    }

    return {
      outputs: { newThumbprint: newThumb, rebound: okLine || result.stdout },
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

async function resolvePfxMaterial(
  step: { config: Record<string, unknown> },
  ctx: { certificateId: string | null; prior: Record<string, Record<string, unknown>> },
  configuredPath: string,
): Promise<{ pfxBytes: Buffer; oldThumb: string; newSha256: string; password: string }> {
  let pfxBytes: Buffer | null = null;
  if (configuredPath) {
    pfxBytes = await fs.readFile(configuredPath);
  } else {
    for (const out of Object.values(ctx.prior)) {
      const files = out.files as { path?: string; filename?: string }[] | undefined;
      const pfx = files?.find((f) => String(f.filename || f.path || '').toLowerCase().endsWith('.pfx'));
      if (pfx?.path) {
        pfxBytes = await fs.readFile(pfx.path);
        break;
      }
    }
  }
  if (!pfxBytes) throw new Error('iis-rebind needs config.pfxPath or a prior step that rendered a .pfx');

  let oldThumb = String(step.config.oldThumbprint || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  let newSha256 = '';
  let password = '';
  if (step.config.credentialId) {
    password = revealCredentialSecret(String(step.config.credentialId))?.secret ?? '';
  } else if (step.config.pfxPassword) {
    password = String(step.config.pfxPassword);
  }

  if (ctx.certificateId) {
    const vault = await readVault(ctx.certificateId);
    const leaf = new X509Certificate(vault.certPem);
    newSha256 = leaf.fingerprint256;
    if (!oldThumb) oldThumb = leaf.fingerprint.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  }
  return { pfxBytes, oldThumb, newSha256, password };
}
