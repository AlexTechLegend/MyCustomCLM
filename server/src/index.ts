import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDirs, preflightProblems, secretKeyMaterial } from './config.js';
import { db, dbBackend } from './db.js';
import { OpenSslError } from './openssl.js';
import { api } from './routes.js';
import { ensureBuiltinPipelines } from './services/pipelines.js';
import { startScheduler } from './services/scheduler.js';

for (const p of preflightProblems()) console.error(`✖ ${p}\n`);
ensureDirs();
db();
ensureBuiltinPipelines();

if (!secretKeyMaterial()) {
  const row = db().prepare('SELECT COUNT(*) AS n FROM credentials').get() as { n: number };
  if (Number(row.n) > 0) {
    console.error(
      '✖ VIGIL_SECRET_KEY is not set, but encrypted credentials already exist. Refusing to start rather than fall back to plaintext. Set VIGIL_SECRET_KEY and restart.',
    );
    process.exit(1);
  }
  console.warn(
    '⚠ VIGIL_SECRET_KEY is not set. Creating or revealing credentials will fail (no plaintext fallback). Set a 64-char hex key or a strong passphrase before using the credential store.',
  );
}

startScheduler();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.use('/api', api);

app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number }).status ?? (err instanceof OpenSslError ? 422 : 400);
  const message = err instanceof Error ? err.message : 'Unexpected error';
  const body: Record<string, unknown> = { error: message };
  if (err instanceof OpenSslError) {
    body.command = err.command;
    body.stderr = err.stderr.split('\n').slice(0, 6).join('\n');
  }
  if (status >= 500) console.error(err);
  res.status(status).json(body);
});

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text/plain').send('Vigil API is running. Build the web app (npm run build) or start the Vite dev server.'));
}

app.listen(config.port, () => {
  console.log(`Vigil server listening on http://localhost:${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(`Database: ${dbBackend()}`);
  console.log(`OpenSSL: ${config.opensslVersion ?? 'not found'} (${config.opensslBin})`);
  console.log(`Scheduler: ${config.schedulerEnabled ? `on every ${config.schedulerIntervalMs}ms` : 'disabled (VIGIL_SCHEDULER=0)'}`);
  console.log(`Auth: ${config.authEnabled ? 'on (VIGIL_AUTH=1)' : 'off'}`);
});
