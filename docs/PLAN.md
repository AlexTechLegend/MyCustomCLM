# Vigil CLM — Product Plan

> Every certificate, watched. Every renewal, handled.

Vigil is a self-hosted Certificate Lifecycle Management platform built around one idea:
you should never have to hand-convert, rename, or copy a certificate again. You tell
Vigil once what your deliverables look like (a reference `.cer` full chain, a decrypted
`private.key`, a `.pfx` for IIS…) and where they live. From then on, every renewal
produces exactly those files, in exactly that format, in exactly that place — and Vigil
keeps score of the time it gave back to you.

---

## 1. Goals

| # | Goal | How Vigil delivers it |
|---|------|-----------------------|
| 1 | Clear picture of the whole certificate estate | Dashboard with fleet health, expiry horizon, issuer mix, and an "expiring soon" queue |
| 2 | Quantify the value of automation | **Time reclaimed** metric: every automated import, CSR, renewal, conversion and deployment is credited with a configurable baseline of manual minutes |
| 3 | Find any certificate fast | Certificates page: full-text search across CN / SANs / issuer / serial / tags, status filters, sort |
| 4 | OpenSSL inside the platform | All parsing, conversion, key generation, CSR generation and signing is executed through the system `openssl` binary; every command is logged and visible in the UI |
| 5 | Reference-driven output formats | Upload a *reference file* → Vigil fingerprints its exact format (PEM/DER/PKCS#12/PKCS#7, chain depth, key encoding, encryption, line endings) → stores it as an **Output Spec** inside a **Reference Profile** |
| 6 | Renewals that land in the right place | Profiles carry a **destination path**. On renewal Vigil renders every spec, writes the files to the destination, and also offers them as individual downloads or a ZIP |

Non-goals for v1: multi-user auth/RBAC, ACME, HSM/KMS integration, agent-based discovery.
These are listed in the roadmap (§10).

---

## 2. Brand

**Name:** Vigil — a vigil is a watch kept through the night. Certificates expire at 03:00
on a Sunday; Vigil is what's awake.

**Logo:** a shield built from two concentric arcs (the lifecycle ring) with a single
check-mark strike inside. The ring is deliberately open on the top-right: the lifecycle
is never "finished", it renews. Files: `brand/logo.svg` (wordmark), `brand/mark.svg`
(icon), also rendered as a React component in `web/src/components/Logo.tsx`.

**Voice:** calm, precise, confident. Short sentences. No exclamation marks in the product.

### 2.1 Colour system

| Token | Hex | Use |
|-------|-----|-----|
| `ink-950` | `#0B1220` | Headlines, sidebar background |
| `ink-700` | `#334155` | Body text |
| `ink-500` | `#64748B` | Secondary text |
| `ink-300` | `#CBD5E1` | Borders (strong) |
| `ink-200` | `#E2E8F0` | Borders (default) |
| `ink-100` | `#F1F5F9` | Subtle fills |
| `canvas` | `#F7F8FA` | App background |
| `surface` | `#FFFFFF` | Cards |
| `brand-700` | `#0B5E5C` | Primary hover |
| `brand-600` | `#0E7C7B` | **Primary** — verdigris teal, professional but not corporate-blue |
| `brand-500` | `#14A19F` | Charts, focus rings |
| `brand-100` | `#DDF3F2` | Primary tint |
| `brand-50` | `#EEF8F8` | Selected rows, soft backgrounds |
| `ok-600 / ok-100` | `#15803D / #DCFCE7` | Healthy |
| `warn-600 / warn-100` | `#B45309 / #FEF3C7` | Expiring (≤ 30 days) |
| `crit-600 / crit-100` | `#BE123C / #FFE4E6` | Critical (≤ 7 days) and errors |
| `dead-600 / dead-100` | `#475569 / #F1F5F9` | Expired |

### 2.2 Typography

- Family: **Inter Variable** (bundled via `@fontsource-variable/inter`, no CDN), fallback system-ui.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 24 / 32. Tabular numerals on all metrics.
- Headlines use `tracking-tight`, weight 600. Body weight 400, labels 500.

### 2.3 Layout & spacing

- 8-pt grid. Cards: `rounded-2xl`, 1 px `ink-200` border, no drop shadow (a hairline border
  reads cleaner and more professional than shadows).
- Sidebar 248 px, dark ink. Content max-width 1280 px, 32 px page padding, 24 px gaps.
- Generous whitespace: section headers have 32 px above, 16 px below.
- Motion: 150 ms ease-out on hover/focus only. No entrance animations.

### 2.4 Components

Button (primary / secondary / ghost / danger), StatCard, Card, Badge (status), Table,
SearchInput, FilterChips, EmptyState, FileDrop, Modal, Toast, Tabs, Field/Input/Select,
LifetimeBar (a slim progress bar showing how much of a certificate's lifetime is consumed),
Timeline, CodeBlock (for PEM / CSR / OpenSSL commands).

---

## 3. Information architecture

```
/                      Dashboard
/certificates          Search & browse
/certificates/import   Import wizard
/certificates/:id      Detail, downloads, renewal history
/certificates/:id/renew  Renewal flow (method → options → outputs)
/profiles              Reference Profiles list
/profiles/new, /profiles/:id   Profile editor (reference analysis, output specs, destination)
/activity              Automation log with time saved and OpenSSL command trail
/settings              Organisation, time baselines, Internal CA, system info
```

---

## 4. Core concepts

### Certificate
One logical certificate (e.g. `portal.contoso.com`). Vigil stores the canonical material
in PEM in the vault (`data/vault/<id>/cert.pem`, `chain.pem`, `key.pem`). Renewal
replaces the material in place and appends to renewal history, so the certificate keeps
its identity, profiles and tags across renewals.

Status is derived from `not_after`:
`expired` · `critical` (≤ 7 d) · `expiring` (≤ 30 d) · `healthy`.

### Reference Profile
A named set of deliverables plus an optional destination directory.

```
Profile "IIS – Web Farm"
  destination: D:\Certs\WebFarm            (or /etc/ssl/webfarm)
  outputs:
    fullchain.cer     ← PEM, full chain (leaf + intermediates), CRLF
    private.key       ← PEM PKCS#8, unencrypted, LF
    {cn}.pfx          ← PKCS#12, password, legacy=false
```

Each output is an **Output Spec** — usually created by uploading a reference file that
Vigil analyses with OpenSSL. Filenames support tokens: `{cn}`, `{cn_safe}`, `{date}`,
`{year}`, `{serial}`, `{profile}`.

### Renewal
Three methods:
1. **Internal CA** — one click. Vigil generates a key + CSR, signs it with the built-in
   CA (created in Settings), and renders outputs.
2. **Self-signed** — one click, for dev/lab.
3. **External CA (CSR)** — Vigil generates key + CSR → you get it signed by DigiCert /
   AD CS / etc. → upload the signed cert (+ chain) → Vigil renders outputs.

Key options: reuse existing key, or new RSA 2048/3072/4096, EC P-256/P-384.
Every renewal records `previous_not_after → new_not_after`, the OpenSSL commands used,
the rendered output files (kept in `data/renewals/<id>/`), and per-file deployment results.

### Automation event & time reclaimed
Every automated action writes an event with `minutes_saved` taken from Settings →
Time baselines (defaults: import 10 min, CSR 15, renewal 45, conversion 8 per file,
deployment 15 per destination). The dashboard shows lifetime hours saved, this month,
and a 6-month trend. Baselines are editable so the number reflects *your* team.

---

## 5. Architecture

```
web/     React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + Recharts
server/  Node 20+ + Express 5 + TypeScript + node:sqlite (built in) + system OpenSSL 3.x
data/    SQLite db, vault, renewals, internal CA (git-ignored)
```

- Single process in production: Express serves the built SPA and the `/api`.
- OpenSSL is invoked via `execFile` with argument arrays (no shell interpolation).
  Passwords are passed through `pass:` env-free arguments in a temp working dir that
  is removed after each operation. Every command is captured for the UI trail.
- Node's `crypto.X509Certificate` is used for fast structured parsing; OpenSSL does the
  rest (PKCS#12, DER, PKCS#7, key transcoding, CSR, signing).

### 5.1 Data model (SQLite)

- `certificates` — id, name, subject, issuer, serial, not_before, not_after, sans(json),
  key_algo, key_bits, sig_algo, fingerprint_sha256, has_key, chain_count, source,
  tags(json), notes, profile_ids(json), renewal_count, created_at, updated_at
- `profiles` — id, name, description, destination_path, outputs(json), created_at, updated_at
- `renewals` — id, certificate_id, method, status, key_mode, csr_pem, previous_not_after,
  new_not_after, outputs(json), commands(json), error, created_at, completed_at
- `events` — id, type, certificate_id, renewal_id, title, detail, minutes_saved, created_at
- `settings` — key, value(json)

### 5.2 API

```
GET    /api/dashboard
GET    /api/certificates?q=&status=&source=&sort=
POST   /api/certificates/import        multipart: files[], password?, keyPassword?, name?, tags?
GET    /api/certificates/:id
PATCH  /api/certificates/:id           name, tags, notes, profileIds
DELETE /api/certificates/:id
GET    /api/certificates/:id/download?format=pem|fullchain|der|pfx|key|pkcs7&password=
POST   /api/certificates/:id/renew     { method, keyMode, keyAlgo, validityDays, profileIds, deploy }
POST   /api/renewals/:id/complete      multipart: files[] (signed cert + chain)
GET    /api/renewals/:id
GET    /api/renewals/:id/outputs/:index
GET    /api/renewals/:id/zip
GET    /api/profiles  POST /api/profiles  GET/PUT/DELETE /api/profiles/:id
POST   /api/profiles/analyze           multipart: file, password?  → detected OutputSpec
GET    /api/activity
GET    /api/settings  PUT /api/settings
GET    /api/ca        POST /api/ca      GET /api/ca/certificate
GET    /api/system                     openssl version, paths
```

---

## 6. OpenSSL operations catalogue

| Purpose | Command shape |
|---------|---------------|
| Unpack PKCS#12 | `openssl pkcs12 -in in.pfx -passin pass:… -nodes -out all.pem` (retry with `-legacy`) |
| DER → PEM | `openssl x509 -inform DER -in in.der -out out.pem` |
| PEM → DER | `openssl x509 -in cert.pem -outform DER -out out.der` |
| Build PKCS#12 | `openssl pkcs12 -export -inkey key.pem -in cert.pem -certfile chain.pem -name … -passout pass:…` |
| Key → PKCS#8 (clear) | `openssl pkey -in key.pem -out out.key` |
| Key → PKCS#1 (RSA traditional) | `openssl rsa -in key.pem -traditional -out out.key` |
| Key → encrypted PKCS#8 | `openssl pkey -in key.pem -aes256 -passout pass:… -out out.key` |
| PKCS#7 bundle | `openssl crl2pkcs7 -nocrl -certfile fullchain.pem [-outform DER]` |
| New key + CSR | `openssl req -new -newkey rsa:2048 -nodes -keyout key.pem -out req.csr -subj … -addext subjectAltName=…` |
| CSR with existing key | `openssl req -new -key key.pem -out req.csr -subj … -addext …` |
| Create internal CA | `openssl req -x509 -newkey rsa:4096 -nodes -days 3650 -subj … -addext basicConstraints=critical,CA:TRUE` |
| Sign with internal CA | `openssl ca -config ca.cnf -batch -notext -in req.csr -out cert.pem -days N` |
| Self-sign | `openssl x509 -req -in req.csr -signkey key.pem -days N -copy_extensions copy` |
| Inspect | `openssl x509 -noout -text`, `openssl pkey -noout -text`, `openssl pkcs7 -print_certs` |

---

## 7. Reference file analysis (format detection)

1. PEM if the file starts with `-----BEGIN`. Count blocks:
   - `CERTIFICATE` ×1 → `pem-cert`; ×N → `pem-fullchain` (root included if last is self-signed)
   - `PRIVATE KEY` → `pem-key` (PKCS#8, clear) · `ENCRYPTED PRIVATE KEY` → `pem-key-encrypted`
   - `RSA PRIVATE KEY` / `EC PRIVATE KEY` → `pem-key` (PKCS#1 / SEC1); `Proc-Type: 4,ENCRYPTED` → encrypted
   - cert + key together → `pem-bundle` · `PKCS7` → `pkcs7`
   - Line endings: CRLF vs LF, trailing newline
2. Otherwise binary: try `x509 -inform DER`, then `pkcs12 -info` (password or "mac verify
   failure" both identify PKCS#12, and `-legacy` detects RC2 era files), then `pkcs7 -inform DER`,
   then `pkey -inform DER`.
3. The result is an Output Spec the user confirms and names.

---

## 8. Time-reclaimed model

```
minutes_saved(event) =
  import      → baseline.import
  csr         → baseline.csr
  renewal     → baseline.renewal
  conversion  → baseline.conversion × files rendered
  deployment  → baseline.deployment × destinations written
```

Displayed as hours (1 decimal) with the raw event count beside it, so the number is
always explainable.

---

## 9. Build sequence

1. Monorepo scaffold, tooling, theme, logo.
2. Server: db, openssl wrapper, certificate import/parse, downloads.
3. Reference analysis + profiles + renderer.
4. Renewals (internal CA, self-signed, CSR) + deployment + ZIP.
5. Dashboard aggregates + time reclaimed.
6. Web: shell, dashboard, certificates, detail, import, profiles, renew, activity, settings.
7. Seed data, README, end-to-end verification against real OpenSSL.

---

## 10. Roadmap (after v1)

- Authentication (local users → OIDC), audit trail per user
- Vault encryption at rest with a master key / KMS
- ACME (Let's Encrypt, internal Step-CA) as a renewal method
- Notifications (email, Slack, Teams) at 60/30/14/7 days
- Discovery: scan hosts/ports and import what is actually deployed
- Remote destinations: SMB/UNC, SSH/SCP, Azure Key Vault, IIS binding update
- Scheduled auto-renew for internal-CA certificates
