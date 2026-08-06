#!/usr/bin/env bash
# update.sh — обновление уже задеплоенного сервиса (zero-downtime)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/callcenter}"

cd "$APP_DIR/project"

echo "⬇  Pulling latest code…"
git pull --ff-only

echo "🔨  Rebuilding backend…"
docker compose build --no-cache backend

echo "🔄  Restarting backend (Evolution API stays up)…"
docker compose up -d --no-deps backend

echo "⏳  Waiting for health check…"
sleep 15
docker compose ps

echo "✅  Update complete"
