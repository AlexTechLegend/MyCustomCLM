import os from 'node:os';
import { Router } from 'express';
import { config } from '../config.js';
import { opensslVersion, FORMAT_LABELS } from '../openssl.js';
import { getSchedulerHeartbeat } from '../services/scheduler.js';
import { wrap } from './http.js';

export const systemRoutes = Router();

systemRoutes.get(
  '/system',
  wrap(async (_req, res) => {
    res.json({
      openssl: await opensslVersion(),
      node: process.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      dataDir: config.dataDir,
      vaultDir: config.vaultDir,
      renewalsDir: config.renewalsDir,
      caDir: config.caDir,
      formats: FORMAT_LABELS,
      scheduler: getSchedulerHeartbeat(),
      authEnabled: config.authEnabled,
    });
  }),
);
