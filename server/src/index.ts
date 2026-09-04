import { config, ensureDirs, loadSecretKeyFromDisk, preflightProblems, secretKeyMaterial, warnIfAuthDisabled } from './config.js';
import { db, dbBackend } from './db.js';
import { createApp } from './lib/app.js';
import { bootstrapIfNeeded, credentialsExist } from './lib/bootstrap.js';
import { log } from './lib/logger.js';
import { ensureBuiltinPipelines } from './services/pipelines.js';
import { startScheduler } from './services/scheduler.js';

for (const p of preflightProblems()) log.error(p);
ensureDirs();
db();
loadSecretKeyFromDisk();

if (!secretKeyMaterial() && credentialsExist()) {
  log.error(
    'VIGIL_SECRET_KEY is not set, but encrypted credentials already exist. Refusing to start rather than fall back to plaintext. Set VIGIL_SECRET_KEY and restart.',
  );
  process.exit(1);
}

bootstrapIfNeeded();
ensureBuiltinPipelines();
warnIfAuthDisabled();
startScheduler();

const app = createApp();
app.listen(config.port, () => {
  log.info(`Vigil server listening on http://localhost:${config.port}`);
  log.info(`Data directory: ${config.dataDir}`);
  log.info(`Database: ${dbBackend()}`);
  log.info(`OpenSSL: ${config.opensslVersion ?? 'not found'} (${config.opensslBin})`);
  log.info(`Scheduler: ${config.schedulerEnabled ? `on every ${config.schedulerIntervalMs}ms` : 'disabled (VIGIL_SCHEDULER=0)'}`);
  log.info(`Auth: ${config.authEnabled ? 'on (VIGIL_AUTH=1)' : 'off'}`);
});
