import net from 'node:net';
import tls from 'node:tls';

export interface SmtpSendOptions {
  host: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  timeoutMs?: number;
}

/**
 * Minimal SMTP client (EHLO, optional STARTTLS, AUTH LOGIN, DATA).
 * No extra dependency — uses node:net / node:tls.
 */
export async function smtpSend(opts: SmtpSendOptions): Promise<void> {
  const port = opts.port ?? (opts.secure ? 465 : 587);
  const recipients = Array.isArray(opts.to) ? opts.to : String(opts.to).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) throw new Error('SMTP send needs at least one recipient');
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const socket = opts.secure
    ? tls.connect({ host: opts.host, port, timeout: timeoutMs, servername: opts.host })
    : net.connect({ host: opts.host, port, timeout: timeoutMs });

  const conn = new SmtpConn(socket);
  try {
    await conn.expect(220);
    await conn.ehlo();
    if (!opts.secure && conn.supports('STARTTLS')) {
      await conn.command('STARTTLS', 220);
      const upgraded = await conn.startTls(opts.host);
      conn.replace(upgraded);
      await conn.ehlo();
    }
    if (opts.username && opts.password) {
      await conn.command('AUTH LOGIN', 334);
      await conn.command(Buffer.from(opts.username).toString('base64'), 334);
      await conn.command(Buffer.from(opts.password).toString('base64'), 235);
    }
    await conn.command(`MAIL FROM:<${addr(opts.from)}>`, 250);
    for (const rcpt of recipients) {
      await conn.command(`RCPT TO:<${addr(rcpt)}>`, 250);
    }
    await conn.command('DATA', 354);
    const body = [
      `From: ${opts.from}`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${opts.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.text.replace(/^\./gm, '..'),
      '.',
    ].join('\r\n');
    await conn.command(body, 250);
    await conn.command('QUIT', 221);
  } finally {
    conn.end();
  }
}

function addr(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim();
}

class SmtpConn {
  private buf = '';
  private caps: string[] = [];
  private socket: net.Socket;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buf += chunk;
    });
  }

  replace(socket: tls.TLSSocket): void {
    this.socket.removeAllListeners('data');
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buf += chunk;
    });
  }

  supports(cap: string): boolean {
    return this.caps.some((c) => c.toUpperCase().startsWith(cap.toUpperCase()));
  }

  async ehlo(): Promise<void> {
    const lines = await this.command('EHLO vigil', 250);
    this.caps = lines.slice(1).map((l) => l.slice(4).trim());
  }

  startTls(servername: string): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const upgraded = tls.connect({ socket: this.socket, servername }, () => resolve(upgraded));
      upgraded.on('error', reject);
    });
  }

  async command(line: string, expectCode: number): Promise<string[]> {
    this.socket.write(line.endsWith('\r\n') ? line : `${line}\r\n`);
    return this.expect(expectCode);
  }

  expect(code: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const lines = this.buf.split(/\r?\n/);
        const done = lines.findIndex((l) => /^\d{3} /.test(l));
        if (done >= 0) {
          const complete = lines.slice(0, done + 1);
          this.buf = lines.slice(done + 1).join('\n');
          const got = Number(complete[complete.length - 1].slice(0, 3));
          if (got !== code) {
            reject(new Error(`SMTP expected ${code}, got ${complete[complete.length - 1]}`));
            return;
          }
          resolve(complete);
          return;
        }
        if (Date.now() - started > 30_000) {
          reject(new Error('SMTP timed out waiting for response'));
          return;
        }
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  end(): void {
    try {
      this.socket.end();
    } catch {
      /* ignore */
    }
  }
}
