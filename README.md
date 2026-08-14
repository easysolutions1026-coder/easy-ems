# IMSE EASY EMS — Cloud Migration (Phase 0)

**Engineering Management System** for IMSE Tech Services Pvt Ltd.

This repo migrates EASY EMS from Google-Drive-JSON storage to a proper cloud
architecture, while keeping the existing `index.html` and `field_app.html`
UIs almost entirely unchanged.

---

## What this Phase 0 delivers

- Docker Compose stack you can run locally (Postgres + Node backend)
- Prisma schema covering all 24 EASY EMS collections
- `api-shim.js` — a drop-in replacement for `loadFileFromDrive` /
  `saveFileToDrive` so `index.html` and `field_app.html` can talk to the
  new backend with **zero UI changes**
- Cloud Run + Cloud SQL deployment config
- GitHub Actions workflow for auto-deploy on push

Phases 1–3 (module cutover, live SSE updates, cron alerts, Sheets sync)
build on top of this without changing what's here.

---

## Architecture

```
Browser (GitHub Pages OR served from Cloud Run)
   │ HTTPS + Google OAuth token
   ▼
Cloud Run (Node/Express)          ← Auto-deploys on push to main
   │ pg wire protocol
   ▼
Cloud SQL PostgreSQL              ← Source of truth (asia-south1, Mumbai)
   │
   ├─ pg_dump nightly ──────►  Google Drive: DBBackups/YYYY-MM-DD.sql.gz
   ├─ sheets-sync (event) ──►  Google Sheet mirror (human-readable backup)
   └─ cron alerts ─────────►   Replaces both existing Apps Scripts
       (attendance 6:30 PM, WFH 7:00 PM, daily activity 7:00 PM)

Photos & PDF attachments still live in Google Drive (unchanged).
Only their driveFileId is stored in Postgres.
```

---

## Local development — first-time setup

Prereqs: **Docker Desktop** or **Docker Engine + Compose plugin**, and
**Node.js 20+** if you want to run the backend outside Docker.

```bash
git clone https://github.com/imse-tech/imse-easy-ems.git
cd imse-easy-ems

# Copy the example env file and edit values
cp .env.example .env
# Edit .env — see notes inside the file

# Start Postgres + backend
docker compose up -d

# Wait ~5 seconds, then apply the schema
docker compose exec backend npx prisma migrate dev --name init

# Open the app
open http://localhost:8080
```

The backend will be on `http://localhost:8080/api/*`, Postgres on
`localhost:5432` (user `ems`, password from `.env`, DB `ems`).

---

## Running the existing HTML against the new backend

Two ways:

### Option A — Least-invasive (recommended for Phase 0 testing)

Add exactly one `<script>` tag to `index.html` and `field_app.html`,
**before** any other script. This loads `api-shim.js`, which monkey-patches
`loadFileFromDrive` / `saveFileToDrive` / `readFile` / `writeFile` to hit
the new backend instead of Google Drive.

```html
<script src="/shim/api-shim.js"></script>
```

Everything else in the HTML — 39k lines of UI code — is unchanged.

### Option B — Full cutover

Later, once Phase 1–3 are done, remove the Google Drive API script imports
entirely and replace them with the shim. This drops a few hundred KB of
loaded JS from the client.

---

## Deployment to Google Cloud Run

Once local dev works, push to `main` and GitHub Actions will:

1. Build the Docker image
2. Push to Google Container Registry
3. Deploy to Cloud Run in `asia-south1`
4. Run any pending Prisma migrations against Cloud SQL

Required GitHub Secrets:

| Secret | Purpose |
|---|---|
| `GCP_PROJECT_ID` | Your Google Cloud project ID |
| `GCP_SA_KEY` | Service account JSON key (for GitHub Actions) |
| `CLOUD_SQL_INSTANCE` | e.g. `imse-ems:asia-south1:ems-prod` |
| `DATABASE_URL` | Postgres connection string with Cloud SQL Auth Proxy |

Setup instructions in `docs/cloud-run-setup.md` (created in Phase 0.5).

---

## Repository layout

```
imse-easy-ems/
├── backend/
│   ├── src/
│   │   ├── server.js           # Express entry point
│   │   ├── routes/
│   │   │   └── data.js         # Generic /api/data/:collection endpoints
│   │   ├── db/
│   │   │   └── prisma.js       # Prisma client singleton
│   │   ├── auth/
│   │   │   └── google-oauth.js # Verifies Google OAuth token
│   │   ├── sync/               # (Phase 2) Sheets backup worker
│   │   └── cron/               # (Phase 2) Replaces Apps Scripts
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   └── shared/
│       └── api-shim.js         # Client-side compatibility layer
├── prisma/
│   └── schema.prisma           # DB schema — all 24 collections
├── docker-compose.yml
├── cloudbuild.yaml
├── .github/workflows/deploy.yml
├── .env.example
└── README.md
```

---

## Phases (from earlier planning)

- **Phase 0** ← YOU ARE HERE. Infra + shim + skeleton. No user impact yet.
- **Phase 1** — Migrate 5 read-heavy collections (staff, parties,
  chartOfAccounts, bankAccounts, settings). Dual-write to Drive AND
  Postgres. Verify parity.
- **Phase 2** — Migrate transactional collections (transactions, expenses,
  paymentRequests, fundPools, fundRequests, workLogs). Enable Sheets sync.
  Retire Apps Scripts.
- **Phase 3** — Migrate remaining (petty cash, GST snapshots, payslips,
  audit log). Turn off Drive JSON reads/writes entirely.
- **Phase 4** — SSE live updates, offline PWA, deferred features
  (backup layer 4, year-based splitting).
