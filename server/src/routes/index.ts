import { Router } from 'express';
import { authMiddleware, requestContext, viewerReadOnly } from '../services/auth.js';
import { authRoutes } from './auth.routes.js';
import { blueprintsRoutes } from './blueprints.routes.js';
import { catalogRoutes } from './catalog.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { certificatesRoutes } from './certificates.routes.js';
import { credentialsRoutes } from './credentials.routes.js';
import { healthRoutes } from './health.routes.js';
import { hostsRoutes } from './hosts.routes.js';
import { jobsRoutes } from './jobs.routes.js';
import { notificationsRoutes } from './notifications.routes.js';
import { pipelinesRoutes } from './pipelines.routes.js';
import { renewalsRoutes } from './renewals.routes.js';
import { settingsRoutes } from './settings.routes.js';
import { systemRoutes } from './system.routes.js';
import { windowsRoutes } from './windows.routes.js';

export const api = Router();

api.use(requestContext);
api.use(authMiddleware);
api.use(viewerReadOnly);

// ---------------------------------------------------------------------------
// Domain mount list.
// Append one `api.use(...)` line to add a router (discovery, CA connectors, …).
// File: server/src/routes/index.ts
// ---------------------------------------------------------------------------
api.use(healthRoutes);
api.use(systemRoutes);
api.use(catalogRoutes);
api.use(dashboardRoutes);
api.use(certificatesRoutes);
api.use(renewalsRoutes);
api.use(settingsRoutes);
api.use(jobsRoutes);
api.use(hostsRoutes);
api.use(credentialsRoutes);
api.use(pipelinesRoutes);
api.use(blueprintsRoutes);
api.use(windowsRoutes);
api.use(authRoutes);
api.use(notificationsRoutes);
// api.use(discoveryRoutes);      // automation-engine
// api.use(connectorsRoutes);     // automation-engine
