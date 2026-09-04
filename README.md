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

Requirements: **Node 20 LTS or newer** and **OpenSSL 3.x**.

The database uses `better-sqlite3` (prebuilt binary for Windows / macOS / Linux — no
compiler needed). On Node 22.5+ it can also fall back to the built-in `node:sqlite`.

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

Environment variables (common): `PORT` (default 4180), `VIGIL_DATA_DIR` (default `./data`),
`OPENSSL_BIN` (auto-detected; set to override), `VIGIL_AUTH=1` (authenticate every route
except health / login / OpenAPI), `VIGIL_SECRET_KEY` (AES-256-GCM for stored credentials).

First start with no users and no key generates `data/secret.key` (mode 0600) and an
`admin` account. The one-time password is printed once in the server log — change it
after login. You can also run `npm run bootstrap -w server`.

> `npm run seed` resets the data directory. Run it before starting the server, or restart
> the server afterwards. Seed also prints one-time passwords for `admin` and `operator`.

### Installing OpenSSL

Vigil looks for OpenSSL on `PATH` and in the usual install locations, and prefers an
OpenSSL 3 binary over LibreSSL / 1.1. If it is missing, the seed and the server tell you.

| Platform | Install |
|----------|---------|
| Windows | `winget install ShiningLight.OpenSSL.Light` (adds `C:\Program Files\OpenSSL-Win64\bin`), or use the copy bundled with Git for Windows — Vigil finds both automatically. Re-open the terminal afterwards. |
| macOS | `brew install openssl@3` — the system `openssl` is LibreSSL and is not sufficient. |
| Linux | `sudo apt install openssl` / `sudo dnf install openssl` |

To point at a specific binary: `OPENSSL_BIN=/path/to/openssl npm run seed`
(PowerShell: `$env:OPENSSL_BIN="C:\path\to\openssl.exe"; npm run seed`).

### Troubleshooting `npm run seed`

- **`EBADENGINE` / "Node … is too old"** — Node 18 and below are not supported. Install
  **Node 20 LTS** (or 22) from <https://nodejs.org>, **close and re-open PowerShell**, then:
  ```powershell
  node --version    # must show v20.x or newer
  npm install
  npm run seed
  ```
- **"Could not open the Vigil database" / better-sqlite3 errors** — the native binding did
  not download. From the repo root:
  ```powershell
  npm rebuild better-sqlite3
  npm run seed
  ```
  If that still fails, install the [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) and retry.
- **"OpenSSL was not found"** — see the table above, or set `OPENSSL_BIN`.
- **"Found LibreSSL …"** (macOS) — `brew install openssl@3`; Vigil picks it up automatically.
- **"Could not reset … EBUSY / EPERM"** (Windows) — the server or an editor has the `data/`
  folder open. Stop `npm run dev` / `npm start`, close Explorer windows on `data/`, retry.
- **Command not found / workspace errors** — run from the repository root with npm 7+
  (`npm --version`), after `npm install`.
- Anything else: the seed prints the exact OpenSSL command and its stderr — paste that output
  into an issue.

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
server/               Express 5 + TypeScript + node:sqlite + OpenSSL wrapper
web/                  React 19 + Vite + Tailwind v4 + TanStack Query + Recharts
data/                 (git-ignored) SQLite, vault, rendered renewals, internal CA
```

## Security notes

- Private keys live in `data/vault/<id>/key.pem` with mode `0600`.
- OpenSSL is spawned with argument arrays (no shell) and detached from any TTY so it can
  never block on a prompt; passwords go through temporary `0600` files, not the command line.
- Filenames rendered from patterns are sanitised; destination paths must be absolute.
- Set **`VIGIL_AUTH=1`** in any install that is not a single-user LAN. The API is
  authenticated-by-default: only `GET /api/health`, `GET /api/openapi.json`,
  `GET /api/auth/me`, `POST /api/auth/login` and `POST /api/auth/logout` are public.
  Roles: **viewer** reads; **operator** renews, deploys and runs pipelines; **approver**
  releases gates; **admin** owns users, credentials, blueprints and settings.
- Leaving `VIGIL_AUTH` unset is still allowed for a local demo, but the process logs a
  loud warning at startup naming the risk.
- Credential secrets are encrypted with `VIGIL_SECRET_KEY`. The server **refuses to start**
  if credentials exist and the key is missing — it never falls back to plaintext. The
  API never returns the secret, only metadata (`hasSecret`).
- OpenAPI document: `GET /api/openapi.json`. `/api/health` is a cheap `{ ok: true }`
  probe (no database).

### Key rotation

```bash
# Current key in VIGIL_SECRET_KEY_OLD, new key in VIGIL_SECRET_KEY.
VIGIL_SECRET_KEY_OLD='old-key-or-passphrase' \
VIGIL_SECRET_KEY='new-64-hex-or-passphrase' \
  npm run rotate-key -w server
