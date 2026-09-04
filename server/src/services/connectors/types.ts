export type ConnectorKind = 'internal-ca' | 'self-signed' | 'adcs' | 'acme';

export interface IssueRequest {
  csrPem: string;
  keyPem?: string;
  days: number;
  commonName?: string;
  sans?: string[];
  template?: string;
  /** Shared OpenSSL command log so the renewal trail stays complete. */
  log?: { commands: string[] };
}

export interface IssuedCertificate {
  leafPem: string;
  chainPems: string[];
}

export interface IssuanceConnector {
  kind: ConnectorKind;
  issue(req: IssueRequest): Promise<IssuedCertificate>;
  listTemplates?(): Promise<string[]>;
}

/** Extras stored in blueprint.renewal_policy JSON (types.ts has no connector fields). */
export type PolicyConnectorExtras = {
  connector?: ConnectorKind;
  autoEnrol?: boolean;
  hostTagSelector?: string[];
  acmeDirectory?: string;
  acmeDnsProvider?: string;
  adcsCesUrl?: string;
};
