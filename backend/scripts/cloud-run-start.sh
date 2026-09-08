#!/bin/bash
# ============================================================
# Cloud Run startup script - Cloud SQL edition
# ============================================================

set -e

echo "[EMS] Cloud Run starting..."
echo "[EMS] NODE_ENV=$NODE_ENV"
echo "[EMS] PORT=$PORT"
echo "[EMS] DATABASE_URL is set: $([ -n "$DATABASE_URL" ] && echo yes || echo no)"

# For SQLite (ephemeral): create/sync database on start
# For Cloud SQL: schema already exists, skip db push
if [[ "$DATABASE_URL" == file:* ]]; then
    echo "[EMS] Detected SQLite - initializing database..."
    npx prisma db push --skip-generate --accept-data-loss
    echo "[EMS] SQLite initialized"
else
    echo "[EMS] Detected external database - skipping db push"
fi

echo "[EMS] Starting server..."
exec node src/server.js