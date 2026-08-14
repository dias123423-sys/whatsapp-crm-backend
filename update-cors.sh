#!/bin/bash

# ========================================
# UPDATE CORS ON VPS
# ========================================

VPS_IP="188.241.217.76"
VPS_USER="root"
BACKEND_DIR="/root/whatsapp-crm-backend"

echo "🔧 Updating CORS settings on VPS..."

# Add Vercel domain to CORS
ssh ${VPS_USER}@${VPS_IP} << 'EOF'
cd /root/whatsapp-crm-backend || exit 1

# Backup .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Update CORS_ORIGIN to include new Vercel domain
sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN=https://whatsapp-crm-frontend-phi.vercel.app,https://whatsapp-crm-frontend-2k0yg1ver-call7.vercel.app,http://localhost:5173,http://localhost:3000|g' .env

# Restart backend service
pm2 restart whatsapp-crm-backend || (cd /root/whatsapp-crm-backend && pm2 start npm --name "whatsapp-crm-backend" -- run start:prod)

echo "✅ CORS updated and backend restarted"
pm2 logs whatsapp-crm-backend --lines 20
EOF

echo "✅ Done!"
