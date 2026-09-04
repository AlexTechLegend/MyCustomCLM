import { config } from '../config.js';

/** Hand-maintained OpenAPI 3 document. The web agent can generate a client from GET /api/openapi.json. */
export function openApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Vigil CLM API',
      version: '0.1.0',
      description:
        'Self-hosted certificate lifecycle API. When VIGIL_AUTH=1 every route except /health, /openapi.json, /auth/login, /auth/logout and /auth/me requires a session cookie. Roles: viewer reads; operator renews, deploys and runs pipelines; approver releases gates; admin owns users, credentials and blueprints.',
    },
    servers: [{ url: '/api' }],
    paths: {
      '/health': { get: { summary: 'Liveness probe', responses: { '200': { description: 'ok' } } } },
      '/auth/login': { post: { summary: 'Create a session', requestBody: jsonBody('Login'), responses: { '200': { description: 'user + cookie' }, '401': { description: 'invalid' } } } },
      '/auth/logout': { post: { summary: 'Destroy the session', responses: { '204': { description: 'cleared' } } } },
      '/auth/me': { get: { summary: 'Current user (null when signed out)', responses: { '200': { description: 'user' } } } },
      '/users': {
        get: { summary: 'List users (admin)', security: [{ cookie: [] }], responses: { '200': { description: 'users' } } },
        post: { summary: 'Create user (admin)', security: [{ cookie: [] }], requestBody: jsonBody('CreateUser'), responses: { '201': { description: 'user' } } },
      },
      '/certificates': { get: { summary: 'List certificates', security: [{ cookie: [] }], responses: { '200': { description: 'certificates' } } } },
      '/certificates/import': { post: { summary: 'Import (operator)', security: [{ cookie: [] }], responses: { '201': { description: 'certificate' } } } },
      '/certificates/{id}/renew': {
        post: { summary: 'Renew (operator)', security: [{ cookie: [] }], requestBody: jsonBody('Renew'), responses: { '201': { description: 'renewal' }, '202': { description: 'queued' }, '429': { description: 'rate limited' } } },
      },
      '/hosts': {
        get: { summary: 'List hosts', security: [{ cookie: [] }], responses: { '200': { description: 'hosts' } } },
        post: { summary: 'Create host (operator)', security: [{ cookie: [] }], requestBody: jsonBody('Host'), responses: { '201': { description: 'host' } } },
      },
      '/credentials': {
        get: { summary: 'List credential metadata (never the secret)', security: [{ cookie: [] }], responses: { '200': { description: 'credentials' } } },
        post: { summary: 'Create credential (admin)', security: [{ cookie: [] }], requestBody: jsonBody('Credential'), responses: { '201': { description: 'metadata' } } },
      },
      '/pipelines/{id}/run': {
        post: { summary: 'Run a pipeline (operator)', security: [{ cookie: [] }], requestBody: jsonBody('PipelineRun'), responses: { '201': { description: 'run' }, '429': { description: 'rate limited' } } },
      },
      '/pipelines/{id}/plan': { post: { summary: 'Plan a pipeline (operator)', security: [{ cookie: [] }], responses: { '200': { description: 'plan' } } } },
      '/pipeline-runs/{id}/approve': { post: { summary: 'Approve a gated run (approver)', security: [{ cookie: [] }], responses: { '200': { description: 'run' } } } },
      '/pipeline-runs/{id}/reject': { post: { summary: 'Reject a gated run (approver)', security: [{ cookie: [] }], responses: { '200': { description: 'run' } } } },
      '/blueprints': {
        get: { summary: 'List blueprints', security: [{ cookie: [] }], responses: { '200': { description: 'blueprints' } } },
        post: { summary: 'Create blueprint (admin)', security: [{ cookie: [] }], responses: { '201': { description: 'blueprint' } } },
      },
      '/blueprints/{id}/instantiate': {
        post: { summary: 'Issue from a blueprint (admin)', security: [{ cookie: [] }], requestBody: jsonBody('Instantiate'), responses: { '201': { description: 'certificate' }, '429': { description: 'rate limited' } } },
      },
      '/jobs/{id}/cancel': { post: { summary: 'Cancel a job (operator)', security: [{ cookie: [] }], responses: { '200': { description: 'job' } } } },
      '/jobs/{id}/retry': { post: { summary: 'Retry a job (operator)', security: [{ cookie: [] }], responses: { '200': { description: 'job' } } } },
      '/windows': {
        get: { summary: 'List maintenance windows', security: [{ cookie: [] }], responses: { '200': { description: 'windows' } } },
        post: { summary: 'Create window (operator)', security: [{ cookie: [] }], responses: { '201': { description: 'window' } } },
      },
    },
    components: {
      securitySchemes: { cookie: { type: 'apiKey', in: 'cookie', name: 'vigil_session' } },
      schemas: {
        Login: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } },
        CreateUser: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' }, role: { type: 'string', enum: ['viewer', 'operator', 'approver', 'admin'] } } },
        Credential: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string' }, username: { type: 'string' }, secret: { type: 'string' } } },
        Host: { type: 'object', properties: { name: { type: 'string' }, hostname: { type: 'string' }, platform: { type: 'string' }, transport: { type: 'string', enum: ['none', 'winrm', 'ssh', 'agent'] } } },
        Renew: { type: 'object', required: ['method'], properties: { method: { type: 'string', enum: ['internal-ca', 'self-signed', 'csr'] } } },
        Instantiate: { type: 'object', required: ['commonName'], properties: { commonName: { type: 'string' }, sans: { type: 'array', items: { type: 'string' } } } },
        PipelineRun: { type: 'object', properties: { certificateId: { type: 'string' }, hostId: { type: 'string' }, dryRun: { type: 'boolean' } } },
      },
    },
    'x-vigil': { authEnabled: config.authEnabled, dataDir: config.dataDir },
  };
}

function jsonBody(ref: string) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}
