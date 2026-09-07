#!/bin/bash
# ============================================================
# Cloud Run startup script
# Initializes SQLite database on first request, then starts server
# ============================================================

set -e

echo "[EMS] Cloud Run starting..."
echo "[EMS] NODE_ENV=$NODE_ENV"
echo "[EMS] PORT=$PORT"
echo "[EMS] DATABASE_URL=$DATABASE_URL"

# Initialize SQLite database (creates tables if not exists)
echo "[EMS] Initializing SQLite database..."
npx prisma db push --skip-generate --accept-data-loss

echo "[EMS] Database initialized. Starting server..."

# Start the Node.js server
exec node src/server.js