```

Re-encryption runs in one SQLite transaction. Persist the new key in the service
environment (and in `data/secret.key`) before restarting.

### Backup and restore drill

These commands write a consistent snapshot of the SQLite database (`VACUUM INTO`,
falling back to a file copy), the vault, and the CA directory. **Stop the service
before restore.** Do not run this against a live shared `data/` directory that
another process has open.

```bash
# 1. Snapshot (safe to run while the server is up)
npm run backup -w server -- ./backups
# prints something like: /…/backups/vigil-backup-2026-09-04T02-30-00-000Z

# 2. Confirm the snapshot
ls backups/vigil-backup-*/vigil.sqlite
ls backups/vigil-backup-*/vault
ls backups/vigil-backup-*/ca
cat backups/vigil-backup-*/manifest.json

# 3. Restore into a disposable directory (proves the files are usable)
VIGIL_DATA_DIR=/tmp/vigil-restore-drill npm run restore -w server -- ./backups/vigil-backup-<stamp>
ls /tmp/vigil-restore-drill/vigil.sqlite
ls /tmp/vigil-restore-drill/vault

# 4. Production restore: stop Vigil, then
#    VIGIL_DATA_DIR=/var/lib/vigil npm run restore -w server -- /path/to/vigil-backup-<stamp>
#    and start the service again. Keep VIGIL_SECRET_KEY the same as when the
#    backup was taken, or credentials will not decrypt.
```

A unit test (`server/src/lib/backup.test.ts`) also round-trips a settings row and a
vault file through backup → delete → restore.

## Running as a service

A scheduler that renews production certificates must survive a reboot. After
`npm run build`, install one of the wrappers in `deploy/`.

### Service account

Use a **dedicated** account — never Domain Admin, never your own interactive login.

| Platform | Account | Required rights |
|----------|---------|-----------------|
| Linux | system user `vigil` | Own `/var/lib/vigil` (`0700`). Read `/opt/vigil`. Execute `node` and OpenSSL. No sudo. The unit sets `ProtectSystem=strict` and `ReadWritePaths=/var/lib/vigil`. |
| Windows | local user or gMSA | **Log on as a service**. **Modify** on `VIGIL_DATA_DIR`. **Read & execute** on the OpenSSL binary (and Git's `usr\bin` if you use that copy). Outbound network later, if you enable WinRM/SSH transports. |

Keep `VIGIL_SECRET_KEY` in the service environment (or `data/secret.key` mode 0600),
not in the database and not in a world-readable script.

### systemd

```bash
sudo useradd --system --home /var/lib/vigil --shell /usr/sbin/nologin vigil
sudo mkdir -p /opt/vigil /var/lib/vigil /etc/vigil
sudo cp -a . /opt/vigil
sudo cp deploy/vigil.env.example /etc/vigil/vigil.env   # then edit; chmod 0600
sudo cp deploy/vigil.service /etc/systemd/system/vigil.service
sudo chown -R vigil:vigil /var/lib/vigil /opt/vigil
sudo systemctl daemon-reload
sudo systemctl enable --now vigil
curl -sS http://127.0.0.1:4180/api/health
```

### Windows

From an elevated PowerShell, after `npm run build`:

```powershell
.\deploy\windows\Install-VigilService.ps1
```

The script uses **NSSM** when `nssm` is on `PATH` (`winget install NSSM.NSSM`), or
**WinSW** if you drop the x64 exe at `deploy\windows\vigil-service.exe`. The WinSW
config is `deploy\windows\vigil-winsw.xml`. Uninstall with
`.\deploy\windows\Uninstall-VigilService.ps1`.

### Docker

```bash
docker build -t vigil-clm .
docker run --name vigil -p 4180:4180 \
  -e VIGIL_SECRET_KEY=your-64-hex-or-passphrase \
  -v vigil-data:/data \
  vigil-clm
```

The image sets `VIGIL_AUTH=1` and `VIGIL_DATA_DIR=/data`. First start without a key
writes `/data/secret.key` and logs the admin one-time password. `GET /api/health`
is the liveness probe.
