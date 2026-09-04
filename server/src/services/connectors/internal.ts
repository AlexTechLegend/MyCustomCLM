import { readCaCert, selfSign, signWithCa, newLog } from '../../openssl.js';
import type { IssuanceConnector, IssueRequest, IssuedCertificate } from './types.js';

export class InternalCaConnector implements IssuanceConnector {
  readonly kind = 'internal-ca' as const;

  async issue(req: IssueRequest): Promise<IssuedCertificate> {
    const log = req.log ?? newLog();
    const leafPem = await signWithCa(req.csrPem, { days: req.days }, log);
    const ca = await readCaCert();
    return { leafPem, chainPems: ca ? [ca] : [] };
  }
}

export class SelfSignedConnector implements IssuanceConnector {
  readonly kind = 'self-signed' as const;

  async issue(req: IssueRequest): Promise<IssuedCertificate> {
    if (!req.keyPem) throw new Error('self-signed issuance requires the matching private key');
    const log = req.log ?? newLog();
    const leafPem = await selfSign(req.csrPem, req.keyPem, req.days, log);
    return { leafPem, chainPems: [] };
  }
}
