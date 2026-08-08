#!/bin/bash

# Quick Deploy to VPS 188.241.217.76
# Password: Cococage_1234

SERVER="188.241.217.76"
USER="root"
APP_DIR="/var/www/whatsapp-crm"

echo "🚀 Deploying WhatsApp CRM Backend to VPS..."
echo "============================================"

# Create deploy archive (exclude node_modules and dist)
echo "📦 Creating archive..."
tar -czf /tmp/backend-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='logs/*.log' \
  --exclude='storage/reports/*.xlsx' \
  . 2>/dev/null

echo "📤 Uploading to VPS..."
scp /tmp/backend-deploy.tar.gz ${USER}@${SERVER}:/tmp/

echo "⚙️  Deploying on server..."
ssh ${USER}@${SERVER} << 'ENDSSH'
set -e

# Create directory
mkdir -p /var/www/whatsapp-crm
cd /var/www/whatsapp-crm

# Extract
tar -xzf /tmp/backend-deploy.tar.gz
rm /tmp/backend-deploy.tar.gz

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production 2>&1 | tail -5

# Generate Prisma
echo "🔧 Generating Prisma client..."
npx prisma generate

# Build
echo "🔨 Building..."
npm run build 2>&1 | tail -5

# Run migrations
echo "🗄️  Running migrations..."
npx prisma migrate deploy

# Restart PM2
echo "⚡ Restarting application..."
pm2 restart whatsapp-crm-api || pm2 start dist/main.js --name whatsapp-crm-api -i 2
pm2 save

echo "✅ Deployment complete!"
ENDSSH

# Cleanup
rm /tmp/backend-deploy.tar.gz

echo ""
echo "🎉 Backend deployed successfully!"
echo ""
echo "📍 API: http://188.241.217.76:3000/api/v1"
echo "📍 Swagger: http://188.241.217.76:3000/api/docs"
echo ""
echo "Check logs: ssh root@188.241.217.76 'pm2 logs whatsapp-crm-api'"
