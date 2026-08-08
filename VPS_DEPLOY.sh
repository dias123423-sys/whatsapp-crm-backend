#!/bin/bash

# Deploy to VPS 188.241.217.76
# Password: Cococage_1234

set -e

SERVER="root@188.241.217.76"
APP_DIR="/var/www/whatsapp-crm"

echo "🚀 Deploying to VPS 188.241.217.76..."

# Create archive
echo "📦 Creating archive..."
tar -czf /tmp/backend.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='*.log' \
  .

# Upload
echo "📤 Uploading..."
scp /tmp/backend.tar.gz ${SERVER}:/tmp/

# Deploy on server
echo "⚙️  Installing on server..."
ssh ${SERVER} << 'ENDSSH'
set -e

# Install dependencies if needed
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

if ! command -v redis-server &> /dev/null; then
    apt install -y redis-server
    systemctl start redis-server
    systemctl enable redis-server
fi

# Extract
mkdir -p /var/www/whatsapp-crm
cd /var/www/whatsapp-crm
tar -xzf /tmp/backend.tar.gz
rm /tmp/backend.tar.gz

# Install
echo "Installing dependencies..."
npm ci --only=production

# Generate Prisma
echo "Generating Prisma..."
npx prisma generate

# Build
echo "Building..."
npm run build

# Migrate
echo "Running migrations..."
npx prisma migrate deploy

# Seed (ignore errors if already seeded)
npx prisma db seed || true

# Restart PM2
echo "Restarting app..."
pm2 delete whatsapp-crm-api 2>/dev/null || true
pm2 start dist/main.js --name whatsapp-crm-api -i 2
pm2 save
pm2 startup

echo "✅ Deployed!"
ENDSSH

rm /tmp/backend.tar.gz

echo ""
echo "🎉 Backend deployed to VPS!"
echo ""
echo "📍 API: http://188.241.217.76:3000/api/v1"
echo "📍 Swagger: http://188.241.217.76:3000/api/docs"
echo ""
echo "Check: ssh root@188.241.217.76 'pm2 logs whatsapp-crm-api'"
