#!/bin/bash
set -e

SERVER="188.241.217.76"
USER="root"
PASSWORD="Cocoage_1234\$"

echo "🚀 Deploying to ${SERVER}..."

sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${USER}@${SERVER} bash << 'ENDSSH'
set -e

# ── Node.js 20 ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  echo "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# ── PM2 ────────────────────────────────────────────────────────────────────
npm install -g pm2 --silent 2>/dev/null || true

# ── Clone / Pull ───────────────────────────────────────────────────────────
mkdir -p /var/www
cd /var/www

if [ -d "whatsapp-crm" ]; then
  echo "📥 Pulling latest..."
  cd whatsapp-crm
  git fetch origin main
  git reset --hard origin/main
else
  echo "📁 Cloning..."
  git clone https://github.com/dias123423-sys/whatsapp-crm-backend.git whatsapp-crm
  cd whatsapp-crm
fi

# ── .env ───────────────────────────────────────────────────────────────────
echo "📝 Writing .env..."
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1
APP_TIMEZONE=Asia/Almaty

DATABASE_URL="postgresql://neondb_owner:npg_mWPj7aoxjm7w@ep-quiet-wind-a2aomkh4.eu-central-1.aws.neon.tech/neondb?sslmode=require"

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=whatsapp-crm-jwt-secret-2026-change-me
JWT_EXPIRES_IN=7d

APP_URL=https://188-241-217-76.nip.io
BACKEND_URL=https://188-241-217-76.nip.io
FRONTEND_URL=https://whatsapp-crm-frontend.vercel.app
CORS_ORIGIN=https://whatsapp-crm-frontend.vercel.app,https://call-center-main.vercel.app,http://localhost:5173
WS_CORS_ORIGIN=https://whatsapp-crm-frontend.vercel.app,http://localhost:5173

EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=evo-key-2026
EVOLUTION_WEBHOOK_SECRET=

WHATSAPP_INSTANCE_1=whatsapp-1-tanat
WHATSAPP_INSTANCE_2=whatsapp-2
WHATSAPP_INSTANCE_3=whatsapp-3-ulday
WHATSAPP_INSTANCE_4=whatsapp-4

NIGHT_REPORT_GENERATION_TIME=09:00
DAY_REPORT_GENERATION_TIME=20:00
EXCEL_STORAGE_PATH=./storage/reports

LOG_LEVEL=info
EOF

# ── Install ────────────────────────────────────────────────────────────────
echo "📦 npm install..."
npm install --production=false

# ── Build ──────────────────────────────────────────────────────────────────
echo "🔨 npm run build..."
npm run build

# ── Prisma ────────────────────────────────────────────────────────────────
echo "🗄️  Prisma generate + migrate..."
npx prisma generate
npx prisma migrate deploy
npx prisma db seed || echo "⚠️  Seed skipped (already seeded)"

# ── Storage dir ────────────────────────────────────────────────────────────
mkdir -p storage/reports logs

# ── PM2 ────────────────────────────────────────────────────────────────────
echo "⚡ Starting with PM2..."
pm2 delete whatsapp-crm-api 2>/dev/null || true
pm2 start dist/main.js \
  --name whatsapp-crm-api \
  --instances 2 \
  --max-memory-restart 512M \
  --restart-delay 3000
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "✅ Deployment complete!"
echo "📍 API: https://188-241-217-76.nip.io/api/v1"
echo "📚 Docs: https://188-241-217-76.nip.io/api/docs"
echo ""
pm2 list

ENDSSH
