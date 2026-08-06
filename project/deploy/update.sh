#!/usr/bin/env bash
# update.sh — обновление без downtime
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/callcenter}"
cd "$APP_DIR"

echo "⬇  Pulling latest code..."
git pull --ff-only

echo "🔨  Rebuilding services..."
docker compose build --no-cache backend admin operator

echo "🔄  Restarting (Evolution API stays up)..."
docker compose up -d --no-deps backend admin operator

echo "⏳  Waiting for backend health..."
sleep 15

echo "📦  Running migrations..."
docker compose exec backend npx prisma migrate deploy

docker compose ps
echo "✅  Update complete"
