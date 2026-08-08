#!/bin/bash
set -e

SERVER="188.241.217.76"
USER="root"
PASSWORD="Cococage_1234"

echo "🚀 Starting full deployment to VPS ${SERVER}..."
echo "================================================"

# Install sshpass if needed
if ! command -v sshpass &> /dev/null; then
    echo "📦 Installing sshpass..."
    sudo apt-get update && sudo apt-get install -y sshpass
fi

echo ""
echo "📤 Step 1: Deploying backend on VPS..."
echo "========================================"

sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${USER}@${SERVER} << 'ENDSSH'
set -e

echo "🔧 Installing system dependencies..."
apt-get update
apt-get install -y git nodejs npm postgresql postgresql-contrib docker.io docker-compose

echo "📦 Installing PM2..."
npm install -g pm2

echo "🐳 Starting Docker service..."
systemctl start docker
systemctl enable docker

echo "📁 Creating directories..."
mkdir -p /var/www
cd /var/www

echo "📥 Cloning repository..."
if [ -d "whatsapp-crm" ]; then
    cd whatsapp-crm
    git pull origin main
else
    git clone https://github.com/dias123423-sys/whatsapp-crm-backend.git whatsapp-crm
    cd whatsapp-crm
fi

echo "📝 Creating .env file..."
cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3000

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://neondb_owner:npg_mWPj7aoxjm7w@ep-quiet-wind-a2aomkh4.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# JWT
JWT_SECRET=whatsapp-crm-jwt-secret-2026-production-secure
JWT_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-secure-evolution-key-2026

# WhatsApp Instances
WHATSAPP_INSTANCE_1=whatsapp-1
WHATSAPP_INSTANCE_2=whatsapp-2
WHATSAPP_INSTANCE_3=whatsapp-3
WHATSAPP_INSTANCE_4=whatsapp-4

# Lead Assignment
LEAD_ASSIGNMENT_MODE=MANUAL
ROUND_ROBIN_ENABLED=false

# Reports
AUTO_EXCEL_REPORTS=true
NIGHT_REPORT_TIME=09:00
DAY_REPORT_TIME=20:00

# CORS
FRONTEND_URL=http://localhost:5173,https://your-frontend.vercel.app

# Logs
LOG_LEVEL=info
ENVEOF

echo "📦 Installing dependencies..."
npm ci --only=production

echo "🔨 Building application..."
npm run build

echo "🗄️  Running Prisma..."
npx prisma generate
npx prisma migrate deploy

echo "🌱 Seeding database..."
npx prisma db seed || echo "Seed already ran or failed, continuing..."

echo "⚡ Starting application with PM2..."
pm2 delete whatsapp-crm-api 2>/dev/null || true
pm2 start dist/main.js --name whatsapp-crm-api -i 2
pm2 save
pm2 startup systemd -u root --hp /root

echo ""
echo "✅ Backend deployed successfully!"
echo ""
ENDSSH

echo ""
echo "🐳 Step 2: Installing Evolution API..."
echo "======================================="

sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${USER}@${SERVER} << 'ENDSSH2'
set -e

echo "🔍 Checking if Evolution API is already running..."
if docker ps | grep -q evolution-api; then
    echo "⚠️  Evolution API already running, skipping..."
else
    echo "🚀 Starting Evolution API..."
    docker run -d \
      --name evolution-api \
      --restart unless-stopped \
      -p 8080:8080 \
      -e AUTHENTICATION_API_KEY="evolution-api-key-2026-secure" \
      -e SERVER_URL="http://188.241.217.76:8080" \
      atendai/evolution-api:latest
    
    echo "⏳ Waiting for Evolution API to start..."
    sleep 10
    echo "✅ Evolution API started!"
fi

echo ""
echo "🐘 Step 3: Installing Redis..."
echo "==============================="

if docker ps | grep -q redis; then
    echo "⚠️  Redis already running, skipping..."
else
    echo "🚀 Starting Redis..."
    docker run -d \
      --name redis \
      --restart unless-stopped \
      -p 6379:6379 \
      redis:alpine
    echo "✅ Redis started!"
fi

ENDSSH2

echo ""
echo "✅ Step 4: Verification..."
echo "=========================="

echo "🔍 Checking services..."
sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${USER}@${SERVER} << 'ENDSSH3'
echo ""
echo "PM2 Status:"
pm2 status

echo ""
echo "Docker Containers:"
docker ps

echo ""
echo "Backend API Check:"
curl -s http://localhost:3000/api/v1 || echo "API not responding yet (may need a few seconds)"

echo ""
echo "Evolution API Check:"
curl -s http://localhost:8080 || echo "Evolution API not responding yet"
ENDSSH3

echo ""
echo "================================================"
echo "🎉 DEPLOYMENT COMPLETE!"
echo "================================================"
echo ""
echo "📍 Backend API: http://188.241.217.76:3000/api/v1"
echo "📍 Swagger Docs: http://188.241.217.76:3000/api/docs"
echo "📍 Evolution API: http://188.241.217.76:8080"
echo ""
echo "🔐 Test Login:"
echo "curl -X POST http://188.241.217.76:3000/api/v1/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"admin@callcenter.com\",\"password\":\"admin123\"}'"
echo ""
echo "📱 Next Steps:"
echo "1. Login to admin panel with admin@callcenter.com / admin123"
echo "2. Connect 4 WhatsApp numbers via Evolution API"
echo "3. Deploy frontend to Vercel"
echo ""
echo "📊 Monitor logs: ssh root@188.241.217.76 'pm2 logs whatsapp-crm-api'"
echo ""
