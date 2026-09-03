# Build prompt — Vigil CLM

This is the prompt that describes the product precisely enough to (re)build it, extend it,
or hand to another engineer / AI agent. It is the single source of intent; `PLAN.md` holds
the design detail.

---

You are building **Vigil**, a self-hosted Certificate Lifecycle Management web platform.
It must be simple to use, visually clean and spacious, professional yet modern.

## Product requirements

1. **Dashboard** — the first screen. Show, at a glance: total certificates; healthy /
   expiring (≤30 d) / critical (≤7 d) / expired counts; an "expiring soon" queue sorted by
   days remaining with a one-click *Renew* action; fleet health donut; issuer breakdown;
   recent automation activity; and a prominent **Time reclaimed** metric — the total
   hours the platform's automation has saved, this month's figure, and a six-month trend.
2. **Certificates** — a search page listing every certificate. Full-text search across
   common name, SANs, issuer, serial and tags; filter chips by status and source; sort by
   expiry, name, issuer. Each row shows a slim lifetime bar (how much validity is used).
   Clicking opens a detail page with subject/issuer/validity/SANs/fingerprint/key info,
   the chain, linked reference profiles, renewal history, and ad-hoc downloads
   (PEM, full chain, DER, PFX with password, key, PKCS#7).
3. **Import** — drag-and-drop `.pfx/.p12` (with password) or `.cer/.crt/.pem/.der` plus an
   optional `.key`. The platform unpacks with OpenSSL, identifies the leaf, orders the
   chain, verifies the key matches, and stores canonical PEM material.
4. **OpenSSL inside the platform** — all cryptographic file operations run through the
   system `openssl` binary (no shell string interpolation; argument arrays only). The
   exact commands are logged and shown in the UI so the operator can trust and audit them.
5. **Reference Profiles** — the operator uploads *reference files* that are already in the
   exact format they issue (e.g. a full-chain `.cer` and a decrypted `private.key`, or a
   `.pfx`). The platform analyses each with OpenSSL and turns it into an **Output Spec**
   (container, chain depth, key encoding, encryption, line endings, password policy).
   Specs are grouped into a named profile with a filename pattern per file (tokens `{cn}`,
   `{cn_safe}`, `{date}`, `{year}`, `{serial}`, `{profile}`) and an optional
   **destination path** on disk.
6. **Renewal** — from a certificate: choose Internal CA (one click), Self-signed (one
   click) or External CA (generate CSR → upload signed cert). Choose to reuse the key or
   generate a new one (RSA 2048/3072/4096, EC P-256/P-384) and the validity period. On
   completion the platform renders every output spec of the selected profiles, writes them
   to the profile's destination path when enabled, and offers each file plus a ZIP for
   download. The certificate record is updated in place; history is preserved.
7. **Activity** — a log of every automated action with the minutes saved and the OpenSSL
   command trail.
8. **Settings** — organisation name, editable time-saved baselines (import, CSR, renewal,
   conversion per file, deployment per destination), Internal CA creation/inspection,
   system information (OpenSSL version, data paths).
9. **Seed** — a script that creates a demo CA plus ~15 realistic certificates spanning
   expired / critical / expiring / healthy, two reference profiles, and historical
   automation events so the dashboard is meaningful on first launch.

## Technical constraints

- `web/`: React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, React Router,
  Recharts, lucide-react, Inter Variable bundled locally.
- `server/`: Node 20+, Express 5, TypeScript, node:sqlite (built in — no native build), multer, archiver, system OpenSSL 3.
- One process serves API and SPA in production. Dev runs both with proxy.
- Data lives in `data/` (git-ignored): SQLite, `vault/<certId>/{cert,chain,key}.pem`,
  `renewals/<id>/` rendered outputs, `ca/` internal CA with `openssl ca` database.
- Filenames from patterns are sanitised (no path separators). Destination paths must be
  absolute. Private keys are written with mode 0600.

## Design constraints

- Palette: ink neutrals on a `#F7F8FA` canvas, verdigris teal primary `#0E7C7B`,
  semantic greens/ambers/roses for status. Hairline borders, `rounded-2xl` cards, no
  drop shadows, 8-pt grid, sidebar 248 px, content max-width 1280 px.
- Typography: Inter, tabular numerals for all figures, tight-tracked 600-weight headings.
- Tone: calm and precise. Empty states explain the next action. No exclamation marks.
- Every destructive action confirms. Every long operation shows progress and result.

## Definition of done

- `npm install && npm run seed && npm run dev` gives a populated dashboard.
- Import a real `.pfx` → appears with correct chain and key → renew via Internal CA →
  outputs rendered exactly matching the reference profile → files present at destination
  → ZIP download works → time reclaimed increases → activity shows OpenSSL commands.
