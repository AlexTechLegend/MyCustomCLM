import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inferConnectorKind, selectIssuanceConnector } from './index.js';

describe('selectIssuanceConnector', () => {
  it('defaults internal-ca', () => {
    assert.equal(inferConnectorKind({ method: 'internal-ca' }), 'internal-ca');
    assert.equal(selectIssuanceConnector({ method: 'internal-ca' }).kind, 'internal-ca');
  });

  it('selects ADCS from caTemplate or policy', () => {
    assert.equal(inferConnectorKind({ method: 'internal-ca', caTemplate: 'adcs:WebServer' }), 'adcs');
    assert.equal(inferConnectorKind({ method: 'internal-ca', policy: { adcsCesUrl: 'https://ca.example/ces' } }), 'adcs');
    assert.equal(selectIssuanceConnector({ method: 'internal-ca', caTemplate: 'adcs:WebServer' }).kind, 'adcs');
  });

  it('selects ACME from caTemplate', () => {
    assert.equal(inferConnectorKind({ method: 'internal-ca', caTemplate: 'acme:https://acme.example/dir' }), 'acme');
    assert.equal(selectIssuanceConnector({ method: 'internal-ca', caTemplate: 'acme:https://acme.example/dir' }).kind, 'acme');
  });

  it('honours an explicit policy.connector', () => {
    assert.equal(inferConnectorKind({ method: 'internal-ca', policy: { connector: 'self-signed' } }), 'self-signed');
  });
});
