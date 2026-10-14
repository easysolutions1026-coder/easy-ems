# EASY EMS - Cloud Migration

Engineering Management System for IMSE Tech Services Pvt Ltd.

Migrates EASY EMS from Google Drive JSON storage to a proper cloud architecture, while keeping the existing `index.html` and `field_app.html` UIs almost entirely unchanged.

## Architecture

**Three environments:**

1. **Local Dev (Docker)** — For active development
   - Postgres 16 in Docker
   - Backend Node.js + Prisma
   - Adminer for DB inspection
   - Data: your 2,351 production records migrated once
   - URL: `http://localhost:8080`

2. **Cloud Run Testing (ephemeral)** — For feature testing and team demos
   - SQLite in-memory (ephemeral)
   - Backend Node.js + Prisma
   - Auto-scale to zero when idle (₹0 cost)
   - Data resets when container idle
   - URL: `https://ems-backend-*.run.app`

3. **Production** — Live app at https://easwaranps.github.io/engineering-services-app/
   - Google Drive JSON storage
   - GitHub Pages hosting
   - Untouched by this migration work

## Quick Start (Local Dev)

Prerequisites:
- Docker Desktop installed and running
- Google account: imseindia@gmail.com

```bash
git clone https://github.com/imse-tech/imse-easy-ems.git
cd imse-easy-ems

# Create local .env from template
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and update GOOGLE_OAUTH_CLIENT_ID

# Start containers
docker compose up -d

# Wait for containers to start
sleep 10

# Create database tables
docker compose exec backend npx prisma db push

# Verify
curl http://localhost:8080/healthz
```

Open browser: http://localhost:8080

Sign in with imseindia@gmail.com.

## Loading Production Data (Optional)

If you want your 2,351 real production records in local Postgres:

1. Download JSON files from Google Drive:
   - Folder: `Engineering Service App` (in imseindia@gmail.com Drive)
   - Files: 23 primary `.json` files (skip `_backup_*` files)
   
2. Place them in `data-source/` folder (name them without number prefixes: `transactions.json`, `parties.json`, etc.)

3. Run migration:
docker compose exec backend node /app/scripts/migrate-from-drive.js

4. Verify in Adminer: http://localhost:8081 (login: db/ems/ImseLocal2026Db/ems)

## Cloud Run Deployment

Prerequisites:
- Google Cloud SDK installed and configured
- Billing enabled on project `easy-ems-507406`
- Signed in: `gcloud auth login` (as imseindia@gmail.com)

### Deploy

```powershell
.\scripts\deploy-to-cloud-run.ps1
```

This script:
1. Verifies gcloud auth and project
2. Enables required APIs (Cloud Run, Cloud Build, Container Registry)
3. Builds Docker image via Cloud Build (3-5 min)
4. Deploys to Cloud Run in asia-south1 (Mumbai)
5. Returns the public URL

Expected time: 5-10 minutes total.

### Check Status

```powershell
.\scripts\check-cloud-run-status.ps1
```

### Rollback

If a deployment breaks something:

```powershell
.\scripts\rollback-cloud-run.ps1
```

Then enter the previous revision name when prompted.

### View Logs

```powershell
gcloud run services logs read ems-backend --region asia-south1 --limit 50
```

## Data Persistence Notes

| Environment | Data Storage | Persistence |
|---|---|---|
| Local Docker | Postgres (Docker volume) | Persists across container restarts, lost if volume deleted |
| Cloud Run | SQLite in /tmp | ***EPHEMERAL*** - lost when container scales to zero |
| Production | Google Drive JSON | Persists forever |

**Cloud Run is intentionally ephemeral** to keep costs at ₹0. When you visit after idle time, you'll see empty tables. This is by design for testing.

To upgrade to persistent Cloud SQL (~₹1,500/month), see [docs/upgrade-to-cloud-sql.md] (future doc).

## Key Files
imse-easy-ems/
├── backend/
│ ├── Dockerfile # Local dev (Postgres)
│ ├── Dockerfile.production # Cloud Run (SQLite)
│ ├── package.json
│ ├── scripts/
│ │ ├── migrate-from-drive.js # One-time data import
│ │ └── cloud-run-start.sh # Cloud Run startup
│ └── src/
│ ├── server.js # Express entry
│ ├── auth/google-oauth.js # Token verification
│ ├── db/prisma.js # Prisma client
│ └── routes/data.js # API routes
├── frontend/
│ ├── index.html # Main app UI
│ └── shared/api-shim.js # Drive->API interceptor
├── prisma/
│ ├── schema.prisma # Postgres schema (local)
│ └── schema.production.prisma # SQLite schema (cloud)
├── scripts/
│ ├── deploy-to-cloud-run.ps1 # Main deployment
│ ├── check-cloud-run-status.ps1 # Status check
│ └── rollback-cloud-run.ps1 # Rollback
├── cloud-run.yaml # Cloud Run config
├── docker-compose.yml # Local dev orchestration
├── .env.example # Local dev template
├── .env.production.example # Cloud Run reference
└── .gitignore # Excludes data-source/ and secrets

## OAuth Client

- **Client ID:** `446056303892-lcuj4rf9hv047sujfklb2vacqtd93k45.apps.googleusercontent.com`
- **Owned by:** imseindia@gmail.com
- **Console:** https://console.cloud.google.com/apis/credentials?project=easy-ems-507406

Authorized origins:
- `http://localhost:8080` (local dev)
- `https://easwaranps.github.io` (production)
- `https://ems-backend-*.a.run.app` (Cloud Run - 3 patterns)

## Troubleshooting

### "Docker command not found" or "Cannot connect to Docker"
Start Docker Desktop from Start menu, wait 30-60 seconds.

### "gcloud not recognized" (PowerShell)
Re-run PATH fix from Part A setup or use full path: `& "C:\Users\pc\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" --version`

### "Failed to save" errors in the app
Check `docker logs ems-backend --tail 30` for the exact Prisma error. Usually a missing schema field or type mismatch.

### Sign-in returns to login screen
Check third-party cookies in Chrome (chrome://settings/cookies). Google OAuth requires them.

### App shows garbled characters (mojibake)
See mojibake fix in `docs/encoding-fix.md` (or the git history around commit "Clean UI: strip mojibake emojis").

## License

Proprietary - IMSE Tech Services Pvt Ltd.
