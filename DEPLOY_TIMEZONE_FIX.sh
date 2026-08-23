#!/bin/bash
set -e

echo "🚀 Deploying timezone fix to VPS..."

# Build locally
echo "🔨 Building..."
npm run build

# Create archive
echo "📦 Creating archive..."
tar -czf dist-timezone-fix.tar.gz dist/ package.json package-lock.json prisma/ .env

echo "✅ Archive created: dist-timezone-fix.tar.gz"
echo ""
echo "📋 Next steps:"
echo "1. Upload to VPS: scp dist-timezone-fix.tar.gz root@188.245.188.137:/var/www/"
echo "2. SSH to VPS: ssh root@188.245.188.137"
echo "3. Extract: cd /var/www && tar -xzf dist-timezone-fix.tar.gz"
echo "4. Restart: pm2 restart whatsapp-crm-api"
echo ""
echo "Or run this one-liner:"
echo "scp dist-timezone-fix.tar.gz root@188.245.188.137:/var/www/ && ssh root@188.245.188.137 'cd /var/www && tar -xzf dist-timezone-fix.tar.gz && pm2 restart whatsapp-crm-api'"
