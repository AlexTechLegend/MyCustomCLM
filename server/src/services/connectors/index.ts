import type { RenewalMethod } from '../../types.js';
import { AcmeConnector, resolveDnsProvider } from './acme.js';
import { AdcsConnector } from './adcs.js';
import { InternalCaConnector, SelfSignedConnector } from './internal.js';
import type { ConnectorKind, IssuanceConnector, PolicyConnectorExtras } from './types.js';

export type { ConnectorKind, IssuanceConnector, IssuedCertificate, IssueRequest, PolicyConnectorExtras } from './types.js';
export { listAdcsTemplates, AdcsConnector } from './adcs.js';
export { AcmeConnector, resolveDnsProvider, HookDnsProvider, ManualDnsProvider } from './acme.js';
export { InternalCaConnector, SelfSignedConnector } from './internal.js';

export interface SelectConnectorInput {
  method: RenewalMethod | string;
  caTemplate?: string;
  policy?: PolicyConnectorExtras;
  contactEmail?: string;
}

export function inferConnectorKind(input: SelectConnectorInput): ConnectorKind {
  if (input.policy?.connector) return input.policy.connector;
  const tpl = (input.caTemplate || '').trim();
  if (tpl.startsWith('acme:') || /^https?:\/\//i.test(tpl) && /acme/i.test(tpl)) return 'acme';
  if (tpl.startsWith('adcs:') || input.policy?.adcsCesUrl) return 'adcs';
  if (input.method === 'self-signed') return 'self-signed';
  if (input.method === 'csr') return 'internal-ca';
  return 'internal-ca';
}

export function selectIssuanceConnector(input: SelectConnectorInput): IssuanceConnector {
  const kind = inferConnectorKind(input);
  if (kind === 'adcs') {
    const template = (input.caTemplate || '').replace(/^adcs:/i, '');
    return new AdcsConnector({
      cesUrl: input.policy?.adcsCesUrl,
      template: template || undefined,
    });
  }
  if (kind === 'acme') {
    const directoryUrl = (input.caTemplate || '').replace(/^acme:/i, '') || input.policy?.acmeDirectory;
    return new AcmeConnector({
      directoryUrl: directoryUrl && directoryUrl !== 'acme' ? directoryUrl : undefined,
      dns: resolveDnsProvider(input.policy?.acmeDnsProvider),
      contactEmail: input.contactEmail,
    });
  }
  if (kind === 'self-signed') return new SelfSignedConnector();
  return new InternalCaConnector();
}
