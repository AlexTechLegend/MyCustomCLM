<p align="center">
  <img src="brand/logo.svg" alt="Vigil CLM" width="220" />
</p>

<p align="center"><strong>Every certificate, watched. Every renewal, handled.</strong></p>

Vigil is a self-hosted Certificate Lifecycle Management platform. It keeps a clear picture of
your whole certificate estate, renews certificates with one click, and — the part that saves
the real time — produces the *exact* files you already issue (a CRLF full-chain `.cer`, a
decrypted `private.key`, an IIS `.pfx`…) in the *exact* place they belong, because you taught
it once with reference files. Every step runs through the system OpenSSL and is logged.

## Highlights

- **Dashboard** — fleet health, expiry horizon, issuer mix, expiring-soon queue, and a
  **Time reclaimed** metric with a monthly trend.
- **Certificates** — instant search across CN / SANs / issuer / serial / tags, status filters,
  lifetime bars, detail pages with chain, history, and any-format download.
- **Import** — `.pfx/.p12` (with password), `.cer/.crt/.pem/.der`, `.p7b`, `.key`. OpenSSL
  unpacks, orders the chain and verifies the key.
- **Reference profiles** — upload a reference file; Vigil detects container (PEM / DER /
  PKCS#12 / PKCS#7), chain depth, root inclusion, key encoding (PKCS#8 / PKCS#1), encryption
  and line endings, and turns it into a reproducible output spec with a filename pattern and
  destination path.
- **Renewal** — Internal CA (one click), Self-signed, or External CA via CSR round-trip. Reuse
  the key or generate RSA 2048/3072/4096, EC P-256/P-384. Outputs are rendered, written to
  destinations, and offered as individual downloads or a ZIP.
- **Activity** — every automated action, minutes saved, and the OpenSSL command trail.

## Quick start

Requirements: Node 22+, OpenSSL 3.x on `PATH`.

```bash
npm install
npm run seed      # demo CA, 16 certificates, 3 profiles, 6 months of history
npm run dev       # API on :4180, web on :5173 (proxied)
```

Open <http://localhost:5173>.

Production build (single process serving API + SPA on :4180):

```bash
npm run build
npm start
```

Environment variables: `PORT` (default 4180), `VIGIL_DATA_DIR` (default `./data`),
`OPENSSL_BIN` (default `openssl`).

> `npm run seed` resets the data directory. Run it before starting the server, or restart
> the server afterwards.

## The workflow

1. **Import** the certificate you have today (for example the `.pfx` your CA gave you).
2. **Create a reference profile**: upload your full-chain `.cer` and your decrypted
   `private.key` as reference files. Vigil analyses them, you name the filename patterns
   (`fullchain.cer`, `private.key`, `{cn_safe}.pfx`…) and set the destination directory.
3. **Link** the profile to the certificate.
4. **Renew** — choose the issuance method, click once. Vigil generates the key and CSR, gets
   the certificate issued, renders every output in your reference format, writes them to the
   destination, and hands you a ZIP. The certificate record is updated in place; history is kept.
5. Watch **Time reclaimed** grow. Tune the per-step baselines in Settings so the number is honest.

## Project layout

```
docs/PLAN.md          Product plan, design system, architecture, data model, API, OpenSSL catalogue
docs/BUILD_PROMPT.md  The build prompt — the single statement of intent for this product
brand/                logo.svg, mark.svg
server/               Express 5 + TypeScript + better-sqlite3 + OpenSSL wrapper
web/                  React 19 + Vite + Tailwind v4 + TanStack Query + Recharts
data/                 (git-ignored) SQLite, vault, rendered renewals, internal CA
```

## Security notes

- Private keys live in `data/vault/<id>/key.pem` with mode `0600`.
- OpenSSL is spawned with argument arrays (no shell) and detached from any TTY so it can
  never block on a prompt; passwords go through temporary `0600` files, not the command line.
- Filenames rendered from patterns are sanitised; destination paths must be absolute.
- There is no authentication in v1 — run Vigil on a trusted network or behind an
  authenticating reverse proxy. See the roadmap in `docs/PLAN.md`.
